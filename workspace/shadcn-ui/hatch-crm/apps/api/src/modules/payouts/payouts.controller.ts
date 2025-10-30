import { Body, Controller, Get, Param, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { PayoutsService } from './payouts.service';
import {
  GeneratePayoutDto,
  MarkPaidDto,
  PayoutListQueryDto,
  PayoutListResponseDto,
  PayoutResponseDto
} from './dto';

@ApiModule('Payouts')
@ApiStandardErrors()
@Controller('payouts')
@UseInterceptors(AuditInterceptor)
export class PayoutsController {
  constructor(private readonly service: PayoutsService) {}

  @Get()
  @Permit('payouts', 'read')
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: ['PENDING', 'PAID'] },
    description: 'Filter payouts by status'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Page size (default 25, maximum 100)'
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque pagination cursor from a prior response' })
  @ApiOkResponse({ type: PayoutListResponseDto })
  async list(@Req() req: FastifyRequest, @Query() query: PayoutListQueryDto) {
    const ctx = resolveRequestContext(req);
    return this.service.list(ctx, query);
  }

  @Post('generate')
  @Permit('payouts', 'create')
  @ApiBody({ type: GeneratePayoutDto })
  @ApiOkResponse({ type: PayoutResponseDto, isArray: true })
  async generate(@Req() req: FastifyRequest, @Body() body: GeneratePayoutDto) {
    const ctx = resolveRequestContext(req);
    return this.service.generateForOpportunity(ctx, body.opportunityId);
  }

  @Post(':id/mark-paid')
  @Permit('payouts', 'update')
  @ApiParam({ name: 'id', description: 'Payout identifier' })
  @ApiBody({ type: MarkPaidDto })
  @ApiOkResponse({ type: PayoutResponseDto })
  async markPaid(@Req() req: FastifyRequest, @Param('id') id: string, @Body() body: MarkPaidDto) {
    const ctx = resolveRequestContext(req);
    return this.service.markPaid(ctx, id, body);
  }
}
