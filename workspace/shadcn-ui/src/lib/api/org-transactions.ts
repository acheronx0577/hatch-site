import { apiFetch } from '@/lib/api/hatch';

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
  complianceNotes?: string | null;
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
}

export const fetchOrgTransactions = async (orgId: string): Promise<OrgTransactionRecord[]> => {
  const transactions = await apiFetch<OrgTransactionRecord[]>(`organizations/${orgId}/transactions`);
  return transactions ?? [];
};

export type UpdateOrgTransactionPayload = {
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
};

export const updateOrgTransaction = async (
  orgId: string,
  transactionId: string,
  payload: UpdateOrgTransactionPayload
): Promise<OrgTransactionRecord> => {
  return apiFetch<OrgTransactionRecord>(`organizations/${orgId}/transactions/${transactionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
};

export type OrgTransactionActivityEvent = {
  id: string;
  type: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
};

export const fetchOrgTransactionActivity = async (
  orgId: string,
  transactionId: string
): Promise<OrgTransactionActivityEvent[]> => {
  const events = await apiFetch<OrgTransactionActivityEvent[]>(
    `organizations/${orgId}/transactions/${transactionId}/activity`
  );
  return events ?? [];
};
