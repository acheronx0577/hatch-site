import { apiFetch } from './api';

export interface MilestoneItem {
  name: string;
  completedAt?: string | null;
  notes?: string | null;
}

export interface ReTransaction {
  id: string;
  stage: string;
  listingId: string | null;
  personId: string | null;
  opportunityId: string | null;
  milestoneChecklist: { items: MilestoneItem[] };
  commissionSnapshot?: Record<string, unknown> | null;
  listing?: {
    id: string;
    status: string;
    opportunityId?: string | null;
    price?: number | null;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
  } | null;
}

export interface CommissionPreview {
  gross: number;
  brokerAmount: number;
  agentAmount: number;
  schedule: Array<{ payee: string; amount: number }>;
  planId?: string | null;
}

export async function getReTransaction(id: string): Promise<ReTransaction> {
  return apiFetch<ReTransaction>(`re/transactions/${id}`);
}

export async function updateTransactionMilestone(id: string, payload: { name: string; completedAt?: string; notes?: string }) {
  return apiFetch<ReTransaction>(`re/transactions/${id}/milestone`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function getTransactionCommission(id: string): Promise<CommissionPreview> {
  return apiFetch<CommissionPreview>(`re/transactions/${id}/commission`);
}

export async function generateTransactionPayouts(id: string) {
  return apiFetch(`re/transactions/${id}/payouts`, {
    method: 'POST'
  });
}
