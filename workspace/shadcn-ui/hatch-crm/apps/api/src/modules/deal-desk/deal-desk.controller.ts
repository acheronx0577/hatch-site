import { Body, Controller, Get, Param, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { DealDeskService } from './deal-desk.service';
import {
  CreateDealDeskRequestDto,
  DealDeskListQueryDto,
  DealDeskListResponseDto,
  DealDeskRequestResponseDto
} from './dto';

@ApiModule('Deal Desk')
@ApiStandardErrors()
@Controller('deal-desk/requests')
@UseInterceptors(AuditInterceptor)
export class DealDeskController {
  constructor(private readonly service: DealDeskService) {}

  @Post()
  @Permit('deal_desk_requests', 'create')
  @ApiBody({ type: CreateDealDeskRequestDto })
  @ApiOkResponse({ type: DealDeskRequestResponseDto })
  async create(@Req() req: FastifyRequest, @Body() dto: CreateDealDeskRequestDto) {
    const ctx = resolveRequestContext(req);
    return this.service.create(ctx, dto);
  }

  @Get()
  @Permit('deal_desk_requests', 'read')
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] }
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Page size (default 25, maximum 100)'
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque pagination cursor from a prior response' })
  @ApiOkResponse({ type: DealDeskListResponseDto })
  async list(@Req() req: FastifyRequest, @Query() query: DealDeskListQueryDto) {
    const ctx = resolveRequestContext(req);
    return this.service.list(ctx, query);
  }

  @Post(':id/approve')
  @Permit('deal_desk_requests', 'update')
  @ApiParam({ name: 'id', description: 'Deal desk request identifier' })
  @ApiOkResponse({ type: DealDeskRequestResponseDto })
  async approve(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.service.approve(ctx, id);
  }

  @Post(':id/reject')
  @Permit('deal_desk_requests', 'update')
  @ApiParam({ name: 'id', description: 'Deal desk request identifier' })
  @ApiOkResponse({ type: DealDeskRequestResponseDto })
  async reject(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.service.reject(ctx, id);
  }
}
