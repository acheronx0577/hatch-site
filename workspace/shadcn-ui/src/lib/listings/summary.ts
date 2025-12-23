export type ListingPipelineSummary = {
  total: number;
  active: number;
  pending: number;
  flagged: number;
  expiringSoon: number;
};

export function isFlaggedListingStatus(status?: string | null) {
  const normalized = (status ?? '').toLowerCase();
  return normalized.includes('approval') || normalized.includes('flag') || normalized.includes('needs');
}

export function isPendingListingStatus(status?: string | null) {
  return (status ?? '').toLowerCase().startsWith('pending');
}

export function isActiveListingStatus(status?: string | null) {
  return (status ?? '').toLowerCase() === 'active';
}

export function isExpiringSoon(expiresAt?: string | null, windowDays = 30) {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt).getTime();
  const now = Date.now();
  const windowMs = 1000 * 60 * 60 * 24 * windowDays;
  return expires - now <= windowMs && expires >= now;
}

export function summarizeListings(
  listings: Array<{ status?: string | null; expiresAt?: string | null }>
): ListingPipelineSummary {
  let active = 0;
  let pending = 0;
  let flagged = 0;
  let expiringSoon = 0;

  for (const listing of listings) {
    if (isActiveListingStatus(listing.status)) active += 1;
    if (isPendingListingStatus(listing.status)) pending += 1;
    if (isFlaggedListingStatus(listing.status)) flagged += 1;
    if (isExpiringSoon(listing.expiresAt)) expiringSoon += 1;
  }

  return { total: listings.length, active, pending, flagged, expiringSoon };
}

