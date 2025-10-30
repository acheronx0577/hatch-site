import { Injectable, NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface PlatformContext {
  orgId?: string;
  tenantId?: string;
  userId?: string;
  roleIds?: string[];
  isOrgAdmin?: boolean;
  record?: {
    id?: string;
    orgId?: string;
    ownerId?: string;
  };
  assignmentOverride?: {
    ownerId?: string;
    teamId?: string;
  } | null;
}

@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  use(
    req: FastifyRequest & { platformContext?: PlatformContext },
    _res: FastifyReply,
    next: () => void
  ): void {
    const orgIdHeader = (req.headers['x-org-id'] as string | undefined)?.trim();
    const tenantHeader = (req.headers['x-tenant-id'] as string | undefined)?.trim();
    const userHeader = (req.headers['x-user-id'] as string | undefined)?.trim();

    const defaultOrgId = process.env.DEFAULT_ORG_ID ?? 'org-hatch';
    const defaultTenantId = process.env.DEFAULT_TENANT_ID ?? 'tenant-hatch';
    const defaultUserId = process.env.DEFAULT_USER_ID ?? 'user-agent';

    req.platformContext = {
      ...(req.platformContext ?? {}),
      orgId: orgIdHeader ?? req.platformContext?.orgId ?? defaultOrgId,
      tenantId: tenantHeader ?? req.platformContext?.tenantId ?? defaultTenantId,
      userId: userHeader ?? req.platformContext?.userId ?? defaultUserId
    };

    next();
  }
}
