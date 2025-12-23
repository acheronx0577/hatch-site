import { Injectable, NestMiddleware } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

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
    const anyReq = req as FastifyRequest & {
      cookies?: Record<string, unknown>;
      user?: Record<string, unknown>;
      headers: Record<string, unknown>;
    };

    const orgIdHeader = (req.headers['x-org-id'] as string | undefined)?.trim();
    const tenantHeader = (req.headers['x-tenant-id'] as string | undefined)?.trim();
    const userHeader = (req.headers['x-user-id'] as string | undefined)?.trim();

    const defaultOrgId = process.env.DEFAULT_ORG_ID ?? 'org-hatch';
    const defaultTenantId = process.env.DEFAULT_TENANT_ID ?? 'tenant-hatch';
    const defaultUserId = process.env.DEFAULT_USER_ID ?? 'user-agent';

    const accessTokenCookie = anyReq.cookies?.['access_token'];
    const cookieToken = typeof accessTokenCookie === 'string' && accessTokenCookie.length > 0 ? accessTokenCookie : null;
    const authHeader = (req.headers['authorization'] as string | undefined)?.trim();
    const headerToken =
      authHeader && authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null;
    const token = cookieToken ?? headerToken;

    if (token) {
      const secret = process.env.JWT_ACCESS_SECRET ?? process.env.API_JWT_SECRET;
      if (secret) {
        try {
          const payload = jwt.verify(token, secret) as Record<string, unknown>;
          const tenantId =
            (payload.tenantId as string | undefined) ??
            (payload.tid as string | undefined) ??
            (payload.tenant_id as string | undefined);
          const userId =
            (payload.sub as string | undefined) ??
            (payload.userId as string | undefined) ??
            (payload.id as string | undefined);
          const orgId =
            (payload.orgId as string | undefined) ??
            (payload.organizationId as string | undefined) ??
            (payload.org_id as string | undefined) ??
            (payload.organization_id as string | undefined);

          if (userId && typeof userId === 'string') {
            anyReq.headers['x-user-id'] = userId;
          }
          if (tenantId && typeof tenantId === 'string' && !tenantHeader) {
            anyReq.headers['x-tenant-id'] = tenantId;
          }
          if (orgId && typeof orgId === 'string' && !orgIdHeader) {
            anyReq.headers['x-org-id'] = orgId;
          }

          anyReq.user = {
            ...payload,
            tenantId,
            userId,
            orgId
          };
        } catch {
          // Ignore invalid tokens; downstream guards can still enforce auth where required.
        }
      }
    }

    req.platformContext = {
      ...(req.platformContext ?? {}),
      orgId: (anyReq.headers['x-org-id'] as string | undefined) ?? req.platformContext?.orgId ?? defaultOrgId,
      tenantId:
        (anyReq.headers['x-tenant-id'] as string | undefined) ?? req.platformContext?.tenantId ?? defaultTenantId,
      userId: (anyReq.user?.userId as string | undefined) ?? (anyReq.headers['x-user-id'] as string | undefined) ?? req.platformContext?.userId ?? defaultUserId
    };

    next();
  }
}
