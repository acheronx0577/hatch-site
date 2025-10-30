import { apiFetch } from './api';

export interface ReOffer {
  id: string;
  listingId: string;
  personId: string;
  status: string;
  amount?: number | null;
  contingencies?: string[];
  decisionNote?: string | null;
  dealId?: string | null;
}

export interface CreateReOfferPayload {
  listingId: string;
  buyerContactId: string;
  amount: number;
  contingencies?: string[];
}

export interface DecideReOfferPayload {
  status: 'ACCEPTED' | 'REJECTED';
  decisionNote?: string;
}

export interface ReOfferListResponse {
  items: ReOffer[];
  nextCursor: string | null;
}

interface ListReOffersParams {
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
}

export async function listReOffers(
  listingId: string,
  params: ListReOffersParams = {}
): Promise<ReOfferListResponse> {
  const search = new URLSearchParams({ listingId });
  if (params.cursor) search.set('cursor', params.cursor);
  if (typeof params.limit === 'number') search.set('limit', params.limit.toString());
  return apiFetch<ReOfferListResponse>(`re/offers?${search.toString()}`, {
    signal: params.signal
  });
}

export async function createReOffer(payload: CreateReOfferPayload): Promise<ReOffer> {
  return apiFetch<ReOffer>('re/offers', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function decideReOffer(id: string, payload: DecideReOfferPayload) {
  return apiFetch<{ offer: ReOffer }>(`re/offers/${id}/decide`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
