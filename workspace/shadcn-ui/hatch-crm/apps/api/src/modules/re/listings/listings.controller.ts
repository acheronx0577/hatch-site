import { Body, Controller, Get, Param, Post, Req, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../../platform/audit/audit.interceptor';
import { Permit } from '../../../platform/security/permit.decorator';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../../common';
import { ListingsService } from './listings.service';
import { ListingResponseDto, UpdateListingStatusDto } from './dto';

@ApiModule('RE Listings')
@ApiStandardErrors()
@Controller('re/listings')
@UseInterceptors(AuditInterceptor)
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get(':id')
  @Permit('re_listings', 'read')
  @ApiParam({ name: 'id', description: 'Listing identifier' })
  @ApiOkResponse({ type: ListingResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.listings.get(ctx, id);
  }

  @Post(':id/status')
  @Permit('re_listings', 'update')
  @ApiParam({ name: 'id', description: 'Listing identifier' })
  @ApiBody({ type: UpdateListingStatusDto })
  @ApiOkResponse({ type: ListingResponseDto })
  async updateStatus(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateListingStatusDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.listings.updateStatus(ctx, id, dto.status);
  }
}
