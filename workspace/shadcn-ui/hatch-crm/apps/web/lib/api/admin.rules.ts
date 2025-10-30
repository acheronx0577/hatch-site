import { apiFetch } from './api';

export type RuleObject = 'accounts' | 'opportunities' | 'cases' | 're_offers' | 're_transactions';

export interface RuleRecord {
  id: string;
  orgId: string;
  object: RuleObject;
  name: string;
  active: boolean;
  dsl: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: RuleRecord[];
  nextCursor: string | null;
}

export interface RulePayload {
  object: RuleObject;
  name: string;
  active?: boolean;
  dsl: Record<string, unknown>;
}

export interface RuleUpdate {
  object?: RuleObject;
  name?: string;
  active?: boolean;
  dsl?: Record<string, unknown>;
}

interface ListParams {
  object?: string;
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
}

const buildQuery = (params?: ListParams) => {
  if (!params) {
    return { suffix: '', signal: undefined as AbortSignal | undefined };
  }
  const search = new URLSearchParams();
  if (params.object) search.set('object', params.object);
  if (params.cursor) search.set('cursor', params.cursor);
  if (typeof params.limit === 'number') search.set('limit', params.limit.toString());
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return { suffix, signal: params.signal };
};

export async function listValidationRules(
  params?: { object?: RuleObject; cursor?: string | null; limit?: number; signal?: AbortSignal }
): Promise<ListResponse> {
  const { suffix, signal } = buildQuery(params);
  return apiFetch<ListResponse>(`admin/rules/validation${suffix}`, { signal });
}

export async function createValidationRule(payload: RulePayload): Promise<RuleRecord> {
  return apiFetch<RuleRecord>('admin/rules/validation', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateValidationRule(id: string, patch: RuleUpdate): Promise<RuleRecord> {
  return apiFetch<RuleRecord>(`admin/rules/validation/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export async function deleteValidationRule(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`admin/rules/validation/${id}`, {
    method: 'DELETE'
  });
}

export async function listAssignmentRules(
  params?: { object?: RuleObject; cursor?: string | null; limit?: number; signal?: AbortSignal }
): Promise<ListResponse> {
  const { suffix, signal } = buildQuery(params);
  return apiFetch<ListResponse>(`admin/rules/assignment${suffix}`, { signal });
}

export async function createAssignmentRule(payload: RulePayload): Promise<RuleRecord> {
  return apiFetch<RuleRecord>('admin/rules/assignment', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateAssignmentRule(id: string, patch: RuleUpdate): Promise<RuleRecord> {
  return apiFetch<RuleRecord>(`admin/rules/assignment/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

export async function deleteAssignmentRule(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`admin/rules/assignment/${id}`, {
    method: 'DELETE'
  });
}
