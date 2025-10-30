import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { MessageChannel } from '@hatch/db';
import type { Message } from '@hatch/db';

import { ApiModule, ApiStandardErrors } from '../common';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import { MessageListResponseDto, MessageResponseDto } from './dto/message-response.dto';
import { MessagesService } from './messages.service';
import { MAX_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';

@ApiModule('Messaging')
@ApiStandardErrors()
@Controller('messages')
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
    @Query('tenantId') tenantId: string | undefined,
    @Query('channel') channel: MessageChannel | undefined,
    @Query('direction') direction: 'INBOUND' | 'OUTBOUND' | undefined,
    @Query('q') q: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined
  ): Promise<MessageListResponseDto> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.messages.listMessages(tenantId, {
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
  async sendSms(@Body() dto: SendSmsDto): Promise<Message> {
    return this.messages.sendSms(dto);
  }

  @Post('email')
  @ApiBody({ type: SendEmailDto })
  @ApiOkResponse({ type: MessageResponseDto })
  async sendEmail(@Body() dto: SendEmailDto): Promise<Message> {
    return this.messages.sendEmail(dto);
  }

  @Post('inbound')
  @ApiBody({ type: InboundMessageDto })
  @ApiOkResponse({ type: MessageResponseDto })
  async ingestInbound(@Body() dto: InboundMessageDto): Promise<Message> {
    return this.messages.ingestInbound(dto);
  }
}
