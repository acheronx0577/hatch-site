import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ComplianceStatus, DocumentType, LeadStatus, OfferIntentStatus, PersonStage, Prisma } from '@hatch/db';

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

@Injectable()
export class MissionControlService {
  private readonly logger = new Logger(MissionControlService.name);
  private readonly skipMembershipCheck = process.env.DISABLE_PERMISSIONS_GUARD === 'true';

  constructor(private readonly prisma: PrismaService, private readonly presence: PresenceService) {}

  private isConnectionLimitError(error: unknown) {
    const message = (error as Error | undefined)?.message?.toLowerCase() ?? '';
    return message.includes('too many database connections opened') || message.includes('too many clients already');
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
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { user: { select: { role: true } } }
    });
    if (!membership || membership.user?.role !== 'BROKER') {
      throw new ForbiddenException('Broker access required');
    }
  }

  async getOrgOverview(orgId: string, brokerUserId: string, scope?: MissionControlScope) {
    await this.assertBrokerInOrg(brokerUserId, orgId);
    const overview = new MissionControlOverviewDto();
    overview.organizationId = orgId;

    const listingExpiringThreshold = new Date(Date.now() + LISTING_EXPIRING_THRESHOLD_MS);
    const aiWindowStart = new Date(Date.now() - DAYS_30_MS);
    const now = new Date();
    const rentalTaxWindowEnd = new Date(now.getTime() + DAYS_30_MS);

    const agentProfileWhere = this.buildAgentProfileWhere(orgId, scope);
    const listingWhere = this.buildOrgListingWhere(orgId, scope);
    const transactionWhere = this.buildOrgTransactionWhere(orgId, scope);
    const leadWhere = this.buildLeadWhere(orgId, scope);
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
      () => this.prisma.agentInvite.count({ where: { organizationId: orgId, status: 'PENDING' } }),
      () =>
        (this.prisma as any).orgFile.groupBy({
          by: ['category'] as const,
          where: orgFileWhere,
          _count: { _all: true }
        }),
      () => this.prisma.orgConversation.count({ where: { organizationId: orgId, type: 'CHANNEL' } }),
      () => this.prisma.orgConversation.count({ where: { organizationId: orgId, type: 'DIRECT' } }),
      () => this.prisma.orgMessage.count({ where: { organizationId: orgId, createdAt: { gte: new Date(Date.now() - DAYS_7_MS) } } }),
      () =>
        this.prisma.orgEvent.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 20
        }),
      () => this.prisma.agentTrainingModule.count({ where: { organizationId: orgId } }),
      () => this.prisma.agentTrainingModule.count({ where: { organizationId: orgId, required: true } }),
      () => this.prisma.agentTrainingProgress.count({ where: { agentProfile: agentProfileWhere } }),
      () =>
        this.prisma.agentTrainingProgress.count({
          where: { agentProfile: agentProfileWhere, status: 'COMPLETED' }
        }),
      () => this.prisma.orgListing.count({ where: listingWhere }),
      () => this.prisma.orgListing.count({ where: { ...listingWhere, status: 'ACTIVE' } }),
      () => this.prisma.orgListing.count({ where: { ...listingWhere, status: 'PENDING_BROKER_APPROVAL' } }),
      () =>
        this.prisma.orgListing.count({
          where: {
            ...listingWhere,
            status: 'ACTIVE',
            expiresAt: { not: null, lte: listingExpiringThreshold }
          }
        }),
      () => this.prisma.orgTransaction.count({ where: transactionWhere }),
      () =>
        this.prisma.orgTransaction.count({
          where: { ...transactionWhere, status: 'UNDER_CONTRACT' }
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
        this.prisma.orgEvent.findMany({
          where: {
            organizationId: orgId,
            type: { in: ['ORG_LISTING_EVALUATED', 'ORG_TRANSACTION_EVALUATED'] },
            createdAt: { gte: aiWindowStart }
          },
          select: { type: true, payload: true }
        }),
      () => this.prisma.agentProfile.count({ where: { ...agentProfileWhere, lifecycleStage: 'ONBOARDING' } }),
      () => this.prisma.agentProfile.count({ where: { ...agentProfileWhere, lifecycleStage: 'OFFBOARDING' } }),
      () =>
        this.prisma.agentWorkflowTask.count({
          where: {
            ...workflowTaskWhere,
            type: 'ONBOARDING',
            status: { in: ['PENDING', 'IN_PROGRESS'] }
          }
        }),
      () =>
        this.prisma.agentWorkflowTask.count({
          where: {
            ...workflowTaskWhere,
            type: 'ONBOARDING',
            status: 'COMPLETED'
          }
        }),
      () =>
        this.prisma.agentWorkflowTask.count({
          where: {
            ...workflowTaskWhere,
            type: 'OFFBOARDING',
            status: { in: ['PENDING', 'IN_PROGRESS'] }
          }
        }),
      () =>
        (this.prisma as any).lead.groupBy({
          by: ['status'] as const,
          where: leadWhere,
          _count: { _all: true }
        }),
      () =>
        (this.prisma as any).offerIntent.groupBy({
          by: ['status'] as const,
          where: offerIntentWhere,
          _count: { _all: true }
        }),
      () =>
        this.prisma.offerIntent.findMany({
          where: offerIntentWhere,
          select: {
            status: true,
            listing: { select: { agentProfileId: true } }
          }
        }),
      () =>
        this.prisma.rentalProperty.count({
          where: {
            organizationId: orgId,
            status: { in: ['UNDER_MGMT', 'ACTIVE'] }
          }
        }),
      () =>
        this.prisma.rentalLease.count({
          where: {
            ...rentalLeaseWhere,
            endDate: { gte: now }
          }
        }),
      () =>
        this.prisma.rentalLease.count({
          where: {
            ...rentalLeaseWhere,
            tenancyType: 'SEASONAL',
            endDate: { gte: now }
          }
        }),
      () =>
        this.prisma.rentalTaxSchedule.count({
          where: {
            ...rentalTaxScheduleWhere,
            status: 'PENDING',
            dueDate: { gte: now, lte: rentalTaxWindowEnd }
          }
        }),
      () =>
        this.prisma.rentalTaxSchedule.count({
          where: {
            ...rentalTaxScheduleWhere,
            status: 'OVERDUE'
          }
        }),
      () =>
        this.prisma.transactionAccountingRecord.count({
          where: { ...transactionAccountingWhere, syncStatus: 'SYNCED' }
        }),
      () =>
        this.prisma.transactionAccountingRecord.count({
          where: { ...transactionAccountingWhere, syncStatus: 'FAILED' }
        }),
      () =>
        this.prisma.rentalLeaseAccountingRecord.count({
          where: { ...rentalLeaseAccountingWhere, syncStatus: 'SYNCED' }
        }),
      () =>
        this.prisma.rentalLeaseAccountingRecord.count({
          where: { ...rentalLeaseAccountingWhere, syncStatus: 'FAILED' }
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
        this.prisma.orgTransaction.findMany({
          where: { ...transactionWhere, status: 'CLOSED' },
          select: {
            id: true,
            listing: {
              select: { listPrice: true }
            }
          }
        }),
      () =>
        this.prisma.rentalLease.aggregate({
          where: {
            ...rentalLeaseWhere,
            endDate: { gte: now },
            rentAmount: { not: null }
          },
          _sum: { rentAmount: true }
        })
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
      channelsCount,
      directCount,
      messages7d,
      events,
      totalModules,
      requiredModules,
      totalAssignments,
      completedAssignments,
      totalListings,
      activeListings,
      pendingApprovalListings,
      expiringListings,
      totalTransactions,
      underContractTransactions,
      closingsNext30Days,
      nonCompliantTransactions,
      aiEvaluationEvents,
      agentsInOnboardingCount,
      agentsInOffboardingCount,
      onboardingTasksOpenCount,
      onboardingTasksCompletedCount,
      offboardingTasksOpenCount,
      leadStatusGroups,
      loiStatusGroups,
      offerIntentAssignments,
      rentalPropertiesManaged,
      activeRentalLeases,
      seasonalRentalLeases,
      upcomingTaxDueCount,
      overdueTaxCount,
      transactionsSyncedCount,
      transactionsSyncFailedCount,
      rentalLeasesSyncedCount,
      rentalLeasesSyncFailedCount,
      docStatusGroups,
      mlsConfig,
      totalIndexedListings,
      activeForSaleListings,
      activeRentalListings,
      savedSearchAggregates,
      savedListingCount,
      closedTransactionsForGci,
      activeLeaseRentAggregate
    ] = overviewResults;

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

    const totalAgents = await this.prisma.agentProfile.count({ where: agentProfileWhere });
    overview.totalAgents = totalAgents;
    overview.activeAgents = Math.max(0, totalAgents - agentsInOnboardingCount - agentsInOffboardingCount);
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
    const leadStatusMap = new Map<string, number>();
    for (const group of leadStatusGroups) {
      leadStatusMap.set(group.status, group._count._all);
    }
    const getLeadStatusCount = (status: LeadStatus) => leadStatusMap.get(status) ?? 0;
    const totalLeadsCount = Array.from(leadStatusMap.values()).reduce((sum, value) => sum + value, 0);
    overview.leadStats = {
      totalLeads: totalLeadsCount,
      newLeads: getLeadStatusCount(LeadStatus.NEW),
      contactedLeads: getLeadStatusCount(LeadStatus.CONTACTED),
      qualifiedLeads: getLeadStatusCount(LeadStatus.QUALIFIED),
      unqualifiedLeads: getLeadStatusCount(LeadStatus.UNQUALIFIED),
      appointmentsSet: getLeadStatusCount(LeadStatus.APPOINTMENT_SET)
    };

    const activeDripCampaigns = await this.optionalQuery(
      () => (this.prisma as any).dripCampaign.count({ where: { organizationId: orgId, enabled: true } }),
      0,
      'dripCampaign.count'
    );
    const leadOptimization = await this.optionalQuery(
      async () => {
        const scoredToday = await (this.prisma as any).leadScoreHistory.count({
          where: { organizationId: orgId, createdAt: { gte: new Date(Date.now() - DAYS_1_MS) } }
        })
        const highPriority = await (this.prisma as any).lead.count({
          where: { organizationId: orgId, aiScore: { gte: 75 } }
        })
        const atRisk = await (this.prisma as any).lead.count({
          where: { organizationId: orgId, aiScore: { lte: 35 } }
        })
        return { scoredToday, highPriority, atRisk }
      },
      { scoredToday: 0, highPriority: 0, atRisk: 0 },
      'leadOptimization'
    )
    overview.marketingAutomation = {
      activeCampaigns: activeDripCampaigns,
      leadsInDrips: 0,
      emailsQueuedToday: 0,
      stepsExecutedToday: 0
    };
    overview.leadOptimization = leadOptimization;
    const loiStatusMap = new Map<string, number>();
    for (const group of loiStatusGroups) {
      loiStatusMap.set(group.status, group._count._all);
    }
    const getLoiStatusCount = (status: OfferIntentStatus) => loiStatusMap.get(status) ?? 0;
    const totalOfferIntents = Array.from(loiStatusMap.values()).reduce((sum, value) => sum + value, 0);
    overview.loiStats = {
      totalOfferIntents,
      submittedOfferIntents: getLoiStatusCount(OfferIntentStatus.SUBMITTED),
      underReviewOfferIntents: getLoiStatusCount(OfferIntentStatus.UNDER_REVIEW),
      acceptedOfferIntents: getLoiStatusCount(OfferIntentStatus.ACCEPTED),
      declinedOfferIntents: getLoiStatusCount(OfferIntentStatus.DECLINED)
    };
    overview.rentalStats = {
      propertiesUnderManagement: rentalPropertiesManaged,
      activeLeases: activeRentalLeases,
      seasonalLeases: seasonalRentalLeases,
      upcomingTaxDueCount,
      overdueTaxCount
    };
    const estimatedGci = closedTransactionsForGci.reduce((sum, txn) => {
      return sum + (txn.listing?.listPrice ?? 0);
    }, 0);
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
  }

  async getAgentsDashboard(orgId: string, brokerUserId: string, scope?: MissionControlScope) {
    await this.assertBrokerInOrg(brokerUserId, orgId);
    const aiWindowStart = new Date(Date.now() - DAYS_30_MS);
    const agentProfileWhere = this.buildAgentProfileWhere(orgId, scope);
    const listingWhere = this.buildOrgListingWhere(orgId, scope);
    const transactionWhere = this.buildOrgTransactionWhere(orgId, scope);
    const workflowTaskWhere = this.buildWorkflowTaskWhere(orgId, scope);
    const leadWhere = this.buildLeadWhere(orgId, scope);
    const offerIntentWhere = this.buildOfferIntentWhere(orgId, scope);

    const profiles = await this.prisma.agentProfile.findMany({
      where: agentProfileWhere,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        memberships: true,
        trainingProgress: { include: { module: true } }
      }
    });
    const agentProfileIds = profiles.map((profile) => profile.id);
    const agentUserIds = profiles.map((profile) => profile.userId);

    const [
      listingCounts,
      activeListingCounts,
      transactionCounts,
      nonCompliantTransactions,
      complianceEvents,
      workflowTaskGroups,
      leadAssignmentGroups,
      offerIntentAssignments,
      closedTransactionSales,
      clientStageGroups
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
      this.prisma.orgEvent.findMany({
        where: {
          organizationId: orgId,
          type: { in: ['ORG_LISTING_EVALUATED', 'ORG_TRANSACTION_EVALUATED'] },
          createdAt: { gte: aiWindowStart }
        },
        select: { payload: true, createdAt: true }
      }),
      this.prisma.agentWorkflowTask.groupBy({
        by: ['agentProfileId', 'type', 'status'],
        where: workflowTaskWhere,
        _count: { _all: true }
      }),
      this.prisma.lead.groupBy({
        by: ['agentProfileId', 'status'],
        where: { ...leadWhere, agentProfileId: { in: agentProfileIds } },
        _count: { _all: true }
      }),
      this.prisma.offerIntent.findMany({
        where: offerIntentWhere,
        select: {
          status: true,
          listing: { select: { agentProfileId: true } }
        }
      }),
      this.prisma.orgTransaction.findMany({
        where: { ...transactionWhere, status: 'CLOSED', agentProfileId: { in: agentProfileIds } },
        select: {
          agentProfileId: true,
          listing: { select: { listPrice: true } }
        }
      }),
      this.prisma.person.groupBy({
        by: ['ownerId', 'stage'],
        where: {
          organizationId: orgId,
          deletedAt: null,
          ownerId: { in: agentUserIds }
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
    for (const group of leadAssignmentGroups) {
      if (!group.agentProfileId) continue;
      const entry = leadAssignmentStats.get(group.agentProfileId) ?? { total: 0, new: 0, qualified: 0 };
      entry.total += group._count._all;
      if (group.status === LeadStatus.NEW) {
        entry.new += group._count._all;
      }
      if (group.status === LeadStatus.QUALIFIED) {
        entry.qualified += group._count._all;
      }
      leadAssignmentStats.set(group.agentProfileId, entry);
    }

    const offerIntentStats = new Map<
      string,
      { total: number; accepted: number }
    >();
    for (const intent of offerIntentAssignments) {
      const agentProfileId = intent.listing?.agentProfileId ?? null;
      if (!agentProfileId) continue;
      const entry = offerIntentStats.get(agentProfileId) ?? { total: 0, accepted: 0 };
      entry.total += 1;
      if (intent.status === OfferIntentStatus.ACCEPTED) {
        entry.accepted += 1;
      }
      offerIntentStats.set(agentProfileId, entry);
    }

    const salesStats = new Map<
      string,
      { closedCount: number; closedVolume: number }
    >();
    for (const txn of closedTransactionSales) {
      const agentProfileId = txn.agentProfileId ?? null;
      if (!agentProfileId) continue;
      const entry = salesStats.get(agentProfileId) ?? { closedCount: 0, closedVolume: 0 };
      entry.closedCount += 1;
      entry.closedVolume += txn.listing?.listPrice ?? 0;
      salesStats.set(agentProfileId, entry);
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

    const rows: MissionControlAgentRowDto[] = profiles.map((profile) => {
      const complianceMeta = complianceMap.get(profile.id);
      const workflow = workflowStats.get(profile.id) ?? {
        onboardingOpen: 0,
        onboardingCompleted: 0,
        offboardingOpen: 0
      };
      const leadStats = leadAssignmentStats.get(profile.id) ?? {
        total: 0,
        new: 0,
        qualified: 0
      };
      const loiStats = offerIntentStats.get(profile.id) ?? { total: 0, accepted: 0 };
      const sales = salesStats.get(profile.id) ?? { closedCount: 0, closedVolume: 0 };
      const clients = clientStats.get(profile.userId) ?? { current: 0, past: 0 };
      return {
        agentProfileId: profile.id,
        userId: profile.userId,
        name: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
        email: profile.user.email,
        riskLevel: profile.riskLevel,
        riskScore: profile.riskScore,
        isCompliant: profile.isCompliant,
        requiresAction: profile.requiresAction,
        ceHoursRequired: profile.ceHoursRequired,
        ceHoursCompleted: profile.ceHoursCompleted,
        memberships: profile.memberships.map((m) => ({ type: m.type, name: m.name, status: m.status })),
        trainingAssigned: profile.trainingProgress.length,
        trainingCompleted: profile.trainingProgress.filter((p) => p.status === 'COMPLETED').length,
        requiredTrainingAssigned: profile.trainingProgress.filter((p) => p.module.required).length,
        requiredTrainingCompleted: profile.trainingProgress.filter(
          (p) => p.module.required && p.status === 'COMPLETED'
        ).length,
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
        acceptedOfferIntentCount: loiStats.accepted
      };
    });

    return rows;
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
    const events = await this.prisma.orgEvent.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    return events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt.toISOString()
    }));
  }
}
