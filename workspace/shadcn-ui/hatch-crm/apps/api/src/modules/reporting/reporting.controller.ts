import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseInterceptors
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { resolveRequestContext } from '../common/request-context';
import { ReportingService } from './reporting.service';
import {
  GetMetricsQueryDto,
  MetricsPointDto,
  MetricsRecomputeResponseDto,
  RecomputeBodyDto
} from './dto';

@ApiTags('Reporting')
@ApiBearerAuth()
@Controller('reporting')
@UseInterceptors(AuditInterceptor)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('metrics')
  @Permit('reporting', 'read')
  @ApiQuery({ name: 'key', enum: ['leads.conversion', 'messaging.deliverability', 'cc.risk', 'pipeline.value'] })
  @ApiQuery({ name: 'from', required: false, description: 'Start date ISO-8601' })
  @ApiQuery({ name: 'to', required: false, description: 'End date ISO-8601' })
  @ApiQuery({ name: 'granularity', required: false })
  @ApiOkResponse({ type: MetricsPointDto, isArray: true })
  async getMetrics(@Req() req: FastifyRequest, @Query() query: GetMetricsQueryDto) {
    const ctx = resolveRequestContext(req);
    return this.reporting.series(ctx, query.key, query.from, query.to);
  }

  @Post('recompute')
  @Permit('reporting', 'create')
  @ApiBody({ type: RecomputeBodyDto })
  @ApiAcceptedResponse({ type: MetricsRecomputeResponseDto })
  @HttpCode(HttpStatus.ACCEPTED)
  async recompute(@Req() req: FastifyRequest, @Body() body: RecomputeBodyDto) {
    const ctx = resolveRequestContext(req);
    const result = await this.reporting.recompute(ctx, body.keys, body.from, body.to);
    return {
      status: 'scheduled',
      ...result
    };
  }
}
