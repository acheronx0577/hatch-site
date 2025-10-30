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
  UseInterceptors
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { RulesService } from './rules.service';
import {
  AssignmentRulePayloadDto,
  RuleQueryDto,
  RuleRecordDto,
  RuleListResponseDto,
  UpdateAssignmentRuleDto,
  UpdateValidationRuleDto,
  ValidationRulePayloadDto
} from './dto';

@ApiModule('Rules Admin')
@ApiStandardErrors()
@Controller('admin/rules')
@UseInterceptors(AuditInterceptor)
export class AdminRulesController {
  constructor(private readonly rules: RulesService) {}

  @Get('validation')
  @Permit('rules', 'read')
  @ApiQuery({ name: 'object', required: false, enum: ['accounts', 'opportunities', 'cases', 're_offers', 're_transactions'] })
  @ApiQuery({ name: 'q', required: false, description: 'Search rules by name' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Page size (default 25, maximum 100)'
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque pagination cursor from a prior response' })
  @ApiOkResponse({ type: RuleListResponseDto })
  async listValidation(@Req() req: FastifyRequest, @Query() query: RuleQueryDto) {
    const ctx = resolveRequestContext(req);
    if (!ctx.orgId) {
      return { items: [], nextCursor: null };
    }
    return this.rules.listValidation(ctx.orgId, query);
  }

  @Post('validation')
  @Permit('rules', 'create')
  @ApiBody({ type: ValidationRulePayloadDto })
  @ApiOkResponse({ type: RuleRecordDto })
  async createValidation(@Req() req: FastifyRequest, @Body() dto: ValidationRulePayloadDto) {
    const ctx = resolveRequestContext(req);
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const created = await this.rules.createValidationRule({
      orgId: ctx.orgId,
      object: dto.object,
      name: dto.name,
      active: dto.active ?? true,
      dsl: dto.dsl
    });

    (req as any).auditObject = 'rules.validation';
    (req as any).auditRecordId = created.id;

    return created;
  }

  @Patch('validation/:id')
  @Permit('rules', 'update')
  @ApiParam({ name: 'id', description: 'Validation rule identifier' })
  @ApiBody({ type: UpdateValidationRuleDto })
  @ApiOkResponse({ type: RuleRecordDto })
  async updateValidation(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateValidationRuleDto
  ) {
    const ctx = resolveRequestContext(req);
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const updated = await this.rules.updateValidationRule(ctx.orgId, id, {
      object: dto.object,
      name: dto.name,
      active: dto.active,
      dsl: dto.dsl
    });

    (req as any).auditObject = 'rules.validation';
    (req as any).auditRecordId = updated.id;

    return updated;
  }

  @Delete('validation/:id')
  @Permit('rules', 'delete')
  @ApiParam({ name: 'id', description: 'Validation rule identifier' })
  @ApiOkResponse({
    schema: { type: 'object', properties: { id: { type: 'string' } } }
  })
  async deleteValidation(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const removed = await this.rules.deleteValidationRule(ctx.orgId, id);

    (req as any).auditObject = 'rules.validation';
    (req as any).auditRecordId = removed.id;

    return { id: removed.id };
  }

  @Get('assignment')
  @Permit('rules', 'read')
  @ApiQuery({ name: 'object', required: false, enum: ['accounts', 'opportunities', 'cases', 're_offers', 're_transactions'] })
  @ApiQuery({ name: 'q', required: false, description: 'Search rules by name' })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Page size (default 25, maximum 100)'
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque pagination cursor from a prior response' })
  @ApiOkResponse({ type: RuleListResponseDto })
  async listAssignment(@Req() req: FastifyRequest, @Query() query: RuleQueryDto) {
    const ctx = resolveRequestContext(req);
    if (!ctx.orgId) {
      return { items: [], nextCursor: null };
    }
    return this.rules.listAssignment(ctx.orgId, query);
  }

  @Post('assignment')
  @Permit('rules', 'create')
  @ApiBody({ type: AssignmentRulePayloadDto })
  @ApiOkResponse({ type: RuleRecordDto })
  async createAssignment(@Req() req: FastifyRequest, @Body() dto: AssignmentRulePayloadDto) {
    const ctx = resolveRequestContext(req);
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const created = await this.rules.createAssignmentRule({
      orgId: ctx.orgId,
      object: dto.object,
      name: dto.name,
      active: dto.active ?? true,
      dsl: dto.dsl
    });

    (req as any).auditObject = 'rules.assignment';
    (req as any).auditRecordId = created.id;

    return created;
  }

  @Patch('assignment/:id')
  @Permit('rules', 'update')
  @ApiParam({ name: 'id', description: 'Assignment rule identifier' })
  @ApiBody({ type: UpdateAssignmentRuleDto })
  @ApiOkResponse({ type: RuleRecordDto })
  async updateAssignment(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentRuleDto
  ) {
    const ctx = resolveRequestContext(req);
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const updated = await this.rules.updateAssignmentRule(ctx.orgId, id, {
      object: dto.object,
      name: dto.name,
      active: dto.active,
      dsl: dto.dsl
    });

    (req as any).auditObject = 'rules.assignment';
    (req as any).auditRecordId = updated.id;

    return updated;
  }

  @Delete('assignment/:id')
  @Permit('rules', 'delete')
  @ApiParam({ name: 'id', description: 'Assignment rule identifier' })
  @ApiOkResponse({
    schema: { type: 'object', properties: { id: { type: 'string' } } }
  })
  async deleteAssignment(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const removed = await this.rules.deleteAssignmentRule(ctx.orgId, id);

    (req as any).auditObject = 'rules.assignment';
    (req as any).auditRecordId = removed.id;

    return { id: removed.id };
  }
}
