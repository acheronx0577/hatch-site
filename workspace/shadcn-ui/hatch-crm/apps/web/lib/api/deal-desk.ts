import { apiFetch } from './api';

export interface DealDeskRequest {
  id: string;
  opportunityId?: string;
  amount?: number | null;
  discountPct?: number | null;
  reason?: string | null;
  status?: string;
  createdAt?: string;
  decidedAt?: string | null;
}

export interface DealDeskListResponse {
  items: DealDeskRequest[];
  nextCursor: string | null;
}

export async function listDealDeskRequests(
  params: { status?: string; cursor?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<DealDeskListResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.cursor) search.set('cursor', params.cursor);
  if (typeof params.limit === 'number') search.set('limit', params.limit.toString());
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiFetch<DealDeskListResponse>(`deal-desk/requests${suffix}`, {
    signal: params.signal
  });
}

export async function submitDealDeskRequest(payload: {
  opportunityId: string;
  amount?: number;
  discountPct?: number;
  reason?: string;
}): Promise<DealDeskRequest> {
  return apiFetch<DealDeskRequest>('deal-desk/requests', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function approveDealDeskRequest(id: string): Promise<DealDeskRequest> {
  return apiFetch<DealDeskRequest>(`deal-desk/requests/${id}/approve`, {
    method: 'POST'
  });
}

export async function rejectDealDeskRequest(id: string): Promise<DealDeskRequest> {
  return apiFetch<DealDeskRequest>(`deal-desk/requests/${id}/reject`, {
    method: 'POST'
  });
}
