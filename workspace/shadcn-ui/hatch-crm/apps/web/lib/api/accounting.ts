import { apiFetch } from './api';

export interface AccountingIntegrationConfig {
  id: string;
  organizationId: string;
  provider: 'QUICKBOOKS';
  realmId?: string | null;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
}

export interface TransactionAccountingRecord {
  id: string;
  transactionId: string;
  provider: string;
  externalId?: string | null;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  lastSyncAt?: string | null;
  errorMessage?: string | null;
  transaction?: {
    id: string;
    status: string;
    closingDate?: string | null;
    listing?: {
      addressLine1?: string | null;
      city?: string | null;
      state?: string | null;
      listPrice?: number | null;
    } | null;
  } | null;
}

export interface RentalLeaseAccountingRecord {
  id: string;
  leaseId: string;
  provider: string;
  externalId?: string | null;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  lastSyncAt?: string | null;
  errorMessage?: string | null;
  lease?: {
    id: string;
    tenantName: string;
    startDate: string;
    endDate: string;
    rentAmount?: number | null;
    unit?: {
      name?: string | null;
      property?: {
        addressLine1?: string | null;
        city?: string | null;
        state?: string | null;
      } | null;
    } | null;
  } | null;
}

export interface AccountingSyncStatusResponse {
  config?: AccountingIntegrationConfig | null;
  transactions: TransactionAccountingRecord[];
  rentalLeases: RentalLeaseAccountingRecord[];
}

export async function fetchAccountingSyncStatus(orgId: string): Promise<AccountingSyncStatusResponse> {
  return apiFetch<AccountingSyncStatusResponse>(`organizations/${orgId}/accounting/sync-status`);
}

export async function connectAccounting(
  orgId: string,
  payload: { provider: 'QUICKBOOKS'; realmId: string }
): Promise<AccountingIntegrationConfig> {
  return apiFetch<AccountingIntegrationConfig>(`organizations/${orgId}/accounting/connect`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function syncTransactionRecord(orgId: string, transactionId: string) {
  return apiFetch<TransactionAccountingRecord>(`organizations/${orgId}/accounting/sync-transaction`, {
    method: 'POST',
    body: { transactionId }
  });
}

export async function syncRentalLeaseRecord(orgId: string, leaseId: string) {
  return apiFetch<RentalLeaseAccountingRecord>(`organizations/${orgId}/accounting/sync-lease`, {
    method: 'POST',
    body: { leaseId }
  });
}
