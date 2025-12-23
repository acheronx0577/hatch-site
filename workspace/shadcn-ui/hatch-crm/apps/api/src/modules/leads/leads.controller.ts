import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseInterceptors
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { RecordCtx } from '../../platform/security/record-ctx.decorator';
import { LeadType } from '@hatch/db';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { CreateLeadTaskDto } from './dto/create-lead-task.dto';
import { CreateLeadTouchpointDto } from './dto/create-lead-touchpoint.dto';
import { IdentifyLeadDto } from './dto/identify-lead.dto';
import { ListLeadsQueryDto } from './dto/list-leads.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadTaskDto } from './dto/update-lead-task.dto';
import {
  LeadDetailDto,
  LeadListResponseDto,
  LeadNoteDto,
  LeadTaskDto,
  LeadTouchpointDto
} from './dto/lead-response.dto';
import { LeadsService } from './leads.service';
import { LeadScoringService } from './scoring.service';
import { LeadScoringProducer } from './lead-scoring.queue';
import { PrismaService } from '../prisma/prisma.service';

@ApiModule('Leads')
@ApiStandardErrors()
@Controller('leads')
@UseInterceptors(AuditInterceptor)
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly prisma: PrismaService,
    private readonly scoring: LeadScoringService,
    private readonly scoringProducer: LeadScoringProducer
  ) {}

  @Get()
  @Permit('leads', 'read')
  @ApiQuery({ name: 'q', required: false, description: 'Free text search across lead name, email, or phone' })
  @ApiQuery({ name: 'ownerId', required: false })
  @ApiQuery({
    name: 'stageId',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string' } }
  })
  @ApiQuery({
    name: 'scoreTier',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string', enum: ['A', 'B', 'C', 'D'] } }
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Page size (default 25, maximum 100)'
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor from previous response' })
  @ApiQuery({
    name: 'lastActivityDays',
    required: false,
    schema: { type: 'integer', enum: [7, 14, 30] },
    description: 'Filter leads that had activity within the provided window'
  })
  @ApiQuery({
    name: 'preapproved',
    required: false,
    schema: { type: 'boolean' },
    description: 'Filter by preapproval status'
  })
  @ApiQuery({ name: 'pipelineId', required: false })
  @ApiQuery({ name: 'leadType', required: false, enum: LeadType, description: 'Filter by buyer/seller orientation' })
  @ApiOkResponse({ type: LeadListResponseDto })
  async listLeads(@Query() query: ListLeadsQueryDto, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.leads.list(query, ctx);
  }

  @Post()
  @Permit('leads', 'create')
  @ApiBody({ type: CreateLeadDto })
  @ApiOkResponse({ type: LeadDetailDto })
  async createLead(@Body() dto: CreateLeadDto, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.leads.create(dto, ctx);
  }

  @Get(':id')
  @Permit('leads', 'read')
  @ApiParam({ name: 'id', description: 'Lead identifier' })
  @ApiOkResponse({ type: LeadDetailDto })
  async getLead(
    @Param('id') id: string,
    @Req() req: FastifyRequest,
    @RecordCtx() _record?: { orgId?: string; ownerId?: string | null }
  ) {
    const ctx = resolveRequestContext(req);
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }
    return this.leads.getById(id, ctx.tenantId);
  }

  @Patch(':id')
  @Permit('leads', 'update')
  @ApiParam({ name: 'id', description: 'Lead identifier' })
  @ApiBody({ type: UpdateLeadDto })
  @ApiOkResponse({ type: LeadDetailDto })
  async updateLead(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @Req() req: FastifyRequest,
    @RecordCtx() _record?: { orgId?: string; ownerId?: string | null }
  ) {
    const ctx = resolveRequestContext(req);
    return this.leads.update(id, dto, ctx);
  }

  @Post(':id/notes')
  @Permit('leads', 'update')
  @ApiParam({ name: 'id', description: 'Lead identifier' })
  @ApiBody({ type: CreateLeadNoteDto })
  @ApiOkResponse({ type: LeadNoteDto })
  async addNote(
    @Param('id') id: string,
    @Body() dto: CreateLeadNoteDto,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    return this.leads.addNote(id, dto, ctx);
  }

  @Post(':id/tasks')
  @Permit('leads', 'update')
  @ApiParam({ name: 'id', description: 'Lead identifier' })
  @ApiBody({ type: CreateLeadTaskDto })
  @ApiOkResponse({ type: LeadTaskDto })
  async addTask(
    @Param('id') id: string,
    @Body() dto: CreateLeadTaskDto,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    return this.leads.addTask(id, dto, ctx);
  }

  @Post(':id/touchpoints')
  @Permit('leads', 'update')
  @ApiParam({ name: 'id', description: 'Lead identifier' })
  @ApiBody({ type: CreateLeadTouchpointDto })
  @ApiOkResponse({ type: LeadTouchpointDto })
  async addTouchpoint(
    @Param('id') id: string,
    @Body() dto: CreateLeadTouchpointDto,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    return this.leads.recordTouchpoint(id, dto, ctx);
  }

  @Patch(':leadId/tasks/:taskId')
  @Permit('leads', 'update')
  @ApiParam({ name: 'leadId', description: 'Lead identifier' })
  @ApiParam({ name: 'taskId', description: 'Lead task identifier' })
  @ApiBody({ type: UpdateLeadTaskDto })
  @ApiOkResponse({ type: LeadTaskDto })
  async updateTask(
    @Param('leadId') leadId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateLeadTaskDto,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    return this.leads.updateTask(leadId, taskId, dto, ctx);
  }

  @Post(':id/identify')
  @Permit('leads', 'update')
  @ApiParam({ name: 'id', description: 'Lead identifier' })
  @ApiBody({ type: IdentifyLeadDto })
  @ApiOkResponse({ type: LeadDetailDto })
  async identifyLead(
    @Param('id') id: string,
    @Body() dto: IdentifyLeadDto,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    return this.leads.identify(id, dto, ctx);
  }

  @Get(':id/score/v2')
  @Permit('leads', 'read')
  async getLeadScoreV2(@Param('id') id: string, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    const existing = await this.prisma.leadScoreV2.findUnique({
      where: { leadId: id }
    });

    if (existing) {
      return { score: existing.score, factors: existing.factors };
    }

    return this.scoring.scoreLead(ctx.tenantId, id);
  }

  @Post(':id/score/v2/recalc')
  @Permit('leads', 'update')
  async recalcLeadScoreV2(
    @Param('id') id: string,
    @Req() req: FastifyRequest,
    @Body() body?: { async?: boolean }
  ) {
    const ctx = resolveRequestContext(req);
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    if (body?.async) {
      await this.scoringProducer.enqueue(ctx.tenantId, id);
      return { queued: true };
    }

    return this.scoring.scoreLead(ctx.tenantId, id);
  }
}
