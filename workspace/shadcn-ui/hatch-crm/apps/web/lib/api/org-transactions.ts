import { apiFetch } from './api';

export interface OrgTransactionRecord {
  id: string;
  status: string;
  listingId?: string | null;
  agentProfileId?: string | null;
  buyerName?: string | null;
  sellerName?: string | null;
  contractSignedAt?: string | null;
  inspectionDate?: string | null;
  financingDate?: string | null;
  closingDate?: string | null;
  isCompliant?: boolean;
  requiresAction?: boolean;
  contractInstances?: Array<{
    id: string;
    status: string;
    title: string;
    updatedAt: string;
    template?: {
      id: string;
      code: string;
      name: string;
    } | null;
  }>;
  listing?: {
    id: string;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    listPrice?: number | null;
  } | null;
  agentProfile?: {
    id: string;
    user?: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    } | null;
  } | null;
  documents?: Array<{
    id: string;
    type?: string | null;
    orgFile?: {
      id: string;
      documentType?: string | null;
      complianceStatus?: string | null;
    } | null;
  }>;
}

export async function fetchOrgTransactions(orgId: string): Promise<OrgTransactionRecord[]> {
  const transactions = await apiFetch<OrgTransactionRecord[]>(`organizations/${orgId}/transactions`);
  return transactions ?? [];
}

export async function updateOrgTransaction(
  orgId: string,
  transactionId: string,
  payload: {
    status?: string;
    buyerName?: string | null;
    sellerName?: string | null;
    buyerPersonId?: string | null;
    sellerPersonId?: string | null;
    contractSignedAt?: string | null;
    inspectionDate?: string | null;
    financingDate?: string | null;
    closingDate?: string | null;
    isCompliant?: boolean;
    requiresAction?: boolean;
    complianceNotes?: string | null;
  }
): Promise<OrgTransactionRecord> {
  return apiFetch<OrgTransactionRecord>(`organizations/${orgId}/transactions/${transactionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function createOrgTransaction(
  orgId: string,
  payload: {
    listingId?: string;
    agentProfileId?: string;
    buyerName?: string;
    sellerName?: string;
    buyerPersonId?: string;
    sellerPersonId?: string;
    contractSignedAt?: string;
    inspectionDate?: string;
    financingDate?: string;
    closingDate?: string;
  }
): Promise<OrgTransactionRecord> {
  return apiFetch<OrgTransactionRecord>(`organizations/${orgId}/transactions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
