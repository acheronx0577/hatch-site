import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/modules/prisma/prisma.service';

/**
 * MLS Importer Service
 *
 * Handles importing external MLS data from various sources (NABOR, Stellar, Bright MLS, etc.)
 * into the MlsListing and MarketComparable tables for Atlas market analysis.
 *
 * @example
 * // Import active listings from NABOR feed
 * await mlsImporter.importListings({
 *   source: 'NABOR',
 *   listings: naborListingsData
 * });
 *
 * // Import sold comps
 * await mlsImporter.importComparables({
 *   source: 'NABOR',
 *   comparables: soldPropertiesData
 * });
 */

export type MlsSource = 'NABOR' | 'Stellar' | 'BrightMLS' | 'FMLS' | 'Manual';

export interface MlsListingInput {
  mlsId: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  county?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  listPrice?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  lotSize?: number | null;
  yearBuilt?: number | null;
  propertyType?: string | null;
  propertySubType?: string | null;
  status: string; // e.g., "ACTIVE", "PENDING", "SOLD", "WITHDRAWN"
  listingDate?: Date | null;
  statusChangeDate?: Date | null;
  daysOnMarket?: number | null;
  description?: string | null;
  photoUrls?: string[];
  virtualTourUrl?: string | null;
  listingAgentName?: string | null;
  listingOfficeName?: string | null;
}

export interface MarketComparableInput {
  mlsId?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  county?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  salePrice: number;
  originalListPrice?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  lotSize?: number | null;
  yearBuilt?: number | null;
  propertyType?: string | null;
  saleDate: Date;
  daysOnMarket?: number | null;
}

