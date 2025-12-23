import { BadRequestException, Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common';
import { DashboardsService } from './dashboards.service';
import { ApiModule, ApiStandardErrors } from '../common';
import { BrokerDashboardSummaryDto } from './dto/broker-dashboard.dto';

@ApiModule('Dashboards')
@ApiStandardErrors()
@Controller('dashboards')
@UseGuards(JwtAuthGuard)
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('broker')
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiOkResponse({ type: BrokerDashboardSummaryDto })
  async broker(@Req() req: FastifyRequest, @Query('tenantId') tenantId: string): Promise<BrokerDashboardSummaryDto> {
    const ctx = resolveRequestContext(req);
    if (tenantId && ctx.tenantId && tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    const resolvedTenantId = ctx.tenantId ?? tenantId;
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const summary = await this.dashboards.brokerSummary(resolvedTenantId);
    return {
      leadToKeptRate: summary.leadToKeptRate,
      toursWithBbaRate: summary.toursWithBbaRate,
      deliverability: summary.deliverability.map((metric) => ({ ...metric })),
      deals: summary.deals.map((deal) => ({ ...deal })),
      clearCooperation: summary.clearCooperation.map((entry) => ({
        timerId: entry.timerId,
        status: entry.status,
        startedAt: entry.startedAt.toISOString(),
        deadlineAt: entry.deadlineAt ? entry.deadlineAt.toISOString() : null
      }))
    };
  }
}
