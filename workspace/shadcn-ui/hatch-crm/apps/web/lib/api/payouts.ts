import { apiFetch } from './api';

export interface Payout {
  id: string;
  opportunityId?: string | null;
  payeeId?: string;
  grossAmount?: number;
  brokerAmount?: number;
  agentAmount?: number;
  status?: string;
  dueOn?: string | null;
  paidAt?: string | null;
  createdAt?: string;
}

export interface PayoutListResponse {
  items: Payout[];
  nextCursor: string | null;
}

export async function listPayouts(
  params: { status?: string; cursor?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<PayoutListResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.cursor) search.set('cursor', params.cursor);
  if (typeof params.limit === 'number') search.set('limit', params.limit.toString());
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiFetch<PayoutListResponse>(`payouts${suffix}`, {
    signal: params.signal
  });
}

export async function generatePayouts(payload: { opportunityId: string }): Promise<Payout[]> {
  return apiFetch<Payout[]>('payouts/generate', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function markPayoutPaid(id: string, paidAt?: string): Promise<Payout> {
  return apiFetch<Payout>(`payouts/${id}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify(paidAt ? { paidAt } : {})
  });
}
