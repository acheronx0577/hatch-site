import { apiFetch } from './hatch';

export interface Account {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  ownerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountListResponse {
  items: Account[];
  nextCursor: string | null;
}

export async function listAccounts(params: { q?: string; cursor?: string | null; limit?: number } = {}): Promise<AccountListResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (typeof params.limit === 'number') search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const res = await apiFetch<AccountListResponse | Account[]>(`accounts${suffix}`);
  if (Array.isArray(res)) {
    return { items: res, nextCursor: null };
  }
  return { items: res.items ?? [], nextCursor: res.nextCursor ?? null };
}

export async function getAccount(id: string): Promise<Account | null> {
  try {
    return await apiFetch<Account>(`accounts/${id}`);
  } catch {
    return null;
  }
}

export async function createAccount(payload: {
  name: string;
  phone?: string;
  website?: string;
  industry?: string;
  annualRevenue?: number;
}): Promise<Account> {
  return apiFetch<Account>('accounts', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateAccount(id: string, payload: {
  name?: string;
  phone?: string;
  website?: string;
  industry?: string;
  annualRevenue?: number;
}): Promise<Account> {
  return apiFetch<Account>(`accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteAccount(id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`accounts/${id}`, {
    method: 'DELETE'
  });
}

export async function bulkDeleteAccounts(ids: string[]): Promise<{ deleted: number }> {
  const results = await Promise.allSettled(ids.map(id => deleteAccount(id)));
  const deleted = results.filter(r => r.status === 'fulfilled').length;
  return { deleted };
}
