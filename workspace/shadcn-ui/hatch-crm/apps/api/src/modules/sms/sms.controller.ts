import { Body, Controller, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { MessageChannel } from '@hatch/db';

import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { TwilioWebhookGuard } from '../common/twilio-webhook.guard';
import { TwilioInboundSmsDto } from './dto/twilio-inbound.dto';
import { TwilioStatusCallbackDto } from './dto/twilio-status.dto';

@ApiTags('SMS')
@Controller('sms')
export class SmsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService
  ) {}

  // Twilio Inbound SMS webhook adapter (form-encoded → normalized DTO)
  @Post('inbound')
  @UseGuards(TwilioWebhookGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true
    })
  )
  @ApiBody({ type: TwilioInboundSmsDto })
  @ApiOkResponse({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  async inbound(@Body() dto: TwilioInboundSmsDto) {
    const tenantSlug = dto.tenant;

    await this.messages.ingestInbound({
      channel: MessageChannel.SMS,
      providerId: dto.MessageSid,
      from: dto.From,
      to: dto.To,
      body: dto.Body,
      tenantSlug
    });

    return { status: 'ok' } as const;
  }

  // Twilio delivery status callback (form-encoded)
  @Post('status')
  @UseGuards(TwilioWebhookGuard)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true
    })
  )
  @ApiBody({ type: TwilioStatusCallbackDto })
  @ApiOkResponse({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  async status(@Body() dto: TwilioStatusCallbackDto) {
    const sid = dto.MessageSid;
    const status = dto.MessageStatus?.toLowerCase() ?? '';

    const message = await this.prisma.message.findFirst({
      where: {
        OR: [
          { providerMessageId: sid },
          {
            AND: [
              { channel: 'SMS' },
              { direction: 'OUTBOUND' },
              { toAddress: dto.To },
              { fromAddress: dto.From }
            ]
          }
        ]
      }
    });

    if (message) {
      const patch: any = {};
      if (status === 'delivered') {
        patch.status = 'DELIVERED';
        patch.deliveredAt = new Date();
      } else if (status === 'failed' || status === 'undelivered') {
        patch.status = 'FAILED';
        patch.errorCode = dto.ErrorCode ?? null;
        patch.errorMessage = dto.ErrorMessage ?? null;
      } else if (status === 'sent' || status === 'queued' || status === 'accepted' || status === 'sending') {
        patch.status = 'SENT';
      }

      // Store SID if missing to improve future correlation
      if (!message.providerMessageId) {
        patch.providerMessageId = sid;
      }

      if (Object.keys(patch).length > 0) {
        await this.prisma.message.update({ where: { id: message.id }, data: patch });
      }
    }

    // Always 200 to satisfy Twilio retry behavior
    return { status: 'ok' } as const;
  }
}
