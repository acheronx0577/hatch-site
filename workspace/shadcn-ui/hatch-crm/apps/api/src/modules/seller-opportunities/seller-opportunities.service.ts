import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  LeadSource,
  LeadStatus,
  LeadType,
  OrgEventType,
  PersonStage,
  SellerOpportunityStatus,
  UserRole,
  type Prisma
} from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { OrgEventsService } from '../org-events/org-events.service';

const ENGINE_METRIC_KEY = 'opportunities.seller_likelihood';
const DAY_MS = 24 * 60 * 60 * 1000;

type SellerSignal = {
  key: string;
  label: string;
  weight: number;
  value?: string;
  reason: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const safeJsonParse = <T>(value: string | null | undefined): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const formatSingleLineAddress = (value: {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}) => {
  const line1 = (value.line1 ?? '').trim();
  const line2 = (value.line2 ?? '').trim();
  const city = (value.city ?? '').trim();
  const state = (value.state ?? '').trim();
  const postalCode = (value.postalCode ?? '').trim();

  const street = [line1, line2].filter(Boolean).join(' ');
  const region = [city, state, postalCode].filter(Boolean).join(' ');
  return [street, region].filter(Boolean).join(', ').trim();
};

const splitOwnerName = (raw: string | null | undefined): { firstName: string; lastName: string } | null => {
  const cleaned = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',').map((part) => part.trim());
    if (first && last) {
      const firstName = first.split(' ')[0]?.trim() ?? first.trim();
      return { firstName: firstName || first.trim(), lastName: last };
    }
  }

  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0] ?? 'Owner', lastName: parts[0] ?? 'Owner' };
  }

  return { firstName: parts[0] ?? 'Owner', lastName: parts.slice(1).join(' ').trim() || 'Owner' };
};

@Injectable()
export class SellerOpportunitiesService {
  private readonly logger = new Logger(SellerOpportunitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orgEvents: OrgEventsService
  ) {}

