// @ts-nocheck
import { Injectable, NotFoundException } from '@nestjs/common';
import { Listing } from '@hatch/db';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import type { BrokerPropertyRow, PromoteDraftPayload } from './types';

@Injectable()
export class ListingsService {
  private readonly promoted = new Map<string, BrokerPropertyRow>();

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<BrokerPropertyRow[]> {
    const mappedPrisma: BrokerPropertyRow[] = [];
    const promoted = Array.from(this.promoted.values()).filter(
      (row) => row.org_id === tenantId || row.firm_id === tenantId
    );

    return [...mappedPrisma, ...promoted].sort((a, b) => {
      const getTime = (row: BrokerPropertyRow) =>
        Date.parse(row.updated_at ?? row.created_at ?? new Date(0).toISOString());
      return getTime(b) - getTime(a);
    });
  }

  promote(tenantId: string, userId: string, payload: PromoteDraftPayload): BrokerPropertyRow {
    const now = new Date().toISOString();
    const id = payload.draftId ?? randomUUID();

    const property = payload.property ?? {};

    const get = <T = unknown>(...keys: string[]): T | undefined => {
      for (const key of keys) {
        if (key in property && property[key] !== undefined && property[key] !== null) {
          return property[key] as T;
        }
      }
      return undefined;
    };

    const toNumber = (value: unknown) => {
      if (value === undefined || value === null || value === '') return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const toString = (value: unknown) => {
      if (value === undefined || value === null) return null;
      const str = String(value).trim();
      return str.length ? str : null;
    };

    const streetNumber = toString(get('streetNumber', 'street_number'));
    const streetName = toString(get('streetName', 'street_name'));
    const streetSuffix = toString(get('streetSuffix', 'street_suffix'));

    const fallbackAddress = [streetNumber, streetName, streetSuffix]
      .filter((part): part is string => Boolean(part && part.trim().length))
      .join(' ') 
      .trim();

    const addressLine =
      toString(get('addressLine', 'address_line')) ?? (fallbackAddress.length ? fallbackAddress : null);

    const listPrice = toNumber(get('listPrice', 'list_price'));
    const bedroomsTotal = toNumber(get('bedroomsTotal', 'bedrooms', 'bedrooms_total'));
    const bathroomsFull = toNumber(get('bathroomsFull', 'bathrooms', 'bathrooms_full'));
    const bathroomsHalf = toNumber(get('bathroomsHalf', 'bathrooms_half'));
    const bathroomsTotal =
      toNumber(get('bathroomsTotal', 'bathrooms_total')) ??
      (bathroomsFull !== null && bathroomsHalf !== null ? bathroomsFull + bathroomsHalf * 0.5 : bathroomsFull);

    const livingArea = toNumber(get('livingAreaSqFt', 'living_area_sq_ft'));
    const lotSqFt = toNumber(get('lotSizeSqFt', 'lot_size_sq_ft'));
    const lotAcres = toNumber(get('lotSizeAcres', 'lot_size_acres'));
    const yearBuilt = toNumber(get('yearBuilt', 'year_built'));

    const photosRaw = get<string[] | string>('photos');
    const photos = Array.isArray(photosRaw)
      ? photosRaw.filter((url) => typeof url === 'string' && url.trim().length > 0)
      : typeof photosRaw === 'string' && photosRaw.trim().length > 0
        ? photosRaw.split(',').map((url) => url.trim())
        : [];

    const status = this.normalizeStatus(toString(get('status')));
    const state = this.deriveWorkflowState(status);

    const row: BrokerPropertyRow = {
      id,
      draft_id: payload.draftId ?? null,
      org_id: tenantId,
      firm_id: payload.firmId ?? tenantId,
      agent_id: payload.agentId ?? userId ?? null,
      mls_number: toString(get('mlsNumber', 'mls_number')),
      state,
      status,
      is_test: payload.isTest ?? false,
      source: payload.source ?? 'bulk_upload',
      file_name: payload.fileName ?? null,
      address_line: addressLine,
      street_number: streetNumber,
      street_name: streetName,
      street_suffix: streetSuffix,
      city: toString(get('city')),
      state_code: toString(get('stateCode', 'state')),
      zip_code: toString(get('zipCode', 'zip_code')),
      county: toString(get('county')),
      latitude: toNumber(get('latitude', 'lat')),
      longitude: toNumber(get('longitude', 'lng')),
      bedrooms_total: bedroomsTotal,
      bathrooms_full: bathroomsFull,
      bathrooms_half: bathroomsHalf,
      bathrooms_total: bathroomsTotal ?? bathroomsFull,
      living_area_sq_ft: livingArea,
      lot_size_sq_ft: lotSqFt,
      lot_size_acres: lotAcres,
      year_built: yearBuilt,
      list_price: listPrice,
      original_list_price: toNumber(get('originalListPrice', 'original_list_price')),
      public_remarks: toString(get('publicRemarks', 'public_remarks')),
      private_remarks: toString(get('privateRemarks', 'private_remarks')),
      showing_instructions: toString(get('showingInstructions', 'showing_instructions')),
      architectural_style: toString(get('architecturalStyle', 'architectural_style')),
      property_type: toString(get('propertyType', 'property_type')),
      property_sub_type: toString(get('propertySubType', 'property_sub_type')),
      parcel_id: toString(get('parcelId', 'parcel_id')),
      garage_spaces: toNumber(get('garageSpaces', 'garage_spaces')),
      garage_type: toString(get('garageType', 'garage_type')),
      construction_materials: toString(get('constructionMaterials', 'construction_materials')),
      foundation_details: toString(get('foundationDetails', 'foundation_details')),
      exterior_features: toString(get('exteriorFeatures', 'exterior_features')),
      interior_features: toString(get('interiorFeatures', 'interior_features')),
      pool_features: toString(get('poolFeatures', 'pool_features')),
      cooling: toString(get('cooling', 'coolingType', 'cooling_type')),
      heating: toString(get('heating', 'heatingType', 'heating_type')),
      parking_features: toString(get('parkingFeatures', 'parking_features')),
      appliances: toString(get('appliances')),
      laundry_features: toString(get('laundryFeatures', 'laundry_features')),
      taxes: toNumber(get('taxes')),
      flooring: toString(get('flooring')),
      fireplace_features: toString(get('fireplaceFeatures', 'fireplace_features')),
      kitchen_features: toString(get('kitchenFeatures', 'kitchen_features')),
      primary_suite: toString(get('primarySuite', 'primary_suite')),
      roof_type: toString(get('roofType', 'roof_type')),
      property_view: toString(get('propertyView', 'property_view')),
      water_source: toString(get('waterSource', 'water_source')),
      sewer_system: toString(get('sewerSystem', 'sewer_system')),
      subdivision: toString(get('subdivision')),
      slug: toString(get('slug')),
      cover_photo_url: toString(get('coverPhotoUrl', 'cover_photo_url')) ?? photos[0] ?? null,
      validation_summary: (payload.validationSummary ?? null) as Record<string, unknown> | null,
      owner_name: toString(get('ownerName', 'owner_name')),
      owner_email: toString(get('ownerEmail', 'owner_email')),
      owner_phone: toString(get('ownerPhone', 'owner_phone')),
      listing_agent_name: toString(get('listingAgentName', 'listing_agent_name')),
      listing_agent_license: toString(get('listingAgentLicense', 'listing_agent_license')),
      listing_agent_phone: toString(get('listingAgentPhone', 'listing_agent_phone')),
      listing_agent_email: toString(get('listingAgentEmail', 'listing_agent_email')),
      listing_office_name: toString(get('listingOfficeName', 'listing_office_name')),
      listing_office_phone: toString(get('listingOfficePhone', 'listing_office_phone')),
      listing_office_email: toString(get('listingOfficeEmail', 'listing_office_email')),
      listing_office_license: toString(get('listingOfficeLicense', 'listing_office_license')),
      photos,
      published_at: toString(get('publishedAt', 'published_at')),
      closed_at: toString(get('closedAt', 'closed_at')),
      created_at: now,
      updated_at: now
    };

    this.promoted.set(row.id, row);
    return row;
  }

  update(tenantId: string, id: string, payload: Partial<BrokerPropertyRow>): BrokerPropertyRow {
    const existing = this.promoted.get(id);
    if (!existing) {
      throw new NotFoundException('not_found');
    }

    // Only allow updates within the same tenant/org
    if (existing.org_id !== tenantId && existing.firm_id !== tenantId) {
      throw new NotFoundException('not_found');
    }

    const now = new Date().toISOString();
    const updated: BrokerPropertyRow = {
      ...existing,
      ...payload,
      id: existing.id,
      draft_id: existing.draft_id,
      org_id: existing.org_id,
      firm_id: existing.firm_id,
      updated_at: now,
      // Normalize photos to an array of strings
      photos: Array.isArray(payload.photos)
        ? payload.photos.filter((url): url is string => typeof url === 'string' && !!url.trim())
        : existing.photos ?? [],
    };

    this.promoted.set(id, updated);
    return updated;
  }

  publish(tenantId: string, id: string): BrokerPropertyRow {
    const existing = this.promoted.get(id);
    if (!existing) {
      throw new NotFoundException('not_found');
    }

    if (existing.org_id !== tenantId && existing.firm_id !== tenantId) {
      throw new NotFoundException('not_found');
    }

    const now = new Date().toISOString();
    const updated: BrokerPropertyRow = {
      ...existing,
      status: 'active',
      state: 'LIVE',
      published_at: existing.published_at ?? now,
      updated_at: now,
    };

    this.promoted.set(id, updated);
    return updated;
  }

  unpublish(tenantId: string, id: string): BrokerPropertyRow {
    const existing = this.promoted.get(id);
    if (!existing) {
      throw new NotFoundException('not_found');
    }

    if (existing.org_id !== tenantId && existing.firm_id !== tenantId) {
      throw new NotFoundException('not_found');
    }

    const now = new Date().toISOString();
    const updated: BrokerPropertyRow = {
      ...existing,
      status: 'draft',
      state: 'PROPERTY_PENDING',
      published_at: null,
      updated_at: now,
    };

    this.promoted.set(id, updated);
    return updated;
  }

  private normalizeStatus(value: string | null): BrokerPropertyRow['status'] {
    switch ((value ?? '').toLowerCase()) {
      case 'active':
        return 'active';
      case 'pending':
        return 'pending';
      case 'sold':
        return 'sold';
      case 'withdrawn':
        return 'withdrawn';
      case 'expired':
        return 'expired';
      default:
        return 'draft';
    }
  }

  private deriveWorkflowState(status: BrokerPropertyRow['status']): BrokerPropertyRow['state'] {
    switch (status) {
      case 'active':
      case 'pending':
        return 'LIVE';
      case 'sold':
        return 'SOLD';
      default:
        return 'PROPERTY_PENDING';
    }
  }

  private mapListingToBrokerRow(listing: Listing): BrokerPropertyRow {
    const status = this.normalizeStatus(listing.status ?? null);
    const state = this.deriveWorkflowState(status);
    return {
      id: listing.id,
      draft_id: null,
      org_id: listing.tenantId,
      firm_id: listing.tenantId,
      agent_id: listing.personId ?? null,
      mls_number: listing.mlsId ?? null,
      state,
      status,
      is_test: false,
      source: 'manual',
      file_name: null,
      address_line: listing.addressLine1 ?? null,
      street_number: null,
      street_name: listing.addressLine1 ?? null,
      street_suffix: null,
      city: listing.city ?? null,
      state_code: listing.state ?? null,
      zip_code: listing.postalCode ?? null,
      county: null,
      latitude: listing.latitude ?? null,
      longitude: listing.longitude ?? null,
      bedrooms_total: listing.beds ?? null,
      bathrooms_full: listing.baths ? Math.floor(listing.baths) : null,
      bathrooms_half: listing.baths ? Math.max(listing.baths - Math.floor(listing.baths), 0) : null,
      bathrooms_total: listing.baths ?? null,
      living_area_sq_ft: null,
      lot_size_sq_ft: null,
      lot_size_acres: null,
      year_built: null,
      list_price: listing.price ? Number(listing.price) : null,
      original_list_price: null,
      public_remarks: null,
      private_remarks: null,
      showing_instructions: null,
      architectural_style: null,
      property_type: listing.propertyType ?? null,
      property_sub_type: null,
      parcel_id: null,
      garage_spaces: null,
      garage_type: null,
      construction_materials: null,
      foundation_details: null,
      exterior_features: null,
      interior_features: null,
      pool_features: null,
      cooling: null,
      heating: null,
      parking_features: null,
      appliances: null,
      laundry_features: null,
      taxes: null,
      flooring: null,
      fireplace_features: null,
      kitchen_features: null,
      primary_suite: null,
      roof_type: null,
      property_view: null,
      water_source: null,
      sewer_system: null,
      subdivision: null,
      slug: null,
      cover_photo_url: null,
      validation_summary: null,
      owner_name: null,
      owner_email: null,
      owner_phone: null,
      listing_agent_name: null,
      listing_agent_license: null,
      listing_agent_phone: null,
      listing_agent_email: null,
      listing_office_name: null,
      listing_office_phone: null,
      listing_office_email: null,
      listing_office_license: null,
      photos: [],
      published_at: listing.createdAt.toISOString(),
      closed_at: null,
      created_at: listing.createdAt.toISOString(),
      updated_at: listing.updatedAt.toISOString()
    };
  }
}
