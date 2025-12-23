import { apiFetch } from '@/lib/api/hatch';
import { ApiError } from '@/lib/api/errors';

export type FinancialsPeriod = 'month' | 'quarter' | 'year';
export type FinancialsSource = 'auto' | 'internal' | 'quickbooks';

export type LedgerEntryType = 'INCOME' | 'EXPENSE';

export type OrgLedgerEntry = {
  id: string;
  orgId: string;
  type: LedgerEntryType;
  category: string;
  amount: number;
  currency: string;
  occurredAt: string;
  memo: string | null;
  transactionId: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LedgerEntriesListResponse = { items: OrgLedgerEntry[]; nextCursor: string | null };

export type FinancialsDashboardResponse = {
  period: FinancialsPeriod;
  dateRange: { start: string; end: string };
  source: 'internal' | 'quickbooks';
  quickbooks: { connected: boolean; realmId: string | null; connectedAt: string | null };
  revenue: { total: number; bySource: Array<{ label: string; amount: number }> };
  expenses: { total: number; byCategory: Array<{ label: string; amount: number }> };
  commissions: {
    total: number;
    paid: number;
    pending: number;
    byAgent: Array<{ agentId: string; agentName: string; paid: number; pending: number; total: number }>;
  };
  transactions: { closed: number; volume: number; avgPrice: number };
  netIncome: number;
  recentPayouts: Array<{
    id: string;
    opportunityId: string | null;
    payeeId: string;
    payeeName: string;
    status: string;
    grossAmount: number;
    brokerAmount: number;
    agentAmount: number;
    createdAt: string;
    paidAt: string | null;
  }>;
  warnings: Array<{ source: 'quickbooks' | 'internal'; message: string }>;
};

export async function fetchFinancialsDashboard(
  orgId: string,
  params: { period?: FinancialsPeriod; source?: FinancialsSource } = {}
): Promise<FinancialsDashboardResponse> {
  const query = new URLSearchParams();
  if (params.period) query.set('period', params.period);
  if (params.source) query.set('source', params.source);

  const path = `organizations/${encodeURIComponent(orgId)}/financials/dashboard${query.size ? `?${query.toString()}` : ''}`;

  try {
    return await apiFetch<FinancialsDashboardResponse>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError('Financials API is not available in this environment.', 404);
    }
    throw error;
  }
}

export async function listLedgerEntries(
  orgId: string,
  params: {
    cursor?: string | null;
    limit?: number;
    type?: LedgerEntryType;
    category?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
  } = {}
): Promise<LedgerEntriesListResponse> {
  const query = new URLSearchParams();
  if (params.cursor) query.set('cursor', params.cursor);
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));
  if (params.type) query.set('type', params.type);
  if (params.category) query.set('category', params.category);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (typeof params.minAmount === 'number') query.set('minAmount', String(params.minAmount));

  const path = `organizations/${encodeURIComponent(orgId)}/financials/ledger${query.size ? `?${query.toString()}` : ''}`;
  return apiFetch<LedgerEntriesListResponse>(path);
}

export async function createLedgerEntry(
  orgId: string,
  payload: {
    type: LedgerEntryType;
    category: string;
    amount: number;
    currency?: string;
    occurredAt: string;
    memo?: string;
    transactionId?: string;
  }
): Promise<OrgLedgerEntry> {
  return apiFetch<OrgLedgerEntry>(`organizations/${encodeURIComponent(orgId)}/financials/ledger`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateLedgerEntry(
  orgId: string,
  entryId: string,
  payload: Partial<{
    type: LedgerEntryType;
    category: string;
    amount: number;
    currency: string;
    occurredAt: string;
    memo: string | null;
    transactionId: string | null;
  }>
): Promise<OrgLedgerEntry> {
  return apiFetch<OrgLedgerEntry>(`organizations/${encodeURIComponent(orgId)}/financials/ledger/${encodeURIComponent(entryId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteLedgerEntry(orgId: string, entryId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(
    `organizations/${encodeURIComponent(orgId)}/financials/ledger/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' }
  );
}
