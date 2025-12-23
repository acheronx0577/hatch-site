import { Injectable, Logger } from '@nestjs/common';
import { LeadScoreTier, SavedViewScope } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';

import type { RequestContext } from '../common/request-context';
import { INSIGHTS_ACTIVITY_FILTERS, type GetInsightsQueryDto, type InsightsActivityFilter } from './dto';

export const INSIGHTS_RESPONSE_VERSION = 3;

type InsightsPeriod = {
  label: string;
  days: number;
  start: Date;
  end: Date;
};

type InsightsCacheKeyInput = {
  tenantId: string;
  period: InsightsPeriod;
  dormantDays: number;
  limit: number;
  version: number;
  ownerId?: string;
  teamId?: string;
  stageIds?: string[];
  tier?: string;
  activity?: InsightsActivityFilter;
  viewId?: string;
};

export function buildInsightsCacheKey(input: InsightsCacheKeyInput): string {
  const stageIds = normalizeStringList(input.stageIds);
  const stageKey = stageIds.length ? stageIds.join(',') : '*';
  const ownerKey = input.ownerId?.trim() || '*';
  const teamKey = input.teamId?.trim() || '*';
  const tierKey = input.tier?.trim().toUpperCase() || '*';
  const activityKey = input.activity ?? '*';
  const viewKey = input.viewId?.trim() || '*';

  return [
    `v=${input.version}`,
    `tenant=${input.tenantId}`,
    // Cache is TTL-based; avoid embedding volatile timestamps so equivalent requests share keys.
    `period=${input.period.days}`,
    `dormant=${input.dormantDays}`,
    `limit=${input.limit}`,
    `owner=${ownerKey}`,
    `team=${teamKey}`,
    `tier=${tierKey}`,
    `activity=${activityKey}`,
    `view=${viewKey}`,
    `stages=${stageKey}`
  ].join('|');
}

type InsightFilterOption = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  meta?: Record<string, unknown>;
};

type InsightsResponse = {
  v: number;
  period: {
    label: string;
    days: number;
    start: string;
    end: string;
  };
  summary: {
    activeLeads: number;
    avgStageTimeHours: number | null;
    conversionPct: number | null;
    deltaWoW?: { conversionPct?: number | null } | null;
  };
  dataAge?: string | null;
  filters: {
    owners: InsightFilterOption[];
    tiers: InsightFilterOption[];
    activities: InsightFilterOption[];
    savedViews: InsightFilterOption[];
  };
  heatmap: { stage: string; engaged: number; inactive: number }[];
  engagement: {
    byStage: any[];
    byOwner: any[];
    byTier: any[];
  };
  bottlenecks: any[];
  leaderboard: any[];
  feed: any[];
  activityFeed?: any[];
  reengagementQueue: any[];
  queues: { reengage: any[]; breaches: any[] };
  trendCards: any[];
  copilotInsights: { message: string }[];
};

type CacheEntry = {
  tenantId: string;
  cachedAtMs: number;
  payload: InsightsResponse;
};

const DAY_MS = 86_400_000;
const DEFAULT_PERIOD_DAYS = 7;
const DEFAULT_DORMANT_DAYS = 7;
const DEFAULT_LIMIT = 50;
const CACHE_TTL_MS = 60_000;
const DEFAULT_PERIOD_LABEL = (days: number) => `${days} days`;

const normalizeStringList = (value?: string[]): string[] => {
  if (!value) return [];
  const items = value
    .map((entry) => (entry ?? '').trim())
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));
};

const parsePeriodDays = (value?: string): number => {
  if (!value) return DEFAULT_PERIOD_DAYS;
  const match = value.match(/^(\d+)d$/i);
  if (!match) return DEFAULT_PERIOD_DAYS;
  const parsed = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PERIOD_DAYS;
  return Math.min(Math.max(parsed, 1), 90);
};

const resolvePeriod = (period?: string): InsightsPeriod => {
  const days = parsePeriodDays(period);
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY_MS);
  return {
    label: DEFAULT_PERIOD_LABEL(days),
    days,
    start,
    end
  };
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object' && value && 'toString' in value) {
    const parsed = Number(String((value as any).toString()));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

@Injectable()
export class InsightsService {
  private readonly log = new Logger(InsightsService.name);

  private readonly responseCache: Map<string, CacheEntry> = new Map();
  private readonly responseCacheKeysByTenant: Map<string, Set<string>> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  purgeTenantCache(tenantId: string) {
    const keys = this.responseCacheKeysByTenant.get(tenantId);
    if (!keys || keys.size === 0) {
      return;
    }

    for (const key of keys) {
      this.responseCache.delete(key);
    }

    this.responseCacheKeysByTenant.delete(tenantId);
    this.logMetric(`metric=insights.cache.evictions tenant=${tenantId} value=${keys.size}`);
  }

