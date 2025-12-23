import { apiFetch } from './api';

export interface OpportunityAccount {
  id: string;
  name?: string;
}

export interface Opportunity {
  id: string;
  name?: string;
  stage?: string;
  amount?: number | null;
  currency?: string | null;
  accountId?: string | null;
  ownerId?: string | null;
  closeDate?: string | null;
  stageEnteredAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  account?: OpportunityAccount | null;
  owner?: { id: string; name?: string } | null;
  transaction?: {
    id: string;
    stage?: string;
  } | null;
}

interface ListParams {
  q?: string;
  stage?: string;
  accountId?: string;
  limit?: number;
  cursor?: string;
}

const buildQuery = (params?: object) => {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export interface OpportunityListResponse {
  items: Opportunity[];
  nextCursor: string | null;
}

export async function listOpportunities(params: ListParams = {}): Promise<OpportunityListResponse> {
  const response = await apiFetch<OpportunityListResponse>(`opportunities${buildQuery(params)}`);
  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  try {
    return await apiFetch<Opportunity>(`opportunities/${id}`);
  } catch (error) {
    return null;
  }
}

export async function createOpportunity(payload: Partial<Opportunity>): Promise<Opportunity> {
  return apiFetch<Opportunity>('opportunities', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOpportunity(
  id: string,
  payload: Partial<Opportunity>
): Promise<Opportunity> {
  return apiFetch<Opportunity>(`opportunities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}
