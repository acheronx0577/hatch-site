import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { MessageChannel } from '@hatch/db';
import type { Message } from '@hatch/db';
import type { FastifyRequest } from 'fastify';

import { ApiModule, ApiStandardErrors } from '../common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { MessageListResponseDto, MessageResponseDto } from './dto/message-response.dto';
import { MessagesService } from './messages.service';
import { MAX_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';

@ApiModule('Messaging')
@ApiStandardErrors()
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({
    name: 'channel',
    required: false,
    enum: Object.values(MessageChannel)
  })
  @ApiQuery({
    name: 'direction',
    required: false,
    enum: ['INBOUND', 'OUTBOUND']
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Free-text search across subject, body, to/from addresses'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE }
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Opaque cursor pointing to the next window'
  })
  @ApiOkResponse({ type: MessageListResponseDto })
  async listMessages(
    @Req() req: FastifyRequest & { user?: Record<string, unknown> },
    @Query('tenantId') tenantId: string | undefined,
    @Query('channel') channel: MessageChannel | undefined,
    @Query('direction') direction: 'INBOUND' | 'OUTBOUND' | undefined,
    @Query('q') q: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined
  ): Promise<MessageListResponseDto> {
    const authTenantId = typeof req.user?.tenantId === 'string' ? req.user.tenantId : null;
    const effectiveTenantId = authTenantId ?? tenantId ?? null;
    if (!effectiveTenantId) {
      throw new BadRequestException('tenantId is required');
    }
    if (authTenantId && tenantId && tenantId !== authTenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }

    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.messages.listMessages(effectiveTenantId, {
      channel,
      direction,
      q,
      cursor,
      limit: Number.isFinite(parsedLimit ?? NaN) ? (parsedLimit as number) : undefined
    });
  }

  @Post('sms')
  @ApiBody({ type: SendSmsDto })
  @ApiOkResponse({ type: MessageResponseDto })
  async sendSms(@Req() req: FastifyRequest & { user?: Record<string, unknown> }, @Body() dto: SendSmsDto): Promise<Message> {
    const authUserId =
      (typeof req.user?.userId === 'string' ? req.user.userId : null) ??
      (typeof req.user?.sub === 'string' ? req.user.sub : null);
    const authTenantId = typeof req.user?.tenantId === 'string' ? req.user.tenantId : null;

    if (authUserId && dto.userId && dto.userId !== authUserId) {
      throw new ForbiddenException('userId does not match authenticated user');
    }
    if (authTenantId && dto.tenantId && dto.tenantId !== authTenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }

    return this.messages.sendSms({
      ...dto,
      userId: authUserId ?? dto.userId,
      tenantId: authTenantId ?? dto.tenantId
    });
  }

  @Post('email')
  @ApiBody({ type: SendEmailDto })
  @ApiOkResponse({ type: MessageResponseDto })
  async sendEmail(@Req() req: FastifyRequest & { user?: Record<string, unknown> }, @Body() dto: SendEmailDto): Promise<Message> {
    const authUserId =
      (typeof req.user?.userId === 'string' ? req.user.userId : null) ??
      (typeof req.user?.sub === 'string' ? req.user.sub : null);
    const authTenantId = typeof req.user?.tenantId === 'string' ? req.user.tenantId : null;

    if (authUserId && dto.userId && dto.userId !== authUserId) {
      throw new ForbiddenException('userId does not match authenticated user');
    }
    if (authTenantId && dto.tenantId && dto.tenantId !== authTenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }

    return this.messages.sendEmail({
      ...dto,
      userId: authUserId ?? dto.userId,
      tenantId: authTenantId ?? dto.tenantId
    });
  }

  @Post('inbound')
  @ApiBody({ type: InboundMessageDto })
  @ApiOkResponse({ type: MessageResponseDto })
  async ingestInbound(@Body() dto: InboundMessageDto): Promise<Message> {
    return this.messages.ingestInbound(dto);
  }
}
