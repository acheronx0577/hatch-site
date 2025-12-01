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
