import { apiFetch } from '@/lib/api';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired' | 'superseded';

export type AiPendingAction = {
  id: string;
  organizationId: string;
  feature: string;
  actionType: string;
  generatedContent: string;
  contentPreview: string;
  requestedById: string;
  entityType?: string | null;
  entityId?: string | null;
  originalRequest: unknown;
  status: ApprovalStatus;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  executedAt?: string | null;
  executionResult?: unknown | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
};

export async function fetchAiPendingActions(params?: {
  status?: ApprovalStatus;
  feature?: string;
  actionType?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaginatedResult<AiPendingAction>> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.feature) query.set('feature', params.feature);
  if (params?.actionType) query.set('actionType', params.actionType);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.cursor) query.set('cursor', params.cursor);

  const suffix = query.toString();
  return apiFetch<PaginatedResult<AiPendingAction>>(`ai/pending-actions${suffix ? `?${suffix}` : ''}`);
}

export async function approveAiPendingAction(id: string, notes?: string) {
  return apiFetch<{ ok: boolean }>(`ai/pending-actions/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: notes ? { notes } : {}
  });
}

export async function rejectAiPendingAction(id: string, reason: string) {
  return apiFetch<{ ok: boolean }>(`ai/pending-actions/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: { reason }
  });
}

export async function regenerateAiPendingAction(id: string, generatedContent: string, notes?: string) {
  return apiFetch<{ ok: boolean; action: AiPendingAction }>(`ai/pending-actions/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
    body: notes ? { generatedContent, notes } : { generatedContent }
  });
}

export async function executeAiPendingAction(id: string) {
  return apiFetch<{ ok: boolean; result: unknown | null }>(`ai/pending-actions/${encodeURIComponent(id)}/execute`, {
    method: 'POST'
  });
}

