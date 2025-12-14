import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { UserRole } from '@hatch/db';

import { isAiEmployeesEnabled } from '@/config/ai-employees.config';
import { ApiModule, ApiStandardErrors, OrgAdminGuard, resolveRequestContext } from '@/modules/common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { AuditInterceptor } from '@/platform/audit/audit.interceptor';
import { Permit } from '@/platform/security/permit.decorator';
import { AiEmployeesService } from './ai-employees.service';
import {
  AdminAiEmployeeTemplateUpdateDto,
  AiEmployeeActionDto,
  AiEmployeeActionReviewDto,
  AiEmployeeChatRequestDto,
  AiEmployeeChatResponseDto,
  AiEmployeeInstanceDto,
  AiEmployeeInstanceUpdateDto,
  AiEmployeeTemplateDto,
  AiEmployeeUsageStatsDto
} from './dto/ai-employee.dto';
import { RunPersonaDto } from './dto/run-persona.dto';
import { AiPersonaId } from './personas/registry';

@Controller('ai/employees')
@ApiModule('AI Employees')
@ApiStandardErrors()
@UseInterceptors(AuditInterceptor)
export class AiEmployeesController {
  private readonly log = new Logger(AiEmployeesController.name);

  constructor(private readonly service: AiEmployeesService) {}

  private ensureAiEmployeesEnabled() {
    if (!isAiEmployeesEnabled()) {
      this.log.warn('AI Employees request blocked because the feature is disabled');
      throw new ServiceUnavailableException('AI Employees are disabled in this environment.');
    }
  }

  @Get('templates')
  @Permit('ai_employees', 'read')
  @ApiOkResponse({ type: AiEmployeeTemplateDto, isArray: true })
  async listTemplates(@Req() req: FastifyRequest) {
    this.ensureAiEmployeesEnabled();
    const ctx = resolveRequestContext(req);
    return this.service.listTemplates(ctx);
  }

  @Get('instances')
  @Permit('ai_employees', 'read')
  @ApiOkResponse({ type: AiEmployeeInstanceDto, isArray: true })
  async listInstances(@Req() req: FastifyRequest) {
    this.ensureAiEmployeesEnabled();
    const ctx = resolveRequestContext(req);
    return this.service.listInstances(ctx);
  }

