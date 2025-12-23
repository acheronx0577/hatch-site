import { Injectable } from '@nestjs/common';
import {
  AiCopilotActionStatus,
  AnalyticsGranularity,
  LeadStatus,
  OfferIntentStatus,
  OrgTransactionStatus
} from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDateToUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  async computeDailyAnalyticsForOrg(orgId: string, dateInput?: Date) {
    const referenceDate = dateInput ?? new Date();
    const day = this.normalizeDateToUtcDay(referenceDate);
    const dayEnd = new Date(day.getTime() + DAY_MS);

    const [
      leadsNewCount,
      leadStatusCounts,
      offerCounts,
      closedTransactions,
      activeLeasesCount,
      pmIncomeAggregate,
      savedListingsCount,
      savedSearchesCount,
      copilotCounts,
      agentProfiles
    ] = await Promise.all([
      this.prisma.lead.count({
        where: {
          organizationId: orgId,
          createdAt: { gte: day, lt: dayEnd }
        }
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: {
          organizationId: orgId,
          createdAt: { lte: dayEnd }
        },
        _count: { _all: true }
      }),
      this.prisma.offerIntent.groupBy({
        by: ['status'],
        where: {
          organizationId: orgId,
          createdAt: { lte: dayEnd }
        },
        _count: { _all: true }
      }),
      this.prisma.orgTransaction.findMany({
        where: {
          organizationId: orgId,
          status: OrgTransactionStatus.CLOSED,
          closingDate: { gte: day, lt: dayEnd }
        },
        include: { listing: true }
      }),
      this.prisma.rentalLease.count({
        where: {
          organizationId: orgId,
          startDate: { lte: dayEnd },
          endDate: { gte: day }
        }
      }),
      this.prisma.rentalLease.aggregate({
        where: {
          organizationId: orgId,
          startDate: { lte: dayEnd },
          endDate: { gte: day }
        },
        _sum: { rentAmount: true }
      }),
      this.prisma.savedListing.count({
        where: {
          organizationId: orgId,
          createdAt: { lte: dayEnd }
        }
      }),
      this.prisma.savedSearch.count({
        where: {
          organizationId: orgId,
          createdAt: { lte: dayEnd }
        }
      }),
      this.prisma.aiCopilotActionRecommendation.groupBy({
        by: ['status'],
        where: {
          organizationId: orgId,
          createdAt: { lte: dayEnd }
        },
        _count: { _all: true }
      }),
      this.prisma.agentProfile.findMany({
        where: { organizationId: orgId },
        select: { id: true }
      })
    ]);

    const leadsContactedCount = leadStatusCounts.find((row) => row.status === LeadStatus.CONTACTED)?._count._all ?? 0;
    const leadsQualifiedCount = leadStatusCounts.find((row) => row.status === LeadStatus.QUALIFIED)?._count._all ?? 0;
    const leadsUnderContractCount = leadStatusCounts.find((row) => row.status === LeadStatus.UNDER_CONTRACT)?._count._all ?? 0;
    const leadsClosedCount = leadStatusCounts.find((row) => row.status === LeadStatus.CLOSED)?._count._all ?? 0;

    const offerIntentsSubmittedCount = offerCounts
      .filter((row) =>
        row.status === OfferIntentStatus.SENT ||
        row.status === OfferIntentStatus.RECEIVED ||
        row.status === OfferIntentStatus.COUNTERED ||
        row.status === OfferIntentStatus.SUBMITTED ||
        row.status === OfferIntentStatus.UNDER_REVIEW
      )
      .reduce((sum, row) => sum + row._count._all, 0);
    const offerIntentsAcceptedCount = offerCounts.find((row) => row.status === OfferIntentStatus.ACCEPTED)?._count._all ?? 0;
    const offerIntentsDeclinedCount =
      offerCounts
        .filter((row) =>
          row.status === OfferIntentStatus.REJECTED ||
          row.status === OfferIntentStatus.DECLINED ||
          row.status === OfferIntentStatus.WITHDRAWN
        )
        .reduce((sum, row) => sum + row._count._all, 0);

    const transactionsClosedCount = closedTransactions.length;
    const transactionsClosedVolume = closedTransactions.reduce((sum, tx) => sum + (tx.listing?.listPrice ?? 0), 0);

    const dayDiffs: number[] = [];
    closedTransactions.forEach((tx) => {
      if (tx.closingDate && tx.listing?.createdAt) {
        const diff = (tx.closingDate.getTime() - tx.listing.createdAt.getTime()) / DAY_MS;
        if (Number.isFinite(diff)) {
          dayDiffs.push(diff);
        }
      }
    });
    const averageDaysOnMarket = dayDiffs.length > 0 ? Math.round(dayDiffs.reduce((sum, diff) => sum + diff, 0) / dayDiffs.length) : 0;

    const pmIncomeEstimate = pmIncomeAggregate._sum.rentAmount ?? 0;

    const copilotActionsSuggestedCount = copilotCounts
      .filter((row) => row.status === AiCopilotActionStatus.SUGGESTED || row.status === AiCopilotActionStatus.ACCEPTED)
      .reduce((sum, row) => sum + row._count._all, 0);
    const copilotActionsCompletedCount = copilotCounts.find((row) => row.status === AiCopilotActionStatus.COMPLETED)?._count._all ?? 0;

    const orgDaily = await this.prisma.orgDailyAnalytics.upsert({
      where: {
        organizationId_date_granularity: {
          organizationId: orgId,
          date: day,
          granularity: AnalyticsGranularity.DAILY
        }
      },
      update: {
        leadsNewCount,
        leadsContactedCount,
        leadsQualifiedCount,
        leadsUnderContractCount,
        leadsClosedCount,
        offerIntentsSubmittedCount,
        offerIntentsAcceptedCount,
        offerIntentsDeclinedCount,
        transactionsClosedCount,
        transactionsClosedVolume,
        averageDaysOnMarket,
        activeLeasesCount,
        pmIncomeEstimate,
        savedListingsCount,
        savedSearchesCount,
        copilotActionsSuggestedCount,
        copilotActionsCompletedCount
      },
      create: {
        organizationId: orgId,
        date: day,
        granularity: AnalyticsGranularity.DAILY,
        leadsNewCount,
        leadsContactedCount,
        leadsQualifiedCount,
        leadsUnderContractCount,
        leadsClosedCount,
        offerIntentsSubmittedCount,
        offerIntentsAcceptedCount,
        offerIntentsDeclinedCount,
        transactionsClosedCount,
        transactionsClosedVolume,
        averageDaysOnMarket,
        activeLeasesCount,
        pmIncomeEstimate,
        savedListingsCount,
        savedSearchesCount,
        copilotActionsSuggestedCount,
        copilotActionsCompletedCount
      }
    });

    for (const agent of agentProfiles) {
      const [
        agentLeadsCreatedCount,
        agentLeadStatuses,
        agentClosedTransactions,
        agentOfferIntents,
        agentActiveLeasesCount,
        agentCopilotCounts
      ] = await Promise.all([
        this.prisma.lead.count({
          where: {
            organizationId: orgId,
            agentProfileId: agent.id,
            createdAt: { gte: day, lt: dayEnd }
          }
        }),
        this.prisma.lead.groupBy({
          by: ['status'],
          where: {
            organizationId: orgId,
            agentProfileId: agent.id,
            createdAt: { lte: dayEnd }
          },
          _count: { _all: true }
        }),
        this.prisma.orgTransaction.findMany({
          where: {
            organizationId: orgId,
            agentProfileId: agent.id,
            status: OrgTransactionStatus.CLOSED,
            closingDate: { gte: day, lt: dayEnd }
          },
          include: { listing: true }
        }),
        this.prisma.offerIntent.findMany({
          where: {
            organizationId: orgId,
            createdAt: { lte: dayEnd },
            OR: [
              { lead: { agentProfileId: agent.id } },
              { listing: { agentProfileId: agent.id } }
            ]
          },
          select: { status: true }
        }),
        this.prisma.rentalLease.count({
          where: {
            organizationId: orgId,
            startDate: { lte: dayEnd },
            endDate: { gte: day },
            transaction: { agentProfileId: agent.id }
          }
        }),
        this.prisma.aiCopilotActionRecommendation.groupBy({
          by: ['status'],
          where: {
            organizationId: orgId,
            agentProfileId: agent.id,
            createdAt: { lte: dayEnd }
          },
          _count: { _all: true }
        })
      ]);

      const leadsContacted = agentLeadStatuses.find((row) => row.status === LeadStatus.CONTACTED)?._count._all ?? 0;
      const leadsQualified = agentLeadStatuses.find((row) => row.status === LeadStatus.QUALIFIED)?._count._all ?? 0;
      const leadsUnderContract = agentLeadStatuses.find((row) => row.status === LeadStatus.UNDER_CONTRACT)?._count._all ?? 0;
      const leadsClosed = agentLeadStatuses.find((row) => row.status === LeadStatus.CLOSED)?._count._all ?? 0;

      const offerSubmitted = agentOfferIntents.filter(
        (intent) =>
          intent.status === OfferIntentStatus.SENT ||
          intent.status === OfferIntentStatus.RECEIVED ||
          intent.status === OfferIntentStatus.COUNTERED ||
          intent.status === OfferIntentStatus.SUBMITTED ||
          intent.status === OfferIntentStatus.UNDER_REVIEW
      ).length;
      const offerAccepted = agentOfferIntents.filter((intent) => intent.status === OfferIntentStatus.ACCEPTED).length;

      const agentTxVolume = agentClosedTransactions.reduce(
        (sum, tx) => sum + (tx.listing?.listPrice ?? 0),
        0
      );

      const agentCopilotSuggested = agentCopilotCounts
        .filter((row) => row.status === AiCopilotActionStatus.SUGGESTED || row.status === AiCopilotActionStatus.ACCEPTED)
        .reduce((sum, row) => sum + row._count._all, 0);
      const agentCopilotCompleted = agentCopilotCounts.find((row) => row.status === AiCopilotActionStatus.COMPLETED)?._count._all ?? 0;

      await this.prisma.agentDailyAnalytics.upsert({
        where: {
          organizationId_agentProfileId_date_granularity: {
            organizationId: orgId,
            agentProfileId: agent.id,
            date: day,
            granularity: AnalyticsGranularity.DAILY
          }
        },
        update: {
          leadsNewCount: agentLeadsCreatedCount,
          leadsContactedCount: leadsContacted,
          leadsQualifiedCount: leadsQualified,
          leadsUnderContractCount: leadsUnderContract,
          leadsClosedCount: leadsClosed,
          offerIntentsSubmittedCount: offerSubmitted,
          offerIntentsAcceptedCount: offerAccepted,
          transactionsClosedCount: agentClosedTransactions.length,
          transactionsClosedVolume: agentTxVolume,
          activeLeasesCount: agentActiveLeasesCount,
          copilotActionsSuggestedCount: agentCopilotSuggested,
          copilotActionsCompletedCount: agentCopilotCompleted
        },
        create: {
          organizationId: orgId,
          agentProfileId: agent.id,
          date: day,
          granularity: AnalyticsGranularity.DAILY,
          leadsNewCount: agentLeadsCreatedCount,
          leadsContactedCount: leadsContacted,
          leadsQualifiedCount: leadsQualified,
          leadsUnderContractCount: leadsUnderContract,
          leadsClosedCount: leadsClosed,
          offerIntentsSubmittedCount: offerSubmitted,
          offerIntentsAcceptedCount: offerAccepted,
          transactionsClosedCount: agentClosedTransactions.length,
          transactionsClosedVolume: agentTxVolume,
          activeLeasesCount: agentActiveLeasesCount,
          copilotActionsSuggestedCount: agentCopilotSuggested,
          copilotActionsCompletedCount: agentCopilotCompleted
        }
      });
    }

    return orgDaily;
  }

  async getOrgDailySeries(orgId: string, start: Date, end: Date) {
    return this.prisma.orgDailyAnalytics.findMany({
      where: {
        organizationId: orgId,
        granularity: AnalyticsGranularity.DAILY,
        date: { gte: start, lte: end }
      },
      orderBy: { date: 'asc' }
    });
  }

  async getAgentDailySeries(orgId: string, agentProfileId: string, start: Date, end: Date) {
    return this.prisma.agentDailyAnalytics.findMany({
      where: {
        organizationId: orgId,
        agentProfileId,
        granularity: AnalyticsGranularity.DAILY,
        date: { gte: start, lte: end }
      },
      orderBy: { date: 'asc' }
    });
  }
}
