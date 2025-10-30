import { apiFetch } from './api';

export interface JourneyListItem {
  id: string;
  tenantId: string;
  name: string;
  trigger: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListJourneysParams {
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
  q?: string;
  active?: 'all' | 'active' | 'inactive';
  tenantId?: string;
}

export interface JourneyListResponse {
  items: JourneyListItem[];
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

export async function listJourneys(
  params: ListJourneysParams = {}
): Promise<JourneyListResponse> {
  const query = buildQuery({
    cursor: params.cursor ?? undefined,
    limit: params.limit,
    q: params.q,
    tenantId: params.tenantId,
    active:
      params.active === 'active'
        ? 'true'
        : params.active === 'inactive'
          ? 'false'
          : undefined
  });

  const response = await apiFetch<JourneyListResponse>(`journeys${query}`, {
    signal: params.signal
  });

  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}
