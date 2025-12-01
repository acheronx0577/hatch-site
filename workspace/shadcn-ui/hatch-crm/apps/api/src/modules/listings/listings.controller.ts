import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiTags
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { resolveRequestContext } from '../common/request-context';
import { ListingsService } from './listings.service';
import type { BrokerPropertyRow, PromoteDraftPayload } from './types';

@ApiTags('Listings')
@ApiBearerAuth()
@Controller(['listings', 'properties'])
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true
      }
    }
  })
  async list(@Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.listings.list(ctx.tenantId);
  }

  @Post('promote')
  @ApiBody({
    description: 'Listing draft payload to promote into broker inventory',
    schema: { type: 'object', additionalProperties: true }
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true
    }
  })
  async promote(@Req() req: FastifyRequest, @Body() body: PromoteDraftPayload) {
    const ctx = resolveRequestContext(req);
    return this.listings.promote(ctx.tenantId, ctx.userId, body);
  }

  @Patch(':id')
  @ApiBody({
    description: 'Partial listing payload to update an existing broker property',
    schema: { type: 'object', additionalProperties: true }
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true
    }
  })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: Partial<BrokerPropertyRow>
  ) {
    const ctx = resolveRequestContext(req);
    return this.listings.update(ctx.tenantId, id, body);
  }

  @Post(':id/publish')
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true
    }
  })
  async publish(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.listings.publish(ctx.tenantId, id);
  }

  @Post(':id/unpublish')
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: true
    }
  })
  async unpublish(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.listings.unpublish(ctx.tenantId, id);
  }
}
