import { apiFetch } from '@/lib/api/hatch';

export type SellerOpportunityStatus = 'NEW' | 'CONVERTED' | 'DISMISSED';

export type SellerOpportunitySignal = {
  key: string;
  label: string;
  weight: number;
  value?: string;
  reason: string;
};

export type SellerOpportunityItem = {
  id: string;
  status: SellerOpportunityStatus | string;
  score: number;
  source: string;
  address: { line1: string; city: string; state: string; postalCode: string };
  owner?: {
    name: string | null;
    mailingAddress:
      | {
          line1: string | null;
          line2: string | null;
          city: string | null;
          state: string | null;
          postalCode: string | null;
        }
      | null;
  };
  signals: SellerOpportunitySignal[];
  convertedLeadId?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SellerOpportunityEngineMeta = {
  lastRunAt: string | null;
  status: string | null;
  summary?: { created: number; updated: number; candidates: number } | null;
};

export type SellerOpportunitiesListResponse = {
  items: SellerOpportunityItem[];
  nextCursor: string | null;
  engine: SellerOpportunityEngineMeta;
};

export async function listSellerOpportunities(
  orgId: string,
  params: {
    q?: string;
    status?: SellerOpportunityStatus;
    minScore?: number;
    limit?: number;
    cursor?: string | null;
  } = {}
): Promise<SellerOpportunitiesListResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  if (typeof params.minScore === 'number') query.set('minScore', String(params.minScore));
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);

  const qs = query.toString();
  return apiFetch<SellerOpportunitiesListResponse>(
    `organizations/${encodeURIComponent(orgId)}/seller-opportunities${qs ? `?${qs}` : ''}`
  );
}

export async function fetchSellerOpportunityEngine(orgId: string) {
  return apiFetch<SellerOpportunityEngineMeta>(`organizations/${encodeURIComponent(orgId)}/seller-opportunities/engine`);
}

export async function runSellerOpportunityScan(orgId: string) {
  return apiFetch<{ runId: string; status: string; created: number; updated: number; candidates: number }>(
    `organizations/${encodeURIComponent(orgId)}/seller-opportunities/run`,
    { method: 'POST' }
  );
}

export async function convertSellerOpportunityToLead(orgId: string, id: string) {
  return apiFetch<{ leadId: string }>(
    `organizations/${encodeURIComponent(orgId)}/seller-opportunities/${encodeURIComponent(id)}/convert`,
    { method: 'POST' }
  );
}
