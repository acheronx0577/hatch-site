import { apiFetch } from './api';

export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'SHARE', 'LOGIN'] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditActor {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface AuditEvent {
  id: string;
  action: AuditAction;
  object?: string | null;
  objectId?: string | null;
  createdAt: string;
  diff?: unknown | null;
  ip?: string | null;
  userAgent?: string | null;
  actor?: AuditActor | null;
}

export interface AuditListResponse {
  items: AuditEvent[];
  nextCursor: string | null;
}

export interface ListAuditParams {
  cursor?: string | null;
  limit?: number;
  actorId?: string;
  object?: string;
  objectId?: string;
  action?: AuditAction | 'all';
  from?: string;
  to?: string;
  signal?: AbortSignal;
}

const encodeAuditQuery = (params: ListAuditParams) => {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.actorId) search.set('actorId', params.actorId);
  if (params.object) search.set('object', params.object);
  if (params.objectId) search.set('objectId', params.objectId);
  if (params.action && params.action !== 'all') search.set('action', params.action);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  return search.toString();
};

export async function listAuditEvents(params: ListAuditParams = {}): Promise<AuditListResponse> {
  const query = encodeAuditQuery(params);
  const response = await apiFetch<AuditListResponse>(`admin/audit${query ? `?${query}` : ''}`, {
    signal: params.signal
  });
  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}
