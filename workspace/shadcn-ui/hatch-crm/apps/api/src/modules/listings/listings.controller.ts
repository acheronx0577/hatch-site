import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiTags
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { resolveRequestContext } from '../common/request-context';
import { ListingsService } from './listings.service';
import type { PromoteDraftPayload } from './types';

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
}
