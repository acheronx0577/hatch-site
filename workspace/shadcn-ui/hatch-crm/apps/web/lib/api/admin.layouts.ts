import { apiFetch } from './api';

export type LayoutKind = 'detail' | 'list';

export interface LayoutField {
  field: string;
  label?: string;
  order: number;
  width?: number;
}

export interface LayoutManifest {
  object: string;
  kind: LayoutKind;
  fields: LayoutField[];
}

interface ResolveParams {
  object: string;
  kind: LayoutKind;
  recordTypeId?: string;
  profile?: string;
  signal?: AbortSignal;
}

interface UpsertPayload {
  object: string;
  kind: LayoutKind;
  recordTypeId?: string | null;
  profile?: string | null;
  fields: LayoutField[];
}

const encodeQuery = (params: ResolveParams) => {
  const search = new URLSearchParams();
  search.set('object', params.object);
  search.set('kind', params.kind);
  if (params.recordTypeId) search.set('recordTypeId', params.recordTypeId);
  if (params.profile) search.set('profile', params.profile);
  return search.toString();
};

export async function resolveLayout(params: ResolveParams): Promise<LayoutManifest> {
  const query = encodeQuery(params);
  return apiFetch<LayoutManifest>(`admin/layouts/resolve?${query}`, {
    signal: params.signal
  });
}

export async function upsertLayout(payload: UpsertPayload): Promise<LayoutManifest> {
  return apiFetch<LayoutManifest>('admin/layouts/upsert', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
