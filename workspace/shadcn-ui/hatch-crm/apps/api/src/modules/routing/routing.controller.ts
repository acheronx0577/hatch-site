import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { CreateRoutingRuleDto } from './dto/create-routing-rule.dto';
import { UpdateRoutingRuleDto } from './dto/update-routing-rule.dto';
import { RoutingService } from './routing.service';
import {
  RoutingCapacityEntryDto,
  RoutingCapacityResponseDto,
  RoutingEventListResponseDto,
  RoutingMetricsResponseDto,
  RoutingProcessSlaResponseDto,
  RoutingRuleDto,
  RoutingRuleIdentifierDto,
  RoutingRuleListResponseDto,
  RoutingSlaDashboardDto
} from './dto/routing-response.dto';
import { RoutingRulesQueryDto } from './dto/routing-query.dto';

const parseMaybeJson = (value: unknown) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }
  }
  return value;
};

@ApiModule('Routing')
@ApiStandardErrors()
@Controller('routing')
export class RoutingController {
  constructor(private readonly routing: RoutingService) {}

  @Get('rules')
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Filter rules by name' })
  @ApiQuery({ name: 'mode', required: false, description: 'Filter rules by routing mode' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Page size (default 25, maximum 100)'
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque pagination cursor from a prior response' })
  @ApiOkResponse({ type: RoutingRuleListResponseDto })
  async listRules(
    @Query('tenantId') tenantId: string | undefined,
    @Query() query: RoutingRulesQueryDto,
    @Req() req: FastifyRequest
  ): Promise<RoutingRuleListResponseDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    return this.routing.listRules(scopedTenantId, query);
  }

  @Post('rules')
  @ApiBody({ type: CreateRoutingRuleDto })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingRuleDto })
  async createRule(
    @Body() dto: CreateRoutingRuleDto,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    const payload = {
      name: dto.name,
      priority: dto.priority,
      mode: dto.mode,
      enabled: dto.enabled,
      conditions: parseMaybeJson(dto.conditions),
      targets: parseMaybeJson(dto.targets),
      fallback: parseMaybeJson(dto.fallback),
      slaFirstTouchMinutes: dto.slaFirstTouchMinutes,
      slaKeptAppointmentMinutes: dto.slaKeptAppointmentMinutes
    };
    return this.routing.createRule(scopedTenantId, ctx.userId, payload);
  }

  @Patch('rules/:id')
  @ApiParam({ name: 'id', description: 'Routing rule identifier' })
  @ApiBody({ type: UpdateRoutingRuleDto })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingRuleDto })
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateRoutingRuleDto,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    const payload = {
      name: dto.name,
      priority: dto.priority,
      mode: dto.mode,
      enabled: dto.enabled,
      conditions: dto.conditions ? parseMaybeJson(dto.conditions) : undefined,
      targets: dto.targets ? parseMaybeJson(dto.targets) : undefined,
      fallback: dto.fallback ? parseMaybeJson(dto.fallback) : undefined,
      slaFirstTouchMinutes: dto.slaFirstTouchMinutes,
      slaKeptAppointmentMinutes: dto.slaKeptAppointmentMinutes
    };
    return this.routing.updateRule(id, scopedTenantId, payload);
  }

  @Delete('rules/:id')
  @ApiParam({ name: 'id', description: 'Routing rule identifier' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingRuleIdentifierDto })
  async deleteRule(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingRuleIdentifierDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    return this.routing.deleteRule(id, scopedTenantId);
  }

  @Get('capacity')
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingCapacityResponseDto })
  async capacity(
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingCapacityResponseDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    const entries = await this.routing.getCapacityView(scopedTenantId);
    const items = entries.map((entry) => ({
      agentId: entry.agentId,
      name: entry.name,
      activePipeline: entry.activePipeline ?? null,
      capacityTarget: entry.capacityTarget,
      capacityRemaining: entry.capacityRemaining,
      keptApptRate: entry.keptApptRate ?? null,
      teamIds: entry.teamIds
    } satisfies RoutingCapacityEntryDto));
    return { items };
  }

  @Get('events')
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingEventListResponseDto })
  async events(
    @Query('limit') limit: string,
    @Query('cursor') cursor: string | undefined,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingEventListResponseDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.routing.listRouteEvents(scopedTenantId, {
      limit: Number.isNaN(parsedLimit ?? NaN) ? undefined : parsedLimit,
      cursor
    });
  }

  @Get('sla')
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingSlaDashboardDto })
  async slaDashboard(
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingSlaDashboardDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    return this.routing.getSlaDashboard(scopedTenantId);
  }

  @Post('sla/process')
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingProcessSlaResponseDto })
  async processSla(
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingProcessSlaResponseDto> {
    const ctx = resolveRequestContext(req);
    return this.routing.processSlaTimers(tenantId ?? ctx.tenantId);
  }

  @Get('metrics')
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingMetricsResponseDto })
  async metrics(
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingMetricsResponseDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    return this.routing.getMetrics(scopedTenantId);
  }

  private resolveTenantId(ctx: ReturnType<typeof resolveRequestContext>, tenantId?: string) {
    const resolved = tenantId ?? ctx.tenantId;
    if (!resolved) {
      throw new BadRequestException('tenantId is required');
    }
    return resolved;
  }
}
