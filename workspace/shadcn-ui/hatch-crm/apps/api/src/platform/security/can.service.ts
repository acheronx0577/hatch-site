import { Injectable } from '@nestjs/common';

import { PermissionHolderType, ShareAccess, ShareGranteeType } from '@hatch/db';

import { PrismaService } from '../../modules/prisma/prisma.service';

export type Action = 'create' | 'read' | 'update' | 'delete';

type HolderType = PermissionHolderType;

export interface AccessRecordContext {
  orgId?: string | null;
  ownerId?: string | null;
  id?: string;
}

export interface UserAccessContext {
  orgId?: string | null;
  userId?: string | null;
}

interface HolderDescriptor {
  type: HolderType;
  id: string;
}

@Injectable()
export class CanService {
  constructor(private readonly prisma: PrismaService) {}

  async can(
    ctx: UserAccessContext,
    action: Action,
    object: string,
    record?: AccessRecordContext
  ): Promise<boolean> {
    if (!ctx.orgId || !ctx.userId) {
      return false;
    }

    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId: ctx.userId, orgId: ctx.orgId } },
      select: { isOrgAdmin: true, profileId: true, roleId: true }
    });

    if (!membership) {
      return false;
    }

    if (membership.isOrgAdmin) {
      return true;
    }

    const holders = await this.resolveHolderIds(ctx.orgId, ctx.userId, membership.profileId ?? undefined);
    const hasPermission =
      holders.length > 0 ? await this.hasObjectPermission(ctx.orgId, holders, object, action) : false;

    if (action === 'create') {
      return hasPermission;
    }

    if (!record) {
      return action === 'read' ? hasPermission : false;
    }

    if (!record?.orgId || record.orgId !== ctx.orgId) {
      return false;
    }

    if (record.ownerId === ctx.userId) {
      return true;
    }

    if (record.id && (await this.isSharedWith(ctx.orgId, ctx.userId, object, record.id, action))) {
      return true;
    }

    if (action === 'read' && record.ownerId) {
      const ownerRoleId = await this.roleIdForUser(ctx.orgId, record.ownerId);
      const viewerRoleId = membership.roleId;

      if (ownerRoleId && viewerRoleId) {
        const ancestor = await this.isAncestorRole(ctx.orgId, viewerRoleId, ownerRoleId);
        if (ancestor) {
          return true;
        }
      }
    }

    return hasPermission;
  }

  private async resolveHolderIds(orgId: string, userId: string, profileId?: string): Promise<HolderDescriptor[]> {
    const holders: HolderDescriptor[] = [];

    if (profileId) {
      holders.push({ type: PermissionHolderType.PROFILE, id: profileId });
    }

    const assignments = await this.prisma.permissionSetAssignment.findMany({
      where: { userId },
      select: { permissionSetId: true, permissionSet: { select: { orgId: true } } }
    });

    for (const assignment of assignments) {
      if (assignment.permissionSet?.orgId === orgId) {
        holders.push({ type: PermissionHolderType.PERMISSION_SET, id: assignment.permissionSetId });
      }
    }

    return holders;
  }

  private async hasObjectPermission(
    orgId: string,
    holders: HolderDescriptor[],
    object: string,
    action: Action
  ): Promise<boolean> {
    if (holders.length === 0) {
      return false;
    }

    const permissions = await this.prisma.objectPermission.findMany({
      where: {
        orgId,
        object,
        OR: holders.map((holder) => ({ holderType: holder.type, holderId: holder.id }))
      },
      select: {
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true
      }
    });

    if (permissions.length === 0) {
      return false;
    }

    const aggregate = permissions.reduce(
      (acc, perm) => ({
        create: acc.create || perm.canCreate,
        read: acc.read || perm.canRead,
        update: acc.update || perm.canUpdate,
        delete: acc.delete || perm.canDelete
      }),
      { create: false, read: false, update: false, delete: false }
    );

    switch (action) {
      case 'create':
        return aggregate.create;
      case 'read':
        return aggregate.read;
      case 'update':
        return aggregate.update;
      case 'delete':
        return aggregate.delete;
      default:
        return false;
    }
  }

  private async isSharedWith(
    orgId: string,
    userId: string,
    object: string,
    recordId: string,
    action: Action
  ): Promise<boolean> {
    const requiresWrite = action === 'update' || action === 'delete';

    const directShare = await this.prisma.recordShare.findFirst({
      where: {
        orgId,
        object,
        recordId,
        granteeType: ShareGranteeType.USER,
        granteeId: userId,
        AND: requiresWrite ? { access: ShareAccess.WRITE } : {}
      }
    });

    if (directShare) {
      return true;
    }

    const viewerRoleId = await this.roleIdForUser(orgId, userId);
    if (viewerRoleId) {
      const roleShare = await this.prisma.recordShare.findFirst({
        where: {
          orgId,
          object,
          recordId,
          granteeType: ShareGranteeType.ROLE,
          granteeId: viewerRoleId,
          AND: requiresWrite ? { access: ShareAccess.WRITE } : {}
        }
      });

      if (roleShare) {
        return true;
      }
    }

    const teamShares = await this.prisma.recordShare.findMany({
      where: {
        orgId,
        object,
        recordId,
        granteeType: ShareGranteeType.TEAM,
        AND: requiresWrite ? { access: ShareAccess.WRITE } : {}
      },
      select: { granteeId: true }
    });

    if (teamShares.length > 0) {
      const teamIds = teamShares.map((share) => share.granteeId);
      const membership = await this.prisma.teamMembership.findFirst({
        where: {
          teamId: { in: teamIds },
          userId
        }
      });

      if (membership) {
        return true;
      }
    }

    return false;
  }

  private async roleIdForUser(orgId: string, userId: string): Promise<string | null> {
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { roleId: true }
    });

    return membership?.roleId ?? null;
  }

  private async isAncestorRole(orgId: string, candidateAncestor: string, descendant: string): Promise<boolean> {
    if (candidateAncestor === descendant) {
      return true;
    }

    let cursor: string | null = descendant;
    for (let depth = 0; depth < 32 && cursor; depth++) {
      const role = await this.prisma.role.findUnique({
        where: { id: cursor },
        select: { parentId: true, orgId: true }
      });

      if (!role || role.orgId !== orgId) {
        break;
      }

      if (!role.parentId) {
        break;
      }

      if (role.parentId === candidateAncestor) {
        return true;
      }

      cursor = role.parentId;
    }

    return false;
  }
}
