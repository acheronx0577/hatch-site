import { BadRequestException, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { UserRole } from '@hatch/db';

import { AgentPerformanceService } from './agent-performance.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common';
import { PrismaService } from '@/modules/prisma/prisma.service';

@Controller('organizations/:orgId/agent-performance')
@UseGuards(JwtAuthGuard)
export class AgentPerformanceController {
  constructor(
    private readonly service: AgentPerformanceService,
    private readonly prisma: PrismaService
  ) {}

  private assertOrgScope(orgId: string, ctxOrgId: string) {
    if (orgId !== ctxOrgId) {
      throw new ForbiddenException('Unauthorized org scope');
    }
  }

  private isOrgManager(role: UserRole) {
    return role === UserRole.BROKER || role === UserRole.TEAM_LEAD;
  }

  private isOrgAdmin(role: UserRole) {
    return role === UserRole.BROKER;
  }

  private parseDebug(value: string | undefined) {
    const normalized = (value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  private async assertCanViewAgent(orgId: string, agentProfileId: string, req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    this.assertOrgScope(orgId, ctx.orgId);
    if (this.isOrgManager(ctx.role)) return ctx;
    if (ctx.role !== UserRole.AGENT) {
      throw new ForbiddenException('Unauthorized');
    }
    const profile = await this.prisma.agentProfile.findFirst({
      where: { id: agentProfileId, organizationId: orgId },
      select: { userId: true }
    });
    if (!profile || profile.userId !== ctx.userId) {
      throw new ForbiddenException('Agents may only view their own performance');
    }
    return ctx;
  }

  private async assertCanViewOrg(orgId: string, req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    this.assertOrgScope(orgId, ctx.orgId);
    if (!this.isOrgManager(ctx.role)) {
      throw new ForbiddenException('Broker or team lead role required');
    }
    return ctx;
  }

  private async assertCanManageOrg(orgId: string, req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    this.assertOrgScope(orgId, ctx.orgId);
    if (!this.isOrgAdmin(ctx.role)) {
      throw new ForbiddenException('Broker role required');
    }
    return ctx;
  }

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Query('agentProfileId') agentProfileId?: string,
    @Query('debug') debugRaw?: string,
    @Req() req?: FastifyRequest
  ) {
    if (!req) {
      throw new ForbiddenException('Unauthorized');
    }
    const ctx = agentProfileId
      ? await this.assertCanViewAgent(orgId, agentProfileId, req)
      : await this.assertCanManageOrg(orgId, req);

    const debug = this.parseDebug(debugRaw);
    const includeRawFeatureSummary = debug && this.isOrgAdmin(ctx.role);

    return this.service.listSnapshots(orgId, agentProfileId, { includeRawFeatureSummary });
  }

  @Post('generate')
  async generate(@Param('orgId') orgId: string, @Req() req: FastifyRequest) {
    await this.assertCanManageOrg(orgId, req);
    await this.service.generateSnapshots(orgId);
    return { ok: true };
  }

  @Get('latest')
  async latest(@Param('orgId') orgId: string, @Query('debug') debugRaw: string | undefined, @Req() req: FastifyRequest) {
    const ctx = await this.assertCanManageOrg(orgId, req);
    const debug = this.parseDebug(debugRaw);
    const includeRawFeatureSummary = debug && this.isOrgAdmin(ctx.role);
    return this.service.latestByOrg(orgId, { includeRawFeatureSummary });
  }

  @Get('agents/:agentProfileId/latest')
  async latestForAgent(
    @Param('orgId') orgId: string,
    @Param('agentProfileId') agentProfileId: string,
    @Query('debug') debugRaw: string | undefined,
    @Req() req: FastifyRequest
  ) {
    const ctx = await this.assertCanViewAgent(orgId, agentProfileId, req);
    const debug = this.parseDebug(debugRaw);
    const includeRawFeatureSummary = debug && this.isOrgAdmin(ctx.role);
    return this.service.getLatestIndicator(orgId, agentProfileId, { includeRawFeatureSummary });
  }

  @Get('agents/:agentProfileId/trend')
  async trendForAgent(
    @Param('orgId') orgId: string,
    @Param('agentProfileId') agentProfileId: string,
    @Query('days') daysRaw: string | undefined,
    @Query('debug') debugRaw: string | undefined,
    @Req() req: FastifyRequest
  ) {
    const ctx = await this.assertCanViewAgent(orgId, agentProfileId, req);
    const days = daysRaw ? Number(daysRaw) : 90;
    if (!Number.isFinite(days) || days <= 0) {
      throw new BadRequestException('days must be a positive number');
    }
    const debug = this.parseDebug(debugRaw);
    const includeRawFeatureSummary = debug && this.isOrgAdmin(ctx.role);
    return this.service.getTrend(orgId, agentProfileId, days, { includeRawFeatureSummary });
  }

  @Get('leaderboard')
  async leaderboard(
    @Param('orgId') orgId: string,
    @Query('page') pageRaw: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Query('officeId') officeId: string | undefined,
    @Query('teamId') teamId: string | undefined,
    @Query('orientation') orientationRaw: string | undefined,
    @Query('priceBand') priceBandRaw: string | undefined,
    @Query('debug') debugRaw: string | undefined,
    @Req() req: FastifyRequest
  ) {
    const ctx = await this.assertCanManageOrg(orgId, req);
    const page = pageRaw ? Number(pageRaw) : 1;
    const limit = limitRaw ? Number(limitRaw) : 25;
    const orientation = (orientationRaw?.toUpperCase() ?? undefined) as any;
    const priceBand = (priceBandRaw?.toUpperCase() ?? undefined) as any;
    const debug = this.parseDebug(debugRaw);
    const includeRawFeatureSummary = debug && this.isOrgAdmin(ctx.role);

    return this.service.listLeaderboard({
      orgId,
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 25,
      officeId: officeId || undefined,
      teamId: teamId || undefined,
      orientation,
      priceBand,
      includeRawFeatureSummary
    });
  }

  @Post('agents/:agentProfileId/context-fit')
  async contextFit(
    @Param('orgId') orgId: string,
    @Param('agentProfileId') agentProfileId: string,
    @Req() req: FastifyRequest,
    @Query('leadType') leadType: string | undefined,
    @Query('city') city: string | undefined,
    @Query('state') state: string | undefined,
    @Query('postalCode') postalCode: string | undefined,
    @Query('price') priceRaw: string | undefined,
    @Query('priceBand') priceBand: string | undefined,
    @Query('propertyType') propertyType: string | undefined
  ) {
    const ctx = await this.assertCanViewAgent(orgId, agentProfileId, req);
    const price = priceRaw ? Number(priceRaw) : null;

    return this.service.getContextFit({
      orgId,
      agentProfileId,
      actorUserId: ctx.userId,
      actorRole: String(ctx.role),
      context: {
        leadType: (leadType?.toUpperCase() as any) ?? 'UNKNOWN',
        city: city ?? null,
        state: state ?? null,
        postalCode: postalCode ?? null,
        price: Number.isFinite(price) ? price : null,
        priceBand: (priceBand?.toUpperCase() as any) ?? undefined,
        propertyType: propertyType ?? null
      }
    });
  }
}
