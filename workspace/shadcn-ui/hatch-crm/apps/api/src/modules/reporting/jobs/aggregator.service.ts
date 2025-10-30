import { BadRequestException, Injectable } from '@nestjs/common';

import {
  ClearCooperationStatus,
  DealStage,
  MessageDirection,
  MessageStatus,
  Prisma
} from '@hatch/db';

import { PrismaService } from '../../prisma/prisma.service';
import type { MetricKey } from '../dto';

interface DateRange {
  start: Date;
  end: Date;
}

interface MetricComputation {
  valueNum: number | null;
  valueJson: Record<string, unknown> | null;
}

type TenantCache = Map<string, string[]>;

@Injectable()
export class AggregatorService {
  private readonly tenantCache: TenantCache = new Map();

  constructor(private readonly prisma: PrismaService) {}

  async recompute(orgId: string, key: MetricKey, range: DateRange): Promise<void> {
    const run = await this.prisma.metricsRun.create({
      data: {
        orgId,
        key,
        status: 'SUCCESS'
      }
    });

    try {
      const tenantIds = await this.getTenantIds(orgId);
      for (const dayStart of iterateDays(range.start, range.end)) {
        const computation = await this.computeForKey({
          orgId,
          tenantIds,
          key,
          dayStart
        });

        await this.upsertMetric(orgId, key, dayStart, computation);
      }

      await this.prisma.metricsRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: 'SUCCESS'
        }
      });
    } catch (error) {
      await this.prisma.metricsRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: 'FAILED',
          note: error instanceof Error ? error.message : 'Unknown aggregator failure'
        }
      });
      throw error;
    }
  }

  private async computeForKey(params: {
    orgId: string;
    tenantIds: string[];
    key: MetricKey;
    dayStart: Date;
  }): Promise<MetricComputation> {
    switch (params.key) {
      case 'leads.conversion':
        return this.computeLeadConversion(params.orgId, params.tenantIds, params.dayStart);
      case 'messaging.deliverability':
        return this.computeDeliverability(params.tenantIds, params.dayStart);
      case 'cc.risk':
        return this.computeClearCooperationRisk(params.tenantIds, params.dayStart);
      case 'pipeline.value':
        return this.computePipelineValue(params.orgId, params.dayStart);
      default:
        throw new BadRequestException(`Unsupported metric key: ${params.key}`);
    }
  }

  private async upsertMetric(orgId: string, key: MetricKey, dayStart: Date, value: MetricComputation) {
    const existing = await this.prisma.metricsDaily.findFirst({
      where: { orgId, key, date: dayStart }
    });

    if (existing) {
      await this.prisma.metricsDaily.update({
        where: { id: existing.id },
        data: {
          valueNum: value.valueNum,
          valueJson: value.valueJson as unknown as Prisma.InputJsonValue
        }
      });
      return;
    }

    await this.prisma.metricsDaily.create({
      data: {
        orgId,
        key,
        date: dayStart,
        valueNum: value.valueNum,
        valueJson: value.valueJson as unknown as Prisma.InputJsonValue
      }
    });
  }

  private async computeLeadConversion(
    orgId: string,
    tenantIds: string[],
    dayStart: Date
  ): Promise<MetricComputation> {
    const dayEnd = addDays(dayStart, 1);

    const [newLeads, converted] = await Promise.all([
      this.prisma.person.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          createdAt: {
            gte: dayStart,
            lt: dayEnd
          }
        }
      }),
      tenantIds.length === 0
        ? 0
        : this.prisma.deal.count({
            where: {
              tenantId: { in: tenantIds },
              stage: { in: [DealStage.UNDER_CONTRACT, DealStage.CLOSED] },
              createdAt: {
                gte: dayStart,
                lt: dayEnd
              }
            }
          })
    ]);

    const ratio = newLeads > 0 ? roundNumber(converted / newLeads, 4) : null;

    return {
      valueNum: ratio,
      valueJson: {
        newLeads,
        converted
      }
    };
  }

  private async computeDeliverability(
    tenantIds: string[],
    dayStart: Date
  ): Promise<MetricComputation> {
    if (tenantIds.length === 0) {
      return {
        valueNum: null,
        valueJson: { total: 0, success: 0, failed: 0 }
      };
    }

    const dayEnd = addDays(dayStart, 1);
    const baseWhere = {
      tenantId: { in: tenantIds },
      direction: MessageDirection.OUTBOUND,
      createdAt: {
        gte: dayStart,
        lt: dayEnd
      }
    } as const;

    const [total, success, failed] = await Promise.all([
      this.prisma.message.count({ where: baseWhere }),
      this.prisma.message.count({
        where: {
          ...baseWhere,
          status: { in: [MessageStatus.SENT, MessageStatus.DELIVERED] }
        }
      }),
      this.prisma.message.count({
        where: {
          ...baseWhere,
          status: { in: [MessageStatus.FAILED, MessageStatus.BOUNCED, MessageStatus.BLOCKED] }
        }
      })
    ]);

    const ratio = total > 0 ? roundNumber(success / total, 4) : null;

    return {
      valueNum: ratio,
      valueJson: {
        total,
        success,
        failed
      }
    };
  }

  private async computeClearCooperationRisk(
    tenantIds: string[],
    dayStart: Date
  ): Promise<MetricComputation> {
    if (tenantIds.length === 0) {
      return { valueNum: null, valueJson: { GREEN: 0, YELLOW: 0, RED: 0 } };
    }

    const dayEnd = addDays(dayStart, 1);

    const grouped = await this.prisma.clearCooperationTimer.groupBy({
      by: ['status'],
      where: {
        tenantId: { in: tenantIds },
        createdAt: { lte: dayEnd }
      },
      _count: { _all: true }
    });

    if (grouped.length === 0) {
      return { valueNum: null, valueJson: { GREEN: 0, YELLOW: 0, RED: 0 } };
    }

    const counts: Record<string, number> = {
      GREEN: 0,
      YELLOW: 0,
      RED: 0
    };

    let total = 0;
    grouped.forEach((entry) => {
      const count = entry._count._all ?? 0;
      counts[entry.status] = count;
      total += count;
    });

    if (total === 0) {
      return { valueNum: null, valueJson: counts };
    }

    const redCount = counts[ClearCooperationStatus.RED] ?? 0;
    const yellowCount = counts[ClearCooperationStatus.YELLOW] ?? 0;
    const greenCount = counts[ClearCooperationStatus.GREEN] ?? 0;

    const score = (redCount * 1 + yellowCount * 0.5 + greenCount * 0) / total;

    return {
      valueNum: roundNumber(score, 4),
      valueJson: counts
    };
  }

  private async computePipelineValue(orgId: string, dayStart: Date): Promise<MetricComputation> {
    const dayEnd = addDays(dayStart, 1);

    const grouped = await this.prisma.opportunity.groupBy({
      by: ['stage'],
      where: {
        orgId,
        deletedAt: null,
        createdAt: { lte: dayEnd }
      },
      _sum: { amount: true }
    });

    if (grouped.length === 0) {
      return {
        valueNum: 0,
        valueJson: {}
      };
    }

    const stageTotals: Record<string, number> = {};
    let overall = 0;

    grouped.forEach((row) => {
      const amount = row._sum.amount ? Number(row._sum.amount) : 0;
      overall += amount;
      stageTotals[row.stage ?? 'UNASSIGNED'] = roundNumber(amount, 2);
    });

    return {
      valueNum: roundNumber(overall, 2),
      valueJson: stageTotals
    };
  }

  private async getTenantIds(orgId: string): Promise<string[]> {
    if (this.tenantCache.has(orgId)) {
      return this.tenantCache.get(orgId)!;
    }

    const tenants = await this.prisma.tenant.findMany({
      where: { organizationId: orgId },
      select: { id: true }
    });

    const ids = tenants.map((tenant) => tenant.id);
    this.tenantCache.set(orgId, ids);
    return ids;
  }
}

const iterateDays = function* (start: Date, end: Date): Generator<Date> {
  let cursor = startOfDayUTC(start);
  const endDay = startOfDayUTC(end);

  while (cursor <= endDay) {
    yield cursor;
    cursor = addDays(cursor, 1);
  }
};

const startOfDayUTC = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const addDays = (value: Date, amount: number): Date => {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
};

const roundNumber = (value: number, precision: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(precision));
};

export const normalizeRange = (from?: string, to?: string): DateRange => {
  const end = startOfDayUTC(to ? parseDate(to) : new Date());
  const start = from
    ? startOfDayUTC(parseDate(from))
    : startOfDayUTC(addDays(end, -6));

  if (start > end) {
    throw new BadRequestException('from must be earlier than or equal to to');
  }

  return { start, end };
};

const parseDate = (value: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid date provided: ${value}`);
  }
  return parsed;
};

export type NormalizedRange = ReturnType<typeof normalizeRange>;
