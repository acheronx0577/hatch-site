import { Body, Controller, Get, Param, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../../platform/audit/audit.interceptor';
import { Permit } from '../../../platform/security/permit.decorator';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../../common';
import { OffersService } from './offers.service';
import {
  CreateOfferDto,
  DecideOfferDto,
  ListOffersQueryDto,
  OfferListResponseDto,
  OfferDecisionResponseDto,
  OfferResponseDto
} from './dto';

@ApiModule('RE Offers')
@ApiStandardErrors()
@Controller('re/offers')
@UseInterceptors(AuditInterceptor)
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post()
  @Permit('re_offers', 'create')
  @ApiBody({ type: CreateOfferDto })
  @ApiOkResponse({ type: OfferResponseDto })
  async create(@Req() req: FastifyRequest, @Body() dto: CreateOfferDto) {
    const ctx = resolveRequestContext(req);
    return this.offers.create(ctx, dto);
  }

  @Get()
  @Permit('re_offers', 'read')
  @ApiQuery({ name: 'listingId', required: false, description: 'Filter results by listing identifier' })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: ['SUBMITTED', 'COUNTERED', 'ACCEPTED', 'REJECTED'] }
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Page size (default 25, maximum 100)'
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque pagination cursor from a prior response' })
  @ApiOkResponse({ type: OfferListResponseDto })
  async list(@Req() req: FastifyRequest, @Query() query: ListOffersQueryDto) {
    const ctx = resolveRequestContext(req);
    return this.offers.list(ctx, query);
  }

  @Post(':id/decide')
  @Permit('re_offers', 'update')
  @ApiParam({ name: 'id', description: 'Offer identifier' })
  @ApiBody({ type: DecideOfferDto })
  @ApiOkResponse({ type: OfferDecisionResponseDto })
  async decide(@Req() req: FastifyRequest, @Param('id') id: string, @Body() dto: DecideOfferDto) {
    const ctx = resolveRequestContext(req);
    return this.offers.decide(ctx, id, dto);
  }
}
