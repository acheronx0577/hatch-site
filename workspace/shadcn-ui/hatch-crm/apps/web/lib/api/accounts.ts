import { apiFetch } from './api';

export interface Account {
  id: string;
  name?: string;
  website?: string | null;
  industry?: string | null;
  annualRevenue?: number | null;
  phone?: string | null;
  ownerId?: string | null;
  owner?: { id: string; name?: string } | null;
  billingAddress?: Record<string, unknown> | null;
  shippingAddress?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ListParams {
  q?: string;
  limit?: number;
  cursor?: string;
}

const buildQuery = (params?: Partial<ListParams>) => {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export interface AccountListResponse {
  items: Account[];
  nextCursor: string | null;
}

export async function listAccounts(params: ListParams = {}): Promise<AccountListResponse> {
  const response = await apiFetch<AccountListResponse>(`accounts${buildQuery(params)}`);
  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}

export async function getAccount(id: string): Promise<Account | null> {
  try {
    return await apiFetch<Account>(`accounts/${id}`);
  } catch (error) {
    return null;
  }
}

export async function createAccount(payload: Partial<Account>): Promise<Account> {
  return apiFetch<Account>('accounts', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateAccount(id: string, payload: Partial<Account>): Promise<Account> {
  return apiFetch<Account>(`accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}
