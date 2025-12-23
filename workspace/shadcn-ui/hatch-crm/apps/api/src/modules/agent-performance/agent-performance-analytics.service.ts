import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/modules/prisma/prisma.service';

type PerformanceRange = 'mtd' | 'qtd' | 'ytd';

type MonthlyPerformance = {
  month: string;
  closings: number;
  volume: number;
  avgPrice: number;
  brokerageAvg: number;
  listings: number;
};

type WeeklyActivity = {
  week: string;
  showings: number;
  openHouses: number;
  offers: number;
};

type PipelineStage = {
  stage: string;
  count: number;
  value: number;
};

@Injectable()
export class AgentPerformanceAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPerformance(agentId: string, range?: string) {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        organization: { select: { name: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const rangeKey = normalizeRange(range);
    const now = new Date();
    const start = resolveRangeStartUtc(rangeKey, now);

    const [agentCount, agentClosings, orgClosings, agentListings, showings, openHouses, offers] =
      await Promise.all([
        this.prisma.agentProfile.count({
          where: { organizationId: agent.organizationId },
        }),
        this.prisma.orgTransaction.findMany({
          where: {
            organizationId: agent.organizationId,
            agentProfileId: agentId,
            status: 'CLOSED',
            OR: [
              { closingDate: { gte: start, lte: now } },
              { closingDate: null, updatedAt: { gte: start, lte: now } },
            ],
          },
          select: {
            closingDate: true,
            updatedAt: true,
            listing: { select: { listPrice: true } },
          },
        }),
        this.prisma.orgTransaction.findMany({
          where: {
            organizationId: agent.organizationId,
            status: 'CLOSED',
            agentProfileId: { not: null },
            OR: [
              { closingDate: { gte: start, lte: now } },
              { closingDate: null, updatedAt: { gte: start, lte: now } },
            ],
          },
          select: { closingDate: true, updatedAt: true },
        }),
        this.prisma.orgListing.findMany({
          where: {
            organizationId: agent.organizationId,
            agentProfileId: agentId,
            OR: [
              { listedAt: { gte: start, lte: now } },
              { listedAt: null, createdAt: { gte: start, lte: now } },
            ],
          },
          select: { listedAt: true, createdAt: true },
        }),
        this.prisma.calendarEvent.findMany({
          where: {
            assignedAgentId: agent.userId,
            eventType: 'SHOWING',
            startAt: { gte: start, lte: now },
          },
          select: { startAt: true },
        }),
        this.prisma.calendarEvent.findMany({
          where: {
            assignedAgentId: agent.userId,
            title: { contains: 'open house', mode: 'insensitive' },
            startAt: { gte: start, lte: now },
          },
          select: { startAt: true },
        }),
        this.prisma.offerIntent.findMany({
          where: {
            organizationId: agent.organizationId,
            listing: { agentProfileId: agentId },
            createdAt: { gte: start, lte: now },
          },
          select: { createdAt: true },
        }),
      ]);

    const monthlyPerformance = buildMonthlyPerformance({
      start,
      end: now,
      agentClosings,
      agentListings,
      orgClosings,
      agentCount,
    });

    const weeklyActivity = buildWeeklyActivity({
      start,
      end: now,
      showings,
      openHouses,
      offers,
    });

    const agentName =
      `${agent.user.firstName ?? ''} ${agent.user.lastName ?? ''}`.trim() || 'Agent';

    return {
      agentId: agent.id,
      agentName,
      brokerageName: agent.organization.name,
      monthlyPerformance,
      weeklyActivity,
    };
  }

