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

export type AgentInviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export type AgentInviteRecord = {
  id: string;
  email: string;
  status: AgentInviteStatus;
  organizationId: string;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
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

export async function listAgentInvites(orgId: string) {
  return apiFetch<AgentInviteRecord[]>(`organizations/${orgId}/invites`);
}

export async function resendAgentInvite(orgId: string, inviteId: string) {
  return apiFetch<AgentInviteRecord & { signupUrl: string; token: string }>(
    `organizations/${orgId}/invites/${inviteId}/resend`,
    { method: 'POST' }
  );
}

export async function revokeAgentInvite(orgId: string, inviteId: string) {
  return apiFetch<AgentInviteRecord>(`organizations/${orgId}/invites/${inviteId}/revoke`, { method: 'POST' });
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

export type AgentProfileRecord = {
  id: string;
  organizationId: string;
  userId: string;
  isCompliant: boolean;
  requiresAction: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskScore: number;
  riskFlags?: unknown;
};

export async function fetchAgentProfile(orgId: string, agentProfileId: string) {
  return apiFetch<AgentProfileRecord>(`organizations/${orgId}/agents/profile/${agentProfileId}`);
}

export async function recomputeAgentRisk(orgId: string, agentProfileId: string) {
  return apiFetch<{ score: number; level: 'LOW' | 'MEDIUM' | 'HIGH' }>(
    `organizations/${orgId}/ai-broker/agents/${agentProfileId}/recompute-risk`,
    {
      method: 'POST'
    }
  );
}

export type AgentRiskAiAnalysis = {
  agentProfileId: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  suggestions: string[];
  priority: 'none' | 'low' | 'medium' | 'high';
  generatedAt?: string;
};

export async function fetchAgentRiskAiAnalysis(orgId: string, agentProfileId: string) {
  return apiFetch<AgentRiskAiAnalysis>(`organizations/${orgId}/ai-broker/agents/${agentProfileId}/risk-analysis`);
}
