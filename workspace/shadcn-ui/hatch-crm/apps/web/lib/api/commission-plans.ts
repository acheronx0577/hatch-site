import { apiFetch } from './api';

export interface CommissionPlan {
  id: string;
  name?: string;
  brokerSplit?: number;
  agentSplit?: number;
  tiers?: unknown;
  createdAt?: string;
}

export interface CommissionPlanListResponse {
  items: CommissionPlan[];
  nextCursor: string | null;
}

export async function listCommissionPlans(
  params: { cursor?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<CommissionPlanListResponse> {
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (typeof params.limit === 'number') search.set('limit', params.limit.toString());
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiFetch<CommissionPlanListResponse>(`commission-plans${suffix}`, {
    signal: params.signal
  });
}

export async function getCommissionPlan(id: string): Promise<CommissionPlan | null> {
  try {
    return await apiFetch<CommissionPlan>(`commission-plans/${id}`);
  } catch (error) {
    return null;
  }
}

export async function createCommissionPlan(payload: Partial<CommissionPlan>): Promise<CommissionPlan> {
  return apiFetch<CommissionPlan>('commission-plans', {
    method: 'POST',
    body: payload
  });
}

export async function updateCommissionPlan(
  id: string,
  payload: Partial<CommissionPlan>
): Promise<CommissionPlan> {
  return apiFetch<CommissionPlan>(`commission-plans/${id}`, {
    method: 'PATCH',
    body: payload
  });
}
