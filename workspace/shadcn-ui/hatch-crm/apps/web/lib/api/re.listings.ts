import { apiFetch } from './api';
import type { ReOffer } from './re.offers';

export interface ReListing {
  id: string;
  status: string;
  opportunityId?: string | null;
  opportunityStage?: string | null;
  offers: ReOffer[];
  transactionId?: string | null;
}

export async function getReListing(id: string): Promise<ReListing> {
  return apiFetch<ReListing>(`re/listings/${id}`);
}

export async function updateReListingStatus(id: string, status: string): Promise<ReListing> {
  return apiFetch<ReListing>(`re/listings/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status })
  });
}
