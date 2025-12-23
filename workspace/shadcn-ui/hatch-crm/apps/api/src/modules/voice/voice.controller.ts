// apps/api/src/modules/voice/voice.controller.ts

import { BadRequestException, Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IsOptional, IsString, Matches } from 'class-validator';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common';
import { TwilioWebhookGuard } from '@/modules/common/twilio-webhook.guard';

import { VoiceService } from './voice.service';

class StartCallDto {
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/)
  to!: string; // E.164, e.g. +16465550123

  @IsOptional()
  @IsString()
  tenantId?: string; // optional, you can also derive from auth
}

@Controller('voice')
export class VoiceController {
  // Protected by auth: agents/brokers can trigger calls from the CRM
  @Post('call')
  @UseGuards(JwtAuthGuard)
  async startCall(@Body() body: StartCallDto, @Req() req: FastifyRequest) {
    const { to } = body;
    if (!to || typeof to !== 'string') {
      throw new BadRequestException("Missing 'to' phone number.");
    }

    const ctx = resolveRequestContext(req);
    const tenantId = body.tenantId ?? ctx.tenantId;

    // Optional: validate E.164 format here
    const result = await VoiceService.startCall({ to, tenantId });

    if (!result.success) {
      throw new BadRequestException('Failed to start call via Twilio Voice.');
    }

    return { success: true, sid: result.sid };
  }

  // Twilio "Answer URL" — returns TwiML telling Twilio what to do on the call
  // In Twilio, set Answer URL to: https://api.findyourhatch.com/voice/twiml
  @Post('twiml')
  @UseGuards(TwilioWebhookGuard)
  async handleTwiml(@Res() reply: FastifyReply) {
    // For MVP: just say a short message.
    // Later, we can <Dial> an agent, start a recording, etc.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="alice">This is Hatch calling on behalf of your agent. They will join shortly.</Say>\n</Response>`;

    reply.type('text/xml').send(twiml);
  }

  // Allow GET as well since Twilio may request TwiML via GET depending on config
  @Get('twiml')
  async handleTwimlGet(@Res() reply: FastifyReply) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice=\"alice\">This is Hatch calling on behalf of your agent. They will join shortly.</Say>\n</Response>`;
    reply.type('text/xml').send(twiml);
  }

  // Twilio Status Callback — logs lifecycle and error codes for troubleshooting
  @Post('status')
  @UseGuards(TwilioWebhookGuard)
  async handleStatus(@Body() body: Record<string, any>, @Res() reply: FastifyReply) {
    const sid = body.CallSid ?? body.CallSid?.toString?.();
    const status = body.CallStatus ?? body.CallStatus?.toString?.();
    const to = body.To ?? body.To?.toString?.();
    const from = body.From ?? body.From?.toString?.();
    const errorCode = body.ErrorCode ?? body.ErrorCode?.toString?.();
    const answeredBy = body.AnsweredBy ?? body.AnsweredBy?.toString?.();
    // eslint-disable-next-line no-console
    console.log('📟 [Twilio Status]', { sid, status, to, from, errorCode, answeredBy });
    reply.status(200).send('OK');
  }
}