  @Get('usage')
  @Permit('ai_employees', 'read')
  @ApiOkResponse({ type: AiEmployeeUsageStatsDto, isArray: true })
  async getUsage(
    @Req() req: FastifyRequest,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    this.ensureAiEmployeesEnabled();
    const ctx = resolveRequestContext(req);
    // Avoid 403 spam in the browser console for non-admin users. Usage stats are optional UI sugar.
    if (ctx.role !== UserRole.BROKER) {
      return [];
    }
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException('Invalid from date');
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid to date');
    }
    return this.service.getUsageStatsForTenant(ctx.tenantId, fromDate, toDate);
  }

  @Patch('templates/:id')
  @Permit('ai_employees', 'update')
  @UseGuards(OrgAdminGuard)
  @ApiParam({ name: 'id', description: 'Template identifier' })
  @ApiBody({ type: AdminAiEmployeeTemplateUpdateDto })
  @ApiOkResponse({ type: AiEmployeeTemplateDto })
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: AdminAiEmployeeTemplateUpdateDto,
    @Req() req: FastifyRequest
  ) {
    this.ensureAiEmployeesEnabled();
    const ctx = resolveRequestContext(req);
    return this.service.updateTemplate(id, ctx, dto);
  }

  @Patch('instances/:id')
  @Permit('ai_employees', 'update')
  @UseGuards(OrgAdminGuard)
  @ApiParam({ name: 'id', description: 'Instance identifier' })
  @ApiBody({ type: AiEmployeeInstanceUpdateDto })
  @ApiOkResponse({ type: AiEmployeeInstanceDto })
  async updateInstance(
    @Param('id') id: string,
    @Body() dto: AiEmployeeInstanceUpdateDto,
    @Req() req: FastifyRequest
  ) {
    this.ensureAiEmployeesEnabled();
    const ctx = resolveRequestContext(req);
    return this.service.updateInstanceAutoMode(id, ctx, dto);
  }

  @Get('actions')
  @Permit('ai_actions', 'read')
  @ApiOkResponse({ type: AiEmployeeActionDto, isArray: true })
  async listActions(@Req() req: FastifyRequest) {
    this.ensureAiEmployeesEnabled();
    const ctx = resolveRequestContext(req);
    return this.service.listActions(ctx);
  }

  @Post(':id/chat')
  @Permit('ai_employees', 'update')
  @ApiParam({ name: 'id', description: 'AI employee instance id' })
  @ApiBody({ type: AiEmployeeChatRequestDto })
  @ApiOkResponse({ type: AiEmployeeChatResponseDto })
  async chat(@Param('id') id: string, @Body() dto: AiEmployeeChatRequestDto, @Req() req: FastifyRequest) {
    this.ensureAiEmployeesEnabled();
    const ctx = resolveRequestContext(req);
    return this.service.sendMessage({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      employeeInstanceId: id,
      userId: ctx.userId,
      actorRole: ctx.role,
      channel: dto.channel ?? 'web_chat',
      contextType: dto.contextType,
      contextId: dto.contextId,
      message: dto.message
    });
  }

  @Post('actions/:id/approve')
  @Permit('ai_actions', 'update')
  @ApiParam({ name: 'id', description: 'Action identifier' })
  @ApiBody({ type: AiEmployeeActionReviewDto })
  @ApiOkResponse({ type: AiEmployeeActionDto })
  async approve(
    @Param('id') id: string,
    @Body() dto: AiEmployeeActionReviewDto,
    @Req() req: FastifyRequest
  ) {
    this.ensureAiEmployeesEnabled();
    const ctx = resolveRequestContext(req);
    return this.service.approveAction(id, ctx.userId, ctx.tenantId, ctx.orgId, dto.note);
  }

  @Post('actions/:id/reject')
  @Permit('ai_actions', 'update')
  @ApiParam({ name: 'id', description: 'Action identifier' })
  @ApiBody({ type: AiEmployeeActionReviewDto })
  @ApiOkResponse({ type: AiEmployeeActionDto })
  async reject(
    @Param('id') id: string,
    @Body() dto: AiEmployeeActionReviewDto,
    @Req() req: FastifyRequest
  ) {
    this.ensureAiEmployeesEnabled();
    const ctx = resolveRequestContext(req);
    return this.service.rejectAction(id, ctx.userId, ctx.tenantId, ctx.orgId, dto.note);
  }
}

@Controller('organizations/:orgId/ai-employees')
@ApiModule('AI Employees')
@ApiStandardErrors()
@UseGuards(JwtAuthGuard)
export class OrgAiEmployeesController {
  constructor(
    private readonly service: AiEmployeesService,
    private readonly prisma: PrismaService
  ) {}

  @Get('personas')
  listPersonas() {
    return this.service.listPersonas();
  }

  @Post(':personaId/run')
  async runPersona(
    @Param('orgId') orgId: string,
    @Param('personaId') personaId: AiPersonaId,
    @Body() dto: RunPersonaDto,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    if (!ctx.userId) {
      throw new UnauthorizedException('Missing user context');
    }
    let agentProfileId = dto.agentProfileId;
    if (!agentProfileId && ctx.role?.toUpperCase() === 'AGENT') {
      const profile = await this.prisma.agentProfile.findFirst({
        where: { organizationId: orgId, userId: ctx.userId },
        select: { id: true }
      });
      agentProfileId = profile?.id ?? undefined;
    }

    return this.service.runPersona(personaId, {
      organizationId: orgId,
      userId: ctx.userId,
      agentProfileId,
      input: dto.input ?? null
    });
  }
}
