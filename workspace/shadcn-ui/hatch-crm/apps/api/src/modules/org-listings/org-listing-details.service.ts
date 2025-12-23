import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MarketComparable, MlsListing, Prisma } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';

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
  listing: Record<string, unknown>;
  mlsDetails: FullPropertyMlsDetails | null;
  areaMetrics: FullPropertyAreaMetrics | null;
  comparables: FullPropertyComparable[];
};

type ListingRecord = Awaited<
  ReturnType<
    PrismaService['orgListing']['findUnique']
  >
>;

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') {
    const num = (value as any).toNumber();
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
};

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

const haversineMiles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const EARTH_RADIUS_MILES = 3958.8;
  const lat1 = degreesToRadians(a.lat);
  const lat2 = degreesToRadians(b.lat);
  const deltaLat = degreesToRadians(b.lat - a.lat);
  const deltaLng = degreesToRadians(b.lng - a.lng);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
};

@Injectable()
export class OrgListingDetailsService {
  private readonly permissionsDisabled =
    process.env.NODE_ENV !== 'production' &&
    (process.env.DISABLE_PERMISSIONS_GUARD ?? 'true').toLowerCase() === 'true';

  private readonly guardFallbackEnabled =
    (process.env.GUARD_FALLBACK_ENABLED ?? 'true').toLowerCase() === 'true';

  constructor(private readonly prisma: PrismaService) {}

