import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '../common/request-context';
import { DealsService } from './deals.service';
import { MoveDealDto } from './dto/move-deal.dto';

@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Post(':dealId/move')
  async move(
    @Param('dealId') dealId: string,
    @Body() body: MoveDealDto,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    const result = await this.deals.moveDeal(ctx, dealId, body.toStageId, body.reason);
    return {
      ok: true,
      dealId: result.id,
      stageId: result.stageId
    };
  }
}
