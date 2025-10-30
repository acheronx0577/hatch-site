import { apiFetch } from '@/lib/api';

export type CaseStatus = 'New' | 'Working' | 'Escalated' | 'Resolved' | 'Closed';
export type CasePriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface CaseSummary {
  id: string;
  subject?: string;
  status?: CaseStatus | null;
  priority?: CasePriority | null;
  origin?: string | null;
  createdAt?: string;
  updatedAt?: string;
  account?: {
    id: string;
    name?: string | null;
  } | null;
  contact?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

export interface CaseListParams {
  q?: string;
  status?: string;
  priority?: string;
  limit?: number;
  cursor?: string;
}

export interface CaseListResponse {
  items: CaseSummary[];
  nextCursor: string | null;
}

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export async function listCases(params: CaseListParams = {}): Promise<CaseListResponse> {
  const response = await apiFetch<CaseListResponse>(`cases${buildQuery(params)}`);
  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}
