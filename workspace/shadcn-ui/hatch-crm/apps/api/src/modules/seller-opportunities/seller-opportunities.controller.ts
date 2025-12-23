import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { OrgMembershipGuard } from '@/platform/security/org-membership.guard';
import { resolveRequestContext } from '../common';
import { ListSellerOpportunitiesQueryDto } from './dto';
import { SellerOpportunitiesService } from './seller-opportunities.service';

@ApiTags('seller-opportunities')
@ApiBearerAuth()
@Controller('organizations/:orgId/seller-opportunities')
@UseGuards(JwtAuthGuard, OrgMembershipGuard)
export class SellerOpportunitiesController {
  constructor(private readonly sellerOpps: SellerOpportunitiesService) {}

  @Get()
  list(@Param('orgId') orgId: string, @Req() req: FastifyRequest, @Query() query: ListSellerOpportunitiesQueryDto) {
    const ctx = resolveRequestContext(req);
    return this.sellerOpps.list(orgId, ctx.userId, query);
  }

  @Get('engine')
  engine(@Param('orgId') orgId: string, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.sellerOpps.getEngineStatus(orgId, ctx.userId);
  }

  @Post('run')
  run(@Param('orgId') orgId: string, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.sellerOpps.runForOrg(orgId, ctx.userId, { reason: 'manual' });
  }

  @Post(':id/convert')
  convert(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.sellerOpps.convertToLead(orgId, ctx.userId, id);
  }
}

