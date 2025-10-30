import { apiFetch } from './api';

export type MessageChannel = 'SMS' | 'EMAIL' | 'PUSH' | 'IN_APP' | 'VOICE';

export interface MessageListItem {
  id: string;
  tenantId: string;
  personId?: string | null;
  userId?: string | null;
  channel: MessageChannel;
  direction: 'INBOUND' | 'OUTBOUND';
  subject?: string | null;
  body?: string | null;
  toAddress?: string | null;
  fromAddress?: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ListMessagesParams {
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
  channel?: MessageChannel | 'all';
  direction?: 'INBOUND' | 'OUTBOUND' | 'all';
  q?: string;
  tenantId?: string;
}

export interface MessageListResponse {
  items: MessageListItem[];
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

export async function listMessages(
  params: ListMessagesParams = {}
): Promise<MessageListResponse> {
  const query = buildQuery({
    cursor: params.cursor ?? undefined,
    limit: params.limit,
    q: params.q,
    tenantId: params.tenantId,
    channel: params.channel && params.channel !== 'all' ? params.channel : undefined,
    direction:
      params.direction && params.direction !== 'all'
        ? params.direction
        : undefined
  });

  const response = await apiFetch<MessageListResponse>(`messages${query}`, {
    signal: params.signal
  });

  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}
