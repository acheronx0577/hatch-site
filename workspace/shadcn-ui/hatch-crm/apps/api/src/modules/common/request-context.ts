import type { FastifyRequest } from 'fastify';

import { UserRole } from '@hatch/db';

export interface RequestContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  teamIds: string[];
  allowTeamContactActions: boolean;
  orgId: string;
  assignmentOverride?: {
    ownerId?: string;
    teamId?: string;
  } | null;
}

// No default user - authentication required
const DEFAULT_ROLE = UserRole.AGENT;
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID ?? 'tenant-hatch';
const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID ?? 'org-hatch';

const toTeamIds = (value?: string | string[]): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => entry.split(',')).map((id) => id.trim()).filter(Boolean);
  }
  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};

export function resolveRequestContext(req: FastifyRequest): RequestContext {
  const headers = req.headers;
  const authUser = (req as FastifyRequest & { user?: Record<string, unknown> }).user;
  const authUserId =
    (authUser?.userId as string | undefined) ?? (authUser?.sub as string | undefined) ?? undefined;

  const userId = authUserId ?? (headers['x-user-id'] as string | undefined)?.trim() ?? '';

  const tenantHeader = (headers['x-tenant-id'] as string | undefined)?.trim();
  const authTenant = (authUser?.tenantId as string | undefined)?.trim();
  const tenantId = tenantHeader && tenantHeader.length > 0 ? tenantHeader : authTenant && authTenant.length > 0 ? authTenant : DEFAULT_TENANT_ID;

  const orgHeader = (headers['x-org-id'] as string | undefined)?.trim();
  const authOrg =
    (authUser?.orgId as string | undefined)?.trim() ??
    (authUser?.organizationId as string | undefined)?.trim();
  const orgId = orgHeader && orgHeader.length > 0 ? orgHeader : authOrg && authOrg.length > 0 ? authOrg : DEFAULT_ORG_ID;

  const authRole = (authUser?.role as string | undefined)?.trim().toUpperCase();
  const roleHeader = ((headers['x-user-role'] as string | undefined)?.trim() ?? authRole ?? '').toUpperCase();
  const role = ((roleHeader && (UserRole as Record<string, UserRole>)[roleHeader]) ?? DEFAULT_ROLE) as UserRole;
  const teamIds = toTeamIds(headers['x-user-team-ids'] as string | string[] | undefined);
  const allowTeamHeader = (headers['x-allow-team-contact-actions'] as string | undefined)?.trim().toLowerCase();
  const allowTeamContactActions =
    allowTeamHeader === undefined || allowTeamHeader === '' ? true : allowTeamHeader === 'true';

  const platformAssignment =
    (req as FastifyRequest & { platformContext?: { assignmentOverride?: RequestContext['assignmentOverride'] } }).platformContext
      ?.assignmentOverride ?? null;

  return {
    userId,
    tenantId,
    role,
    teamIds,
    allowTeamContactActions,
    orgId,
    assignmentOverride: platformAssignment
  };
}
