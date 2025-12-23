import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@hatch/db';
import { subDays } from 'date-fns';
import { createHash } from 'crypto';

import { PrismaService } from '@/modules/prisma/prisma.service';
import {
  API_V1_MODEL_VERSION,
  computeApiV1Indicator,
  DEFAULT_AGENT_PERFORMANCE_WEIGHTS
} from './scoring/api-v1';

type AgentPerformanceReadOptions = {
  includeRawFeatureSummary?: boolean;
};

@Injectable()
export class AgentPerformanceService {
  private readonly logger = new Logger(AgentPerformanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private clamp01(value: number) {
    return this.clamp(value, 0, 1);
  }

  private snapshotSelect(includeRawFeatureSummary: boolean) {
    return {
      modelVersion: true,
      overallScore: true,
      confidenceBand: true,
      historicalEffectivenessScore: true,
      responsivenessReliabilityScore: true,
      recencyMomentumScore: true,
      opportunityFitScore: true,
      riskDragPenalty: true,
      capacityLoadScore: true,
      topDrivers: true,
      ...(includeRawFeatureSummary ? { rawFeatureSummary: true } : {}),
      createdAt: true
    };
  }

  private isMissingSchemaError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022' || error.code === '42P01')
    );
  }

  private async getOrCreateWeights(orgId: string) {
    return this.prisma.agentPerformanceWeights.upsert({
      where: {
        organizationId_modelVersion: {
          organizationId: orgId,
          modelVersion: API_V1_MODEL_VERSION
        }
      },
      create: {
        organizationId: orgId,
        modelVersion: API_V1_MODEL_VERSION,
        weightHistoricalEffectiveness: DEFAULT_AGENT_PERFORMANCE_WEIGHTS.weightHistoricalEffectiveness,
        weightResponsivenessReliability: DEFAULT_AGENT_PERFORMANCE_WEIGHTS.weightResponsivenessReliability,
        weightRecencyMomentum: DEFAULT_AGENT_PERFORMANCE_WEIGHTS.weightRecencyMomentum,
        weightOpportunityFit: DEFAULT_AGENT_PERFORMANCE_WEIGHTS.weightOpportunityFit,
        weightCapacityLoad: DEFAULT_AGENT_PERFORMANCE_WEIGHTS.weightCapacityLoad,
        maxRiskDragPenalty: DEFAULT_AGENT_PERFORMANCE_WEIGHTS.maxRiskDragPenalty,
        highBandThreshold: DEFAULT_AGENT_PERFORMANCE_WEIGHTS.highBandThreshold,
        mediumBandThreshold: DEFAULT_AGENT_PERFORMANCE_WEIGHTS.mediumBandThreshold
      },
      update: {}
    });
  }

  /**
   * Compute and persist performance snapshots for all agents in an org.
   * Deterministic, versioned scoring (API_v1) with explainable drivers and raw feature summaries.
   */
  async generateSnapshots(orgId: string, periodStart?: Date, periodEnd?: Date) {
    const now = periodEnd ?? new Date();
    const lookbackStart = periodStart ?? subDays(now, 180);
    const prev30Start = subDays(now, 60);
    const recent30Start = subDays(now, 30);
    const recent90Start = subDays(now, 90);
    const prev90Start = subDays(now, 180);
    const fitWindowStart = subDays(now, 365);
    const closedQualityWindowDays = 365;
    const staleLeadThreshold = subDays(now, 7);
    const openLeadWindowStart = subDays(now, 90);

    let weights: Awaited<ReturnType<typeof this.getOrCreateWeights>>;
    try {
      weights = await this.getOrCreateWeights(orgId);
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        this.logger.warn(`Agent performance weights table missing; skipping snapshots for org ${orgId}`);
        return;
      }
      throw error;
    }

    const profiles = await this.prisma.agentProfile.findMany({
      where: {
        organizationId: orgId,
        lifecycleStage: { in: ['ONBOARDING', 'ACTIVE'] as any }
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        riskLevel: true,
        requiresAction: true
      }
    });

    if (profiles.length === 0) return;

    const agentProfileIds = profiles.map((profile) => profile.id);
    const agentUserIds = profiles.map((profile) => profile.userId);

    const baselineFitByAgentPromise = this.computeBaselineOpportunityFitByAgent({
      orgId,
      now,
      since: fitWindowStart,
      profiles: profiles.map((profile) => ({ id: profile.id, userId: profile.userId }))
    });

    const toCountMap = (groups: Array<{ key: string | null; count: number }>) => {
      const map = new Map<string, number>();
      for (const group of groups) {
        if (!group.key) continue;
        map.set(group.key, group.count);
      }
      return map;
    };

    const [
      leadCountsByStatus,
      leadsNewLast30,
      leadsStaleNewLast30,
      openLeads,
      tasksCompletedLast30,
      tasksCompletedPrev30,
      overdueOpenTasks,
      activeListings,
      activeTransactions,
      closedTransactions,
      nonCompliantTransactionsAgg,
      complianceEvents,
      firstTouchTimers,
      touchesLast30,
      touchesPrev30,
      baselineFitByAgent
    ] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['agentProfileId', 'status'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          createdAt: { gte: lookbackStart, lte: now }
        },
        _count: { _all: true }
      }),
      this.prisma.lead.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          createdAt: { gte: recent30Start, lte: now }
        },
        _count: { _all: true }
      }),
      this.prisma.lead.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: 'NEW' as any,
          createdAt: { gte: recent30Start, lte: staleLeadThreshold }
        },
        _count: { _all: true }
      }),
      this.prisma.lead.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: { not: 'CLOSED' as any },
          createdAt: { gte: openLeadWindowStart, lte: now }
        },
        _count: { _all: true }
      }),
      this.prisma.agentWorkflowTask.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: 'COMPLETED' as any,
          completedAt: { gte: recent30Start, lte: now }
        },
        _count: { _all: true }
      }),
      this.prisma.agentWorkflowTask.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: 'COMPLETED' as any,
          completedAt: { gte: prev30Start, lt: recent30Start }
        },
        _count: { _all: true }
      }),
      this.prisma.agentWorkflowTask.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: { in: ['PENDING', 'IN_PROGRESS'] as any },
          dueAt: { lt: now }
        },
        _count: { _all: true }
      }),
      this.prisma.orgListing.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: { in: ['ACTIVE', 'PENDING', 'PENDING_BROKER_APPROVAL'] as any }
        },
        _count: { _all: true }
      }),
      this.prisma.orgTransaction.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: { in: ['PRE_CONTRACT', 'UNDER_CONTRACT', 'CONTINGENT'] as any }
        },
        _count: { _all: true }
      }),
      this.prisma.orgTransaction.findMany({
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: 'CLOSED' as any,
          OR: [
            { closingDate: { gte: prev90Start, lte: now } },
            { closingDate: null, updatedAt: { gte: prev90Start, lte: now } }
          ]
        },
        select: {
          agentProfileId: true,
          createdAt: true,
          closingDate: true,
          updatedAt: true
        }
      }),
      this.prisma.orgTransaction.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          OR: [{ isCompliant: false }, { requiresAction: true }]
        },
        _count: { _all: true },
        _min: { updatedAt: true }
      }),
      this.prisma.orgEvent.findMany({
        where: {
          organizationId: orgId,
          type: { in: ['ORG_LISTING_EVALUATED', 'ORG_TRANSACTION_EVALUATED'] as any },
          createdAt: { gte: recent30Start, lte: now }
        },
        select: { payload: true }
      }),
      this.prisma.leadSlaTimer.findMany({
        where: {
          tenant: { organizationId: orgId },
          type: 'FIRST_TOUCH' as any,
          status: { in: ['SATISFIED', 'BREACHED'] },
          assignedAgentId: { in: agentUserIds },
          createdAt: { gte: recent30Start, lte: now }
        },
        select: {
          assignedAgentId: true,
          status: true,
          createdAt: true,
          satisfiedAt: true
        }
      }),
      this.prisma.leadTouchpoint.groupBy({
        by: ['userId'],
        where: {
          tenant: { organizationId: orgId },
          userId: { in: agentUserIds },
          occurredAt: { gte: recent30Start, lte: now }
        },
        _count: { _all: true }
      }),
      this.prisma.leadTouchpoint.groupBy({
        by: ['userId'],
        where: {
          tenant: { organizationId: orgId },
          userId: { in: agentUserIds },
          occurredAt: { gte: prev30Start, lt: recent30Start }
        },
        _count: { _all: true }
      }),
      baselineFitByAgentPromise
    ]);

    const leadsByAgent = new Map<string, { worked: number; converted: number }>();
    for (const group of leadCountsByStatus) {
      const agentProfileId = group.agentProfileId ?? null;
      if (!agentProfileId) continue;
      const entry = leadsByAgent.get(agentProfileId) ?? { worked: 0, converted: 0 };
      entry.worked += group._count._all;
      if (group.status === ('CLOSED' as any)) {
        entry.converted += group._count._all;
      }
      leadsByAgent.set(agentProfileId, entry);
    }

    const leadsNewLast30ByAgent = toCountMap(
      leadsNewLast30.map((row) => ({ key: row.agentProfileId ?? null, count: row._count._all }))
    );
    const leadsStaleNewLast30ByAgent = toCountMap(
      leadsStaleNewLast30.map((row) => ({ key: row.agentProfileId ?? null, count: row._count._all }))
    );
    const openLeadsByAgent = toCountMap(openLeads.map((row) => ({ key: row.agentProfileId ?? null, count: row._count._all })));
    const tasksCompletedLast30ByAgent = toCountMap(
      tasksCompletedLast30.map((row) => ({ key: row.agentProfileId ?? null, count: row._count._all }))
    );
    const tasksCompletedPrev30ByAgent = toCountMap(
      tasksCompletedPrev30.map((row) => ({ key: row.agentProfileId ?? null, count: row._count._all }))
    );
    const overdueOpenTasksByAgent = toCountMap(
      overdueOpenTasks.map((row) => ({ key: row.agentProfileId ?? null, count: row._count._all }))
    );
    const activeListingsByAgent = toCountMap(activeListings.map((row) => ({ key: row.agentProfileId ?? null, count: row._count._all })));
    const activeTransactionsByAgent = toCountMap(
      activeTransactions.map((row) => ({ key: row.agentProfileId ?? null, count: row._count._all }))
    );

    const nonCompliantTxnCountByAgent = new Map<string, number>();
    const oldestNonCompliantUpdatedAtByAgent = new Map<string, Date | null>();
    for (const row of nonCompliantTransactionsAgg) {
      const agentProfileId = row.agentProfileId ?? null;
      if (!agentProfileId) continue;
      nonCompliantTxnCountByAgent.set(agentProfileId, row._count._all);
      oldestNonCompliantUpdatedAtByAgent.set(agentProfileId, (row._min.updatedAt as Date | null) ?? null);
    }

    const interventionsByAgent = new Map<string, number>();
    for (const event of complianceEvents) {
      const payload = event.payload as any;
      const agentProfileId: string | undefined = payload?.agentProfileId ?? undefined;
      if (!agentProfileId) continue;
      const riskLevel = payload?.riskLevel;
      if (!riskLevel || riskLevel === 'LOW') continue;
      interventionsByAgent.set(agentProfileId, (interventionsByAgent.get(agentProfileId) ?? 0) + 1);
    }

    const firstTouchByAgent = new Map<
      string,
      { satisfied: number; breached: number; responseMinutes: number[] }
    >();
    for (const timer of firstTouchTimers) {
      const agentId = timer.assignedAgentId ?? null;
      if (!agentId) continue;
      const entry = firstTouchByAgent.get(agentId) ?? { satisfied: 0, breached: 0, responseMinutes: [] };
      if (timer.status === 'SATISFIED') {
        entry.satisfied += 1;
        if (timer.satisfiedAt) {
          entry.responseMinutes.push((timer.satisfiedAt.getTime() - timer.createdAt.getTime()) / 60000);
        }
      } else if (timer.status === 'BREACHED') {
        entry.breached += 1;
      }
      firstTouchByAgent.set(agentId, entry);
    }

    const touchesLast30ByUser = new Map<string, number>();
    for (const row of touchesLast30) {
      const userId = row.userId ?? null;
      if (!userId) continue;
      touchesLast30ByUser.set(userId, row._count._all);
    }
    const touchesPrev30ByUser = new Map<string, number>();
    for (const row of touchesPrev30) {
      const userId = row.userId ?? null;
      if (!userId) continue;
      touchesPrev30ByUser.set(userId, row._count._all);
    }

    const closedTxnByAgent = new Map<
      string,
      { closeAts: Date[]; daysToClose: number[] }
    >();
    for (const txn of closedTransactions) {
      const agentProfileId = txn.agentProfileId ?? null;
      if (!agentProfileId) continue;
      const closeAt = (txn.closingDate ?? txn.updatedAt) as Date | null;
      if (!closeAt) continue;
      const entry = closedTxnByAgent.get(agentProfileId) ?? { closeAts: [], daysToClose: [] };
      entry.closeAts.push(closeAt);
      const days = (closeAt.getTime() - txn.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      if (Number.isFinite(days) && days >= 0) {
        entry.daysToClose.push(days);
      }
      closedTxnByAgent.set(agentProfileId, entry);
    }

    for (const profile of profiles) {
      try {
        const leadStats = leadsByAgent.get(profile.id) ?? { worked: 0, converted: 0 };
        const closed = closedTxnByAgent.get(profile.id) ?? { closeAts: [], daysToClose: [] };

        const closedLast30 = closed.closeAts.filter((date) => date >= recent30Start).length;
        const closedLast90 = closed.closeAts.filter((date) => date >= recent90Start).length;
        const closedPrev90 = closed.closeAts.filter((date) => date >= prev90Start && date < recent90Start).length;

        const avgDaysToClose =
          closed.daysToClose.length === 0
            ? null
            : closed.daysToClose.reduce((acc, value) => acc + value, 0) / closed.daysToClose.length;

        const sla = firstTouchByAgent.get(profile.userId) ?? { satisfied: 0, breached: 0, responseMinutes: [] };
        const resolved = sla.satisfied + sla.breached;
        const baselineFit =
          baselineFitByAgent.get(profile.id) ??
          ({
            score: 0.7,
            context: {
              typicalLeadType: 'UNKNOWN',
              topState: null,
              topPropertyType: null,
              topPriceBand: null
            },
            counts: {
              listingsTotal: 0,
              listingsInTopState: 0,
              listingsInTopPropertyType: 0,
              closedTotal: 0,
              closedInTopPriceBand: 0,
              closedFlagged: 0
            }
          } as const);

        const indicator = computeApiV1Indicator({
          orgId,
          agentProfileId: profile.id,
          agentUserId: profile.userId,
          now,
          lookbackStart,
          agentCreatedAt: profile.createdAt,
          weights: {
            weightHistoricalEffectiveness: weights.weightHistoricalEffectiveness,
            weightResponsivenessReliability: weights.weightResponsivenessReliability,
            weightRecencyMomentum: weights.weightRecencyMomentum,
            weightOpportunityFit: weights.weightOpportunityFit,
            weightCapacityLoad: weights.weightCapacityLoad,
            maxRiskDragPenalty: weights.maxRiskDragPenalty,
            highBandThreshold: weights.highBandThreshold,
            mediumBandThreshold: weights.mediumBandThreshold
          },
          riskLevel: String(profile.riskLevel ?? 'LOW'),
          requiresAction: Boolean(profile.requiresAction),
          opportunityFitBaseline: {
            windowDays: closedQualityWindowDays,
            context: baselineFit.context,
            counts: {
              listingsTotal: baselineFit.counts.listingsTotal,
              listingsInTopState: baselineFit.counts.listingsInTopState,
              listingsInTopPropertyType: baselineFit.counts.listingsInTopPropertyType,
              closedTotal: baselineFit.counts.closedTotal,
              closedInTopPriceBand: baselineFit.counts.closedInTopPriceBand
            }
          },
          leadsWorked: leadStats.worked,
          leadsConverted: leadStats.converted,
          leadsNewLast30Days: leadsNewLast30ByAgent.get(profile.id) ?? 0,
          leadsStaleNewLast30Days: leadsStaleNewLast30ByAgent.get(profile.id) ?? 0,
          openLeads: openLeadsByAgent.get(profile.id) ?? 0,
          tasksCompletedLast30Days: tasksCompletedLast30ByAgent.get(profile.id) ?? 0,
          tasksCompletedPrev30Days: tasksCompletedPrev30ByAgent.get(profile.id) ?? 0,
          overdueOpenTasks: overdueOpenTasksByAgent.get(profile.id) ?? 0,
          closedTransactionsLast30Days: closedLast30,
          closedTransactionsLast90Days: closedLast90,
          closedTransactionsPrev90Days: closedPrev90,
          avgDaysToClose,
          activeTransactions: activeTransactionsByAgent.get(profile.id) ?? 0,
          activeListings: activeListingsByAgent.get(profile.id) ?? 0,
          closedTransactionsQualityWindowDays: closedQualityWindowDays,
          closedTransactionsQualityTotal: baselineFit.counts.closedTotal,
          closedTransactionsQualityFlagged: baselineFit.counts.closedFlagged,
          firstTouchResolvedLast30Days: resolved,
          firstTouchSatisfiedLast30Days: sla.satisfied,
          firstTouchBreachedLast30Days: sla.breached,
          firstTouchResponseMinutes: sla.responseMinutes,
          touchesLast30Days: touchesLast30ByUser.get(profile.userId) ?? 0,
          touchesPrev30Days: touchesPrev30ByUser.get(profile.userId) ?? 0,
          nonCompliantTransactions: nonCompliantTxnCountByAgent.get(profile.id) ?? 0,
          oldestNonCompliantUpdatedAt: oldestNonCompliantUpdatedAtByAgent.get(profile.id) ?? null,
          interventionsLast30Days: interventionsByAgent.get(profile.id) ?? 0,
          opportunityFitScore: baselineFit.score
        });

        await this.prisma.$transaction(async (tx) => {
          const snapshot = await tx.agentPerformanceSnapshot.create({
            data: {
              organizationId: orgId,
              agentProfileId: profile.id,
              modelVersion: indicator.modelVersion,
              overallScore: indicator.overallScore,
              confidenceBand: indicator.confidenceBand as any,
              historicalEffectivenessScore: indicator.dimensions.historicalEffectiveness,
              responsivenessReliabilityScore: indicator.dimensions.responsivenessReliability,
              recencyMomentumScore: indicator.dimensions.recencyMomentum,
              opportunityFitScore: indicator.dimensions.opportunityFit,
              riskDragPenalty: indicator.dimensions.riskDragPenalty,
              capacityLoadScore: indicator.dimensions.capacityLoad,
              topDrivers: indicator.topDrivers as any,
              rawFeatureSummary: indicator.rawFeatureSummary as any,
              leadsWorked: leadStats.worked,
              leadsConverted: leadStats.converted,
              avgResponseTimeSec:
                indicator.rawFeatureSummary.sla.medianFirstTouchMinutes === null
                  ? 0
                  : Math.round(indicator.rawFeatureSummary.sla.medianFirstTouchMinutes * 60),
              tasksCompleted: indicator.rawFeatureSummary.tasks.completedLast30Days,
              tasksOverdue: indicator.rawFeatureSummary.tasks.overdueOpen,
              documentsIssues: 0,
              compliantDocs: 0,
              listingsActive: indicator.rawFeatureSummary.listings.active,
              transactionsActive: indicator.rawFeatureSummary.transactions.active,
              activityScore: indicator.dimensions.recencyMomentum * 100,
              responsivenessScore: indicator.dimensions.responsivenessReliability * 100,
              performanceScore: indicator.overallScore * 100,
              periodStart: lookbackStart,
              periodEnd: now
            } as any
          });

          await tx.agentPerformanceLatest.upsert({
            where: {
              organizationId_agentProfileId_modelVersion: {
                organizationId: orgId,
                agentProfileId: profile.id,
                modelVersion: indicator.modelVersion
              }
            },
            create: {
              organizationId: orgId,
              agentProfileId: profile.id,
              modelVersion: indicator.modelVersion,
              snapshotId: snapshot.id
            },
            update: { snapshotId: snapshot.id }
          } as any);
        });
      } catch (err) {
        this.logger.warn(
          `Failed to compute API_v1 snapshot for agent ${profile.id} in org ${orgId}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  }

  async listSnapshots(orgId: string, agentProfileId?: string, options: AgentPerformanceReadOptions = {}) {
    const includeRawFeatureSummary = Boolean(options.includeRawFeatureSummary);
    try {
      return await this.prisma.agentPerformanceSnapshot.findMany({
        where: {
          organizationId: orgId,
          agentProfileId: agentProfileId ?? undefined,
          modelVersion: API_V1_MODEL_VERSION
        } as any,
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          organizationId: true,
          agentProfileId: true,
          ...this.snapshotSelect(includeRawFeatureSummary)
        } as any
      });
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        this.logger.warn(
          `Agent performance snapshot table missing; returning empty snapshots for org ${orgId}`
        );
        return [];
      }
      throw error;
    }
  }

  async latestByOrg(orgId: string, options: AgentPerformanceReadOptions = {}) {
    const includeRawFeatureSummary = Boolean(options.includeRawFeatureSummary);
    try {
      return await this.prisma.agentPerformanceLatest.findMany({
        where: {
          organizationId: orgId,
          modelVersion: API_V1_MODEL_VERSION
        } as any,
        include: {
          snapshot: {
            select: this.snapshotSelect(includeRawFeatureSummary)
          }
        },
        orderBy: { agentProfileId: 'asc' },
        take: 500
      });
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        this.logger.warn(
          `Agent performance latest table missing; returning empty latest indicators for org ${orgId}`
        );
        return [];
      }
      throw error;
    }
  }

  async getLatestIndicator(orgId: string, agentProfileId: string, options: AgentPerformanceReadOptions = {}) {
    const includeRawFeatureSummary = Boolean(options.includeRawFeatureSummary);
    let latest: any;
    try {
      latest = await this.prisma.agentPerformanceLatest.findFirst({
        where: {
          organizationId: orgId,
          agentProfileId,
          modelVersion: API_V1_MODEL_VERSION
        } as any,
        include: {
          snapshot: {
            select: this.snapshotSelect(includeRawFeatureSummary)
          }
        }
      });
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        this.logger.warn(
          `Agent performance latest table missing; returning null indicator for agent ${agentProfileId}`
        );
        return null;
      }
      throw error;
    }

    const snapshot = latest?.snapshot as any;
    if (!snapshot) return null;

    return this.toIndicatorDto(snapshot, { includeRawFeatureSummary });
  }

  async getTrend(orgId: string, agentProfileId: string, days: number, options: AgentPerformanceReadOptions = {}) {
    const includeRawFeatureSummary = Boolean(options.includeRawFeatureSummary);
    const horizon = Math.min(Math.max(days || 90, 7), 365);
    const since = subDays(new Date(), horizon);
    let snapshots: any[] = [];
    try {
      snapshots = await this.prisma.agentPerformanceSnapshot.findMany({
        where: {
          organizationId: orgId,
          agentProfileId,
          modelVersion: API_V1_MODEL_VERSION,
          createdAt: { gte: since }
        } as any,
        orderBy: { createdAt: 'asc' },
        take: 400,
        select: this.snapshotSelect(includeRawFeatureSummary) as any
      });
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        this.logger.warn(
          `Agent performance snapshot table missing; returning empty trend for agent ${agentProfileId}`
        );
        snapshots = [];
      } else {
        throw error;
      }
    }

    return {
      agentProfileId,
      modelVersion: API_V1_MODEL_VERSION,
      points: snapshots.map((snapshot: any) => this.toIndicatorPoint(snapshot))
    };
  }

  async listLeaderboard(params: {
    orgId: string;
    page?: number;
    limit?: number;
    officeId?: string;
    teamId?: string;
    orientation?: 'BUYER_HEAVY' | 'SELLER_HEAVY' | 'BALANCED' | 'UNKNOWN';
    priceBand?: 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY';
    includeRawFeatureSummary?: boolean;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const includeRawFeatureSummary = Boolean(params.includeRawFeatureSummary);

    let rows: any[] = [];
    try {
      rows = await this.prisma.agentPerformanceLatest.findMany({
        where: {
          organizationId: params.orgId,
          modelVersion: API_V1_MODEL_VERSION,
          ...(params.officeId || params.teamId
            ? {
                agentProfile: {
                  ...(params.officeId ? { officeId: params.officeId } : {}),
                  ...(params.teamId ? { teamId: params.teamId } : {})
                }
              }
            : {})
        } as any,
        include: {
          snapshot: {
            select: this.snapshotSelect(includeRawFeatureSummary)
          },
          agentProfile: {
            select: {
              id: true,
              userId: true,
              officeId: true,
              teamId: true,
              office: { select: { id: true, name: true } },
              team: { select: { id: true, name: true } },
              user: { select: { firstName: true, lastName: true, email: true } }
            }
          }
        }
      });
    } catch (error) {
      if (this.isMissingSchemaError(error)) {
        this.logger.warn(
          `Agent performance latest table missing; returning empty leaderboard for org ${params.orgId}`
        );
        return {
          modelVersion: API_V1_MODEL_VERSION,
          page,
          limit,
          total: 0,
          items: []
        };
      }
      throw error;
    }

    const userIds = rows.map((row: any) => row.agentProfile?.userId).filter(Boolean);
    const orientationByUserId = await this.computeOrientationByUserId(params.orgId, userIds);

    const priceBandCounts =
      params.priceBand
        ? await this.computeClosedPriceBandCounts(params.orgId, rows.map((row: any) => row.agentProfileId), params.priceBand)
        : null;

    const items = rows
      .map((row: any) => {
        const snapshot = row.snapshot as any;
        const agentProfile = row.agentProfile as any;
        const user = agentProfile?.user ?? null;
        const fullName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : 'Agent';
        const orientation = orientationByUserId.get(agentProfile?.userId) ?? {
          buyerSharePercent: 0,
          orientation: 'UNKNOWN' as const,
          buyerCount: 0,
          sellerCount: 0
        };
        const closedInBand = priceBandCounts?.get(agentProfile?.id ?? '') ?? 0;

        return {
          agentProfileId: agentProfile?.id ?? row.agentProfileId,
          name: fullName || 'Agent',
          email: user?.email ?? null,
          office: agentProfile?.office ?? (agentProfile?.officeId ? { id: agentProfile.officeId, name: null } : null),
          team: agentProfile?.team ?? (agentProfile?.teamId ? { id: agentProfile.teamId, name: null } : null),
          buyerSharePercent: orientation.buyerSharePercent,
          buyerLeadCount: orientation.buyerCount,
          sellerLeadCount: orientation.sellerCount,
          buyerSellerOrientation: orientation.orientation,
          priceBandClosedCount: closedInBand,
          ...this.toIndicatorDto(snapshot, { includeRawFeatureSummary })
        };
      })
      .filter((row) => {
        if (!params.orientation) return true;
        return row.buyerSellerOrientation === params.orientation;
      })
      .filter((row) => {
        if (!params.priceBand) return true;
        return (row.priceBandClosedCount ?? 0) > 0;
      })
      .sort((a, b) => b.overallScore - a.overallScore || a.name.localeCompare(b.name));

    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);

    return {
      modelVersion: API_V1_MODEL_VERSION,
      page,
      limit,
      total,
      items: paged
    };
  }

  async getContextFit(params: {
    orgId: string;
    agentProfileId: string;
    actorUserId: string;
    actorRole: string;
    context: {
      leadType?: 'BUYER' | 'SELLER' | 'UNKNOWN';
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      price?: number | null;
      priceBand?: 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY';
      propertyType?: string | null;
    };
  }) {
    const agent = await this.prisma.agentProfile.findFirst({
      where: { id: params.agentProfileId, organizationId: params.orgId },
      select: { id: true, userId: true }
    });
    if (!agent) {
      throw new ForbiddenException('Agent profile not found');
    }

    if (params.actorRole === 'AGENT' && agent.userId !== params.actorUserId) {
      throw new ForbiddenException('Agents may only view their own context fit');
    }

    const explicitPriceBand = params.context.priceBand ?? null;
    const derivedPriceBand =
      params.context.price === null || params.context.price === undefined
        ? null
        : this.resolvePriceBand(params.context.price);

    const normalizedContext = {
      leadType: (params.context.leadType ?? 'UNKNOWN').toUpperCase(),
      city: (params.context.city ?? '').trim().toLowerCase(),
      state: (params.context.state ?? '').trim().toUpperCase(),
      postalCode: (params.context.postalCode ?? '').trim(),
      propertyType: (params.context.propertyType ?? '').trim().toLowerCase(),
      priceBand: explicitPriceBand ?? derivedPriceBand
    };

    const contextKey = createHash('sha256').update(JSON.stringify(normalizedContext)).digest('hex');
    let cached: any = null;
    try {
      cached = await this.prisma.agentPerformanceContextScore.findFirst({
        where: {
          organizationId: params.orgId,
          agentProfileId: params.agentProfileId,
          modelVersion: API_V1_MODEL_VERSION,
          contextKey
        } as any
      });
    } catch (error) {
      if (!this.isMissingSchemaError(error)) {
        throw error;
      }
      cached = null;
    }

    if (cached) {
      return {
        agentProfileId: params.agentProfileId,
        modelVersion: API_V1_MODEL_VERSION,
        contextKey,
        fitScore: cached.fitScore,
        computedAt: cached.computedAt.toISOString(),
        reasons: (cached.reasons as any) ?? []
      };
    }

    const windowStart = subDays(new Date(), 365);
    const [totalListings, cityListings, stateListings, typeListings, closedTotal, closedBand, orientation] =
      await Promise.all([
        this.prisma.orgListing.count({
          where: { organizationId: params.orgId, agentProfileId: params.agentProfileId, createdAt: { gte: windowStart } }
        }),
        normalizedContext.city
          ? this.prisma.orgListing.count({
              where: {
                organizationId: params.orgId,
                agentProfileId: params.agentProfileId,
                city: { equals: normalizedContext.city, mode: 'insensitive' },
                createdAt: { gte: windowStart }
              }
            })
          : Promise.resolve(0),
        normalizedContext.state
          ? this.prisma.orgListing.count({
              where: {
                organizationId: params.orgId,
                agentProfileId: params.agentProfileId,
                state: { equals: normalizedContext.state, mode: 'insensitive' },
                createdAt: { gte: windowStart }
              }
            })
          : Promise.resolve(0),
        normalizedContext.propertyType
          ? this.prisma.orgListing.count({
              where: {
                organizationId: params.orgId,
                agentProfileId: params.agentProfileId,
                propertyType: { equals: normalizedContext.propertyType, mode: 'insensitive' },
                createdAt: { gte: windowStart }
              }
            })
          : Promise.resolve(0),
        this.prisma.orgTransaction.count({
          where: {
            organizationId: params.orgId,
            agentProfileId: params.agentProfileId,
            status: 'CLOSED' as any,
            OR: [
              { closingDate: { gte: windowStart } },
              { closingDate: null, updatedAt: { gte: windowStart } }
            ]
          }
        }),
        this.countClosedInBand(params.orgId, params.agentProfileId, normalizedContext.priceBand, windowStart),
        this.computeOrientationForUser(params.orgId, agent.userId)
      ]);

    const geoFit =
      normalizedContext.city && totalListings > 0
        ? cityListings >= 3
          ? 1
          : Math.min(0.9, 0.6 + (cityListings / Math.max(totalListings, 1)) * 0.6)
        : normalizedContext.state && totalListings > 0
          ? stateListings >= 5
            ? 0.9
            : Math.min(0.85, 0.6 + (stateListings / Math.max(totalListings, 1)) * 0.5)
          : 0.7;

    const priceFit =
      normalizedContext.priceBand && closedTotal > 0
        ? Math.min(1, (closedBand + 1) / (closedTotal + 4))
        : 0.7;

    const propertyFit =
      normalizedContext.propertyType && totalListings > 0
        ? Math.min(1, (typeListings + 1) / (totalListings + 4))
        : 0.7;

    const leadTypeFit =
      normalizedContext.leadType === 'BUYER'
        ? orientation.orientation === 'BUYER_HEAVY'
          ? 1
          : orientation.orientation === 'BALANCED'
            ? 0.85
            : orientation.orientation === 'SELLER_HEAVY'
              ? 0.6
              : 0.75
        : normalizedContext.leadType === 'SELLER'
          ? orientation.orientation === 'SELLER_HEAVY'
            ? 1
            : orientation.orientation === 'BALANCED'
              ? 0.85
              : orientation.orientation === 'BUYER_HEAVY'
                ? 0.6
                : 0.75
          : 0.75;

    const fitScore = Math.max(0, Math.min(1, geoFit * 0.35 + priceFit * 0.25 + propertyFit * 0.15 + leadTypeFit * 0.25));

    const reasons = [
      normalizedContext.city || normalizedContext.state
        ? {
            label: 'Geo familiarity',
            metricSummary: normalizedContext.city
              ? `${cityListings}/${totalListings} listings in ${params.context.city}`
              : `${stateListings}/${totalListings} listings in ${params.context.state}`
          }
        : null,
      normalizedContext.priceBand
        ? {
            label: 'Price band success',
            metricSummary: `${closedBand}/${closedTotal} closings in ${normalizedContext.priceBand}`
          }
        : null,
      normalizedContext.propertyType
        ? {
            label: 'Property type experience',
            metricSummary: `${typeListings}/${totalListings} listings in ${params.context.propertyType}`
          }
        : null,
      normalizedContext.leadType !== 'UNKNOWN'
        ? {
            label: 'Buyer/seller orientation',
            metricSummary: `${orientation.orientation} · ${orientation.buyerSharePercent}% buyer`
          }
        : null
    ].filter(Boolean);

    try {
      await this.prisma.agentPerformanceContextScore.create({
        data: {
          organizationId: params.orgId,
          agentProfileId: params.agentProfileId,
          modelVersion: API_V1_MODEL_VERSION,
          contextKey,
          fitScore,
          reasons: reasons as any,
          computedAt: new Date()
        } as any
      });
    } catch (error) {
      if (!this.isMissingSchemaError(error)) {
        this.logger.warn(
          `Failed to persist context-fit cache for agent ${params.agentProfileId}: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    return {
      agentProfileId: params.agentProfileId,
      modelVersion: API_V1_MODEL_VERSION,
      contextKey,
      fitScore,
      computedAt: new Date().toISOString(),
      reasons
    };
  }

  private toIndicatorDto(snapshot: any, options: AgentPerformanceReadOptions = {}) {
    const topDrivers = Array.isArray(snapshot.topDrivers) ? snapshot.topDrivers : snapshot.topDrivers ? [snapshot.topDrivers] : [];
    const dto: any = {
      modelVersion: snapshot.modelVersion ?? API_V1_MODEL_VERSION,
      overallScore: Number(snapshot.overallScore ?? 0),
      confidenceBand: String(snapshot.confidenceBand ?? 'DEVELOPING'),
      dimensions: {
        historicalEffectiveness: Number(snapshot.historicalEffectivenessScore ?? 0),
        responsivenessReliability: Number(snapshot.responsivenessReliabilityScore ?? 0),
        recencyMomentum: Number(snapshot.recencyMomentumScore ?? 0),
        opportunityFit: Number(snapshot.opportunityFitScore ?? 0),
        riskDragPenalty: Number(snapshot.riskDragPenalty ?? 0),
        capacityLoad: Number(snapshot.capacityLoadScore ?? 0)
      },
      topDrivers: topDrivers ?? [],
      lastUpdated: snapshot.createdAt ? snapshot.createdAt.toISOString() : null
    };

    if (options.includeRawFeatureSummary) {
      dto.rawFeatureSummary = snapshot.rawFeatureSummary ?? null;
    }

    return dto;
  }

  private toIndicatorPoint(snapshot: any) {
    return {
      computedAt: snapshot.createdAt ? snapshot.createdAt.toISOString() : null,
      overallScore: Number(snapshot.overallScore ?? 0),
      confidenceBand: String(snapshot.confidenceBand ?? 'DEVELOPING'),
      dimensions: {
        historicalEffectiveness: Number(snapshot.historicalEffectivenessScore ?? 0),
        responsivenessReliability: Number(snapshot.responsivenessReliabilityScore ?? 0),
        recencyMomentum: Number(snapshot.recencyMomentumScore ?? 0),
        opportunityFit: Number(snapshot.opportunityFitScore ?? 0),
        riskDragPenalty: Number(snapshot.riskDragPenalty ?? 0),
        capacityLoad: Number(snapshot.capacityLoadScore ?? 0)
      },
      risk: snapshot.rawFeatureSummary?.risk ?? null
    };
  }

  private resolvePriceBand(price: number | null): 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY' {
    if (price === null || !Number.isFinite(price)) return 'MOVE_UP';
    if (price < 300_000) return 'STARTER';
    if (price < 600_000) return 'MOVE_UP';
    if (price < 1_000_000) return 'PREMIUM';
    return 'LUXURY';
  }

  private async countClosedInBand(orgId: string, agentProfileId: string, band: string, since: Date) {
    const range = this.priceBandRange(band as any);
    if (!range) return 0;
    return this.prisma.orgTransaction.count({
      where: {
        organizationId: orgId,
        agentProfileId,
        status: 'CLOSED' as any,
        listing: {
          listPrice: {
            gte: range.min,
            ...(range.max === null ? {} : { lt: range.max })
          }
        },
        OR: [{ closingDate: { gte: since } }, { closingDate: null, updatedAt: { gte: since } }]
      }
    });
  }

  private async computeClosedPriceBandCounts(orgId: string, agentProfileIds: string[], band: string) {
    const range = this.priceBandRange(band as any);
    if (!range) return new Map<string, number>();
    const since = subDays(new Date(), 365);
    const groups = await this.prisma.orgTransaction.groupBy({
      by: ['agentProfileId'],
      where: {
        organizationId: orgId,
        agentProfileId: { in: agentProfileIds },
        status: 'CLOSED' as any,
        listing: {
          listPrice: {
            gte: range.min,
            ...(range.max === null ? {} : { lt: range.max })
          }
        },
        OR: [{ closingDate: { gte: since } }, { closingDate: null, updatedAt: { gte: since } }]
      },
      _count: { _all: true }
    });
    const map = new Map<string, number>();
    for (const group of groups) {
      if (!group.agentProfileId) continue;
      map.set(group.agentProfileId, group._count._all);
    }
    return map;
  }

  private priceBandRange(band: 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY') {
    switch (band) {
      case 'STARTER':
        return { min: 0, max: 300_000 };
      case 'MOVE_UP':
        return { min: 300_000, max: 600_000 };
      case 'PREMIUM':
        return { min: 600_000, max: 1_000_000 };
      case 'LUXURY':
        return { min: 1_000_000, max: null };
      default:
        return null;
    }
  }

  private async computeOrientationByUserId(orgId: string, userIds: string[]) {
    if (!userIds.length) return new Map<string, { buyerSharePercent: number; orientation: 'BUYER_HEAVY' | 'SELLER_HEAVY' | 'BALANCED' | 'UNKNOWN'; buyerCount: number; sellerCount: number }>();

    const groups = await (this.prisma as any).person.groupBy({
      by: ['ownerId', 'leadType'],
      where: {
        organizationId: orgId,
        deletedAt: null,
        stageId: { not: null },
        ownerId: { in: userIds }
      },
      _count: { _all: true }
    });

    const counts = new Map<string, { buyer: number; seller: number }>();
    for (const group of groups) {
      const ownerId = group.ownerId ?? null;
      if (!ownerId) continue;
      const entry = counts.get(ownerId) ?? { buyer: 0, seller: 0 };
      if (String(group.leadType).toUpperCase() === 'BUYER') entry.buyer += group._count._all;
      if (String(group.leadType).toUpperCase() === 'SELLER') entry.seller += group._count._all;
      counts.set(ownerId, entry);
    }

    const result = new Map<string, { buyerSharePercent: number; orientation: 'BUYER_HEAVY' | 'SELLER_HEAVY' | 'BALANCED' | 'UNKNOWN'; buyerCount: number; sellerCount: number }>();
    for (const [ownerId, entry] of counts.entries()) {
      const known = entry.buyer + entry.seller;
      const buyerSharePercent = known > 0 ? Math.round((entry.buyer / known) * 100) : 0;
      const orientation =
        known === 0
          ? 'UNKNOWN'
          : buyerSharePercent >= 67
            ? 'BUYER_HEAVY'
            : buyerSharePercent <= 33
              ? 'SELLER_HEAVY'
              : 'BALANCED';
      result.set(ownerId, { buyerSharePercent, orientation, buyerCount: entry.buyer, sellerCount: entry.seller });
    }

    return result;
  }

  private async computeOrientationForUser(orgId: string, userId: string) {
    const map = await this.computeOrientationByUserId(orgId, [userId]);
    return map.get(userId) ?? { buyerSharePercent: 0, orientation: 'UNKNOWN' as const, buyerCount: 0, sellerCount: 0 };
  }

  private async computeBaselineOpportunityFitByAgent(params: {
    orgId: string;
    now: Date;
    since: Date;
    profiles: Array<{ id: string; userId: string }>;
  }) {
    const { orgId, now, since, profiles } = params;
    const agentProfileIds = profiles.map((profile) => profile.id);
    const agentUserIds = profiles.map((profile) => profile.userId);
    const userIdByProfileId = new Map(profiles.map((profile) => [profile.id, profile.userId]));

    const orientationByUserId = await this.computeOrientationByUserId(orgId, agentUserIds);
    let totalBuyer = 0;
    let totalSeller = 0;
    for (const orientation of orientationByUserId.values()) {
      totalBuyer += orientation.buyerCount;
      totalSeller += orientation.sellerCount;
    }
    const typicalLeadType: 'BUYER' | 'SELLER' | 'UNKNOWN' =
      totalBuyer + totalSeller === 0 ? 'UNKNOWN' : totalBuyer >= totalSeller ? 'BUYER' : 'SELLER';

    const [listingByState, listingByPropertyType, closedTotals, closedFlaggedTotals, ...closedByBand] = await Promise.all([
      this.prisma.orgListing.groupBy({
        by: ['agentProfileId', 'state'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          createdAt: { gte: since, lte: now }
        },
        _count: { _all: true }
      }),
      this.prisma.orgListing.groupBy({
        by: ['agentProfileId', 'propertyType'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          propertyType: { not: null },
          createdAt: { gte: since, lte: now }
        },
        _count: { _all: true }
      }),
      this.prisma.orgTransaction.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: 'CLOSED' as any,
          OR: [{ closingDate: { gte: since, lte: now } }, { closingDate: null, updatedAt: { gte: since, lte: now } }]
        },
        _count: { _all: true }
      }),
      this.prisma.orgTransaction.groupBy({
        by: ['agentProfileId'],
        where: {
          organizationId: orgId,
          agentProfileId: { in: agentProfileIds },
          status: 'CLOSED' as any,
          AND: [
            { OR: [{ closingDate: { gte: since, lte: now } }, { closingDate: null, updatedAt: { gte: since, lte: now } }] },
            { OR: [{ isCompliant: false }, { requiresAction: true }] }
          ]
        },
        _count: { _all: true }
      }),
      ...(['STARTER', 'MOVE_UP', 'PREMIUM', 'LUXURY'] as const).map((band) => {
        const range = this.priceBandRange(band);
        if (!range) {
          return Promise.resolve([] as Array<{ agentProfileId: string | null; _count: { _all: number } }>);
        }
        return this.prisma.orgTransaction.groupBy({
          by: ['agentProfileId'],
          where: {
            organizationId: orgId,
            agentProfileId: { in: agentProfileIds },
            status: 'CLOSED' as any,
            listing: {
              listPrice: {
                gte: range.min,
                ...(range.max === null ? {} : { lt: range.max })
              }
            },
            OR: [{ closingDate: { gte: since, lte: now } }, { closingDate: null, updatedAt: { gte: since, lte: now } }]
          },
          _count: { _all: true }
        });
      })
    ]);

    const listingTotalsByAgent = new Map<string, number>();
    const stateTotals = new Map<string, number>();
    for (const group of listingByState) {
      const agentProfileId = group.agentProfileId ?? null;
      if (!agentProfileId) continue;
      const canonicalState = String(group.state ?? '').trim().toUpperCase();
      if (!canonicalState) continue;
      listingTotalsByAgent.set(agentProfileId, (listingTotalsByAgent.get(agentProfileId) ?? 0) + group._count._all);
      stateTotals.set(canonicalState, (stateTotals.get(canonicalState) ?? 0) + group._count._all);
    }
    const topState = Array.from(stateTotals.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const propertyTotals = new Map<string, { count: number; label: string }>();
    for (const group of listingByPropertyType) {
      const type = group.propertyType ?? null;
      if (!type) continue;
      const canonical = String(type).trim().toLowerCase();
      if (!canonical) continue;
      const existing = propertyTotals.get(canonical);
      if (existing) {
        existing.count += group._count._all;
      } else {
        propertyTotals.set(canonical, { count: group._count._all, label: String(type).trim() });
      }
    }
    const topPropertyTypeCanonical =
      Array.from(propertyTotals.entries()).sort((a, b) => b[1].count - a[1].count)[0]?.[0] ?? null;
    const topPropertyTypeLabel = topPropertyTypeCanonical ? propertyTotals.get(topPropertyTypeCanonical)?.label ?? null : null;

    const listingInTopStateByAgent = new Map<string, number>();
    if (topState) {
      for (const group of listingByState) {
        const agentProfileId = group.agentProfileId ?? null;
        if (!agentProfileId) continue;
        const canonicalState = String(group.state ?? '').trim().toUpperCase();
        if (canonicalState !== topState) continue;
        listingInTopStateByAgent.set(agentProfileId, (listingInTopStateByAgent.get(agentProfileId) ?? 0) + group._count._all);
      }
    }

    const listingInTopPropertyTypeByAgent = new Map<string, number>();
    if (topPropertyTypeCanonical) {
      for (const group of listingByPropertyType) {
        const agentProfileId = group.agentProfileId ?? null;
        if (!agentProfileId) continue;
        const type = group.propertyType ?? null;
        if (!type) continue;
        const canonical = String(type).trim().toLowerCase();
        if (canonical !== topPropertyTypeCanonical) continue;
        listingInTopPropertyTypeByAgent.set(
          agentProfileId,
          (listingInTopPropertyTypeByAgent.get(agentProfileId) ?? 0) + group._count._all
        );
      }
    }

    const closedTotalByAgent = new Map<string, number>();
    for (const group of closedTotals) {
      const agentProfileId = group.agentProfileId ?? null;
      if (!agentProfileId) continue;
      closedTotalByAgent.set(agentProfileId, group._count._all);
    }

    const closedFlaggedTotalByAgent = new Map<string, number>();
    for (const group of closedFlaggedTotals) {
      const agentProfileId = group.agentProfileId ?? null;
      if (!agentProfileId) continue;
      closedFlaggedTotalByAgent.set(agentProfileId, group._count._all);
    }

    const bandTotals = new Map<'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY', number>();
    const bandByAgent = new Map<'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY', Map<string, number>>();
    (['STARTER', 'MOVE_UP', 'PREMIUM', 'LUXURY'] as const).forEach((band, idx) => {
      const groups = closedByBand[idx] ?? [];
      const map = new Map<string, number>();
      let total = 0;
      for (const group of groups) {
        const agentProfileId = group.agentProfileId ?? null;
        if (!agentProfileId) continue;
        map.set(agentProfileId, group._count._all);
        total += group._count._all;
      }
      bandTotals.set(band, total);
      bandByAgent.set(band, map);
    });
    const sortedBandTotals = Array.from(bandTotals.entries()).sort((a, b) => b[1] - a[1]);
    const topPriceBand = sortedBandTotals.length > 0 && sortedBandTotals[0]![1] > 0 ? sortedBandTotals[0]![0] : null;

    const closedInTopBandByAgent = new Map<string, number>();
    if (topPriceBand) {
      const map = bandByAgent.get(topPriceBand);
      if (map) {
        for (const [agentProfileId, count] of map.entries()) {
          closedInTopBandByAgent.set(agentProfileId, count);
        }
      }
    }

    const result = new Map<
      string,
      {
        score: number;
        context: {
          typicalLeadType: 'BUYER' | 'SELLER' | 'UNKNOWN';
          topState: string | null;
          topPropertyType: string | null;
          topPriceBand: 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY' | null;
        };
        counts: {
          listingsTotal: number;
          listingsInTopState: number;
          listingsInTopPropertyType: number;
          closedTotal: number;
          closedInTopPriceBand: number;
          closedFlagged: number;
        };
      }
    >();

    for (const agentProfileId of agentProfileIds) {
      const listingsTotal = listingTotalsByAgent.get(agentProfileId) ?? 0;
      const listingsInTopState = listingInTopStateByAgent.get(agentProfileId) ?? 0;
      const listingsInTopPropertyType = listingInTopPropertyTypeByAgent.get(agentProfileId) ?? 0;
      const closedTotal = closedTotalByAgent.get(agentProfileId) ?? 0;
      const closedInTopPriceBand = closedInTopBandByAgent.get(agentProfileId) ?? 0;
      const closedFlagged = closedFlaggedTotalByAgent.get(agentProfileId) ?? 0;
      const orientation = orientationByUserId.get(userIdByProfileId.get(agentProfileId) ?? '')?.orientation ?? 'UNKNOWN';

      const geoFit =
        topState && listingsTotal > 0
          ? listingsInTopState >= 5
            ? 0.9
            : Math.min(0.85, 0.6 + (listingsInTopState / Math.max(listingsTotal, 1)) * 0.5)
          : 0.7;

      const priceFit =
        topPriceBand && closedTotal > 0 ? Math.min(1, (closedInTopPriceBand + 1) / (closedTotal + 4)) : 0.7;

      const propertyFit =
        topPropertyTypeCanonical && listingsTotal > 0
          ? Math.min(1, (listingsInTopPropertyType + 1) / (listingsTotal + 4))
          : 0.7;

      const leadTypeFit =
        typicalLeadType === 'BUYER'
          ? orientation === 'BUYER_HEAVY'
            ? 1
            : orientation === 'BALANCED'
              ? 0.85
              : orientation === 'SELLER_HEAVY'
                ? 0.6
                : 0.75
          : typicalLeadType === 'SELLER'
            ? orientation === 'SELLER_HEAVY'
              ? 1
              : orientation === 'BALANCED'
                ? 0.85
                : orientation === 'BUYER_HEAVY'
                  ? 0.6
                  : 0.75
            : 0.75;

      const score = this.clamp01(geoFit * 0.35 + priceFit * 0.25 + propertyFit * 0.15 + leadTypeFit * 0.25);

      result.set(agentProfileId, {
        score,
        context: {
          typicalLeadType,
          topState,
          topPropertyType: topPropertyTypeLabel,
          topPriceBand
        },
        counts: {
          listingsTotal,
          listingsInTopState,
          listingsInTopPropertyType,
          closedTotal,
          closedInTopPriceBand,
          closedFlagged
        }
      });
    }

    return result;
  }
}
