import { apiFetch } from './api';

export interface CopilotInsightResponse {
  insight: {
    id: string;
    title: string;
    summary: string;
    data: unknown;
    createdAt: string;
  };
  actions: CopilotAction[];
}

export interface CopilotAction {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: number | null;
  leadId?: string | null;
  orgListingId?: string | null;
  orgTransactionId?: string | null;
  leaseId?: string | null;
}

export async function fetchDailyBriefing(orgId: string, date?: string) {
  return apiFetch<CopilotInsightResponse>(`organizations/${orgId}/ai-copilot/daily-briefing`, {
    method: 'POST',
    body: JSON.stringify(date ? { date } : {})
  });
}

export async function fetchCopilotActions(orgId: string) {
  return apiFetch<CopilotAction[]>(`organizations/${orgId}/ai-copilot/actions`);
}

export async function updateCopilotActionStatus(orgId: string, actionId: string, status: string) {
  return apiFetch<CopilotAction>(`organizations/${orgId}/ai-copilot/actions/${actionId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}