  async getInsights(ctx: RequestContext, query: GetInsightsQueryDto): Promise<InsightsResponse> {
    const tenantId = ctx.tenantId;
    const period = resolvePeriod(query.period);
    const dormantDays = query.dormantDays ?? DEFAULT_DORMANT_DAYS;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const stageIds = normalizeStringList(query.stage);

    const cacheKey = buildInsightsCacheKey({
      tenantId,
      period,
      dormantDays,
      limit,
      version: INSIGHTS_RESPONSE_VERSION,
      ownerId: query.ownerId,
      teamId: query.teamId,
      stageIds,
      tier: query.tier,
      activity: query.activity,
      viewId: query.viewId
    });

    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAtMs <= CACHE_TTL_MS) {
      return cached.payload;
    }

    const ownerId = query.ownerId?.trim() || undefined;
    const tier = query.tier?.trim()?.toUpperCase() || undefined;

    const analyticsWhere = {
      tenantId,
      ...(ownerId ? { ownerId } : {}),
      ...(stageIds.length ? { stageId: { in: stageIds } } : {}),
      ...(tier ? { scoreTier: tier as LeadScoreTier } : {})
    };

    const [people, analyticsAgg, savedViews] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(ownerId ? { ownerId } : {}),
          ...(stageIds.length ? { stageId: { in: stageIds } } : {}),
          ...(tier ? { scoreTier: tier as LeadScoreTier } : {})
        },
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          pipelineStage: { select: { id: true, name: true, order: true } }
        }
      }),
      this.prisma.leadAnalyticsView.aggregate({
        where: analyticsWhere,
        _count: { _all: true },
        _sum: {
          avgStageDurationMs: true,
          stageMovesTotal: true,
          stageMovesForward: true
        }
      }),
      this.prisma.savedView.findMany({
        where: {
          tenantId
        },
        orderBy: { name: 'asc' }
      })
    ]);

    const activeLeads = people.length;

    const analyticsRowCount = analyticsAgg?._count?._all ?? 0;
    const avgStageDurationMs =
      analyticsRowCount > 0
        ? (toNumber(analyticsAgg?._sum?.avgStageDurationMs) ?? 0) / analyticsRowCount
        : null;

    const avgStageTimeHours =
      avgStageDurationMs === null ? null : Math.round((avgStageDurationMs / (60 * 60 * 1000)) * 10) / 10;

    const totalMoves = toNumber(analyticsAgg?._sum?.stageMovesTotal) ?? 0;
    const forwardMoves = toNumber(analyticsAgg?._sum?.stageMovesForward) ?? 0;
    const conversionPct = totalMoves > 0 ? Math.round((forwardMoves / totalMoves) * 1000) / 10 : null;

    const owners = normalizeOwners(people);
    const tiers = buildTierFilters();
    const activities = buildActivityFilters();
    const savedViewsFilter = savedViews.map((view: any) => ({
      id: view.id,
      label: view.name,
      meta: {
        scope: view.scope as SavedViewScope,
        teamId: view.teamId ?? null,
        userId: view.userId ?? null
      }
    }));

    const response: InsightsResponse = {
      v: INSIGHTS_RESPONSE_VERSION,
      period: {
        label: period.label,
        days: period.days,
        start: period.start.toISOString(),
        end: period.end.toISOString()
      },
      summary: {
        activeLeads,
        avgStageTimeHours,
        conversionPct,
        deltaWoW: null
      },
      dataAge: new Date().toISOString(),
      filters: {
        owners,
        tiers,
        activities,
        savedViews: savedViewsFilter
      },
      heatmap: [],
      engagement: {
        byStage: [],
        byOwner: [],
        byTier: []
      },
      bottlenecks: [],
      leaderboard: [],
      feed: [],
      activityFeed: [],
      reengagementQueue: [],
      queues: { reengage: [], breaches: [] },
      trendCards: [],
      copilotInsights: []
    };

    this.cacheResponse(cacheKey, tenantId, response);
    return response;
  }

  private cacheResponse(cacheKey: string, tenantId: string, payload: InsightsResponse) {
    this.responseCache.set(cacheKey, { tenantId, payload, cachedAtMs: Date.now() });
    const set = this.responseCacheKeysByTenant.get(tenantId) ?? new Set<string>();
    set.add(cacheKey);
    this.responseCacheKeysByTenant.set(tenantId, set);
  }

  private logMetric(message: string) {
    this.log.debug(message);
  }
}

function normalizeOwners(people: any[]): InsightFilterOption[] {
  const owners = new Map<string, InsightFilterOption>();
  for (const person of people) {
    const owner = person?.owner;
    if (!owner?.id) continue;
    const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
    owners.set(owner.id, {
      id: owner.id,
      label: name || owner.id,
      avatarUrl: owner.avatarUrl ?? null
    });
  }
  return Array.from(owners.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function buildTierFilters(): InsightFilterOption[] {
  return ['A', 'B', 'C', 'D'].map((tier) => ({
    id: tier,
    label: tier,
    meta: { tier }
  }));
}

function buildActivityFilters(): InsightFilterOption[] {
  return INSIGHTS_ACTIVITY_FILTERS.map((activity) => ({
    id: activity,
    label: activity
  }));
}