  private async assertUserInOrg(userId: string, orgId: string) {
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { user: { select: { role: true } } }
    });
    if (!membership) {
      throw new ForbiddenException('User is not part of this organization');
    }
    return membership.user?.role ?? null;
  }

  private normalizeAddressPart(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s#.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private makeDedupeKey(addressLine1: string, city: string, state: string, postalCode: string) {
    return [
      this.normalizeAddressPart(addressLine1),
      this.normalizeAddressPart(city),
      state.toUpperCase().trim(),
      postalCode.trim()
    ].join('|');
  }

  private resolvePrice(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    const asNumber = Number((raw as any)?.toString?.() ?? raw);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  private scoreListing(listing: {
    status: string;
    listingDate?: Date | null;
    statusChangeDate?: Date | null;
    daysOnMarket?: number | null;
    listPrice?: unknown;
  }): { score: number; signals: SellerSignal[] } {
    const status = (listing.status ?? '').toUpperCase();
    const signals: SellerSignal[] = [];

    const add = (signal: SellerSignal) => {
      if (signals.some((existing) => existing.key === signal.key)) return;
      signals.push(signal);
    };

    const cancelledStatuses = ['WITHDRAWN', 'CANCELLED', 'CANCELED', 'EXPIRED', 'TERMINATED', 'FAILED', 'OFF_MARKET'];
    if (cancelledStatuses.some((entry) => status.includes(entry))) {
      add({
        key: 'STATUS_OFF_MARKET',
        label: 'Off-market transition',
        weight: 35,
        value: status,
        reason: 'The listing moved off-market recently (withdrawn/expired/cancelled), often indicating a seller still needs help.'
      });
    }

    const daysOnMarket = listing.daysOnMarket ?? null;
    if (typeof daysOnMarket === 'number' && Number.isFinite(daysOnMarket)) {
      if (daysOnMarket >= 120) {
        add({
          key: 'DOM_120',
          label: 'High days on market',
          weight: 25,
          value: `${daysOnMarket} days`,
          reason: 'High days-on-market correlates with seller frustration and higher likelihood of switching strategy.'
        });
      } else if (daysOnMarket >= 60) {
        add({
          key: 'DOM_60',
          label: 'Stale listing',
          weight: 15,
          value: `${daysOnMarket} days`,
          reason: 'Stale listings often reprice, withdraw, or relist with a different agent.'
        });
      }
    }

    if (status === 'ACTIVE' && typeof daysOnMarket === 'number' && daysOnMarket >= 90) {
      add({
        key: 'ACTIVE_STALE',
        label: 'Active + stale',
        weight: 10,
        value: `${daysOnMarket} days`,
        reason: 'Active listings that stagnate are prime candidates for listing optimization or re-approach.'
      });
    }

    const listPrice = this.resolvePrice(listing.listPrice);
    if (typeof listPrice === 'number' && Number.isFinite(listPrice) && listPrice >= 750_000) {
      add({
        key: 'PRICE_BAND',
        label: 'High-value property',
        weight: 10,
        value: `$${Math.round(listPrice).toLocaleString()}`,
        reason: 'Higher price bands typically justify outreach due to larger commission upside.'
      });
    }

    const listingAgeDays =
      listing.listingDate && Number.isFinite(listing.listingDate.getTime())
        ? Math.floor((Date.now() - listing.listingDate.getTime()) / DAY_MS)
        : null;
    if (typeof listingAgeDays === 'number' && listingAgeDays >= 180) {
      add({
        key: 'LISTING_AGE',
        label: 'Long listing history',
        weight: 5,
        value: `${listingAgeDays}d`,
        reason: 'Longer listing histories can indicate repeated attempts and motivation to sell.'
      });
    }

    const score = clamp(
      signals.reduce((sum, signal) => sum + signal.weight, 0),
      0,
      100
    );
    signals.sort((a, b) => b.weight - a.weight);

    return { score, signals };
  }

  async getEngineStatus(orgId: string, userId: string) {
    const role = await this.assertUserInOrg(userId, orgId);
    if (!role || (role !== UserRole.BROKER && role !== UserRole.TEAM_LEAD && role !== UserRole.AGENT)) {
      throw new ForbiddenException('Broker or agent access required');
    }

    const lastRun = await this.prisma.metricsRun.findFirst({
      where: { orgId, key: ENGINE_METRIC_KEY },
      orderBy: { createdAt: 'desc' }
    });

    const summary = safeJsonParse<{ created: number; updated: number; candidates: number }>(lastRun?.note ?? null);
    return {
      key: ENGINE_METRIC_KEY,
      lastRunAt: lastRun?.finishedAt?.toISOString() ?? lastRun?.createdAt?.toISOString() ?? null,
      status: lastRun?.status ?? null,
      summary
    };
  }

  async list(
    orgId: string,
    userId: string,
    query: { q?: string; status?: string; minScore?: number; limit?: number; cursor?: string }
  ) {
    const role = await this.assertUserInOrg(userId, orgId);
    if (!role || (role !== UserRole.BROKER && role !== UserRole.TEAM_LEAD && role !== UserRole.AGENT)) {
      throw new ForbiddenException('Broker or agent access required');
    }

    const take = clamp(query.limit ?? 50, 1, 200);
    const where: Prisma.SellerOpportunityWhereInput = {
      organizationId: orgId,
      ...(query.status ? { status: query.status as SellerOpportunityStatus } : {}),
      ...(typeof query.minScore === 'number' ? { score: { gte: query.minScore } } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { addressLine1: { contains: query.q.trim(), mode: 'insensitive' } },
              { city: { contains: query.q.trim(), mode: 'insensitive' } },
              { postalCode: { contains: query.q.trim(), mode: 'insensitive' } },
              { ownerName: { contains: query.q.trim(), mode: 'insensitive' } },
              { ownerMailingAddressLine1: { contains: query.q.trim(), mode: 'insensitive' } },
              { ownerMailingCity: { contains: query.q.trim(), mode: 'insensitive' } },
              { ownerMailingPostalCode: { contains: query.q.trim(), mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const records = await this.prisma.sellerOpportunity.findMany({
      where,
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
      take,
      skip: query.cursor ? 1 : 0,
      cursor: query.cursor ? { id: query.cursor } : undefined
    });

    const nextCursor = records.length === take ? records[records.length - 1]?.id ?? null : null;

    const lastRun = await this.prisma.metricsRun.findFirst({
      where: { orgId, key: ENGINE_METRIC_KEY },
      orderBy: { createdAt: 'desc' }
    });
    const summary = safeJsonParse<{ created: number; updated: number; candidates: number }>(lastRun?.note ?? null);

    return {
      items: records.map((record) => ({
        id: record.id,
        status: record.status,
        score: record.score,
        source: record.source,
        address: {
          line1: record.addressLine1,
          city: record.city,
          state: record.state,
          postalCode: record.postalCode
        },
        owner: {
          name: record.ownerName ?? null,
          mailingAddress:
            record.ownerMailingAddressLine1 ||
            record.ownerMailingAddressLine2 ||
            record.ownerMailingCity ||
            record.ownerMailingState ||
            record.ownerMailingPostalCode
              ? {
                  line1: record.ownerMailingAddressLine1 ?? null,
                  line2: record.ownerMailingAddressLine2 ?? null,
                  city: record.ownerMailingCity ?? null,
                  state: record.ownerMailingState ?? null,
                  postalCode: record.ownerMailingPostalCode ?? null
                }
              : null
        },
        signals: record.signals as unknown,
        convertedLeadId: record.convertedLeadId ?? null,
        lastSeenAt: record.lastSeenAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString()
      })),
      nextCursor,
      engine: {
        lastRunAt: lastRun?.finishedAt?.toISOString() ?? lastRun?.createdAt?.toISOString() ?? null,
        status: lastRun?.status ?? null,
        summary
      }
    };
  }

  async runForOrg(orgId: string, userId: string | null, options: { reason: 'manual' | 'cron' }) {
    if (userId) {
      const role = await this.assertUserInOrg(userId, orgId);
      if (!role || (role !== UserRole.BROKER && role !== UserRole.TEAM_LEAD)) {
        throw new ForbiddenException('Broker access required to run scans');
      }
    }

    const run = await this.prisma.metricsRun.create({
      data: {
        orgId,
        key: ENGINE_METRIC_KEY,
        status: 'RUNNING',
        note: options.reason
      }
    });

    const startedAt = new Date();

    try {
      const regions = await this.prisma.orgListing.findMany({
        where: { organizationId: orgId },
        select: { city: true, state: true },
        distinct: ['city', 'state'],
        take: 8
      });

      const safeRegions = regions.filter((r) => r.city?.trim() && r.state?.trim());

      const fallbackRegions =
        safeRegions.length > 0
          ? []
          : await this.prisma.mlsListing.findMany({
              select: { city: true, state: true },
              distinct: ['city', 'state'],
              take: 3
            });

      const targetRegions = safeRegions.length > 0 ? safeRegions : fallbackRegions;

      if (targetRegions.length === 0) {
        await this.prisma.metricsRun.update({
          where: { id: run.id },
          data: { status: 'SUCCESS', finishedAt: new Date(), note: JSON.stringify({ created: 0, updated: 0, candidates: 0 }) }
        });
        return { runId: run.id, status: 'SUCCESS', created: 0, updated: 0, candidates: 0 };
      }

      const since = new Date(Date.now() - 365 * DAY_MS);
      const candidates = await this.prisma.mlsListing.findMany({
        where: {
          listingDate: { gte: since },
          OR: targetRegions.map((r) => ({ city: r.city, state: r.state }))
        },
        orderBy: { updatedAt: 'desc' },
        take: 200
      });

      const dedupeKeys = candidates.map((c) => this.makeDedupeKey(c.addressLine1, c.city, c.state, c.postalCode));
      const existing = dedupeKeys.length
        ? await this.prisma.sellerOpportunity.findMany({
            where: { organizationId: orgId, dedupeKey: { in: dedupeKeys } },
            select: { dedupeKey: true }
          })
        : [];
      const existingSet = new Set(existing.map((row) => row.dedupeKey));

      const now = new Date();
      let created = 0;
      let updated = 0;

      for (const candidate of candidates) {
        const dedupeKey = this.makeDedupeKey(candidate.addressLine1, candidate.city, candidate.state, candidate.postalCode);
        const { score, signals } = this.scoreListing(candidate);
        const data: Prisma.SellerOpportunityUncheckedCreateInput = {
          id: undefined as any,
          organizationId: orgId,
          dedupeKey,
          source: 'MLS',
          status: SellerOpportunityStatus.NEW,
          score,
          signals: signals as unknown as Prisma.InputJsonValue,
          addressLine1: candidate.addressLine1,
          city: candidate.city,
          state: candidate.state,
          postalCode: candidate.postalCode,
          county: candidate.county ?? null,
          latitude: candidate.latitude ?? null,
          longitude: candidate.longitude ?? null,
          externalMlsId: candidate.mlsId,
          externalMlsSource: candidate.mlsSource,
          externalListingStatus: candidate.status,
          externalListPrice: this.resolvePrice(candidate.listPrice) ? Math.round(this.resolvePrice(candidate.listPrice)!) : null,
          externalDaysOnMarket: candidate.daysOnMarket ?? null,
          externalListingDate: candidate.listingDate ?? null,
          externalStatusChangeDate: candidate.statusChangeDate ?? null,
          lastSeenAt: now
        };

        if (existingSet.has(dedupeKey)) {
          await this.prisma.sellerOpportunity.update({
            where: { organizationId_dedupeKey: { organizationId: orgId, dedupeKey } },
            data: {
              score: data.score,
              signals: data.signals,
              source: data.source,
              addressLine1: data.addressLine1,
              city: data.city,
              state: data.state,
              postalCode: data.postalCode,
              county: data.county,
              latitude: data.latitude,
              longitude: data.longitude,
              externalMlsId: data.externalMlsId,
              externalMlsSource: data.externalMlsSource,
              externalListingStatus: data.externalListingStatus,
              externalListPrice: data.externalListPrice,
              externalDaysOnMarket: data.externalDaysOnMarket,
              externalListingDate: data.externalListingDate,
              externalStatusChangeDate: data.externalStatusChangeDate,
              lastSeenAt: now
            }
          });
          updated += 1;
        } else {
          await this.prisma.sellerOpportunity.create({
            data: {
              ...data,
              id: undefined as any
            } as Prisma.SellerOpportunityUncheckedCreateInput
          });
          created += 1;
          existingSet.add(dedupeKey);
        }
      }

      const finishedAt = new Date();
      const note = JSON.stringify({ created, updated, candidates: candidates.length });
      await this.prisma.metricsRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCESS',
          finishedAt,
          note
        }
      });

      this.logger.log(
        `Seller opportunity scan (${options.reason}) for org=${orgId} created=${created} updated=${updated} candidates=${candidates.length} durationMs=${finishedAt.getTime() - startedAt.getTime()}`
      );

      return { runId: run.id, status: 'SUCCESS', created, updated, candidates: candidates.length };
    } catch (error) {
      await this.prisma.metricsRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          note: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  async convertToLead(orgId: string, userId: string, sellerOpportunityId: string) {
    const role = await this.assertUserInOrg(userId, orgId);
    if (!role || (role !== UserRole.BROKER && role !== UserRole.TEAM_LEAD && role !== UserRole.AGENT)) {
      throw new ForbiddenException('Broker or agent access required');
    }

    const opportunity = await this.prisma.sellerOpportunity.findFirst({
      where: { id: sellerOpportunityId, organizationId: orgId }
    });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    if (opportunity.status === SellerOpportunityStatus.CONVERTED && opportunity.convertedLeadId) {
      return { leadId: opportunity.convertedLeadId };
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found for organization');
    }

    const propertyAddress = formatSingleLineAddress({
      line1: opportunity.addressLine1,
      city: opportunity.city,
      state: opportunity.state,
      postalCode: opportunity.postalCode
    });

    const mailingAddress = formatSingleLineAddress({
      line1: opportunity.ownerMailingAddressLine1,
      line2: opportunity.ownerMailingAddressLine2,
      city: opportunity.ownerMailingCity,
      state: opportunity.ownerMailingState,
      postalCode: opportunity.ownerMailingPostalCode
    });

    const ownerName = (opportunity.ownerName ?? '').trim();
    const ownerParts = splitOwnerName(ownerName);
    const address = mailingAddress || propertyAddress;

    const person = await this.prisma.person.create({
      data: {
        tenantId: tenant.id,
        organizationId: orgId,
        ownerId: userId,
        firstName: ownerParts?.firstName ?? 'Owner',
        lastName: ownerParts?.lastName ?? opportunity.addressLine1,
        stage: PersonStage.NEW,
        leadType: LeadType.SELLER,
        source: 'seller_opportunity_engine',
        address
      }
    });

    const lead = await this.prisma.lead.create({
      data: {
        organizationId: orgId,
        tenantId: tenant.id,
        personId: person.id,
        status: LeadStatus.NEW,
        source: LeadSource.MANUAL,
        name: `${ownerName ? `${ownerName} · ` : 'Seller · '}${propertyAddress}`.slice(0, 255)
      }
    });

    await this.prisma.sellerOpportunity.update({
      where: { id: opportunity.id },
      data: {
        status: SellerOpportunityStatus.CONVERTED,
        convertedLeadId: lead.id
      }
    });

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: userId,
      type: OrgEventType.ORG_LEAD_CREATED,
      payload: {
        leadId: lead.id,
        sellerOpportunityId: opportunity.id,
        address: propertyAddress
      }
    });

    return { leadId: lead.id };
  }
}
