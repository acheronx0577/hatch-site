import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { LedgerEntryType } from '@hatch/db';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { QuickBooksService } from '@/modules/integrations/quickbooks/quickbooks.service';
import type { CreateLedgerEntryDto, FinancialsPeriod, FinancialsSource, ListLedgerEntriesQueryDto, UpdateLedgerEntryDto } from './dto';
import { InternalFinancialsService } from './internal-financials.service';

type DateRange = { start: Date; end: Date };

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const startOfMonth = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
const startOfQuarter = (value: Date) => {
  const quarterStartMonth = Math.floor(value.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(value.getUTCFullYear(), quarterStartMonth, 1));
};
const startOfYear = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), 0, 1));

const resolveDateRange = (period: FinancialsPeriod, now = new Date()): DateRange => {
  const end = now;
  switch (period) {
    case 'quarter':
      return { start: startOfQuarter(now), end };
    case 'year':
      return { start: startOfYear(now), end };
    case 'month':
    default:
      return { start: startOfMonth(now), end };
  }
};

type FinancialsDashboardResponse = {
  period: FinancialsPeriod;
  dateRange: { start: string; end: string };
  source: 'internal' | 'quickbooks';
  quickbooks: { connected: boolean; realmId: string | null; connectedAt: string | null };
  revenue: { total: number; bySource: Array<{ label: string; amount: number }> };
  expenses: { total: number; byCategory: Array<{ label: string; amount: number }> };
  commissions: {
    total: number;
    paid: number;
    pending: number;
    byAgent: Array<{ agentId: string; agentName: string; paid: number; pending: number; total: number }>;
  };
  transactions: { closed: number; volume: number; avgPrice: number };
  netIncome: number;
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
  warnings: Array<{ source: 'quickbooks' | 'internal'; message: string }>;
};

