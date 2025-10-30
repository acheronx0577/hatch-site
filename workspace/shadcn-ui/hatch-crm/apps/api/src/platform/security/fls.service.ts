import { Injectable } from '@nestjs/common';

import { PermissionHolderType } from '@hatch/db';

import { PrismaService } from '../../modules/prisma/prisma.service';
import type { UserAccessContext } from './can.service';
import { CASES_FLS } from './fls.matrix.cases';
import { RE_FLS } from './fls.matrix.re';

interface ResolvedFieldPermissions {
  allowAll: boolean;
  readable: Set<string>;
  writable: Set<string>;
}

const DEFAULT_FLS = {
  ...RE_FLS,
  ...CASES_FLS
};

@Injectable()
export class FlsService {
  constructor(private readonly prisma: PrismaService) {}

  async filterRead<T extends object>(
    ctx: UserAccessContext,
    object: string,
    payload: T
  ): Promise<Partial<T>> {
    const resolved = await this.resolve(ctx, object);
    const fieldsSet = resolved.allowAll
      ? new Set(Object.keys(payload ?? {}))
      : resolved.readable;

    return Object.fromEntries(
      Object.entries(payload ?? {}).filter(([key]) => fieldsSet.has(key))
    ) as Partial<T>;
  }

  async filterWrite<T extends object>(
    ctx: UserAccessContext,
    object: string,
    payload: T
  ): Promise<T> {
    const resolved = await this.resolve(ctx, object);
    const fieldsSet = resolved.allowAll
      ? new Set(Object.keys(payload ?? {}))
      : resolved.writable;

    return Object.fromEntries(
      Object.entries(payload ?? {}).filter(([key]) => fieldsSet.has(key))
    ) as T;
  }

  async readableSet(ctx: UserAccessContext, object: string, samplePayload?: Record<string, unknown>) {
    const resolved = await this.resolve(ctx, object);
    if (resolved.allowAll) {
      return new Set(Object.keys(samplePayload ?? {}));
    }
    return resolved.readable;
  }

  async writableSet(ctx: UserAccessContext, object: string, samplePayload?: Record<string, unknown>) {
    const resolved = await this.resolve(ctx, object);
    if (resolved.allowAll) {
      return new Set(Object.keys(samplePayload ?? {}));
    }
    return resolved.writable;
  }

  private async resolve(ctx: UserAccessContext, object: string): Promise<ResolvedFieldPermissions> {
    const defaults = this.defaultPermissions(object);

    if (!ctx.orgId || !ctx.userId) {
      return defaults ?? this.emptyPermissions();
    }

    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId: ctx.userId, orgId: ctx.orgId } },
      select: { isOrgAdmin: true, profileId: true }
    });

    if (!membership) {
      return defaults ?? this.emptyPermissions();
    }

    if (membership.isOrgAdmin) {
      return { allowAll: true, readable: new Set(), writable: new Set() };
    }

    const holders: { type: PermissionHolderType; id: string }[] = [];

    if (membership.profileId) {
      holders.push({ type: PermissionHolderType.PROFILE, id: membership.profileId });
    }

    const assignments = await this.prisma.permissionSetAssignment.findMany({
      where: { userId: ctx.userId },
      select: { permissionSetId: true, permissionSet: { select: { orgId: true } } }
    });

    for (const assignment of assignments) {
      if (assignment.permissionSet?.orgId === ctx.orgId) {
        holders.push({ type: PermissionHolderType.PERMISSION_SET, id: assignment.permissionSetId });
      }
    }

    if (holders.length === 0) {
      return defaults ?? this.emptyPermissions();
    }

    const permissions = await this.prisma.fieldPermission.findMany({
      where: {
        orgId: ctx.orgId,
        object,
        OR: holders.map((holder) => ({ holderType: holder.type, holderId: holder.id }))
      },
      select: { field: true, canRead: true, canWrite: true }
    });

    if (permissions.length === 0) {
      return defaults ?? { allowAll: true, readable: new Set(), writable: new Set() };
    }

    const readable = defaults ? new Set(defaults.readable) : new Set<string>();
    const writable = defaults ? new Set(defaults.writable) : new Set<string>();

    for (const perm of permissions) {
      if (perm.canRead) {
        readable.add(perm.field);
      }
      if (perm.canWrite) {
        writable.add(perm.field);
      }
    }

    return { allowAll: false, readable, writable };
  }

  private emptyPermissions(): ResolvedFieldPermissions {
    return { allowAll: false, readable: new Set(), writable: new Set() };
  }

  private defaultPermissions(object: string): ResolvedFieldPermissions | null {
    const defaults = DEFAULT_FLS[object];
    if (!defaults) {
      return null;
    }
    return {
      allowAll: false,
      readable: new Set(defaults.readable),
      writable: new Set(defaults.writable)
    };
  }
}
