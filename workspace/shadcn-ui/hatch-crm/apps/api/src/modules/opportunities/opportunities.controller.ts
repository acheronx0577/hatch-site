import {
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
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { resolveRequestContext } from '../common/request-context';
import { OpportunitiesService } from './opportunities.service';
import {
  CreateOpportunityDto,
  OpportunityResponseDto,
  UpdateOpportunityDto
} from './dto';

const parseLimit = (value?: string) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, 200);
};

@ApiTags('Opportunities')
@ApiBearerAuth()
@Controller('opportunities')
@UseInterceptors(AuditInterceptor)
export class OpportunitiesController {
  constructor(private readonly service: OpportunitiesService) {}

  @Get()
  @Permit('opportunities', 'read')
  @ApiQuery({ name: 'q', required: false, description: 'Search term for opportunity names' })
  @ApiQuery({
    name: 'stage',
    required: false,
    description: 'Stage filter',
    schema: { type: 'string' }
  })
  @ApiQuery({
    name: 'accountId',
    required: false,
    description: 'Filter by related account identifier'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of records',
    schema: { type: 'integer', minimum: 1, maximum: 200 }
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for pagination' })
  @ApiOkResponse({ type: OpportunityResponseDto, isArray: true })
  async list(
    @Req() req: FastifyRequest,
    @Query('q') q?: string,
    @Query('stage') stage?: string,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string
  ) {
    const ctx = resolveRequestContext(req);
    return this.service.list(ctx, {
      q,
      stage: stage ?? undefined,
      accountId: accountId ?? undefined,
      limit: parseLimit(limit),
      cursor: cursor ?? undefined
    });
  }

  @Get(':id')
  @Permit('opportunities', 'read')
  @ApiParam({ name: 'id', description: 'Opportunity identifier' })
  @ApiOkResponse({ type: OpportunityResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.service.get(ctx, id);
  }

  @Post()
  @Permit('opportunities', 'create')
  @ApiBody({ type: CreateOpportunityDto })
  @ApiOkResponse({ type: OpportunityResponseDto })
  async create(@Req() req: FastifyRequest, @Body() dto: CreateOpportunityDto) {
    const ctx = resolveRequestContext(req);
    return this.service.create(ctx, dto as unknown as Record<string, unknown>);
  }

  @Patch(':id')
  @Permit('opportunities', 'update')
  @ApiParam({ name: 'id', description: 'Opportunity identifier' })
  @ApiBody({ type: UpdateOpportunityDto })
  @ApiOkResponse({ type: OpportunityResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOpportunityDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.service.update(ctx, id, dto as unknown as Record<string, unknown>);
  }

  @Delete(':id')
  @Permit('opportunities', 'delete')
  @ApiParam({ name: 'id', description: 'Opportunity identifier' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Soft-deleted opportunity id' } }
    }
  })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.service.softDelete(ctx, id);
  }
}
