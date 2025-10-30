import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { AggregatorService, normalizeRange } from './jobs/aggregator.service';
import { MetricKey, METRIC_KEYS, normalizeKeys } from './dto';

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService, private readonly aggregator: AggregatorService) {}

  async series(
    ctx: RequestContext,
    key: MetricKey,
    from?: string,
    to?: string
  ): Promise<Array<{ date: string; valueNum: number | null; valueJson: unknown }>> {
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context is required');
    }

    const range = normalizeRange(from, to);

    const rows = await this.prisma.metricsDaily.findMany({
      where: {
        orgId: ctx.orgId,
        key,
        date: {
          gte: range.start,
          lte: range.end
        }
      },
      orderBy: { date: 'asc' }
    });

    return rows.map((row) => ({
      date: row.date.toISOString(),
      valueNum: row.valueNum !== null ? Number(row.valueNum) : null,
      valueJson: row.valueJson ?? null
    }));
  }

  async recompute(ctx: RequestContext, keys?: string[], from?: string, to?: string) {
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context is required');
    }

    const normalizedKeys = normalizeKeys(keys);
    const range = normalizeRange(from, to);

    for (const key of normalizedKeys) {
      await this.aggregator.recompute(ctx.orgId, key, range);
    }

    return {
      keys: normalizedKeys,
      range: {
        from: range.start.toISOString(),
        to: range.end.toISOString()
      }
    };
  }

  getSupportedKeys(): MetricKey[] {
    return [...METRIC_KEYS];
  }
}
