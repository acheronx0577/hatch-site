import { Injectable } from '@nestjs/common';
import { LedgerEntryType, OrgTransactionStatus } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';

type DateRange = { start: Date; end: Date };

const numberOrZero = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

export type InternalFinancialsDashboard = {
  revenue: {
    total: number;
    bySource: Array<{ label: string; amount: number }>;
  };
  expenses: {
    total: number;
    byCategory: Array<{ label: string; amount: number }>;
  };
  commissions: {
    total: number;
    paid: number;
    pending: number;
    byAgent: Array<{ agentId: string; agentName: string; paid: number; pending: number; total: number }>;
  };
  transactions: {
    closed: number;
    volume: number;
    avgPrice: number;
  };
  recentPayouts: Array<{
    id: string;
    opportunityId: string | null;
    payeeId: string;
    payeeName: string;
    status: string;
    grossAmount: number;
    brokerAmount: number;
    agentAmount: number;
    createdAt: string;
    paidAt: string | null;
  }>;
};

@Injectable()
export class InternalFinancialsService {
  constructor(private readonly prisma: PrismaService) {}

  async buildDashboard(orgId: string, range: DateRange): Promise<InternalFinancialsDashboard> {
    const [revenue, ledger, commissions, transactions, recentPayouts] = await Promise.all([
      this.getRevenue(orgId, range),
      this.getLedger(orgId, range),
      this.getCommissions(orgId, range),
      this.getTransactions(orgId, range),
      this.getRecentPayouts(orgId, range)
    ]);

    return {
      revenue: mergeLineItems(revenue, ledger.income),
      expenses: ledger.expenses,
      commissions,
      transactions,
      recentPayouts
    };
  }

  private async getRevenue(orgId: string, range: DateRange) {
    const aggregate = await this.prisma.payout.aggregate({
      where: {
        orgId,
        payeeId: orgId,
        createdAt: { gte: range.start, lte: range.end }
      },
      _sum: {
        grossAmount: true
      }
    });

    const total = numberOrZero(aggregate._sum.grossAmount);
    return {
      total,
      bySource: total > 0 ? [{ label: 'Commissions', amount: total }] : []
    };
  }

  private async getLedger(orgId: string, range: DateRange) {
    try {
      const rows = await this.prisma.orgLedgerEntry.groupBy({
        by: ['type', 'category'],
        where: {
          orgId,
          occurredAt: { gte: range.start, lte: range.end }
        },
        _sum: {
          amount: true
        }
      });

      const incomeByCategory = new Map<string, number>();
      const expenseByCategory = new Map<string, number>();

      for (const row of rows) {
        const category = (row.category ?? 'Other').trim() || 'Other';
        const amount = numberOrZero(row._sum.amount);
        if (row.type === LedgerEntryType.INCOME) {
          incomeByCategory.set(category, (incomeByCategory.get(category) ?? 0) + amount);
        } else if (row.type === LedgerEntryType.EXPENSE) {
          expenseByCategory.set(category, (expenseByCategory.get(category) ?? 0) + amount);
        }
      }

      const income = {
        total: Array.from(incomeByCategory.values()).reduce((sum, value) => sum + value, 0),
        bySource: Array.from(incomeByCategory.entries())
          .map(([label, amount]) => ({ label, amount }))
          .sort((a, b) => b.amount - a.amount)
      };

      const expenses = {
        total: Array.from(expenseByCategory.values()).reduce((sum, value) => sum + value, 0),
        byCategory: Array.from(expenseByCategory.entries())
          .map(([label, amount]) => ({ label, amount }))
          .sort((a, b) => b.amount - a.amount)
      };

      return { income, expenses };
    } catch {
      // If migrations haven't been deployed yet, treat internal ledger as empty.
      return { income: { total: 0, bySource: [] }, expenses: { total: 0, byCategory: [] } };
    }
  }