type LedgerEntryRecord = {
  id: string;
  orgId: string;
  type: LedgerEntryType;
  category: string;
  amount: number;
  currency: string;
  occurredAt: string;
  memo: string | null;
  transactionId: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type LedgerEntriesListResponse = { items: LedgerEntryRecord[]; nextCursor: string | null };

@Injectable()
export class FinancialsService {
  private readonly logger = new Logger(FinancialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internal: InternalFinancialsService,
    private readonly qb: QuickBooksService
  ) {}

  async getDashboard(
    orgId: string,
    options: { period: FinancialsPeriod; source: FinancialsSource }
  ): Promise<FinancialsDashboardResponse> {
    const range = resolveDateRange(options.period);

    const connection = await this.getQuickBooksConnection(orgId);
    const internalDashboard = await this.internal.buildDashboard(orgId, range);

    const warnings: FinancialsDashboardResponse['warnings'] = [];

    const shouldTryQuickBooks = options.source === 'quickbooks' || (options.source === 'auto' && connection.connected);

    if (shouldTryQuickBooks && connection.connected) {
      try {
        const pnl = await this.qb.fetchProfitAndLoss(orgId, {
          startDate: toIsoDate(range.start),
          endDate: toIsoDate(range.end)
        });

        const revenue = {
          total: pnl.totalIncome,
          bySource: pnl.incomeByAccount
        };
        const expenses = {
          total: pnl.totalExpenses,
          byCategory: pnl.expensesByAccount
        };

        const netIncome = pnl.netIncome ?? revenue.total - expenses.total;

        return {
          period: options.period,
          dateRange: { start: range.start.toISOString(), end: range.end.toISOString() },
          source: 'quickbooks',
          quickbooks: connection,
          revenue,
          expenses,
          commissions: internalDashboard.commissions,
          transactions: internalDashboard.transactions,
          netIncome,
          recentPayouts: internalDashboard.recentPayouts,
          warnings
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'QuickBooks financials request failed';
        this.logger.warn({ orgId, err: message }, 'QuickBooks dashboard fallback to internal');
        warnings.push({ source: 'quickbooks', message });
      }
    } else if (options.source === 'quickbooks' && !connection.connected) {
      warnings.push({ source: 'quickbooks', message: 'QuickBooks is not connected for this organization.' });
    }

    const netIncome =
      internalDashboard.revenue.total - internalDashboard.expenses.total - internalDashboard.commissions.paid;

    return {
      period: options.period,
      dateRange: { start: range.start.toISOString(), end: range.end.toISOString() },
      source: 'internal',
      quickbooks: connection,
      revenue: internalDashboard.revenue,
      expenses: internalDashboard.expenses,
      commissions: internalDashboard.commissions,
      transactions: internalDashboard.transactions,
      netIncome,
      recentPayouts: internalDashboard.recentPayouts,
      warnings
    };
  }

  private async getQuickBooksConnection(orgId: string) {
    try {
      const conn = await this.prisma.quickBooksConnection.findUnique({
        where: { orgId },
        select: { realmId: true, createdAt: true }
      });
      return {
        connected: Boolean(conn),
        realmId: conn?.realmId ?? null,
        connectedAt: conn?.createdAt ? conn.createdAt.toISOString() : null
      };
    } catch (error) {
      // If the schema isn't migrated yet, treat as not connected.
      return { connected: false, realmId: null, connectedAt: null };
    }
  }

  async listLedgerEntries(orgId: string, _userId: string, query: ListLedgerEntriesQueryDto): Promise<LedgerEntriesListResponse> {
    const take = Math.min(Math.max(query.limit ?? 25, 1), 100);

    const where: any = {
      orgId
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.category?.trim()) {
      where.category = { equals: query.category.trim(), mode: 'insensitive' };
    }

    if (typeof query.minAmount === 'number' && Number.isFinite(query.minAmount)) {
      where.amount = { gte: query.minAmount };
    }

    const occurredAt: any = {};
    if (query.startDate) {
      occurredAt.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      occurredAt.lte = new Date(query.endDate);
    }
    if (Object.keys(occurredAt).length > 0) {
      where.occurredAt = occurredAt;
    }

    const records = await this.prisma.orgLedgerEntry.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take,
      skip: query.cursor ? 1 : 0,
      cursor: query.cursor ? { id: query.cursor } : undefined
    });

    const nextCursor = records.length === take ? records[records.length - 1]?.id ?? null : null;

    return {
      items: records.map((entry) => ({
        id: entry.id,
        orgId: entry.orgId,
        type: entry.type,
        category: entry.category,
        amount: Number(entry.amount),
        currency: entry.currency,
        occurredAt: entry.occurredAt.toISOString(),
        memo: entry.memo ?? null,
        transactionId: entry.transactionId ?? null,
        createdByUserId: entry.createdByUserId ?? null,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString()
      })),
      nextCursor
    };
  }

  async createLedgerEntry(orgId: string, userId: string, dto: CreateLedgerEntryDto): Promise<LedgerEntryRecord> {
    const created = await this.prisma.orgLedgerEntry.create({
      data: {
        orgId,
        type: dto.type,
        category: dto.category.trim(),
        amount: dto.amount,
        currency: (dto.currency ?? 'USD').trim() || 'USD',
        occurredAt: new Date(dto.occurredAt),
        memo: dto.memo?.trim() ? dto.memo.trim() : null,
        transactionId: dto.transactionId?.trim() ? dto.transactionId.trim() : null,
        createdByUserId: userId
      }
    });

    return {
      id: created.id,
      orgId: created.orgId,
      type: created.type,
      category: created.category,
      amount: Number(created.amount),
      currency: created.currency,
      occurredAt: created.occurredAt.toISOString(),
      memo: created.memo ?? null,
      transactionId: created.transactionId ?? null,
      createdByUserId: created.createdByUserId ?? null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString()
    };
  }

  async updateLedgerEntry(orgId: string, _userId: string, entryId: string, dto: UpdateLedgerEntryDto): Promise<LedgerEntryRecord> {
    const existing = await this.prisma.orgLedgerEntry.findFirst({
      where: { id: entryId, orgId }
    });
    if (!existing) {
      throw new NotFoundException('Ledger entry not found');
    }

    const updated = await this.prisma.orgLedgerEntry.update({
      where: { id: existing.id },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.currency !== undefined ? { currency: (dto.currency ?? 'USD').trim() || 'USD' } : {}),
        ...(dto.occurredAt !== undefined ? { occurredAt: new Date(dto.occurredAt) } : {}),
        ...(dto.memo !== undefined ? { memo: dto.memo?.trim() ? dto.memo.trim() : null } : {}),
        ...(dto.transactionId !== undefined ? { transactionId: dto.transactionId?.trim() ? dto.transactionId.trim() : null } : {})
      }
    });

    return {
      id: updated.id,
      orgId: updated.orgId,
      type: updated.type,
      category: updated.category,
      amount: Number(updated.amount),
      currency: updated.currency,
      occurredAt: updated.occurredAt.toISOString(),
      memo: updated.memo ?? null,
      transactionId: updated.transactionId ?? null,
      createdByUserId: updated.createdByUserId ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  async deleteLedgerEntry(orgId: string, _userId: string, entryId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.orgLedgerEntry.findFirst({
      where: { id: entryId, orgId },
      select: { id: true }
    });
    if (!existing) {
      throw new NotFoundException('Ledger entry not found');
    }

    await this.prisma.orgLedgerEntry.delete({
      where: { id: existing.id }
    });

    return { ok: true };
  }
}
