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
  name: string;
  licenseNumber?: string;
  licenseState?: string;
  licenseExpiresAt?: string;
};

export async function inviteAgent(orgId: string, payload: InviteAgentPayload) {
  return apiFetch<{ sent: boolean; inviteLink: string; reason?: string }>(`organizations/${orgId}/agents/invite`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
