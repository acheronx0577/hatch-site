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

const DEFAULT_USER_ID = 'user-agent';
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
  const userId = (headers['x-user-id'] as string | undefined)?.trim() || DEFAULT_USER_ID;
  const tenantHeader = (headers['x-tenant-id'] as string | undefined)?.trim();
  const tenantId = tenantHeader && tenantHeader.length > 0 ? tenantHeader : DEFAULT_TENANT_ID;
  const orgHeader = (headers['x-org-id'] as string | undefined)?.trim();
  const orgId = orgHeader && orgHeader.length > 0 ? orgHeader : DEFAULT_ORG_ID;
  const roleHeader = (headers['x-user-role'] as string | undefined)?.trim().toUpperCase();
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