  async getPipeline(agentId: string): Promise<{ pipeline: PipelineStage[] }> {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { id: agentId },
      select: { id: true, organizationId: true },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const now = new Date();
    const monthStart = startOfUtcMonth(now);

    const [activeListings, underContract, pendingClose, closedMtd] = await Promise.all([
      this.prisma.orgListing.findMany({
        where: {
          organizationId: agent.organizationId,
          agentProfileId: agentId,
          status: 'ACTIVE',
        },
        select: { listPrice: true },
      }),
      this.prisma.orgTransaction.findMany({
        where: {
          organizationId: agent.organizationId,
          agentProfileId: agentId,
          status: 'UNDER_CONTRACT',
        },
        select: { listing: { select: { listPrice: true } } },
      }),
      this.prisma.orgTransaction.findMany({
        where: {
          organizationId: agent.organizationId,
          agentProfileId: agentId,
          status: 'CONTINGENT',
        },
        select: { listing: { select: { listPrice: true } } },
      }),
      this.prisma.orgTransaction.findMany({
        where: {
          organizationId: agent.organizationId,
          agentProfileId: agentId,
          status: 'CLOSED',
          OR: [
            { closingDate: { gte: monthStart, lte: now } },
            { closingDate: null, updatedAt: { gte: monthStart, lte: now } },
          ],
        },
        select: { listing: { select: { listPrice: true } } },
      }),
    ]);

    const pipeline: PipelineStage[] = [
      {
        stage: 'Active Listings',
        count: activeListings.length,
        value: sumInt(activeListings.map((row) => row.listPrice)),
      },
      {
        stage: 'Under Contract',
        count: underContract.length,
        value: sumInt(underContract.map((row) => row.listing?.listPrice)),
      },
      {
        stage: 'Pending Close',
        count: pendingClose.length,
        value: sumInt(pendingClose.map((row) => row.listing?.listPrice)),
      },
      {
        stage: 'Closed MTD',
        count: closedMtd.length,
        value: sumInt(closedMtd.map((row) => row.listing?.listPrice)),
      },
    ];

    return { pipeline };
  }

