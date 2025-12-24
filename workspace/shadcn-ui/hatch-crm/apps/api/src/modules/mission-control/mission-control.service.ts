import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ComplianceStatus, DocumentType, LeadType, OfferIntentStatus, PersonStage, Prisma } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import {
  MissionControlAgentRowDto,
  MissionControlComplianceSummaryDto,
  MissionControlOverviewDto
} from './dto/mission-control-overview.dto';
import { PresenceService } from '@/gateways/presence/presence.service';

const DAYS_7_MS = 7 * 24 * 60 * 60 * 1000;
const DAYS_1_MS = 24 * 60 * 60 * 1000;
const CE_EXPIRING_THRESHOLD_DAYS = 30;
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
const LISTING_EXPIRING_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

type MissionControlScope = {
  officeId?: string;
  teamId?: string;
};

type PersonStageGroup = { stage: PersonStage; _count: { _all: number } };

@Injectable()
export class MissionControlService {
  private readonly logger = new Logger(MissionControlService.name);
  private readonly skipMembershipCheck = process.env.DISABLE_PERMISSIONS_GUARD === 'true';
  private readonly cache = new Map<string, { expiresAt: number; value: Promise<any> }>();
  private readonly membershipCache = new Map<string, { expiresAt: number; value: Promise<boolean> }>();

  constructor(private readonly prisma: PrismaService, private readonly presence: PresenceService) {}

  private isConnectionLimitError(error: unknown) {
    const message = (error as Error | undefined)?.message?.toLowerCase() ?? '';
    return message.includes('too many database connections opened') || message.includes('too many clients already');
  }

  private resolveCacheMs(envKey: string, fallbackMs: number) {
    const raw = process.env[envKey];
    if (!raw) return fallbackMs;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallbackMs;
    return Math.max(0, Math.trunc(parsed));
  }

  private get missionControlCacheMs() {
    return this.resolveCacheMs(
      'MISSION_CONTROL_CACHE_MS',
      process.env.NODE_ENV === 'production' ? 0 : 2000
    );
  }

  private get missionControlMembershipCacheMs() {
    return this.resolveCacheMs(
      'MISSION_CONTROL_MEMBERSHIP_CACHE_MS',
      process.env.NODE_ENV === 'production' ? 0 : 60_000
    );
  }

  private scopeKey(scope?: MissionControlScope) {
    if (!scope?.officeId && !scope?.teamId) {
      return 'all';
    }
    return `office:${scope.officeId ?? ''}|team:${scope.teamId ?? ''}`;
  }

  private cachedPromise<T>(
    store: Map<string, { expiresAt: number; value: Promise<T> }>,
    key: string,
    ttlMs: number,
    compute: () => Promise<T>
  ): Promise<T> {
    if (ttlMs <= 0) {
      return compute();
    }
    const now = Date.now();
    const existing = store.get(key);
    if (existing && existing.expiresAt > now) {
      return existing.value;
    }

    const value = Promise.resolve().then(compute).catch((error) => {
      store.delete(key);
      throw error;
    });

    store.set(key, { expiresAt: now + ttlMs, value });
    return value;
  }

