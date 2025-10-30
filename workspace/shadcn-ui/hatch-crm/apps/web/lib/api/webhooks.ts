import { apiFetch } from './api';

export interface WebhookSubscription {
  id: string;
  tenantId: string;
  eventType: string;
  url: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListWebhookSubscriptionsParams {
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
  status?: 'all' | 'active' | 'inactive';
}

export interface WebhookSubscriptionListResponse {
  items: WebhookSubscription[];
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

export async function listWebhookSubscriptions(
  params: ListWebhookSubscriptionsParams = {}
): Promise<WebhookSubscriptionListResponse> {
  const query = buildQuery({
    cursor: params.cursor ?? undefined,
    limit: params.limit,
    active:
      params.status === 'active'
        ? 'true'
        : params.status === 'inactive'
          ? 'false'
          : undefined
  });

  const response = await apiFetch<WebhookSubscriptionListResponse>(
    `webhooks/subscriptions${query}`,
    { signal: params.signal }
  );

  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}
