import { apiFetch } from '@/lib/api/hatch';
import { fetchBrokerProperties } from '@/lib/api/properties';
import type { BrokerPropertyRow } from '@/lib/api/properties';

export interface OrgListingAgent {
  id: string;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
}

export interface OrgListingDocumentRecord {
  id: string;
  type: string;
  createdAt?: string;
  orgFile?: {
    id: string;
    name: string;
    fileId: string;
    category?: string;
    documentType?: string;
    complianceStatus?: string;
    reviewStatus?: string;
    createdAt?: string;
  } | null;
}

export interface OrgListingRecord {
  id: string;
  status: string;
  agentProfileId?: string | null;
  mlsNumber?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  listPrice?: number | null;
  propertyType?: string | null;
  propertySubType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  lotSizeSqFt?: number | null;
  lotSizeAcres?: number | null;
  yearBuilt?: number | null;
  county?: string | null;
  parcelId?: string | null;
  garageSpaces?: number | null;
  propertyView?: string | null;
  waterSource?: string | null;
  sewerSystem?: string | null;
  publicRemarks?: string | null;
  privateRemarks?: string | null;
  showingInstructions?: string | null;
  cooling?: string | null;
  heating?: string | null;
  parkingFeatures?: string | null;
  exteriorFeatures?: string | null;
  interiorFeatures?: string | null;
  appliances?: string | null;
  taxes?: number | null;
  photos?: string[];
  coverPhotoUrl?: string | null;
  expiresAt?: string | null;
  agentProfile?: OrgListingAgent | null;
  documents?: OrgListingDocumentRecord[];
  brokerApproved?: boolean | null;
  listedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const fetchOrgListings = async (orgId: string): Promise<OrgListingRecord[]> => {
  const listings = await apiFetch<OrgListingRecord[]>(`organizations/${orgId}/listings`);
  if (listings && listings.length > 0) return listings;

  // Fallback: use broker properties when org listings table is empty (local/demo)
  const props = await fetchBrokerProperties();
  return (props ?? []).map(mapPropertyToOrgListing);
};

const mapPropertyToOrgListing = (prop: BrokerPropertyRow): OrgListingRecord => ({
  id: prop.id,
  status: (prop.state ?? '').toUpperCase(),
  mlsNumber: prop.mls_number ?? undefined,
  addressLine1: prop.address_line ?? [prop.street_number, prop.street_name, prop.street_suffix].filter(Boolean).join(' ').trim(),
  addressLine2: null,
  city: prop.city ?? '',
  state: prop.state_code ?? '',
  postalCode: prop.zip_code ?? '',
  listPrice: prop.list_price ?? null,
  propertyType: prop.property_type ?? null,
  propertySubType: prop.property_sub_type ?? null,
  bedrooms: prop.bedrooms_total ?? null,
  bathrooms: prop.bathrooms_total ?? prop.bathrooms_full ?? null,
  squareFeet: prop.living_area_sq_ft ?? null,
  lotSizeSqFt: prop.lot_size_sq_ft ?? null,
  lotSizeAcres: prop.lot_size_acres ?? null,
  yearBuilt: prop.year_built ?? null,
  county: prop.county ?? null,
  parcelId: prop.parcel_id ?? null,
  garageSpaces: prop.garage_spaces ?? null,
  propertyView: prop.property_view ?? null,
  waterSource: prop.water_source ?? null,
  sewerSystem: prop.sewer_system ?? null,
  publicRemarks: prop.public_remarks ?? null,
  privateRemarks: prop.private_remarks ?? null,
  showingInstructions: prop.showing_instructions ?? null,
  cooling: prop.cooling ?? null,
  heating: prop.heating ?? null,
  parkingFeatures: prop.parking_features ?? null,
  exteriorFeatures: prop.exterior_features ?? null,
  interiorFeatures: prop.interior_features ?? null,
  appliances: prop.appliances ?? null,
  taxes: prop.taxes ?? null,
  photos: prop.photos ?? [],
  coverPhotoUrl: prop.cover_photo_url ?? (prop.photos?.[0] ?? null),
  expiresAt: null,
  agentProfile: null,
});

export type FullPropertyComparable = {
  address: string;
  price: number;
  sqft: number | null;
  pricePerSqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  soldDate: string;
  distanceMiles: number | null;
};

export type FullPropertyMlsDetails = {
  propertyType: string | null;
  yearBuilt: number | null;
  sqft: number | null;
  lotSize: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  stories: number | null;
  parkingSpaces: number | null;
  garageType: string | null;
  pool: boolean | null;
  waterfront: boolean | null;
  view: string | null;
  construction: string | null;
  roofType: string | null;
  foundation: string | null;
  cooling: string | null;
  heating: string | null;
  electric: string | null;
  sewer: string | null;
  water: string | null;
  hoa: boolean | null;
  hoaFee: number | null;
  hoaFrequency: string | null;
  taxAmount: number | null;
  taxYear: number | null;
  assessedValue: number | null;
  interiorFeatures: string[] | null;
  exteriorFeatures: string[] | null;
  appliances: string[] | null;
  flooring: string[] | null;
  publicRemarks: string | null;
  privateRemarks: string | null;
  listDate: string | null;
  daysOnMarket: number | null;
  lastPriceChange: string | null;
  photos: string[];
  virtualTourUrl: string | null;
};

export type FullPropertyAreaMetrics = {
  population: number | null;
  medianAge: number | null;
  medianIncome: number | null;
  medianHomeValue: number | null;
  avgPricePerSqft: number | null;
  homeownershipRate: number | null;
  avgDaysOnMarket: number | null;
  listToSaleRatio: number | null;
  inventoryMonths: number | null;
  priceChange1Year: number | null;
  priceChange5Year: number | null;
  schoolDistrict: string | null;
  schoolRatings: Array<{
    name: string;
    type: string | null;
    distance: string | null;
    rating: number;
  }>;
  walkScore: number | null;
  transitScore: number | null;
  bikeScore: number | null;
};

export type FullPropertyDetailsResponse = {
  listing: OrgListingRecord;
  mlsDetails: FullPropertyMlsDetails | null;
  areaMetrics: FullPropertyAreaMetrics | null;
  comparables: FullPropertyComparable[];
};

export const fetchOrgListingDetails = async (orgId: string, listingId: string) =>
  apiFetch<FullPropertyDetailsResponse>(`organizations/${orgId}/listings/${listingId}/details`);

export type ListingRecommendationPriority = 'high' | 'medium' | 'low';

export type ListingRecommendation = {
  type: string;
  title: string;
  description: string;
  priority: ListingRecommendationPriority;
  field?: string;
  documentType?: string;
};

export type ListingRecommendationsResponse = {
  stageRecommendations: ListingRecommendation[];
  missingFields: string[];
  contractGaps: string[];
  aiRecommendations: ListingRecommendation[];
  complianceIssues: ListingComplianceIssue[];
  nextActions: ListingRecommendation[];
};

export const fetchOrgListingRecommendations = async (orgId: string, listingId: string) =>
  apiFetch<ListingRecommendationsResponse>(`organizations/${orgId}/listings/${listingId}/recommendations`);

export type ListingComplianceIssue = {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  description: string;
  resolutionSteps: string[];
  metadata?: Record<string, unknown>;
};

export type ListingActivityEvent = {
  id: string;
  type: string;
  message?: string | null;
  createdAt: string;
  actor?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  payload?: Record<string, unknown> | null;
};

export const fetchOrgListingActivity = async (orgId: string, listingId: string) =>
  apiFetch<ListingActivityEvent[]>(`organizations/${orgId}/listings/${listingId}/activity`);

export const requestOrgListingApproval = async (orgId: string, listingId: string) =>
  apiFetch<OrgListingRecord>(`organizations/${orgId}/listings/${listingId}/request-approval`, { method: 'POST' });

export const approveOrgListing = async (orgId: string, listingId: string, payload?: { note?: string }) =>
  apiFetch<OrgListingRecord>(`organizations/${orgId}/listings/${listingId}/approve`, { method: 'POST', body: payload ?? {} });

export const requestOrgListingChanges = async (orgId: string, listingId: string, payload?: { note?: string }) =>
  apiFetch<OrgListingRecord>(`organizations/${orgId}/listings/${listingId}/request-changes`, { method: 'POST', body: payload ?? {} });

export const rejectOrgListing = async (orgId: string, listingId: string, payload?: { note?: string }) =>
  apiFetch<OrgListingRecord>(`organizations/${orgId}/listings/${listingId}/reject`, { method: 'POST', body: payload ?? {} });
