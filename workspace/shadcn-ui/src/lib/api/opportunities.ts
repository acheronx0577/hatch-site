import { apiFetch } from './hatch';

export interface Opportunity {
  id: string;
  name?: string | null;
  stage?: string | null;
  amount?: number | null;
  currency?: string | null;
  accountId?: string | null;
  account?: { id: string; name?: string | null } | null;
  ownerId?: string | null;
  closeDate?: string | null;
  updatedAt?: string | null;
}

export interface OpportunityListResponse {
  items: Opportunity[];
  nextCursor: string | null;
}

export async function listOpportunities(params: {
  q?: string;
  stage?: string;
  accountId?: string;
  cursor?: string | null;
  limit?: number;
} = {}): Promise<OpportunityListResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.stage) search.set('stage', params.stage);
  if (params.accountId) search.set('accountId', params.accountId);
  if (typeof params.limit === 'number') search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const res = await apiFetch<OpportunityListResponse | Opportunity[]>(`opportunities${suffix}`);
  if (Array.isArray(res)) {
    return { items: res, nextCursor: null };
  }
  return { items: res.items ?? [], nextCursor: res.nextCursor ?? null };
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  try {
    return await apiFetch<Opportunity>(`opportunities/${id}`);
  } catch {
    return null;
  }
}

export async function createOpportunity(payload: {
  name: string;
  stage: string;
  accountId?: string;
  amount?: number;
  currency?: string;
  closeDate?: string;
}): Promise<Opportunity> {
  return apiFetch<Opportunity>('opportunities', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOpportunity(id: string, payload: {
  name?: string;
  stage?: string;
  accountId?: string;
  amount?: number;
  currency?: string;
  closeDate?: string;
}): Promise<Opportunity> {
  return apiFetch<Opportunity>(`opportunities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteOpportunity(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`opportunities/${id}`, {
    method: 'DELETE'
  });
}

export async function bulkDeleteOpportunities(ids: string[]): Promise<{ deleted: number }> {
  const results = await Promise.allSettled(ids.map(id => deleteOpportunity(id)));
  const deleted = results.filter(r => r.status === 'fulfilled').length;
  return { deleted };
}
