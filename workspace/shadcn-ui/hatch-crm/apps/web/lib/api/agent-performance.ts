import { apiFetch } from './api';

export type AgentPerformanceConfidenceBand = 'HIGH' | 'MEDIUM' | 'DEVELOPING';

export type AgentPerformanceDriver = {
  label: string;
  direction: 'positive' | 'negative';
  metricSummary: string;
  deepLink?: string;
};

export type AgentPerformanceDimensions = {
  historicalEffectiveness: number;
  responsivenessReliability: number;
  recencyMomentum: number;
  opportunityFit: number;
  riskDragPenalty: number;
  capacityLoad: number;
};

export type AgentPerformanceIndicator = {
  modelVersion: string;
  overallScore: number;
  confidenceBand: AgentPerformanceConfidenceBand;
  dimensions: AgentPerformanceDimensions;
  topDrivers: AgentPerformanceDriver[];
  rawFeatureSummary?: unknown | null;
  lastUpdated: string | null;
};

export type AgentPerformanceTrendPoint = {
  computedAt: string | null;
  overallScore: number;
  confidenceBand: AgentPerformanceConfidenceBand;
  dimensions: AgentPerformanceDimensions;
  risk?: unknown | null;
};

export type AgentPerformanceTrendResponse = {
  agentProfileId: string;
  modelVersion: string;
  points: AgentPerformanceTrendPoint[];
};

export type AgentPerformanceLeaderboardRow = AgentPerformanceIndicator & {
  agentProfileId: string;
  name: string;
  email: string | null;
  buyerSharePercent: number;
  buyerLeadCount: number;
  sellerLeadCount: number;
  buyerSellerOrientation: 'BUYER_HEAVY' | 'SELLER_HEAVY' | 'BALANCED' | 'UNKNOWN';
  priceBandClosedCount?: number;
  office?: { id: string; name: string | null } | null;
  team?: { id: string; name: string | null } | null;
};

export type AgentPerformanceLeaderboardResponse = {
  modelVersion: string;
  page: number;
  limit: number;
  total: number;
  items: AgentPerformanceLeaderboardRow[];
};

export async function fetchAgentPerformanceLatest(orgId: string, agentProfileId: string) {
  return apiFetch<AgentPerformanceIndicator | null>(
    `organizations/${orgId}/agent-performance/agents/${agentProfileId}/latest`
  );
}

export async function fetchAgentPerformanceTrend(orgId: string, agentProfileId: string, days = 90) {
  const qs = new URLSearchParams({ days: String(days) });
  return apiFetch<AgentPerformanceTrendResponse>(
    `organizations/${orgId}/agent-performance/agents/${agentProfileId}/trend?${qs.toString()}`
  );
}

export async function fetchAgentPerformanceLeaderboard(
  orgId: string,
  params: {
    page?: number;
    limit?: number;
    officeId?: string;
    teamId?: string;
    orientation?: 'BUYER_HEAVY' | 'SELLER_HEAVY' | 'BALANCED' | 'UNKNOWN';
    priceBand?: 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY';
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.officeId) qs.set('officeId', params.officeId);
  if (params.teamId) qs.set('teamId', params.teamId);
  if (params.orientation) qs.set('orientation', params.orientation);
  if (params.priceBand) qs.set('priceBand', params.priceBand);

  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<AgentPerformanceLeaderboardResponse>(`organizations/${orgId}/agent-performance/leaderboard${suffix}`);
}