  async getRanking(agentId: string, range?: string): Promise<{ ranking: { rank: number; totalAgents: number; percentile: number } }> {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { id: agentId },
      select: { id: true, organizationId: true },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const rangeKey = normalizeRange(range);
    const now = new Date();
    const start = resolveRangeStartUtc(rangeKey, now);

    const [agents, closedTransactions] = await Promise.all([
      this.prisma.agentProfile.findMany({
        where: { organizationId: agent.organizationId },
        select: { id: true },
      }),
      this.prisma.orgTransaction.findMany({
        where: {
          organizationId: agent.organizationId,
          status: 'CLOSED',
          agentProfileId: { not: null },
          OR: [
            { closingDate: { gte: start, lte: now } },
            { closingDate: null, updatedAt: { gte: start, lte: now } },
          ],
        },
        select: {
          agentProfileId: true,
          listing: { select: { listPrice: true } },
        },
      }),
    ]);

    const volumeByAgent = new Map<string, number>();
    for (const row of closedTransactions) {
      const rowAgentId = row.agentProfileId ?? undefined;
      if (!rowAgentId) continue;
      const value = typeof row.listing?.listPrice === 'number' ? row.listing.listPrice : 0;
      volumeByAgent.set(rowAgentId, (volumeByAgent.get(rowAgentId) ?? 0) + value);
    }

    const rankingTable = agents
      .map((row) => ({ agentId: row.id, volume: volumeByAgent.get(row.id) ?? 0 }))
      .sort((a, b) => b.volume - a.volume || a.agentId.localeCompare(b.agentId));

    const totalAgents = rankingTable.length;
    const rank = Math.max(1, rankingTable.findIndex((row) => row.agentId === agentId) + 1);
    const percentile = totalAgents > 0 ? Math.round(((totalAgents - rank + 1) / totalAgents) * 100) : 0;

    return { ranking: { rank, totalAgents, percentile } };
  }
}

function normalizeRange(range?: string): PerformanceRange {
  const value = (range ?? '').toString().toLowerCase();
  if (value === 'mtd' || value === 'qtd' || value === 'ytd') return value;
  return 'ytd';
}

function resolveRangeStartUtc(range: PerformanceRange, now: Date): Date {
  switch (range) {
    case 'mtd':
      return startOfUtcMonth(now);
    case 'qtd':
      return startOfUtcQuarter(now);
    case 'ytd':
    default:
      return startOfUtcYear(now);
  }
}

function startOfUtcYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

function startOfUtcQuarter(date: Date) {
  const quarterIndex = Math.floor(date.getUTCMonth() / 3);
  return new Date(Date.UTC(date.getUTCFullYear(), quarterIndex * 3, 1, 0, 0, 0, 0));
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfUtcWeekMonday(date: Date) {
  const day = date.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = (day + 6) % 7; // days since Monday
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diff, 0, 0, 0, 0));
}

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function monthKey(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function dateKey(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function resolveActivityDate(date: Date | null | undefined, fallback: Date): Date {
  return date ?? fallback;
}

function sumInt(values: Array<number | null | undefined>) {
  return values.reduce((acc, value) => acc + (typeof value === 'number' ? value : 0), 0);
}

function buildMonthlyPerformance(input: {
  start: Date;
  end: Date;
  agentCount: number;
  agentClosings: Array<{ closingDate: Date | null; updatedAt: Date; listing?: { listPrice: number | null } | null }>;
  orgClosings: Array<{ closingDate: Date | null; updatedAt: Date }>;
  agentListings: Array<{ listedAt: Date | null; createdAt: Date }>;
}): MonthlyPerformance[] {
  const startMonth = startOfUtcMonth(input.start);
  const endMonth = startOfUtcMonth(input.end);

  const agentByMonth = new Map<string, { closings: number; volume: number }>();
  for (const row of input.agentClosings) {
    const key = monthKey(resolveActivityDate(row.closingDate, row.updatedAt));
    const value = typeof row.listing?.listPrice === 'number' ? row.listing.listPrice : 0;
    const bucket = agentByMonth.get(key) ?? { closings: 0, volume: 0 };
    bucket.closings += 1;
    bucket.volume += value;
    agentByMonth.set(key, bucket);
  }

  const listingsByMonth = new Map<string, number>();
  for (const row of input.agentListings) {
    const key = monthKey(resolveActivityDate(row.listedAt, row.createdAt));
    listingsByMonth.set(key, (listingsByMonth.get(key) ?? 0) + 1);
  }

  const orgClosingsByMonth = new Map<string, number>();
  for (const row of input.orgClosings) {
    const key = monthKey(resolveActivityDate(row.closingDate, row.updatedAt));
    orgClosingsByMonth.set(key, (orgClosingsByMonth.get(key) ?? 0) + 1);
  }

  const rows: MonthlyPerformance[] = [];
  for (let cursor = startMonth; cursor.getTime() <= endMonth.getTime(); cursor = addUtcMonths(cursor, 1)) {
    const key = monthKey(cursor);
    const agentBucket = agentByMonth.get(key) ?? { closings: 0, volume: 0 };
    const closings = agentBucket.closings;
    const volume = agentBucket.volume;
    const avgPrice = closings > 0 ? Math.round(volume / closings) : 0;
    const orgClosings = orgClosingsByMonth.get(key) ?? 0;
    const brokerageAvg = input.agentCount > 0 ? Number((orgClosings / input.agentCount).toFixed(2)) : 0;
    const listings = listingsByMonth.get(key) ?? 0;
    rows.push({ month: key, closings, volume, avgPrice, brokerageAvg, listings });
  }

  return rows;
}

function buildWeeklyActivity(input: {
  start: Date;
  end: Date;
  showings: Array<{ startAt: Date }>;
  openHouses: Array<{ startAt: Date }>;
  offers: Array<{ createdAt: Date }>;
}): WeeklyActivity[] {
  const startWeek = startOfUtcWeekMonday(input.start);
  const endWeek = startOfUtcWeekMonday(input.end);

  const buckets = new Map<string, { showings: number; openHouses: number; offers: number }>();
  for (let cursor = startWeek; cursor.getTime() <= endWeek.getTime(); cursor = addUtcDays(cursor, 7)) {
    buckets.set(dateKey(cursor), { showings: 0, openHouses: 0, offers: 0 });
  }

  for (const row of input.showings) {
    const key = dateKey(startOfUtcWeekMonday(row.startAt));
    const bucket = buckets.get(key);
    if (bucket) bucket.showings += 1;
  }
  for (const row of input.openHouses) {
    const key = dateKey(startOfUtcWeekMonday(row.startAt));
    const bucket = buckets.get(key);
    if (bucket) bucket.openHouses += 1;
  }
  for (const row of input.offers) {
    const key = dateKey(startOfUtcWeekMonday(row.createdAt));
    const bucket = buckets.get(key);
    if (bucket) bucket.offers += 1;
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, bucket]) => ({ week, ...bucket }));
}

