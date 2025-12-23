import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { OrgMembershipGuard } from '@/platform/security/org-membership.guard';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import type { MetricKey } from './dto';
import { GetMetricsQueryDto, MetricsRecomputeResponseDto, RecomputeBodyDto, normalizeKeys } from './dto';
import { AggregatorService } from './jobs/aggregator.service';

type MetricsPoint = {
  date: string;
  valueNum?: number | null;
  valueJson?: unknown;
};

const parseIsoDate = (value: string | undefined, label: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  return parsed;
};

const startOfDayUtc = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

@ApiTags('Reporting')
@ApiModule('Reporting Metrics')
@ApiStandardErrors()
@Controller('reporting')
@UseGuards(JwtAuthGuard, OrgMembershipGuard)
export class ReportingMetricsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregator: AggregatorService
  ) {}

  @Post('recompute')
  @HttpCode(202)
  @ApiBody({ type: RecomputeBodyDto })
  @ApiOkResponse({ type: MetricsRecomputeResponseDto })
  async recompute(@Req() req: FastifyRequest, @Body() body: RecomputeBodyDto): Promise<MetricsRecomputeResponseDto> {
    const ctx = resolveRequestContext(req);
    const orgId = ctx.orgId?.trim();
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    const from = parseIsoDate(body.from, 'from') ?? new Date(Date.now() - 7 * 86_400_000);
    const to = parseIsoDate(body.to, 'to') ?? new Date();
    if (from > to) {
      throw new BadRequestException('from must be before to');
    }

    const keys = normalizeKeys(body.keys as string[] | undefined);
    const range = { start: startOfDayUtc(from), end: startOfDayUtc(to) };

    for (const key of keys) {
      await this.aggregator.recompute(orgId, key, range);
    }

    return {
      keys,
      range: {
        from: range.start.toISOString(),
        to: range.end.toISOString()
      },
      status: 'scheduled'
    };
  }

  @Get('metrics')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          valueNum: { type: 'number', nullable: true },
          valueJson: { type: 'object', nullable: true }
        }
      }
    }
  })
  async getMetrics(@Req() req: FastifyRequest, @Query() query: GetMetricsQueryDto): Promise<MetricsPoint[]> {
    const ctx = resolveRequestContext(req);
    const orgId = ctx.orgId?.trim();
    if (!orgId) {
      throw new BadRequestException('x-org-id header is required');
    }

    const from = parseIsoDate(query.from, 'from') ?? new Date(Date.now() - 7 * 86_400_000);
    const to = parseIsoDate(query.to, 'to') ?? new Date();
    if (from > to) {
      throw new BadRequestException('from must be before to');
    }

    const key = query.key as MetricKey;
    const start = startOfDayUtc(from);
    const end = startOfDayUtc(to);

    const rows = await this.prisma.metricsDaily.findMany({
      where: {
        orgId,
        key,
        date: {
          gte: start,
          lte: end
        }
      },
      orderBy: { date: 'asc' }
    });

    return rows.map((row) => ({
      date: row.date.toISOString(),
      valueNum: row.valueNum === null ? null : Number(row.valueNum),
      valueJson: row.valueJson ?? undefined
    }));
  }
}
