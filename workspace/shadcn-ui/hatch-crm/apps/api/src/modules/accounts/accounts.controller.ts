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
import type { RequestContext } from '../common/request-context';
import { AccountsService } from './accounts.service';
import { AccountResponseDto, CreateAccountDto, UpdateAccountDto } from './dto';

const parseLimit = (value?: string) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, 200);
};

@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('accounts')
@UseInterceptors(AuditInterceptor)
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  @Permit('accounts', 'read')
  @ApiQuery({ name: 'q', required: false, description: 'Search term to match account names' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of records to return',
    schema: { type: 'integer', minimum: 1, maximum: 200 }
  })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for pagination' })
  @ApiOkResponse({ type: AccountResponseDto, isArray: true })
  async list(
    @Req() req: FastifyRequest,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string
  ) {
    const ctx = resolveRequestContext(req);
    return this.service.list(ctx, {
      q,
      limit: parseLimit(limit),
      cursor: cursor ?? undefined
    });
  }

  @Get(':id')
  @Permit('accounts', 'read')
  @ApiParam({ name: 'id', description: 'Account identifier' })
  @ApiOkResponse({ type: AccountResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx = resolveRequestContext(req);
    return this.service.get(ctx, id);
  }

  @Post()
  @Permit('accounts', 'create')
  @ApiBody({ type: CreateAccountDto })
  @ApiOkResponse({ type: AccountResponseDto })
  async create(@Req() req: FastifyRequest, @Body() dto: CreateAccountDto) {
    const ctx = resolveRequestContext(req);
    return this.service.create(ctx, dto as unknown as Record<string, unknown>);
  }

  @Patch(':id')
  @Permit('accounts', 'update')
  @ApiParam({ name: 'id', description: 'Account identifier' })
  @ApiBody({ type: UpdateAccountDto })
  @ApiOkResponse({ type: AccountResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto
  ) {
    const ctx = resolveRequestContext(req);
    return this.service.update(ctx, id, dto as unknown as Record<string, unknown>);
  }

  @Delete(':id')
  @Permit('accounts', 'delete')
  @ApiParam({ name: 'id', description: 'Account identifier' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Deleted account identifier' } }
    }
  })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string) {
    const ctx: RequestContext = resolveRequestContext(req);
    return this.service.softDelete(ctx, id);
  }
}
