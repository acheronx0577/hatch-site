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
  Req,
  UseGuards
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { RolesGuard } from '@/auth/roles.guard';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { PermissionsService } from '@/modules/permissions/permissions.service';
import { CreateRoutingRuleDto } from './dto/create-routing-rule.dto';
import { RoutingApprovalDecisionDto, RoutingApprovalQueueResponseDto } from './dto/routing-approval-queue.dto';
import { RoutingRuleDraftDto, RoutingRuleDraftRequestDto } from './dto/routing-ai.dto';
import { RoutingSettingsDto, UpdateRoutingSettingsDto } from './dto/routing-settings.dto';
import { UpdateRoutingRuleDto } from './dto/update-routing-rule.dto';
import { RoutingAiService } from './routing-ai.service';
import { RoutingService } from './routing.service';
import { RoutingSettingsService } from './routing-settings.service';
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
@UseGuards(JwtAuthGuard)
export class RoutingController {
  constructor(
    private readonly routing: RoutingService,
    private readonly routingAi: RoutingAiService,
    private readonly routingSettings: RoutingSettingsService,
    private readonly permissions: PermissionsService
  ) {}

  @Get('settings')
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingSettingsDto })
  async settings(
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingSettingsDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    await this.permissions.assertBrokerOrTeamLead(ctx.orgId, ctx.userId);
    const result = await this.routingSettings.getSettings({ orgId: ctx.orgId, tenantId: scopedTenantId });
    return {
      mode: result.mode,
      approvalTeamId: result.approvalTeamId,
      approvalTeamName: result.approvalTeamName,
      updatedAt: result.updatedAt ? result.updatedAt.toISOString() : null
    };
  }

  @Patch('settings')
  @UseGuards(RolesGuard('broker'))
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiBody({ type: UpdateRoutingSettingsDto })
  @ApiOkResponse({ type: RoutingSettingsDto })
  async updateSettings(
    @Body() dto: UpdateRoutingSettingsDto,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingSettingsDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    await this.permissions.assertBroker(ctx.orgId, ctx.userId);
    const result = await this.routingSettings.updateSettings({
      orgId: ctx.orgId,
      tenantId: scopedTenantId,
      mode: dto.mode,
      approvalTeamId: dto.approvalTeamId ?? undefined
    });
    return {
      mode: result.mode,
      approvalTeamId: result.approvalTeamId,
      approvalTeamName: result.approvalTeamName,
      updatedAt: result.updatedAt ? result.updatedAt.toISOString() : null
    };
  }

  @Get('approval-queue')
  @UseGuards(RolesGuard('broker'))
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingApprovalQueueResponseDto })
  async approvalQueue(
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingApprovalQueueResponseDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    await this.permissions.assertBroker(ctx.orgId, ctx.userId);
    return this.routingSettings.listApprovalQueue({ tenantId: scopedTenantId, orgId: ctx.orgId });
  }

  @Post('approval-queue/:assignmentId/approve')
  @UseGuards(RolesGuard('broker'))
  @ApiParam({ name: 'assignmentId', description: 'Approval queue assignment id' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiBody({ type: RoutingApprovalDecisionDto })
  @ApiOkResponse({ schema: { type: 'object' } })
  async approveFromQueue(
    @Param('assignmentId') assignmentId: string,
    @Body() dto: RoutingApprovalDecisionDto,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    await this.permissions.assertBroker(ctx.orgId, ctx.userId);
    return this.routingSettings.approveFromQueue({
      tenantId: scopedTenantId,
      orgId: ctx.orgId,
      assignmentId,
      agentId: dto.agentId ?? undefined
    });
  }

  @Post('approval-queue/:assignmentId/reject')
  @UseGuards(RolesGuard('broker'))
  @ApiParam({ name: 'assignmentId', description: 'Approval queue assignment id' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ schema: { type: 'object' } })
  async rejectFromQueue(
    @Param('assignmentId') assignmentId: string,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);
    await this.permissions.assertBroker(ctx.orgId, ctx.userId);
    return this.routingSettings.rejectFromQueue({
      tenantId: scopedTenantId,
      orgId: ctx.orgId,
      assignmentId
    });
  }

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

  @Post('rules/draft')
  @ApiBody({ type: RoutingRuleDraftRequestDto })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: RoutingRuleDraftDto })
  async draftRule(
    @Body() dto: RoutingRuleDraftRequestDto,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<RoutingRuleDraftDto> {
    const ctx = resolveRequestContext(req);
    const scopedTenantId = this.resolveTenantId(ctx, tenantId);

    const draft = await this.routingAi.draftRule({
      tenantId: scopedTenantId,
      prompt: dto.prompt,
      mode: dto.mode,
      defaultTeamId: dto.defaultTeamId,
      fallbackTeamId: dto.fallbackTeamId,
      relaxAgentFilters: dto.relaxAgentFilters
    });

    return draft as RoutingRuleDraftDto;
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
