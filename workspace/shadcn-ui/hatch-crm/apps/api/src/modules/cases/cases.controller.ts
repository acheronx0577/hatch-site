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
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { resolveRequestContext } from '../common/request-context';
import { CasesService } from './cases.service';
import {
  CaseListResponseDto,
  CaseResponseDto,
  CreateCaseDto,
  UpdateCaseDto
} from './dto';

interface ListQuery {
  q?: string;
  status?: string;
  priority?: string;
  limit?: string;
  cursor?: string;
}

@ApiTags('Cases')
@ApiBearerAuth()
@ApiExtraModels(CaseListResponseDto)
@Controller('cases')
@UseInterceptors(AuditInterceptor)
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  @Permit('cases', 'read')
  @ApiQuery({ name: 'q', required: false, description: 'Search text for case subjects' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['New', 'Working', 'Escalated', 'Resolved', 'Closed']
  })
  @ApiQuery({ name: 'priority', required: false, enum: ['Low', 'Medium', 'High', 'Urgent'] })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 200 }
  })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOkResponse({ type: CaseListResponseDto })
  async list(@Req() req: FastifyRequest, @Query() query: ListQuery) {
    const ctx = resolveRequestContext(req);
    const { items, nextCursor } = await this.cases.list(ctx, {
      q: query.q?.trim(),
      status: query.status,
      priority: query.priority,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor
    });
    return { items, nextCursor };
  }

  @Get(':id')
  @Permit('cases', 'read')
  @ApiParam({ name: 'id', description: 'Case identifier' })
  @ApiOkResponse({ type: CaseResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.cases.get(ctx, id);
  }

  @Post()
  @Permit('cases', 'create')
  @ApiBody({ type: CreateCaseDto })
  @ApiOkResponse({ type: CaseResponseDto })
  async create(@Req() req: FastifyRequest, @Body() dto: CreateCaseDto) {
    const ctx = resolveRequestContext(req);
    return this.cases.create(ctx, dto);
  }

  @Patch(':id')
  @Permit('cases', 'update')
  @ApiParam({ name: 'id', description: 'Case identifier' })
  @ApiBody({ type: UpdateCaseDto })
  @ApiOkResponse({ type: CaseResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCaseDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.cases.update(ctx, id, dto);
  }

  @Delete(':id')
  @Permit('cases', 'delete')
  @ApiParam({ name: 'id', description: 'Case identifier' })
  @ApiOkResponse({
    schema: { type: 'object', properties: { id: { type: 'string' } } }
  })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.cases.remove(ctx, id);
  }
}