  private async runInBatches<T>(tasks: Array<() => Promise<T>>, batchSize = 5): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((task) => task()));
      results.push(...batchResults);
    }
    return results;
  }

  private mapStageGroups(groups: PersonStageGroup[]) {
    const map = new Map<PersonStage, number>();
    for (const group of groups) {
      map.set(group.stage, group._count._all);
    }
    return map;
  }

  private buildAgentProfileWhere(orgId: string, scope?: MissionControlScope): Prisma.AgentProfileWhereInput {
    const where: Prisma.AgentProfileWhereInput = { organizationId: orgId };
    if (scope?.officeId) {
      where.officeId = scope.officeId;
    }
    if (scope?.teamId) {
      where.teamId = scope.teamId;
    }
    return where;
  }

  private buildOrgListingWhere(orgId: string, scope?: MissionControlScope): Prisma.OrgListingWhereInput {
    const where: Prisma.OrgListingWhereInput = { organizationId: orgId };
    if (scope?.officeId) {
      where.officeId = scope.officeId;
    }
    if (scope?.teamId) {
      where.agentProfile = { teamId: scope.teamId };
    }
    return where;
  }

  private buildOrgTransactionWhere(orgId: string, scope?: MissionControlScope): Prisma.OrgTransactionWhereInput {
    const where: Prisma.OrgTransactionWhereInput = { organizationId: orgId };
    if (scope?.officeId) {
      where.officeId = scope.officeId;
    }
    if (scope?.teamId) {
      where.agentProfile = { teamId: scope.teamId };
    }
    return where;
  }

  private buildLeadWhere(orgId: string, scope?: MissionControlScope): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = { organizationId: orgId };
    if (scope?.officeId) {
      where.officeId = scope.officeId;
    }
    if (scope?.teamId) {
      where.agentProfile = { teamId: scope.teamId };
    }
    return where;
  }

  private buildWorkflowTaskWhere(orgId: string, scope?: MissionControlScope): Prisma.AgentWorkflowTaskWhereInput {
    const where: Prisma.AgentWorkflowTaskWhereInput = { organizationId: orgId };
    if (scope?.officeId) {
      where.officeId = scope.officeId;
    }
    if (scope?.teamId) {
      where.agentProfile = { teamId: scope.teamId };
    }
    return where;
  }

  private buildOfferIntentWhere(orgId: string, scope?: MissionControlScope): Prisma.OfferIntentWhereInput {
    const where: Prisma.OfferIntentWhereInput = { organizationId: orgId };
    if (!scope?.officeId && !scope?.teamId) {
      return where;
    }

    const clauses: Prisma.OfferIntentWhereInput[] = [];
    if (scope.officeId) {
      clauses.push({
        OR: [
          { listing: { officeId: scope.officeId } },
          { transaction: { officeId: scope.officeId } }
        ]
      });
    }
    if (scope.teamId) {
      clauses.push({
        OR: [
          { listing: { agentProfile: { teamId: scope.teamId } } },
          { transaction: { agentProfile: { teamId: scope.teamId } } }
        ]
      });
    }
    if (clauses.length) {
      where.AND = clauses;
    }
    return where;
  }

  private buildRentalLeaseWhere(orgId: string, scope?: MissionControlScope): Prisma.RentalLeaseWhereInput {
    const where: Prisma.RentalLeaseWhereInput = { organizationId: orgId };
    if (scope?.officeId) {
      where.officeId = scope.officeId;
    }
    if (scope?.teamId) {
      where.transaction = { agentProfile: { teamId: scope.teamId } };
    }
    return where;
  }

  private buildRentalTaxScheduleWhere(orgId: string, scope?: MissionControlScope): Prisma.RentalTaxScheduleWhereInput {
    if (!scope?.officeId && !scope?.teamId) {
      return { lease: { organizationId: orgId } };
    }
    return { lease: this.buildRentalLeaseWhere(orgId, scope) };
  }

  private buildTransactionAccountingWhere(orgId: string, scope?: MissionControlScope): Prisma.TransactionAccountingRecordWhereInput {
    const where: Prisma.TransactionAccountingRecordWhereInput = { organizationId: orgId };
    if (scope?.officeId || scope?.teamId) {
      where.transaction = this.buildOrgTransactionWhere(orgId, scope);
    }
    return where;
  }

  private buildRentalLeaseAccountingWhere(orgId: string, scope?: MissionControlScope): Prisma.RentalLeaseAccountingRecordWhereInput {
    const where: Prisma.RentalLeaseAccountingRecordWhereInput = { organizationId: orgId };
    if (scope?.officeId || scope?.teamId) {
      where.lease = this.buildRentalLeaseWhere(orgId, scope);
    }
    return where;
  }

  private buildOrgFileWhere(orgId: string, scope?: MissionControlScope): Prisma.OrgFileWhereInput {
    const where: Prisma.OrgFileWhereInput = { orgId };
    if (!scope?.officeId && !scope?.teamId) {
      return where;
    }
    const clauses: Prisma.OrgFileWhereInput[] = [];
    if (scope.officeId) {
      clauses.push(
        { listing: { officeId: scope.officeId } },
        { transaction: { officeId: scope.officeId } },
        { lease: { officeId: scope.officeId } }
      );
    }
    if (scope.teamId) {
      clauses.push(
        { listing: { agentProfile: { teamId: scope.teamId } } },
        { transaction: { agentProfile: { teamId: scope.teamId } } },
        { lease: { transaction: { agentProfile: { teamId: scope.teamId } } } }
      );
    }
    if (clauses.length) {
      where.OR = clauses;
    }
    return where;
  }

  private isMissingSchemaError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' || error.code === 'P2022' || error.code === '42P01')
    );
  }

  private async optionalQuery<T>(query: () => Promise<T>, fallback: T, context: string): Promise<T> {
    try {
      return await query();
    } catch (error) {
      if (this.isMissingSchemaError(error) || this.isConnectionLimitError(error)) {
        this.logger.warn(`mission-control optional query skipped: ${context}`);
        return fallback;
      }
      throw error;
    }
  }

  private async assertBrokerInOrg(userId: string, orgId: string) {
    if (this.skipMembershipCheck) {
      return;
    }

    const cacheKey = `${userId}:${orgId}`;
    const isBroker = await this.cachedPromise(
      this.membershipCache,
      cacheKey,
      this.missionControlMembershipCacheMs,
      async () => {
        const membership = await this.prisma.userOrgMembership.findUnique({
          where: { userId_orgId: { userId, orgId } },
          select: { user: { select: { role: true } } }
        });
        return Boolean(membership && membership.user?.role === 'BROKER');
      }
    );

    if (!isBroker) {
      throw new ForbiddenException('Broker access required');
    }
  }

  async getOrgOverview(orgId: string, brokerUserId: string, scope?: MissionControlScope) {
    await this.assertBrokerInOrg(brokerUserId, orgId);
    const cacheKey = `mission-control:overview:${orgId}:${this.scopeKey(scope)}`;
    return this.cachedPromise(this.cache, cacheKey, this.missionControlCacheMs, async () => {
      const overview = new MissionControlOverviewDto();
      overview.organizationId = orgId;

      const listingExpiringThreshold = new Date(Date.now() + LISTING_EXPIRING_THRESHOLD_MS);
      const aiWindowStart = new Date(Date.now() - DAYS_30_MS);
      const now = new Date();
      const rentalTaxWindowEnd = new Date(now.getTime() + DAYS_30_MS);

      const agentProfileWhere = this.buildAgentProfileWhere(orgId, scope);
      const listingWhere = this.buildOrgListingWhere(orgId, scope);
      const transactionWhere = this.buildOrgTransactionWhere(orgId, scope);
      const workflowTaskWhere = this.buildWorkflowTaskWhere(orgId, scope);
      const offerIntentWhere = this.buildOfferIntentWhere(orgId, scope);
      const rentalLeaseWhere = this.buildRentalLeaseWhere(orgId, scope);
      const rentalTaxScheduleWhere = this.buildRentalTaxScheduleWhere(orgId, scope);
      const transactionAccountingWhere = this.buildTransactionAccountingWhere(orgId, scope);
      const rentalLeaseAccountingWhere = this.buildRentalLeaseAccountingWhere(orgId, scope);
      const orgFileWhere = this.buildOrgFileWhere(orgId, scope);

      const overviewQueryTasks: Array<() => Promise<any>> = [
      () =>
        (this.prisma as any).agentProfile.groupBy({
          by: ['isCompliant', 'requiresAction', 'riskLevel'] as const,
          where: agentProfileWhere,
          _count: { _all: true }
        }),
      () =>
        this.prisma.agentInvite.count({
          where: { organizationId: orgId, status: 'PENDING', expiresAt: { gt: now } }
        }),
      () =>
        (this.prisma as any).orgFile.groupBy({
          by: ['category'] as const,
          where: orgFileWhere,
          _count: { _all: true }
        }),
      () =>
        this.prisma.orgConversation
          .groupBy({
            by: ['type'] as const,
            where: {
              organizationId: orgId,
              type: { in: ['CHANNEL', 'DIRECT'] }
            },
            _count: { _all: true }
          })
          .then((groups) => {
            let channelsCount = 0;
            let directCount = 0;
            for (const group of groups) {
              if (group.type === 'CHANNEL') channelsCount = group._count._all;
              if (group.type === 'DIRECT') directCount = group._count._all;
            }
            return { channelsCount, directCount };
          }),
      () =>
        this.prisma.orgMessage.count({
          where: { organizationId: orgId, createdAt: { gte: new Date(Date.now() - DAYS_7_MS) } }
        }),
      () =>
        this.optionalQuery(
          () =>
            this.prisma.orgEvent.findMany({
              where: { organizationId: orgId },
              orderBy: { createdAt: 'desc' },
              take: 20
            }),
          [],
          'orgEvent.recent'
        ),
      () =>
        this.prisma.agentTrainingModule
          .groupBy({
            by: ['required'] as const,
            where: { organizationId: orgId },
            _count: { _all: true }
          })
          .then((groups) => {
            let totalModules = 0;
            let requiredModules = 0;
            for (const group of groups) {
              totalModules += group._count._all;
              if (group.required) requiredModules += group._count._all;
            }
            return { totalModules, requiredModules };
          }),
      () =>
        this.prisma.agentTrainingProgress
          .groupBy({
            by: ['status'] as const,
            where: { agentProfile: agentProfileWhere },
            _count: { _all: true }
          })
          .then((groups) => {
            let totalAssignments = 0;
            let completedAssignments = 0;
            for (const group of groups) {
              totalAssignments += group._count._all;
              if (group.status === 'COMPLETED') completedAssignments += group._count._all;
            }
            return { totalAssignments, completedAssignments };
          }),
      () =>
        this.prisma.orgListing
          .groupBy({
            by: ['status'] as const,
            where: listingWhere,
            _count: { _all: true }
          })
          .then((groups) => {
            let totalListings = 0;
            let activeListings = 0;
            let pendingApprovalListings = 0;
            for (const group of groups) {
              totalListings += group._count._all;
              if (group.status === 'ACTIVE') activeListings = group._count._all;
              if (group.status === 'PENDING_BROKER_APPROVAL') pendingApprovalListings = group._count._all;
            }
            return { totalListings, activeListings, pendingApprovalListings };
          }),
      () =>
        this.prisma.orgListing.count({
          where: {
            ...listingWhere,
            status: 'ACTIVE',
            expiresAt: { not: null, lte: listingExpiringThreshold }
          }
        }),
      () =>
        this.prisma.orgTransaction
          .groupBy({
            by: ['status'] as const,
            where: transactionWhere,
            _count: { _all: true }
          })
          .then((groups) => {
            let totalTransactions = 0;
            let underContractTransactions = 0;
            for (const group of groups) {
              totalTransactions += group._count._all;
              if (group.status === 'UNDER_CONTRACT') underContractTransactions = group._count._all;
            }
            return { totalTransactions, underContractTransactions };
          }),
      () =>
        this.prisma.orgTransaction.count({
          where: {
            ...transactionWhere,
            closingDate: { not: null, gte: new Date(), lte: listingExpiringThreshold }
          }
        }),
      () =>
        this.prisma.orgTransaction.count({
          where: {
            ...transactionWhere,
            OR: [{ isCompliant: false }, { requiresAction: true }]
          }
        }),
      () =>
        this.optionalQuery(
          () =>
            this.prisma.orgEvent.findMany({
              where: {
                organizationId: orgId,
                type: { in: ['ORG_LISTING_EVALUATED', 'ORG_TRANSACTION_EVALUATED'] },
                createdAt: { gte: aiWindowStart }
              },
              select: { type: true, payload: true }
            }),
          [],
          'orgEvent.aiEvaluations'
        ),
      () =>
        this.prisma.agentProfile
          .groupBy({
            by: ['lifecycleStage'] as const,
            where: agentProfileWhere,
            _count: { _all: true }
          })
          .then((groups) => {
            let agentsInOnboardingCount = 0;
            let agentsInOffboardingCount = 0;
            for (const group of groups) {
              if (group.lifecycleStage === 'ONBOARDING') agentsInOnboardingCount = group._count._all;
              if (group.lifecycleStage === 'OFFBOARDING') agentsInOffboardingCount = group._count._all;
            }
            return { agentsInOnboardingCount, agentsInOffboardingCount };
          }),
      () =>
        this.prisma.agentWorkflowTask
          .groupBy({
            by: ['type', 'status'] as const,
            where: {
              ...workflowTaskWhere,
              type: { in: ['ONBOARDING', 'OFFBOARDING'] },
              status: { in: ['PENDING', 'IN_PROGRESS', 'COMPLETED'] }
            },
            _count: { _all: true }
          })
          .then((groups) => {
            let onboardingTasksOpenCount = 0;
            let onboardingTasksCompletedCount = 0;
            let offboardingTasksOpenCount = 0;

            for (const group of groups) {
              const count = group._count._all;
              if (group.type === 'ONBOARDING') {
                if (group.status === 'COMPLETED') onboardingTasksCompletedCount += count;
                else onboardingTasksOpenCount += count;
              } else if (group.type === 'OFFBOARDING') {
                if (group.status !== 'COMPLETED') offboardingTasksOpenCount += count;
              }
            }

            return { onboardingTasksOpenCount, onboardingTasksCompletedCount, offboardingTasksOpenCount };
          }),
      () =>
        (this.prisma as any).person.groupBy({
          by: ['stage'],
          where: { organizationId: orgId, deletedAt: null, stageId: { not: null } },
          _count: { _all: true }
        }),
      () =>
        this.prisma.person.count({
          where: {
            organizationId: orgId,
            deletedAt: null,
            stageId: { not: null },
            OR: [
              { pipelineStage: { name: { contains: 'appointment', mode: 'insensitive' } } },
              { pipelineStage: { name: { contains: 'showing', mode: 'insensitive' } } }
            ]
          }
        }),
      () =>
        (this.prisma as any).person.groupBy({
          by: ['leadType'] as const,
          where: { organizationId: orgId, deletedAt: null, stageId: { not: null } },
          _count: { _all: true }
        }),
      () =>
        (this.prisma as any).offerIntent.groupBy({
          by: ['status'] as const,
          where: offerIntentWhere,
          _count: { _all: true }
        }),
      () =>
        this.prisma.rentalProperty.count({
          where: {
            organizationId: orgId,
            status: { in: ['UNDER_MGMT', 'ACTIVE'] }
          }
        }),
      () =>
        this.prisma.rentalLease
          .groupBy({
            by: ['tenancyType'] as const,
            where: { ...rentalLeaseWhere, endDate: { gte: now } },
            _count: { _all: true }
          })
          .then((groups) => {
            let activeRentalLeases = 0;
            let seasonalRentalLeases = 0;
            for (const group of groups) {
              activeRentalLeases += group._count._all;
              if (group.tenancyType === 'SEASONAL') seasonalRentalLeases = group._count._all;
            }
            return { activeRentalLeases, seasonalRentalLeases };
          }),
      () =>
        this.prisma.rentalTaxSchedule
          .groupBy({
            by: ['status'] as const,
            where: {
              ...rentalTaxScheduleWhere,
              OR: [
                { status: 'PENDING', dueDate: { gte: now, lte: rentalTaxWindowEnd } },
                { status: 'OVERDUE' }
              ]
            },
            _count: { _all: true }
          })
          .then((groups) => {
            let upcomingTaxDueCount = 0;
            let overdueTaxCount = 0;
            for (const group of groups) {
              if (group.status === 'PENDING') upcomingTaxDueCount = group._count._all;
              if (group.status === 'OVERDUE') overdueTaxCount = group._count._all;
            }
            return { upcomingTaxDueCount, overdueTaxCount };
          }),
      () =>
        this.prisma.transactionAccountingRecord
          .groupBy({
            by: ['syncStatus'] as const,
            where: { ...transactionAccountingWhere, syncStatus: { in: ['SYNCED', 'FAILED'] } },
            _count: { _all: true }
          })
          .then((groups) => {
            let transactionsSyncedCount = 0;
            let transactionsSyncFailedCount = 0;
            for (const group of groups) {
              if (group.syncStatus === 'SYNCED') transactionsSyncedCount = group._count._all;
              if (group.syncStatus === 'FAILED') transactionsSyncFailedCount = group._count._all;
            }
            return { transactionsSyncedCount, transactionsSyncFailedCount };
          }),
      () =>
        this.prisma.rentalLeaseAccountingRecord
          .groupBy({
            by: ['syncStatus'] as const,
            where: { ...rentalLeaseAccountingWhere, syncStatus: { in: ['SYNCED', 'FAILED'] } },
            _count: { _all: true }
          })
          .then((groups) => {
            let rentalLeasesSyncedCount = 0;
            let rentalLeasesSyncFailedCount = 0;
            for (const group of groups) {
              if (group.syncStatus === 'SYNCED') rentalLeasesSyncedCount = group._count._all;
              if (group.syncStatus === 'FAILED') rentalLeasesSyncFailedCount = group._count._all;
            }
            return { rentalLeasesSyncedCount, rentalLeasesSyncFailedCount };
          }),
      // Some older databases may not have complianceStatus on OrgFile; count documents defensively.
      () =>
        this.optionalQuery(
          () =>
            (this.prisma as any).orgFile.groupBy({
              by: ['complianceStatus'],
              where: orgFileWhere,
              _count: { _all: true }
            }),
          [],
          'orgFileCompliance'
        ),
      () => this.optionalQuery(() => this.prisma.mlsFeedConfig.findUnique({ where: { organizationId: orgId } }), null, 'mlsFeedConfig'),
      () =>
        this.optionalQuery(
          () => this.prisma.listingSearchIndex.count({ where: { organizationId: orgId } }),
          0,
          'listingSearchIndex.total'
        ),
      () =>
        this.optionalQuery(
          () =>
            this.prisma.listingSearchIndex.count({
              where: { organizationId: orgId, isActive: true, isRental: false }
            }),
          0,
          'listingSearchIndex.activeForSale'
        ),
      () =>
        this.optionalQuery(
          () =>
            this.prisma.listingSearchIndex.count({
              where: { organizationId: orgId, isActive: true, isRental: true }
            }),
          0,
          'listingSearchIndex.activeRentals'
        ),
      () =>
        this.optionalQuery(
          () =>
            (this.prisma as any).savedSearch.groupBy({
              by: ['frequency', 'alertsEnabled'] as const,
              where: { organizationId: orgId },
              _count: { _all: true }
            }),
          [] as Prisma.SavedSearchGroupByOutputType[],
          'savedSearch.groupBy'
        ),
      () =>
        this.optionalQuery(
          () => this.prisma.savedListing.count({ where: { organizationId: orgId } }),
          0,
          'savedListing.count'
        ),
      () =>
        this.prisma
          .$queryRaw<Array<{ estimatedGci: bigint }>>(
            Prisma.sql`
              SELECT COALESCE(SUM(l."listPrice"), 0)::bigint AS "estimatedGci"
              FROM "OrgTransaction" t
              LEFT JOIN "OrgListing" l ON l."id" = t."listingId"
              LEFT JOIN "AgentProfile" ap ON ap."id" = t."agentProfileId"
              WHERE t."organizationId" = ${orgId}
                AND t."status" = 'CLOSED'
                ${scope?.officeId ? Prisma.sql`AND t."officeId" = ${scope.officeId}` : Prisma.empty}
                ${scope?.teamId ? Prisma.sql`AND ap."teamId" = ${scope.teamId}` : Prisma.empty}
            `
          )
          .then((rows) => rows[0]?.estimatedGci ?? 0n),
      () =>
        this.prisma.rentalLease.aggregate({
          where: {
            ...rentalLeaseWhere,
            endDate: { gte: now },
            rentAmount: { not: null }
          },
          _sum: { rentAmount: true }
        }),
      () =>
        this.optionalQuery(
          () => this.prisma.aiPendingAction.count({ where: { organizationId: orgId, status: 'pending' } }),
          0,
          'aiPendingAction.count'
        )
    ];

    let overviewResults: any[];
    try {
      overviewResults = await this.runInBatches(overviewQueryTasks, 6);
    } catch (error) {
      if (this.isConnectionLimitError(error)) {
        this.logger.warn('mission-control overview skipped due to connection limit');
        return overview;
      }
      throw error;
    }

    const [
      agentsSummary,
      pendingInvites,
      vaultSummary,
      conversationCounts,
      messages7d,
      events,
      trainingModuleCounts,
      trainingAssignmentCounts,
      listingStatusCounts,
      expiringListings,
      transactionStatusCounts,
      closingsNext30Days,
      nonCompliantTransactions,
      aiEvaluationEvents,
      lifecycleStageCounts,
      workflowTaskCounts,
      leadStageGroups,
      appointmentsSetCount,
      leadTypeGroups,
      loiStatusGroups,
      rentalPropertiesManaged,
      rentalLeaseCounts,
      taxScheduleCounts,
      transactionAccountingCounts,
      rentalLeaseAccountingCounts,
      docStatusGroups,
      mlsConfig,
      totalIndexedListings,
      activeForSaleListings,
      activeRentalListings,
      savedSearchAggregates,
      savedListingCount,
      estimatedGciSum,
      activeLeaseRentAggregate,
      pendingAiActions
    ] = overviewResults;

    const { channelsCount = 0, directCount = 0 } = conversationCounts ?? {};
    const { totalModules = 0, requiredModules = 0 } = trainingModuleCounts ?? {};
    const { totalAssignments = 0, completedAssignments = 0 } = trainingAssignmentCounts ?? {};
    const { totalListings = 0, activeListings = 0, pendingApprovalListings = 0 } =
      listingStatusCounts ?? {};
    const { totalTransactions = 0, underContractTransactions = 0 } = transactionStatusCounts ?? {};
    const { agentsInOnboardingCount = 0, agentsInOffboardingCount = 0 } = lifecycleStageCounts ?? {};
    const {
      onboardingTasksOpenCount = 0,
      onboardingTasksCompletedCount = 0,
      offboardingTasksOpenCount = 0
    } = workflowTaskCounts ?? {};
    const { activeRentalLeases = 0, seasonalRentalLeases = 0 } = rentalLeaseCounts ?? {};
    const { upcomingTaxDueCount = 0, overdueTaxCount = 0 } = taxScheduleCounts ?? {};
    const { transactionsSyncedCount = 0, transactionsSyncFailedCount = 0 } =
      transactionAccountingCounts ?? {};
    const { rentalLeasesSyncedCount = 0, rentalLeasesSyncFailedCount = 0 } =
      rentalLeaseAccountingCounts ?? {};

    const totalAgents = Array.isArray(agentsSummary)
      ? agentsSummary.reduce((sum: number, group: any) => sum + (group?._count?._all ?? 0), 0)
      : 0;

    const transactionsForDocs = await this.prisma.orgTransaction.findMany({
      where: transactionWhere,
      select: {
        id: true,
        closingDate: true,
        status: true,
        documents: {
          select: {
            orgFile: {
              select: {
                documentType: true,
                complianceStatus: true
              }
            }
          }
        }
      },
      take: 500
    });

    overview.totalAgents = totalAgents;
    overview.activeAgents = Math.max(
      0,
      totalAgents - agentsInOnboardingCount - agentsInOffboardingCount
    );
    overview.pendingInvites = pendingInvites;
    overview.comms.channels = channelsCount;
    overview.comms.directConversations = directCount;
    overview.comms.messagesLast7Days = messages7d;
    overview.training = {
      totalModules,
      requiredModules,
      totalAssignments,
      completedAssignments
    };
    overview.listings = {
      total: totalListings,
      active: activeListings,
      pendingApproval: pendingApprovalListings,
      expiringSoon: expiringListings
    };

    const requiredTransactionDocs: DocumentType[] = [
      DocumentType.PURCHASE_CONTRACT,
      DocumentType.ADDENDUM,
      DocumentType.CLOSING_DOC,
      DocumentType.PROOF_OF_FUNDS
    ];
    const nonPassingStatuses: ComplianceStatus[] = [
      ComplianceStatus.FAILED,
      ComplianceStatus.NEEDS_REVIEW,
      ComplianceStatus.UNKNOWN,
      ComplianceStatus.PENDING
    ];
    let transactionsReady = 0;
    let transactionsMissing = 0;
    let upcomingClosingsMissingDocs = 0;
    for (const txn of transactionsForDocs) {
      const docs = txn.documents.map((doc) => doc.orgFile).filter(Boolean);
      const missingRequired = requiredTransactionDocs.filter(
        (required) => !docs.some((doc) => doc.documentType === required)
      );
      const failingDocs = docs.filter((doc) => nonPassingStatuses.includes(doc.complianceStatus));
      const hasIssues = missingRequired.length > 0 || failingDocs.length > 0;
      if (hasIssues) {
        transactionsMissing += 1;
        if (txn.closingDate && txn.closingDate >= now && txn.closingDate <= listingExpiringThreshold) {
          upcomingClosingsMissingDocs += 1;
        }
      } else {
        transactionsReady += 1;
      }
    }
    const transactionsDocsReadyPercent = transactionsForDocs.length
      ? Math.round((transactionsReady / transactionsForDocs.length) * 100)
      : 0;

    overview.transactions = {
      total: totalTransactions,
      underContract: underContractTransactions,
      closingsNext30Days,
      nonCompliant: nonCompliantTransactions,
      docsReadyPercent: transactionsDocsReadyPercent,
      missingDocs: transactionsMissing,
      upcomingClosingsMissingDocs
    };
    overview.onboarding = {
      agentsInOnboarding: agentsInOnboardingCount,
      totalOnboardingTasksOpen: onboardingTasksOpenCount,
      totalOnboardingTasksCompleted: onboardingTasksCompletedCount
    };
    overview.offboarding = {
      agentsInOffboarding: agentsInOffboardingCount,
      totalOffboardingTasksOpen: offboardingTasksOpenCount
    };
    const leadStageMap = this.mapStageGroups(leadStageGroups);
    const totalLeadsCount = Array.from(leadStageMap.values()).reduce((sum, value) => sum + value, 0);
    overview.leadStats = {
      totalLeads: totalLeadsCount,
      newLeads: leadStageMap.get(PersonStage.NEW) ?? 0,
      contactedLeads: leadStageMap.get(PersonStage.NURTURE) ?? 0,
      qualifiedLeads: leadStageMap.get(PersonStage.ACTIVE) ?? 0,
      unqualifiedLeads: leadStageMap.get(PersonStage.LOST) ?? 0,
      appointmentsSet: typeof appointmentsSetCount === 'number' ? appointmentsSetCount : 0
    };

    const leadTypeMap = new Map<string, number>();
    for (const group of leadTypeGroups) {
      leadTypeMap.set(group.leadType, group._count._all);
    }
    overview.leadTypeBreakdown = {
      BUYER: leadTypeMap.get(LeadType.BUYER) ?? 0,
      SELLER: leadTypeMap.get(LeadType.SELLER) ?? 0,
      UNKNOWN: leadTypeMap.get(LeadType.UNKNOWN) ?? 0
    };

	    const [activeDripCampaigns, leadOptimization] = await Promise.all([
	      this.optionalQuery(
	        () => (this.prisma as any).dripCampaign.count({ where: { organizationId: orgId, enabled: true } }),
	        0,
	        'dripCampaign.count'
	      ),
	      this.optionalQuery(
	        async () => {
	          const [scoredToday, highPriority, atRisk] = await Promise.all([
	            (this.prisma as any).leadScoreHistory.count({
	              where: { organizationId: orgId, createdAt: { gte: new Date(Date.now() - DAYS_1_MS) } }
	            }),
	            (this.prisma as any).lead.count({
	              where: { organizationId: orgId, aiScore: { gte: 75 } }
	            }),
	            (this.prisma as any).lead.count({
	              where: { organizationId: orgId, aiScore: { lte: 35 } }
	            })
	          ]);
	          return { scoredToday, highPriority, atRisk };
	        },
	        { scoredToday: 0, highPriority: 0, atRisk: 0 },
	        'leadOptimization'
	      )
	    ]);
	    overview.marketingAutomation = {
	      activeCampaigns: activeDripCampaigns,
	      leadsInDrips: 0,
	      emailsQueuedToday: 0,
	      stepsExecutedToday: 0
    };
    overview.leadOptimization = leadOptimization;
    const loiCounts: Record<
      | 'DRAFT'
      | 'SENT'
      | 'RECEIVED'
      | 'COUNTERED'
      | 'ACCEPTED'
      | 'REJECTED',
      number
    > = {
      DRAFT: 0,
      SENT: 0,
      RECEIVED: 0,
      COUNTERED: 0,
      ACCEPTED: 0,
      REJECTED: 0
    };

    const normalizeOfferIntentStatus = (raw: string) => {
      const normalized = String(raw ?? '').toUpperCase().trim();
      switch (normalized) {
        case OfferIntentStatus.DRAFT:
        case OfferIntentStatus.SENT:
        case OfferIntentStatus.RECEIVED:
        case OfferIntentStatus.COUNTERED:
        case OfferIntentStatus.ACCEPTED:
        case OfferIntentStatus.REJECTED:
          return normalized as keyof typeof loiCounts;
        // Legacy mappings
        case OfferIntentStatus.SUBMITTED:
          return 'SENT' as const;
        case OfferIntentStatus.UNDER_REVIEW:
          return 'RECEIVED' as const;
        case OfferIntentStatus.DECLINED:
        case OfferIntentStatus.WITHDRAWN:
          return 'REJECTED' as const;
        default:
          return null;
      }
    };

    for (const group of loiStatusGroups) {
      const mapped = normalizeOfferIntentStatus(group.status);
      if (!mapped) continue;
      loiCounts[mapped] += group._count._all;
    }

    const totalOfferIntents = Object.values(loiCounts).reduce((sum, value) => sum + value, 0);
    overview.loiStats = {
      totalOfferIntents,
      draftOfferIntents: loiCounts.DRAFT,
      sentOfferIntents: loiCounts.SENT,
      receivedOfferIntents: loiCounts.RECEIVED,
      counteredOfferIntents: loiCounts.COUNTERED,
      acceptedOfferIntents: loiCounts.ACCEPTED,
      rejectedOfferIntents: loiCounts.REJECTED
    };
    overview.rentalStats = {
      propertiesUnderManagement: rentalPropertiesManaged,
      activeLeases: activeRentalLeases,
      seasonalLeases: seasonalRentalLeases,
      upcomingTaxDueCount,
      overdueTaxCount
    };
    const estimatedGci = Number(estimatedGciSum ?? 0n);
    const estimatedPmIncome = Number(activeLeaseRentAggregate._sum.rentAmount ?? 0);
    overview.financialStats = {
      transactionsSyncedCount,
      transactionsSyncFailedCount,
      rentalLeasesSyncedCount,
      rentalLeasesSyncFailedCount,
      estimatedGci,
      estimatedPmIncome
    };

    let pendingDocs = 0;
    let failedDocs = 0;
    let passedDocs = 0;
    for (const group of docStatusGroups) {
      const count = group._count._all;
      switch (group.complianceStatus as ComplianceStatus) {
        case ComplianceStatus.PASSED:
          passedDocs += count;
          break;
        case ComplianceStatus.FAILED:
          failedDocs += count;
          break;
        case ComplianceStatus.NEEDS_REVIEW:
        case ComplianceStatus.UNKNOWN:
        case ComplianceStatus.PENDING:
        default:
          pendingDocs += count;
          break;
      }
    }
    overview.documentCompliance = {
      pending: pendingDocs,
      failed: failedDocs,
      passed: passedDocs
    };

    const presenceSummary = await this.presence.activeSummary(orgId);
    overview.liveActivity = presenceSummary as any;
    overview.mlsStats = {
      totalIndexed: totalIndexedListings,
      activeForSale: activeForSaleListings,
      activeRentals: activeRentalListings,
      lastFullSyncAt: mlsConfig?.lastFullSyncAt?.toISOString() ?? null,
      lastIncrementalSyncAt: mlsConfig?.lastIncrementalSyncAt?.toISOString() ?? null,
      provider: mlsConfig?.provider ?? null,
      boardName: mlsConfig?.boardName ?? null
    };
    let totalSavedSearches = 0;
    let alertsEnabledCount = 0;
    let dailyCount = 0;
    let weeklyCount = 0;
    for (const row of savedSearchAggregates) {
      const count = row._count._all;
      totalSavedSearches += count;
      if (row.alertsEnabled) alertsEnabledCount += count;
      if (row.frequency === 'DAILY') dailyCount += count;
      if (row.frequency === 'WEEKLY') weeklyCount += count;
    }
    overview.savedSearchStats = {
      totalSavedSearches,
      alertsEnabledCount,
      dailyCount,
      weeklyCount
    };
    overview.favoritesStats = {
      totalSavedListings: savedListingCount
    };
    const aiCompliance = {
      evaluationsLast30Days: aiEvaluationEvents.length,
      highRiskListings: 0,
      highRiskTransactions: 0
    };
    for (const event of aiEvaluationEvents) {
      const riskLevel = (event.payload as any)?.riskLevel;
      if (riskLevel === 'HIGH') {
        if (event.type === 'ORG_LISTING_EVALUATED') {
          aiCompliance.highRiskListings += 1;
        } else if (event.type === 'ORG_TRANSACTION_EVALUATED') {
          aiCompliance.highRiskTransactions += 1;
        }
      }
    }
    overview.aiCompliance = aiCompliance;
    overview.aiApprovals.pending = pendingAiActions;

    const byCategory: Record<string, number> = {};
    let totalFiles = 0;
    for (const group of vaultSummary) {
      byCategory[group.category] = group._count._all;
      totalFiles += group._count._all;
    }
    overview.vaultFileCounts = { total: totalFiles, byCategory };

    let nonCompliant = 0;
    let highRisk = 0;
    for (const summary of agentsSummary) {
      const count = summary._count._all;
      if (!summary.isCompliant) {
        nonCompliant += count;
      }
      if (summary.riskLevel === 'HIGH') {
        highRisk += count;
      }
    }
    overview.nonCompliantAgents = nonCompliant;
    overview.highRiskAgents = highRisk;

    overview.recentEvents = events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt.toISOString()
    }));

      return overview;
    });
  }

  async getAgentsDashboard(orgId: string, brokerUserId: string, scope?: MissionControlScope) {
    await this.assertBrokerInOrg(brokerUserId, orgId);
    const cacheKey = `mission-control:agents:${orgId}:${this.scopeKey(scope)}`;
    return this.cachedPromise(this.cache, cacheKey, this.missionControlCacheMs, async () => {
      const aiWindowStart = new Date(Date.now() - DAYS_30_MS);
      const agentProfileWhere = this.buildAgentProfileWhere(orgId, scope);
      const listingWhere = this.buildOrgListingWhere(orgId, scope);
      const transactionWhere = this.buildOrgTransactionWhere(orgId, scope);
      const workflowTaskWhere = this.buildWorkflowTaskWhere(orgId, scope);

    const profiles = await this.prisma.agentProfile.findMany({
      where: agentProfileWhere,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        riskLevel: true,
        riskScore: true,
        isCompliant: true,
        requiresAction: true,
        ceHoursRequired: true,
        ceHoursCompleted: true,
        ceCycleEndAt: true,
        lifecycleStage: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        memberships: { select: { type: true, name: true, status: true } }
      }
    });
    const agentProfileIds = profiles.map((profile) => profile.id);
    const agentUserIds = profiles.map((profile) => profile.userId);
    if (agentProfileIds.length === 0) {
      return [];
    }

    const [
      listingCounts,
      activeListingCounts,
      transactionCounts,
      nonCompliantTransactions,
      performanceLatest,
      complianceEvents,
      workflowTaskGroups,
      pipelineLeadStageGroups,
      trainingProgressGroups,
      requiredTrainingProgressGroups,
      offerIntentStatsRows,
      closedTransactionSalesRows,
      clientStageGroups,
      leadTypeGroupsByOwner
    ] = await Promise.all([
      this.prisma.orgListing.groupBy({
        by: ['agentProfileId'],
        where: { ...listingWhere, agentProfileId: { in: agentProfileIds } },
        _count: { _all: true }
      }),
      this.prisma.orgListing.groupBy({
        by: ['agentProfileId'],
        where: {
          ...listingWhere,
          agentProfileId: { in: agentProfileIds },
          status: 'ACTIVE'
        },
        _count: { _all: true }
      }),
      this.prisma.orgTransaction.groupBy({
        by: ['agentProfileId'],
        where: { ...transactionWhere, agentProfileId: { in: agentProfileIds } },
        _count: { _all: true }
      }),
      this.prisma.orgTransaction.groupBy({
        by: ['agentProfileId'],
        where: {
          ...transactionWhere,
          agentProfileId: { in: agentProfileIds },
          OR: [{ isCompliant: false }, { requiresAction: true }]
        },
        _count: { _all: true }
      }),
      this.optionalQuery(
        () =>
          this.prisma.agentPerformanceLatest.findMany({
            where: {
              organizationId: orgId,
              modelVersion: 'API_v1' as any,
              agentProfileId: { in: agentProfileIds }
            } as any,
            include: {
              snapshot: {
                select: {
                  modelVersion: true,
                  overallScore: true,
                  confidenceBand: true,
                  riskDragPenalty: true,
                  topDrivers: true,
                  createdAt: true
                }
              }
            }
          }),
        [],
        'agent-performance-latest'
      ),
      this.optionalQuery(
        () =>
          this.prisma.orgEvent.findMany({
            where: {
              organizationId: orgId,
              type: { in: ['ORG_LISTING_EVALUATED', 'ORG_TRANSACTION_EVALUATED'] },
              createdAt: { gte: aiWindowStart }
            },
            select: { payload: true, createdAt: true }
          }),
        [],
        'orgEvent.aiEvaluations.agentsDashboard'
      ),
      this.prisma.agentWorkflowTask.groupBy({
        by: ['agentProfileId', 'type', 'status'],
        where: workflowTaskWhere,
        _count: { _all: true }
      }),
      (this.prisma as any).person.groupBy({
        by: ['ownerId', 'stage'],
        where: {
          organizationId: orgId,
          deletedAt: null,
          stageId: { not: null },
          ownerId: { in: agentUserIds }
        },
        _count: { _all: true }
      }),
      this.prisma.agentTrainingProgress.groupBy({
        by: ['agentProfileId', 'status'],
        where: { agentProfileId: { in: agentProfileIds } },
        _count: { _all: true }
      }),
      this.prisma.agentTrainingProgress.groupBy({
        by: ['agentProfileId', 'status'],
        where: { agentProfileId: { in: agentProfileIds }, module: { required: true } },
        _count: { _all: true }
      }),
      this.prisma.$queryRaw<Array<{ agentProfileId: string; total: number; accepted: number }>>(
        Prisma.sql`
          SELECT
            l."agentProfileId" AS "agentProfileId",
            COUNT(*)::int AS "total",
            COUNT(*) FILTER (WHERE oi."status"::text = ${OfferIntentStatus.ACCEPTED})::int AS "accepted"
          FROM "OfferIntent" oi
          JOIN "OrgListing" l ON l."id" = oi."listingId"
          LEFT JOIN "OrgTransaction" t ON t."id" = oi."transactionId"
          LEFT JOIN "AgentProfile" listing_ap ON listing_ap."id" = l."agentProfileId"
          LEFT JOIN "AgentProfile" txn_ap ON txn_ap."id" = t."agentProfileId"
          WHERE oi."organizationId" = ${orgId}
            AND l."agentProfileId" IN (${Prisma.join(agentProfileIds)})
            ${
              scope?.officeId
                ? Prisma.sql`AND (l."officeId" = ${scope.officeId} OR t."officeId" = ${scope.officeId})`
                : Prisma.empty
            }
            ${
              scope?.teamId
                ? Prisma.sql`AND (listing_ap."teamId" = ${scope.teamId} OR txn_ap."teamId" = ${scope.teamId})`
                : Prisma.empty
            }
          GROUP BY l."agentProfileId"
        `
      ),
      this.prisma.$queryRaw<Array<{ agentProfileId: string; closedCount: number; closedVolume: bigint }>>(
        Prisma.sql`
          SELECT
            t."agentProfileId" AS "agentProfileId",
            COUNT(*)::int AS "closedCount",
            COALESCE(SUM(l."listPrice"), 0)::bigint AS "closedVolume"
          FROM "OrgTransaction" t
          LEFT JOIN "OrgListing" l ON l."id" = t."listingId"
          JOIN "AgentProfile" ap ON ap."id" = t."agentProfileId"
          WHERE t."organizationId" = ${orgId}
            AND t."status" = 'CLOSED'
            AND t."agentProfileId" IN (${Prisma.join(agentProfileIds)})
            ${scope?.officeId ? Prisma.sql`AND t."officeId" = ${scope.officeId}` : Prisma.empty}
            ${scope?.teamId ? Prisma.sql`AND ap."teamId" = ${scope.teamId}` : Prisma.empty}
          GROUP BY t."agentProfileId"
        `
      ),
      this.prisma.person.groupBy({
        by: ['ownerId', 'stage'],
        where: {
          organizationId: orgId,
          deletedAt: null,
          ownerId: { in: agentUserIds }
        },
        _count: { _all: true }
      }),
      this.prisma.person.groupBy({
        by: ['ownerId', 'leadType'],
        where: {
          organizationId: orgId,
          deletedAt: null,
          ownerId: { in: agentUserIds },
          stageId: { not: null }
        },
        _count: { _all: true }
      })
    ]);

    const toMap = (groups: Array<{ agentProfileId: string | null; _count: { _all: number } }>) => {
      const map = new Map<string, number>();
      for (const group of groups) {
        if (group.agentProfileId) {
          map.set(group.agentProfileId, group._count._all);
        }
      }
      return map;
    };

    const listingCountMap = toMap(listingCounts);
    const activeListingCountMap = toMap(activeListingCounts);
    const transactionCountMap = toMap(transactionCounts);
    const nonCompliantTransactionMap = toMap(nonCompliantTransactions);

    const performanceMap = new Map<
      string,
      {
        modelVersion: string;
        overallScore: number;
        confidenceBand: string;
        riskDragPenalty?: number;
        topDrivers: Array<{
          label: string;
          direction: 'positive' | 'negative';
          metricSummary: string;
          deepLink?: string;
        }>;
        lastUpdated: string;
      }
    >();
    for (const entry of performanceLatest as any[]) {
      const agentProfileId = entry.agentProfileId ?? null;
      const snapshot = entry.snapshot ?? null;
      if (!agentProfileId || !snapshot) continue;
      const topDrivers = Array.isArray(snapshot.topDrivers) ? snapshot.topDrivers.slice(0, 2) : [];
      performanceMap.set(agentProfileId, {
        modelVersion: snapshot.modelVersion ?? 'API_v1',
        overallScore: Number(snapshot.overallScore ?? 0),
        confidenceBand: String(snapshot.confidenceBand ?? 'DEVELOPING'),
        riskDragPenalty: snapshot.riskDragPenalty === null || snapshot.riskDragPenalty === undefined ? undefined : Number(snapshot.riskDragPenalty),
        topDrivers,
        lastUpdated: snapshot.createdAt ? snapshot.createdAt.toISOString() : new Date().toISOString()
      });
    }

    const complianceMap = new Map<
      string,
      { openIssues: number; lastEvaluation?: Date }
    >();
    for (const event of complianceEvents) {
      const payload = event.payload as any;
      const agentProfileId: string | undefined = payload?.agentProfileId ?? undefined;
      if (!agentProfileId) continue;
      const entry = complianceMap.get(agentProfileId) ?? { openIssues: 0 };
      const issuesCount = typeof payload?.issuesCount === 'number' ? payload.issuesCount : 1;
      const riskLevel = payload?.riskLevel;
      if (riskLevel && riskLevel !== 'LOW') {
        entry.openIssues += Math.max(1, issuesCount);
      }
      if (!entry.lastEvaluation || entry.lastEvaluation < event.createdAt) {
        entry.lastEvaluation = event.createdAt;
      }
      complianceMap.set(agentProfileId, entry);
    }

    const workflowStats = new Map<
      string,
      { onboardingOpen: number; onboardingCompleted: number; offboardingOpen: number }
    >();
    for (const group of workflowTaskGroups) {
      if (!group.agentProfileId) continue;
      const entry =
        workflowStats.get(group.agentProfileId) ?? { onboardingOpen: 0, onboardingCompleted: 0, offboardingOpen: 0 };
      if (group.type === 'ONBOARDING') {
        if (group.status === 'COMPLETED') {
          entry.onboardingCompleted += group._count._all;
        } else if (['PENDING', 'IN_PROGRESS'].includes(group.status)) {
          entry.onboardingOpen += group._count._all;
        }
      } else if (group.type === 'OFFBOARDING' && ['PENDING', 'IN_PROGRESS'].includes(group.status)) {
        entry.offboardingOpen += group._count._all;
      }
      workflowStats.set(group.agentProfileId, entry);
    }

    const leadAssignmentStats = new Map<
      string,
      { total: number; new: number; qualified: number }
    >();
    for (const group of pipelineLeadStageGroups) {
      const ownerId = group.ownerId ?? null;
      if (!ownerId) continue;
      const entry = leadAssignmentStats.get(ownerId) ?? { total: 0, new: 0, qualified: 0 };
      entry.total += group._count._all;
      if (group.stage === PersonStage.NEW) {
        entry.new += group._count._all;
      }
      if (group.stage === PersonStage.ACTIVE) {
        entry.qualified += group._count._all;
      }
      leadAssignmentStats.set(ownerId, entry);
    }

    const trainingStats = new Map<string, { assigned: number; completed: number }>();
    for (const group of trainingProgressGroups) {
      const agentProfileId = group.agentProfileId;
      const entry = trainingStats.get(agentProfileId) ?? { assigned: 0, completed: 0 };
      entry.assigned += group._count._all;
      if (group.status === 'COMPLETED') {
        entry.completed += group._count._all;
      }
      trainingStats.set(agentProfileId, entry);
    }

    const requiredTrainingStats = new Map<string, { assigned: number; completed: number }>();
    for (const group of requiredTrainingProgressGroups) {
      const agentProfileId = group.agentProfileId;
      const entry = requiredTrainingStats.get(agentProfileId) ?? { assigned: 0, completed: 0 };
      entry.assigned += group._count._all;
      if (group.status === 'COMPLETED') {
        entry.completed += group._count._all;
      }
      requiredTrainingStats.set(agentProfileId, entry);
    }

    const offerIntentStats = new Map<string, { total: number; accepted: number }>();
    for (const row of offerIntentStatsRows) {
      offerIntentStats.set(row.agentProfileId, { total: row.total, accepted: row.accepted });
    }

    const salesStats = new Map<string, { closedCount: number; closedVolume: number }>();
    for (const row of closedTransactionSalesRows) {
      salesStats.set(row.agentProfileId, {
        closedCount: row.closedCount,
        closedVolume: Number(row.closedVolume ?? 0n)
      });
    }

    const clientStats = new Map<string, { current: number; past: number }>();
    for (const group of clientStageGroups) {
      const ownerId = group.ownerId ?? null;
      if (!ownerId) continue;
      const entry = clientStats.get(ownerId) ?? { current: 0, past: 0 };
      switch (group.stage) {
        case PersonStage.ACTIVE:
        case PersonStage.UNDER_CONTRACT:
          entry.current += group._count._all;
          break;
        case PersonStage.CLOSED:
          entry.past += group._count._all;
          break;
        default:
          break;
      }
      clientStats.set(ownerId, entry);
    }

    const leadTypeStats = new Map<string, { buyer: number; seller: number; unknown: number }>();
    for (const group of leadTypeGroupsByOwner) {
      const ownerId = group.ownerId ?? null;
      if (!ownerId) continue;
      const entry = leadTypeStats.get(ownerId) ?? { buyer: 0, seller: 0, unknown: 0 };
      switch (group.leadType) {
        case LeadType.BUYER:
          entry.buyer += group._count._all;
          break;
        case LeadType.SELLER:
          entry.seller += group._count._all;
          break;
        default:
          entry.unknown += group._count._all;
          break;
      }
      leadTypeStats.set(ownerId, entry);
    }

    const rows: MissionControlAgentRowDto[] = profiles.map((profile) => {
      const complianceMeta = complianceMap.get(profile.id);
      const workflow = workflowStats.get(profile.id) ?? {
        onboardingOpen: 0,
        onboardingCompleted: 0,
        offboardingOpen: 0
      };
      const leadStats = leadAssignmentStats.get(profile.userId) ?? {
        total: 0,
        new: 0,
        qualified: 0
      };
      const training = trainingStats.get(profile.id) ?? { assigned: 0, completed: 0 };
      const requiredTraining = requiredTrainingStats.get(profile.id) ?? { assigned: 0, completed: 0 };
      const loiStats = offerIntentStats.get(profile.id) ?? { total: 0, accepted: 0 };
      const sales = salesStats.get(profile.id) ?? { closedCount: 0, closedVolume: 0 };
      const clients = clientStats.get(profile.userId) ?? { current: 0, past: 0 };
      const typeCounts = leadTypeStats.get(profile.userId) ?? { buyer: 0, seller: 0, unknown: 0 };
      const knownTotal = typeCounts.buyer + typeCounts.seller;
      const buyerSharePercent = knownTotal > 0 ? Math.round((typeCounts.buyer / knownTotal) * 100) : 0;
      const buyerSellerOrientation: MissionControlAgentRowDto['buyerSellerOrientation'] =
        knownTotal === 0
          ? 'UNKNOWN'
          : buyerSharePercent >= 67
            ? 'BUYER_HEAVY'
            : buyerSharePercent <= 33
              ? 'SELLER_HEAVY'
              : 'BALANCED';
      return {
        agentProfileId: profile.id,
        userId: profile.userId,
        name: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
        email: profile.user.email,
        riskLevel: profile.riskLevel,
        riskScore: profile.riskScore,
        isCompliant: profile.isCompliant,
        requiresAction: profile.requiresAction,
        buyerLeadCount: typeCounts.buyer,
        sellerLeadCount: typeCounts.seller,
        unknownLeadCount: typeCounts.unknown,
        buyerSharePercent,
        buyerSellerOrientation,
        ceHoursRequired: profile.ceHoursRequired,
        ceHoursCompleted: profile.ceHoursCompleted,
        ceCycleEndAt: profile.ceCycleEndAt?.toISOString() ?? null,
        memberships: profile.memberships.map((m) => ({ type: m.type, name: m.name, status: m.status })),
        trainingAssigned: training.assigned,
        trainingCompleted: training.completed,
        requiredTrainingAssigned: requiredTraining.assigned,
        requiredTrainingCompleted: requiredTraining.completed,
        listingCount: listingCountMap.get(profile.id) ?? 0,
        activeListingCount: activeListingCountMap.get(profile.id) ?? 0,
        transactionCount: transactionCountMap.get(profile.id) ?? 0,
        nonCompliantTransactionCount: nonCompliantTransactionMap.get(profile.id) ?? 0,
        closedTransactionCount: sales.closedCount,
        closedTransactionVolume: sales.closedVolume,
        currentClientCount: clients.current,
        pastClientCount: clients.past,
        openComplianceIssues: complianceMeta?.openIssues ?? 0,
        lastComplianceEvaluationAt: complianceMeta?.lastEvaluation?.toISOString(),
        lifecycleStage: profile.lifecycleStage,
        onboardingTasksOpenCount: workflow.onboardingOpen,
        onboardingTasksCompletedCount: workflow.onboardingCompleted,
        offboardingTasksOpenCount: workflow.offboardingOpen,
        assignedLeadsCount: leadStats.total,
        newLeadsCount: leadStats.new,
        qualifiedLeadsCount: leadStats.qualified,
        offerIntentCount: loiStats.total,
        acceptedOfferIntentCount: loiStats.accepted,
        performance: performanceMap.get(profile.id) ?? null
      };
    });

      return rows;
    });
  }

  async getComplianceSummary(orgId: string, brokerUserId: string, scope?: MissionControlScope) {
    await this.assertBrokerInOrg(brokerUserId, orgId);
    const summary = new MissionControlComplianceSummaryDto();
    summary.organizationId = orgId;
    const agentProfileWhere = this.buildAgentProfileWhere(orgId, scope);

    const [profiles, expiredMemberships] = await Promise.all([
      this.prisma.agentProfile.findMany({ where: agentProfileWhere }),
      this.prisma.agentMembership.count({ where: { agentProfile: agentProfileWhere, status: 'EXPIRED' } })
    ]);

    summary.totalAgents = profiles.length;
    const now = new Date();
    const ceThreshold = new Date(now.getTime() + CE_EXPIRING_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    for (const profile of profiles) {
      if (profile.isCompliant) summary.compliantAgents += 1;
      else summary.nonCompliantAgents += 1;
      if (profile.riskLevel === 'HIGH') summary.highRiskAgents += 1;
      if (profile.ceCycleEndAt && profile.ceCycleEndAt <= ceThreshold) {
        summary.ceExpiringSoon += 1;
      }
    }
    summary.expiredMemberships = expiredMemberships;
    return summary;
  }

  async getActivityFeed(orgId: string, brokerUserId: string, _scope?: MissionControlScope) {
    await this.assertBrokerInOrg(brokerUserId, orgId);
    const events = await this.optionalQuery(
      () =>
        this.prisma.orgEvent.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 50
        }),
      [],
      'orgEvent.activity'
    );
    return events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      payload: event.payload as any,
      createdAt: event.createdAt.toISOString()
    }));
  }
}
