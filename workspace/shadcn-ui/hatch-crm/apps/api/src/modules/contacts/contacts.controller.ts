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
import { ListContactsQueryDto } from './dto/list-contacts.dto';
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
  @ApiQuery({
    name: 'tenantId',
    required: false,
    description: 'Tenant context; defaults from request headers when omitted'
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Free text search across name, email, phone, and address'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Page size (default 25, maximum 100)'
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Opaque pagination cursor from a prior response'
  })
  @ApiQuery({
    name: 'stage',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string' } }
  })
  @ApiQuery({
    name: 'ownerId',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string' } }
  })
  @ApiQuery({
    name: 'teamId',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string' } }
  })
  @ApiQuery({
    name: 'tags',
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
  @ApiQuery({ name: 'createdFrom', required: false })
  @ApiQuery({ name: 'createdTo', required: false })
  @ApiQuery({ name: 'lastActivityFrom', required: false })
  @ApiQuery({ name: 'lastActivityTo', required: false })
  @ApiQuery({
    name: 'emailConsent',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string', enum: ['GRANTED', 'REVOKED', 'UNKNOWN'] } }
  })
  @ApiQuery({
    name: 'smsConsent',
    required: false,
    style: 'form',
    explode: false,
    schema: { type: 'array', items: { type: 'string', enum: ['GRANTED', 'REVOKED', 'UNKNOWN'] } }
  })
  @ApiQuery({ name: 'buyerRepStatus', required: false })
  @ApiQuery({ name: 'hasOpenDeal', required: false, schema: { type: 'boolean' } })
  @ApiQuery({ name: 'doNotContact', required: false, schema: { type: 'boolean' } })
  @ApiQuery({ name: 'includeDeleted', required: false, schema: { type: 'boolean' } })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'sortDirection', required: false, schema: { type: 'string', enum: ['asc', 'desc'] } })
  @ApiQuery({ name: 'savedViewId', required: false })
  @ApiOkResponse({ type: ContactListResponseDto })
  async listContacts(
    @Query() query: ListContactsQueryDto,
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
      } catch (error) {
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
}