@Injectable()
export class MlsImporterService {
  private readonly log = new Logger(MlsImporterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Import active MLS listings from an external feed
   */
  async importListings(params: {
    source: MlsSource;
    listings: MlsListingInput[];
    deleteStale?: boolean; // Remove listings not in this batch
  }): Promise<{ created: number; updated: number; deleted: number }> {
    const { source, listings, deleteStale = false } = params;

    let created = 0;
    let updated = 0;
    let deleted = 0;

    this.log.log(`Importing ${listings.length} listings from ${source}`);

    // Upsert listings (create or update)
    for (const listing of listings) {
      try {
        const data: Prisma.MlsListingCreateInput = {
          mlsId: listing.mlsId,
          mlsSource: source,
          addressLine1: listing.addressLine1,
          addressLine2: listing.addressLine2,
          city: listing.city,
          state: listing.state,
          postalCode: listing.postalCode,
          county: listing.county,
          latitude: listing.latitude,
          longitude: listing.longitude,
          listPrice: listing.listPrice != null ? new Prisma.Decimal(listing.listPrice) : null,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          squareFeet: listing.squareFeet,
          lotSize: listing.lotSize,
          yearBuilt: listing.yearBuilt,
          propertyType: listing.propertyType,
          propertySubType: listing.propertySubType,
          status: listing.status,
          listingDate: listing.listingDate,
          statusChangeDate: listing.statusChangeDate,
          daysOnMarket: listing.daysOnMarket,
          description: listing.description,
          photoUrls: listing.photoUrls ?? [],
          virtualTourUrl: listing.virtualTourUrl,
          listingAgentName: listing.listingAgentName,
          listingOfficeName: listing.listingOfficeName
        };

        const result = await this.prisma.mlsListing.upsert({
          where: { mlsId: listing.mlsId },
          create: data,
          update: data
        });

        // Check if it was created or updated
        const existing = await this.prisma.mlsListing.findFirst({
          where: { mlsId: listing.mlsId },
          select: { importedAt: true, updatedAt: true }
        });

        if (existing && existing.importedAt.getTime() === existing.updatedAt.getTime()) {
          created++;
        } else {
          updated++;
        }
      } catch (error) {
        this.log.error(`Failed to import listing ${listing.mlsId}: ${(error as Error).message}`);
      }
    }

    // Optionally delete stale listings (not in this batch)
    if (deleteStale) {
      const mlsIds = listings.map(l => l.mlsId);
      const deleteResult = await this.prisma.mlsListing.deleteMany({
        where: {
          mlsSource: source,
          mlsId: { notIn: mlsIds }
        }
      });
      deleted = deleteResult.count;
    }

    this.log.log(`Import complete: ${created} created, ${updated} updated, ${deleted} deleted`);

    return { created, updated, deleted };
  }

  /**
   * Import sold comparables from an external feed
   */
  async importComparables(params: {
    source: MlsSource;
    comparables: MarketComparableInput[];
  }): Promise<{ created: number; updated: number }> {
    const { source, comparables } = params;

    let created = 0;
    let updated = 0;

    this.log.log(`Importing ${comparables.length} comparables from ${source}`);

    for (const comp of comparables) {
      try {
        const data: Prisma.MarketComparableCreateInput = {
          mlsId: comp.mlsId,
          mlsSource: source,
          addressLine1: comp.addressLine1,
          addressLine2: comp.addressLine2,
          city: comp.city,
          state: comp.state,
          postalCode: comp.postalCode,
          county: comp.county,
          latitude: comp.latitude,
          longitude: comp.longitude,
          salePrice: new Prisma.Decimal(comp.salePrice),
          originalListPrice: comp.originalListPrice != null ? new Prisma.Decimal(comp.originalListPrice) : null,
          bedrooms: comp.bedrooms,
          bathrooms: comp.bathrooms,
          squareFeet: comp.squareFeet,
          lotSize: comp.lotSize,
          yearBuilt: comp.yearBuilt,
          propertyType: comp.propertyType,
          saleDate: comp.saleDate,
          daysOnMarket: comp.daysOnMarket
        };

        // For comparables, use a composite key if mlsId is available
        if (comp.mlsId) {
          const existing = await this.prisma.marketComparable.findFirst({
            where: { mlsId: comp.mlsId }
          });

          if (existing) {
            await this.prisma.marketComparable.update({
              where: { id: existing.id },
              data
            });
            updated++;
          } else {
            await this.prisma.marketComparable.create({ data });
            created++;
          }
        } else {
          // No mlsId, just create
          await this.prisma.marketComparable.create({ data });
          created++;
        }
      } catch (error) {
        this.log.error(`Failed to import comparable ${comp.mlsId ?? comp.addressLine1}: ${(error as Error).message}`);
      }
    }

    this.log.log(`Import complete: ${created} created, ${updated} updated`);

    return { created, updated };
  }

  /**
   * Clean up old comparables beyond a retention period (e.g., keep last 2 years)
   */
  async cleanupOldComparables(params: {
    olderThan: Date;
    source?: MlsSource;
  }): Promise<number> {
    const { olderThan, source } = params;

    const where: Prisma.MarketComparableWhereInput = {
      saleDate: { lt: olderThan }
    };

    if (source) {
      where.mlsSource = source;
    }

    const result = await this.prisma.marketComparable.deleteMany({ where });

    this.log.log(`Deleted ${result.count} comparables older than ${olderThan.toISOString()}`);

    return result.count;
  }

  /**
   * Get import statistics for monitoring
   */
  async getImportStats(source?: MlsSource): Promise<{
    totalListings: number;
    activeListings: number;
    totalComparables: number;
    lastImportAt: Date | null;
  }> {
    const listingWhere: Prisma.MlsListingWhereInput = source ? { mlsSource: source } : {};
    const compWhere: Prisma.MarketComparableWhereInput = source ? { mlsSource: source } : {};

    const [totalListings, activeListings, totalComparables, latestListing] = await Promise.all([
      this.prisma.mlsListing.count({ where: listingWhere }),
      this.prisma.mlsListing.count({ where: { ...listingWhere, status: 'ACTIVE' } }),
      this.prisma.marketComparable.count({ where: compWhere }),
      this.prisma.mlsListing.findFirst({
        where: listingWhere,
        orderBy: { importedAt: 'desc' },
        select: { importedAt: true }
      })
    ]);

    return {
      totalListings,
      activeListings,
      totalComparables,
      lastImportAt: latestListing?.importedAt ?? null
    };
  }
}
