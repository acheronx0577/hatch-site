import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '../common/request-context';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations.dto';
import { PostMessageDto } from './dto/post-message.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { AddParticipantsDto } from './dto/update-participants.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  async list(@Query() query: ListConversationsQueryDto, @Req() req: FastifyRequest): Promise<unknown> {
    const ctx = resolveRequestContext(req);
    const tenantId = query.tenantId ?? ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.conversations.list({ ...query, tenantId }, ctx);
  }

  @Post()
  async create(@Body() dto: CreateConversationDto, @Req() req: FastifyRequest): Promise<unknown> {
    const ctx = resolveRequestContext(req);
    const tenantId = dto.tenantId ?? ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.conversations.create({ ...dto, tenantId }, ctx);
  }

  @Get(':id')
  async getConversation(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<unknown> {
    const ctx = resolveRequestContext(req);
    const resolvedTenantId = tenantId ?? ctx.tenantId;
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.conversations.get(id, resolvedTenantId, ctx, {
      cursor: cursor ?? null,
      limit: parsedLimit && Number.isFinite(parsedLimit) ? parsedLimit : undefined
    });
  }

  @Post(':id/messages')
  async postMessage(
    @Param('id') id: string,
    @Body() dto: PostMessageDto,
    @Req() req: FastifyRequest
  ): Promise<unknown> {
    const ctx = resolveRequestContext(req);
    const tenantId = dto.tenantId ?? ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.conversations.postMessage(id, { ...dto, tenantId }, ctx);
  }

  @Post(':id/read')
  async markRead(
    @Param('id') id: string,
    @Body() dto: MarkReadDto,
    @Req() req: FastifyRequest
  ): Promise<unknown> {
    const ctx = resolveRequestContext(req);
    const tenantId = dto.tenantId ?? ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.conversations.markRead(id, { ...dto, tenantId }, ctx);
  }

  @Post(':id/participants')
  async addParticipants(
    @Param('id') id: string,
    @Body() dto: AddParticipantsDto,
    @Req() req: FastifyRequest
  ): Promise<unknown> {
    const ctx = resolveRequestContext(req);
    const tenantId = dto.tenantId ?? ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.conversations.addParticipants(id, { ...dto, tenantId }, ctx);
  }

  @Delete(':id/participants/:participantId')
  async removeParticipant(
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Query('tenantId') tenantId: string | undefined,
    @Req() req: FastifyRequest
  ): Promise<unknown> {
    const ctx = resolveRequestContext(req);
    const resolvedTenantId = tenantId ?? ctx.tenantId;
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    await this.conversations.removeParticipant(id, participantId, resolvedTenantId, ctx);
    return { id: participantId };
  }

  @Post(':id/attachments')
  async uploadAttachment(
    @Param('id') id: string,
    @Body() dto: UploadAttachmentDto,
    @Req() req: FastifyRequest
  ): Promise<unknown> {
    const ctx = resolveRequestContext(req);
    const tenantId = dto.tenantId ?? ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.conversations.requestAttachmentUpload(id, { ...dto, tenantId }, ctx);
  }
}