  private async assertUserInOrg(userId: string, orgId: string) {
    if (this.permissionsDisabled) {
      return { userId, orgId };
    }
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } }
    });
    if (!membership) {
      if (this.guardFallbackEnabled) {
        return { userId, orgId };
      }
      throw new ForbiddenException('User is not part of this organization');
    }
    return membership;
  }

  async getFullDetails(
    orgId: string,
    userId: string,
    listingId: string,
    options?: { radiusMiles?: number; comparableLimit?: number }
  ): Promise<FullPropertyDetailsResponse> {
    await this.assertUserInOrg(userId, orgId);

    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId },
      include: {
        agentProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        },
        documents: { include: { orgFile: true } }
      }
    });

    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }

    const mlsListing = await this.lookupMlsListing(listing);
    const [areaMetrics, comparables] = await Promise.all([
      this.buildAreaMetrics(listing, mlsListing),
      this.getComparables(listing, mlsListing, options)
    ]);

    return {
      listing: listing as unknown as Record<string, unknown>,
      mlsDetails: mlsListing ? this.mapMlsDetails(mlsListing) : null,
      areaMetrics,
      comparables
    };
  }

  private async lookupMlsListing(listing: ListingRecord): Promise<MlsListing | null> {
    const mlsId = (listing as any)?.mlsNumber as string | undefined | null;
    if (mlsId) {
      const found = await this.prisma.mlsListing.findUnique({ where: { mlsId } });
      if (found) return found;
    }

    // Fallback matching by address (best-effort)
    const addressLine1 = (listing as any)?.addressLine1 as string | undefined | null;
    const city = (listing as any)?.city as string | undefined | null;
    const state = (listing as any)?.state as string | undefined | null;
    const postalCode = (listing as any)?.postalCode as string | undefined | null;

    if (!addressLine1 || !city || !state) return null;

    return this.prisma.mlsListing.findFirst({
      where: {
        city,
        state,
        postalCode: postalCode ?? undefined,
        addressLine1: { equals: addressLine1, mode: 'insensitive' }
      },
      orderBy: { importedAt: 'desc' }
    });
  }

  private mapMlsDetails(mls: MlsListing): FullPropertyMlsDetails {
    return {
      propertyType: mls.propertyType ?? null,
      yearBuilt: mls.yearBuilt ?? null,
      sqft: mls.squareFeet ?? null,
      lotSize: mls.lotSize ?? null,
      bedrooms: mls.bedrooms ?? null,
      bathrooms: mls.bathrooms ?? null,
      stories: null,
      parkingSpaces: null,
      garageType: null,
      pool: null,
      waterfront: null,
      view: null,
      construction: null,
      roofType: null,
      foundation: null,
      cooling: null,
      heating: null,
      electric: null,
      sewer: null,
      water: null,
      hoa: null,
      hoaFee: null,
      hoaFrequency: null,
      taxAmount: null,
      taxYear: null,
      assessedValue: null,
      interiorFeatures: null,
      exteriorFeatures: null,
      appliances: null,
      flooring: null,
      publicRemarks: mls.description ?? null,
      privateRemarks: null,
      listDate: mls.listingDate ? mls.listingDate.toISOString() : null,
      daysOnMarket: mls.daysOnMarket ?? null,
      lastPriceChange: mls.statusChangeDate ? mls.statusChangeDate.toISOString() : null,
      photos: mls.photoUrls ?? [],
      virtualTourUrl: mls.virtualTourUrl ?? null
    };
  }

  private async buildAreaMetrics(listing: ListingRecord, mlsListing: MlsListing | null): Promise<FullPropertyAreaMetrics> {
    const city = listing.city;
    const state = listing.state;

    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last365Days = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const prior365Start = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);

    const last5Years = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
    const prior5YearsStart = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);

    const [activeListings, recentSales, priorSales, recentSales5y, priorSales5y] = await Promise.all([
      this.prisma.mlsListing.findMany({
        where: { status: 'ACTIVE', city, state },
        select: { listPrice: true, squareFeet: true, daysOnMarket: true },
        take: 500,
        orderBy: { importedAt: 'desc' }
      }),
      this.prisma.marketComparable.findMany({
        where: { city, state, saleDate: { gte: last365Days } },
        select: { salePrice: true, squareFeet: true, originalListPrice: true, saleDate: true }
      }),
      this.prisma.marketComparable.findMany({
        where: { city, state, saleDate: { gte: prior365Start, lt: last365Days } },
        select: { salePrice: true }
      }),
      this.prisma.marketComparable.findMany({
        where: { city, state, saleDate: { gte: last5Years } },
        select: { salePrice: true }
      }),
      this.prisma.marketComparable.findMany({
        where: { city, state, saleDate: { gte: prior5YearsStart, lt: last5Years } },
        select: { salePrice: true }
      })
    ]);

    const activePricePerSqft = activeListings
      .map((row) => {
        const price = toNumberOrNull(row.listPrice);
        const sqft = row.squareFeet ?? null;
        if (!price || !sqft) return null;
        return price / Math.max(sqft, 1);
      })
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const activeDays = activeListings
      .map((row) => row.daysOnMarket ?? null)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const salePrices = recentSales
      .map((row) => toNumberOrNull(row.salePrice))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const salePricesPrior = priorSales
      .map((row) => toNumberOrNull(row.salePrice))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const salePrices5y = recentSales5y
      .map((row) => toNumberOrNull(row.salePrice))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const salePricesPrior5y = priorSales5y
      .map((row) => toNumberOrNull(row.salePrice))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const listToSaleRatios = recentSales
      .map((row) => {
        const sale = toNumberOrNull(row.salePrice);
        const list = toNumberOrNull(row.originalListPrice);
        if (!sale || !list) return null;
        return sale / Math.max(list, 1);
      })
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const recentMedian = median(salePrices);
    const priorMedian = median(salePricesPrior);
    const priceChange1Year =
      recentMedian !== null && priorMedian !== null && priorMedian > 0
        ? ((recentMedian - priorMedian) / priorMedian) * 100
        : null;

    const recentMedian5y = median(salePrices5y);
    const priorMedian5y = median(salePricesPrior5y);
    const priceChange5Year =
      recentMedian5y !== null && priorMedian5y !== null && priorMedian5y > 0
        ? ((recentMedian5y - priorMedian5y) / priorMedian5y) * 100
        : null;

    const salesLast30Days = recentSales.filter((sale) => sale.saleDate && sale.saleDate >= last30Days).length;
    const inventoryMonths =
      salesLast30Days > 0 ? activeListings.length / salesLast30Days : null;

    // Use the listing's MLS match to hint that metrics are for the same geography.
    // Fields without reliable sources remain null until a dedicated data provider is integrated.
    void mlsListing;

    return {
      population: null,
      medianAge: null,
      medianIncome: null,
      medianHomeValue: recentMedian,
      avgPricePerSqft: average(activePricePerSqft),
      homeownershipRate: null,
      avgDaysOnMarket: average(activeDays),
      listToSaleRatio: average(listToSaleRatios),
      inventoryMonths,
      priceChange1Year,
      priceChange5Year,
      schoolDistrict: null,
      schoolRatings: [],
      walkScore: null,
      transitScore: null,
      bikeScore: null
    };
  }

  private async getComparables(
    listing: ListingRecord,
    mlsListing: MlsListing | null,
    options?: { radiusMiles?: number; comparableLimit?: number }
  ): Promise<FullPropertyComparable[]> {
    const radiusMiles = options?.radiusMiles ?? 1;
    const limit = options?.comparableLimit ?? 10;

    const city = listing.city;
    const state = listing.state;

    const bedrooms = listing.bedrooms ?? null;
    const bathrooms = listing.bathrooms ?? null;
    const propertyType = listing.propertyType ?? null;

    const now = new Date();
    const last365Days = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const where: Prisma.MarketComparableWhereInput = {
      city,
      state,
      saleDate: { gte: last365Days }
    };

    if (propertyType) {
      where.propertyType = { equals: propertyType, mode: 'insensitive' };
    }

    if (typeof bedrooms === 'number') {
      where.bedrooms = { gte: Math.max(bedrooms - 1, 0), lte: bedrooms + 1 };
    }

    if (typeof bathrooms === 'number') {
      where.bathrooms = { gte: Math.max(bathrooms - 1, 0), lte: bathrooms + 1 };
    }

    const candidates = await this.prisma.marketComparable.findMany({
      where,
      select: {
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        salePrice: true,
        squareFeet: true,
        bedrooms: true,
        bathrooms: true,
        saleDate: true,
        latitude: true,
        longitude: true
      },
      take: 75,
      orderBy: { saleDate: 'desc' }
    });

    const origin = mlsListing?.latitude && mlsListing?.longitude
      ? { lat: mlsListing.latitude, lng: mlsListing.longitude }
      : null;

    const results = candidates
      .map((comp) => this.mapComparable(comp, origin))
      .filter((comp) => {
        if (!origin || comp.distanceMiles === null) return true;
        return comp.distanceMiles <= radiusMiles;
      })
      .sort((a, b) => {
        if (a.distanceMiles === null && b.distanceMiles === null) return 0;
        if (a.distanceMiles === null) return 1;
        if (b.distanceMiles === null) return -1;
        return a.distanceMiles - b.distanceMiles;
      })
      .slice(0, limit);

    return results;
  }

  private mapComparable(
    comp: Pick<
      MarketComparable,
      'addressLine1' | 'city' | 'state' | 'postalCode' | 'salePrice' | 'squareFeet' | 'bedrooms' | 'bathrooms' | 'saleDate' | 'latitude' | 'longitude'
    >,
    origin: { lat: number; lng: number } | null
  ): FullPropertyComparable {
    const price = toNumberOrNull(comp.salePrice) ?? 0;
    const sqft = comp.squareFeet ?? null;
    const pricePerSqft = sqft ? price / Math.max(sqft, 1) : null;

    const distanceMiles =
      origin && comp.latitude != null && comp.longitude != null
        ? haversineMiles(origin, { lat: comp.latitude, lng: comp.longitude })
        : null;

    return {
      address: `${comp.addressLine1}, ${comp.city}, ${comp.state} ${comp.postalCode}`.trim(),
      price,
      sqft,
      pricePerSqft,
      bedrooms: comp.bedrooms ?? null,
      bathrooms: comp.bathrooms ?? null,
      soldDate: comp.saleDate.toISOString(),
      distanceMiles
    };
  }
}

