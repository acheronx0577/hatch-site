import { apiFetch } from '@/lib/api/hatch';

export type OrgDailyAnalyticsPoint = {
  id: string;
  organizationId: string;
  date: string;
  granularity: string;
  leadsNewCount: number;
  leadsContactedCount: number;
  leadsQualifiedCount: number;
  leadsUnderContractCount: number;
  leadsClosedCount: number;
  offerIntentsSubmittedCount: number;
  offerIntentsAcceptedCount: number;
  offerIntentsDeclinedCount: number;
  transactionsClosedCount: number;
  transactionsClosedVolume: number;
  averageDaysOnMarket: number;
  activeLeasesCount: number;
  pmIncomeEstimate: number;
  savedListingsCount: number;
  savedSearchesCount: number;
  copilotActionsSuggestedCount: number;
  copilotActionsCompletedCount: number;
  createdAt: string;
};

export type AgentDailyAnalyticsPoint = {
  id: string;
  organizationId: string;
  agentProfileId: string;
  date: string;
  granularity: string;
  leadsNewCount: number;
  leadsContactedCount: number;
  leadsQualifiedCount: number;
  leadsUnderContractCount: number;
  leadsClosedCount: number;
  offerIntentsSubmittedCount: number;
  offerIntentsAcceptedCount: number;
  transactionsClosedCount: number;
  transactionsClosedVolume: number;
  activeLeasesCount: number;
  copilotActionsSuggestedCount: number;
  copilotActionsCompletedCount: number;
  createdAt: string;
};

export async function fetchOrgDailyAnalytics(orgId: string, params: { startDate?: string; endDate?: string } = {}) {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  const qs = query.toString();
  return apiFetch<OrgDailyAnalyticsPoint[]>(
    `organizations/${encodeURIComponent(orgId)}/reporting/org-daily${qs ? `?${qs}` : ''}`
  );
}

export async function fetchAgentDailyAnalytics(
  orgId: string,
  agentProfileId: string,
  params: { startDate?: string; endDate?: string } = {}
) {
  const query = new URLSearchParams();
  query.set('agentProfileId', agentProfileId);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  const qs = query.toString();
  return apiFetch<AgentDailyAnalyticsPoint[]>(
    `organizations/${encodeURIComponent(orgId)}/reporting/agent-daily${qs ? `?${qs}` : ''}`
  );
}

