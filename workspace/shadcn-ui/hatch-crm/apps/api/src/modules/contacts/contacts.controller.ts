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

import { SavedView } from '@hatch/db';

import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { AuditInterceptor } from '../../platform/audit/audit.interceptor';
import { Permit } from '../../platform/security/permit.decorator';
import { RecordCtx } from '../../platform/security/record-ctx.decorator';
import {
  ContactsService,
  type ContactDetails,
  type ContactListResponse,
  type CreateContactResult
} from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ContactListQueryDto } from './dto/contact-list-query.dto';
import { SaveViewDto } from './dto/save-view.dto';
import { AssignOwnerDto } from './dto/assign-owner.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import {
  ContactDetailsDto,
  ContactListResponseDto,
  SavedViewDto
} from './dto/contact-response.dto';

@ApiModule('Contacts')
@ApiStandardErrors()
@Controller('contacts')
@UseInterceptors(AuditInterceptor)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @Permit('contacts', 'read')
  @ApiQuery({ name: 'q', required: false, description: 'Full-text search across name, email, and phone' })
  @ApiQuery({ name: 'ownerId', required: false, description: 'Filter by owner id' })
  @ApiQuery({ name: 'teamId', required: false, description: 'Filter by team id' })
  @ApiQuery({
    name: 'status',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string' } }
  })
  @ApiQuery({
    name: 'source',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string' } }
  })
  @ApiQuery({
    name: 'consent',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string', enum: ['sms', 'email', 'call'] } }
  })
  @ApiQuery({ name: 'dncBlocked', required: false, schema: { type: 'boolean' } })
  @ApiQuery({ name: 'minScore', required: false, schema: { type: 'number' } })
  @ApiQuery({ name: 'maxAgeDays', required: false, schema: { type: 'number' } })
  @ApiQuery({
    name: 'sort',
    required: false,
    schema: { type: 'string', enum: ['updatedAt:desc', 'updatedAt:asc', 'score:desc', 'score:asc'] }
  })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 200 } })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque pagination cursor' })
  @ApiQuery({ name: 'savedViewId', required: false, description: 'Apply saved view filters' })
  @ApiOkResponse({ type: ContactListResponseDto })
  async listContacts(
    @Query() query: ContactListQueryDto,
    @Req() req: FastifyRequest
  ): Promise<ContactListResponse> {
    const ctx = resolveRequestContext(req);
    return this.contacts.list(query, ctx);
  }

  @Post()
  @Permit('contacts', 'create')
  @ApiBody({ type: CreateContactDto })
  @ApiOkResponse({ type: ContactDetailsDto })
  async createContact(
    @Body() dto: CreateContactDto,
    @Req() req: FastifyRequest
  ): Promise<CreateContactResult> {
    const ctx = resolveRequestContext(req);
    if (!dto.ownerId) {
      dto.ownerId = ctx.userId;
    }
    return this.contacts.create(dto, ctx);
  }

  @Get('views')
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: SavedViewDto, isArray: true })
  async listViews(@Query('tenantId') tenantId: string, @Req() req: FastifyRequest): Promise<SavedView[]> {
    const ctx = resolveRequestContext(req);
    const resolvedTenantId = tenantId ?? ctx.tenantId;
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.contacts.listViews(resolvedTenantId, ctx);
  }

  @Post('views')
  @ApiBody({ type: SaveViewDto })
  @ApiOkResponse({ type: SavedViewDto })
  async saveView(@Body() dto: SaveViewDto, @Req() req: FastifyRequest): Promise<SavedView> {
    const ctx = resolveRequestContext(req);
    let filters: unknown = {};
    if (dto.filters) {
      try {
        filters = JSON.parse(dto.filters);
      } catch {
        throw new BadRequestException('filters must be valid JSON');
      }
    }
    return this.contacts.saveView(dto.tenantId, ctx, {
      name: dto.name,
      filters,
      isDefault: dto.isDefault
    });
  }

  @Delete('views/:id')
  @ApiParam({ name: 'id', description: 'Saved view identifier' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { id: { type: 'string' } }
    }
  })
  async deleteView(@Param('id') id: string, @Query('tenantId') tenantId: string, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    const resolvedTenantId = tenantId ?? ctx.tenantId;
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    await this.contacts.deleteView(id, resolvedTenantId, ctx);
    return { id };
  }

  @Get(':id')
  @Permit('contacts', 'read')
  @ApiParam({ name: 'id', description: 'Contact identifier' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: ContactDetailsDto })
  async getContact(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Req() req: FastifyRequest,
    @RecordCtx() _record?: { orgId?: string; ownerId?: string | null }
  ): Promise<ContactDetails> {
    const ctx = resolveRequestContext(req);
    const resolvedTenantId = tenantId ?? ctx.tenantId;
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.contacts.getById(id, resolvedTenantId, ctx);
  }

  @Patch(':id')
  @Permit('contacts', 'update')
  @ApiParam({ name: 'id', description: 'Contact identifier' })
  @ApiBody({ type: UpdateContactDto })
  @ApiOkResponse({ type: ContactDetailsDto })
  async updateContact(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
    @Req() req: FastifyRequest,
    @RecordCtx() _record?: { orgId?: string; ownerId?: string | null }
  ): Promise<ContactDetails> {
    const ctx = resolveRequestContext(req);
    const tenantId = dto.tenantId ?? ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.contacts.update(id, tenantId, dto, ctx);
  }

  @Delete(':id')
  @Permit('contacts', 'delete')
  @ApiParam({ name: 'id', description: 'Contact identifier' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { id: { type: 'string' } }
    }
  })
  async deleteContact(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    const resolvedTenantId = tenantId ?? ctx.tenantId;
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    await this.contacts.remove(id, resolvedTenantId, ctx);
    return { id };
  }

  @Post(':id/restore')
  @Permit('contacts', 'update')
  @ApiParam({ name: 'id', description: 'Contact identifier' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiOkResponse({ type: ContactDetailsDto })
  async restoreContact(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Req() req: FastifyRequest
  ): Promise<ContactDetails> {
    const ctx = resolveRequestContext(req);
    const resolvedTenantId = tenantId ?? ctx.tenantId;
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.contacts.restore(id, resolvedTenantId, ctx);
  }

  @Post(':id/assign')
  @Permit('contacts', 'update')
  @ApiParam({ name: 'id', description: 'Contact identifier' })
  @ApiBody({ type: AssignOwnerDto })
  @ApiOkResponse({ type: ContactDetailsDto })
  async assignOwner(
    @Param('id') id: string,
    @Body() dto: AssignOwnerDto,
    @Req() req: FastifyRequest
  ): Promise<ContactDetails> {
    const ctx = resolveRequestContext(req);
    const tenantId = dto.tenantId ?? ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.contacts.assignOwner(id, tenantId, dto.ownerId, { notify: dto.notify ?? false, reason: dto.reason }, ctx);
  }

  @Post(':id/convert-to-opportunity')
  @Permit('contacts', 'update')
  @ApiParam({ name: 'id', description: 'Contact identifier' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        opportunityName: { type: 'string' },
        accountName: { type: 'string' }
      }
    }
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        opportunity: { type: 'object' },
        account: { type: 'object' },
        message: { type: 'string' }
      }
    }
  })
  async convertToOpportunity(
    @Param('id') id: string,
    @Body() dto: { opportunityName?: string; accountName?: string },
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    return this.contacts.convertToOpportunity(id, ctx, dto);
  }
}
