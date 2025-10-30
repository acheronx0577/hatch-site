import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AccessRecordContext, UserAccessContext } from './can.service';
import { CanService } from './can.service';
import { RecordContextResolver } from './record-ctx.decorator';
import { PERMIT_METADATA_KEY, type PermitMetadata } from './permit.decorator';

import { PrismaService } from '../../modules/prisma/prisma.service';

interface PlatformContext {
  orgId?: string;
  tenantId?: string;
  userId?: string;
  record?: AccessRecordContext;
  assignmentOverride?: {
    ownerId?: string;
    teamId?: string;
  } | null;
}

interface GuardRequest {
  platformContext?: PlatformContext;
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string | undefined>;
  user?: { sub?: string };
  recordCtx?: AccessRecordContext;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly canService: CanService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<PermitMetadata>(PERMIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardRequest>();
    const platformContext = request.platformContext ?? {};
    const candidateOrg =
      platformContext.orgId ??
      platformContext.tenantId ??
      this.headerValue(request, 'x-org-id') ??
      this.headerValue(request, 'x-tenant-id') ??
      process.env.DEFAULT_ORG_ID ??
      process.env.DEFAULT_TENANT_ID ??
      undefined;

    let userId = platformContext.userId ?? request.user?.sub ?? this.headerValue(request, 'x-user-id');
    let orgId = candidateOrg;

    if (!userId) {
      const guardFallbackEnabled = (process.env.GUARD_FALLBACK_ENABLED ?? 'true').toLowerCase() === 'true';
      if (!guardFallbackEnabled) {
        throw new UnauthorizedException('Missing authenticated user');
      }

      userId = process.env.DEFAULT_USER_ID ?? 'user-agent';
      orgId = orgId ?? process.env.DEFAULT_ORG_ID ?? 'org-hatch';
    }

    const userCtx: UserAccessContext = { orgId, userId };

    if (metadata.object) {
      await RecordContextResolver.attach(request, metadata.object, this.prisma);
    }

    const recordCtx = request.recordCtx ?? platformContext.record;

    const allowed = await this.canService.can(userCtx, metadata.action, metadata.object, recordCtx);

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (!request.platformContext) {
      request.platformContext = {};
    }
    request.platformContext.orgId = orgId;
    request.platformContext.userId = userId;
    request.platformContext.record = recordCtx;

    return true;
  }

  private headerValue(request: GuardRequest, key: string): string | undefined {
    const value = request.headers?.[key];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value as string | undefined;
  }
}
