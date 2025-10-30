import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';

import { DashboardsService, type BrokerDashboardSummary } from './dashboards.service';
import { ApiModule, ApiStandardErrors } from '../common';
import { BrokerDashboardSummaryDto } from './dto/broker-dashboard.dto';

@ApiModule('Dashboards')
@ApiStandardErrors()
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('broker')
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiOkResponse({ type: BrokerDashboardSummaryDto })
  async broker(@Query('tenantId') tenantId: string): Promise<BrokerDashboardSummaryDto> {
    const summary = await this.dashboards.brokerSummary(tenantId);
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
