import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseInterceptors
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../../platform/audit/audit.interceptor';
import { Permit } from '../../../platform/security/permit.decorator';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../../common';
import { PayoutResponseDto } from '../../payouts/dto';
import { TransactionsService } from './transactions.service';
import {
  CommissionPreviewDto,
  TransactionResponseDto,
  UpdateMilestoneDto
} from './dto';

@ApiModule('RE Transactions')
@ApiStandardErrors()
@Controller('re/transactions')
@UseInterceptors(AuditInterceptor)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get(':id')
  @Permit('re_transactions', 'read')
  @ApiParam({ name: 'id', description: 'Transaction identifier' })
  @ApiOkResponse({ type: TransactionResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.transactions.get(ctx, id);
  }

  @Patch(':id/milestone')
  @Permit('re_transactions', 'update')
  @ApiParam({ name: 'id', description: 'Transaction identifier' })
  @ApiBody({ type: UpdateMilestoneDto })
  @ApiOkResponse({ type: TransactionResponseDto })
  async updateMilestone(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateMilestoneDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.transactions.updateMilestone(ctx, id, dto);
  }

  @Get(':id/commission')
  @Permit('re_transactions', 'read')
  @ApiParam({ name: 'id', description: 'Transaction identifier' })
  @ApiOkResponse({ type: CommissionPreviewDto })
  async commission(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.transactions.computeCommission(ctx, id);
  }

  @Post(':id/payouts')
  @Permit('re_transactions', 'update')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'id', description: 'Transaction identifier' })
  @ApiOkResponse({ type: PayoutResponseDto, isArray: true })
  async generatePayouts(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.transactions.generatePayouts(ctx, id);
  }
}
