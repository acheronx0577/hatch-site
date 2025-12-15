import { apiFetch } from './hatch';

export type UpsertAgentProfilePayload = {
  userId: string;
  licenseNumber?: string;
  licenseState?: string;
  licenseExpiresAt?: string;
  isCommercial?: boolean;
  isResidential?: boolean;
  title?: string;
  bio?: string;
  tags?: string[];
};

export async function upsertAgentProfile(orgId: string, payload: UpsertAgentProfilePayload) {
  return apiFetch<{ id: string }>(`organizations/${orgId}/agents/profile`, {
    method: 'POST',
    body: payload
  });
}

export type InviteAgentPayload = {
  email: string;
  expiresAt?: string;
};

export async function inviteAgent(orgId: string, payload: InviteAgentPayload) {
  return apiFetch<{
    id: string;
    email: string;
    status: string;
    organizationId: string;
    invitedByUserId: string;
    expiresAt: string;
    createdAt: string;
    signupUrl: string;
    token: string;
  }>(`organizations/${orgId}/invites`, {
    method: 'POST',
    body: payload
  });
}

export type UpdateAgentProfileAdminPayload = {
  lifecycleStage?: 'ONBOARDING' | 'ACTIVE' | 'OFFBOARDING';
  officeId?: string | null;
  teamId?: string | null;
  tags?: string[];
};

export async function updateAgentProfileAdmin(orgId: string, agentProfileId: string, payload: UpdateAgentProfileAdminPayload) {
  return apiFetch<{ id: string }>(`organizations/${orgId}/agents/profile/${agentProfileId}`, {
    method: 'PATCH',
    body: payload
  });
}

export type UpdateAgentCompliancePayload = {
  isCompliant?: boolean;
  requiresAction?: boolean;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  riskScore?: number;
  riskFlags?: unknown;
  ceCycleStartAt?: string;
  ceCycleEndAt?: string;
  ceHoursRequired?: number;
  ceHoursCompleted?: number;
};

export async function updateAgentCompliance(orgId: string, agentProfileId: string, payload: UpdateAgentCompliancePayload) {
  return apiFetch<{ id: string }>(`organizations/${orgId}/agents/profile/${agentProfileId}/compliance`, {
    method: 'PATCH',
    body: payload
  });
}
