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

const buildQuery = (params: object) => {
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

export interface CaseDetail extends CaseSummary {
  description?: string | null;
  ownerId?: string | null;
}

export interface CaseFileLink {
  id: string;
  fileId: string;
  file?: {
    name?: string | null;
    mimeType?: string | null;
  } | null;
}

export async function getCase(caseId: string): Promise<CaseDetail> {
  return apiFetch<CaseDetail>(`cases/${caseId}`);
}

export async function listCaseFiles(caseId: string): Promise<CaseFileLink[]> {
  const response = await apiFetch<{ items?: CaseFileLink[] }>(`cases/${caseId}/files`);
  return response.items ?? [];
}
