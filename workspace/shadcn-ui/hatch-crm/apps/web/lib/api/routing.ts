import { apiFetch } from './api';

export interface RoutingRule {
  id: string;
  tenantId: string;
  name: string;
  priority: number;
  mode: string;
  enabled: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface ListRoutingRulesParams {
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
  q?: string;
  mode?: string;
}

export interface RoutingRuleListResponse {
  items: RoutingRule[];
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

export async function listRoutingRules(
  params: ListRoutingRulesParams = {}
): Promise<RoutingRuleListResponse> {
  const query = buildQuery({
    cursor: params.cursor ?? undefined,
    limit: params.limit,
    q: params.q,
    mode: params.mode
  });

  const response = await apiFetch<RoutingRuleListResponse>(
    `routing/rules${query}`,
    { signal: params.signal }
  );

  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}