  private async getCommissions(orgId: string, range: DateRange) {
    const rows = await this.prisma.payout.findMany({
      where: {
        orgId,
        payeeId: { not: orgId },
        createdAt: { gte: range.start, lte: range.end }
      },
      select: {
        payeeId: true,
        status: true,
        agentAmount: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const agentIds = Array.from(new Set(rows.map((row) => row.payeeId)));
    const users = agentIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, firstName: true, lastName: true, email: true }
        })
      : [];
    const userNameById = new Map(
      users.map((user) => [
        user.id,
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.id
      ])
    );

    let paid = 0;
    let pending = 0;
    const agentMap = new Map<string, { paid: number; pending: number }>();

    for (const row of rows) {
      const amount = numberOrZero(row.agentAmount);
      if ((row.status ?? '').toUpperCase() === 'PAID') {
        paid += amount;
      } else {
        pending += amount;
      }

      const entry = agentMap.get(row.payeeId) ?? { paid: 0, pending: 0 };
      if ((row.status ?? '').toUpperCase() === 'PAID') {
        entry.paid += amount;
      } else {
        entry.pending += amount;
      }
      agentMap.set(row.payeeId, entry);
    }

    const byAgent = Array.from(agentMap.entries())
      .map(([agentId, entry]) => ({
        agentId,
        agentName: userNameById.get(agentId) ?? agentId,
        paid: entry.paid,
        pending: entry.pending,
        total: entry.paid + entry.pending
      }))
      .sort((a, b) => b.total - a.total);

    return {
      total: paid + pending,
      paid,
      pending,
      byAgent
    };
  }

  private async getTransactions(orgId: string, range: DateRange) {
    const closed = await this.prisma.orgTransaction.count({
      where: {
        organizationId: orgId,
        status: OrgTransactionStatus.CLOSED,
        closingDate: { gte: range.start, lte: range.end }
      }
    });

    const rows = await this.prisma.orgTransaction.findMany({
      where: {
        organizationId: orgId,
        status: OrgTransactionStatus.CLOSED,
        closingDate: { gte: range.start, lte: range.end }
      },
      select: {
        listing: { select: { listPrice: true } }
      }
    });
    const volume = rows.reduce((sum, row) => sum + numberOrZero(row.listing?.listPrice), 0);

    return {
      closed,
      volume,
      avgPrice: closed > 0 ? volume / closed : 0
    };
  }

  private async getRecentPayouts(orgId: string, range: DateRange) {
    const payouts = await this.prisma.payout.findMany({
      where: {
        orgId,
        createdAt: { gte: range.start, lte: range.end }
      },
      select: {
        id: true,
        opportunityId: true,
        payeeId: true,
        status: true,
        grossAmount: true,
        brokerAmount: true,
        agentAmount: true,
        createdAt: true,
        paidAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const payeeIds = Array.from(new Set(payouts.map((payout) => payout.payeeId)));
    const payees = payeeIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: payeeIds } },
          select: { id: true, firstName: true, lastName: true, email: true }
        })
      : [];
    const payeeNameById = new Map(
      payees.map((user) => [
        user.id,
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.id
      ])
    );

    return payouts.map((payout) => ({
      id: payout.id,
      opportunityId: payout.opportunityId ?? null,
      payeeId: payout.payeeId,
      payeeName: payout.payeeId === orgId ? 'Brokerage' : payeeNameById.get(payout.payeeId) ?? payout.payeeId,
      status: payout.status,
      grossAmount: numberOrZero(payout.grossAmount),
      brokerAmount: numberOrZero(payout.brokerAmount),
      agentAmount: numberOrZero(payout.agentAmount),
      createdAt: payout.createdAt.toISOString(),
      paidAt: payout.paidAt ? payout.paidAt.toISOString() : null
    }));
  }
}

function mergeLineItems(
  base: { total: number; bySource: Array<{ label: string; amount: number }> },
  extra: { total: number; bySource: Array<{ label: string; amount: number }> }
) {
  const merged = new Map<string, number>();
  for (const item of base.bySource) {
    merged.set(item.label, (merged.get(item.label) ?? 0) + item.amount);
  }
  for (const item of extra.bySource) {
    merged.set(item.label, (merged.get(item.label) ?? 0) + item.amount);
  }
  const bySource = Array.from(merged.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    total: base.total + extra.total,
    bySource
  };
}
