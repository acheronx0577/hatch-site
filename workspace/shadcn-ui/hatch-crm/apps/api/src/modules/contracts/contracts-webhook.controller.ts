import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import crypto from 'crypto';

import { ContractsDocuSignService } from './contracts.docusign.service';

const constantTimeEquals = (a: string, b: string) => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
};

@Controller('contracts/webhooks')
export class ContractsWebhookController {
  constructor(
    private readonly docusign: ContractsDocuSignService,
    private readonly config: ConfigService
  ) {}

  @Post('docusign')
  @HttpCode(200)
  async handleDocuSignWebhook(
    @Body() body: any,
    @Req() req: FastifyRequest & { rawBody?: string },
    @Headers('x-docusign-signature-1') signature?: string
  ) {
    const expectedSecret = this.config.get<string>('DOCUSIGN_WEBHOOK_SECRET');
    if (expectedSecret) {
      const provided = (signature ?? '').trim();
      const rawBody = typeof req.rawBody === 'string' ? req.rawBody : null;

      const valid =
        (provided && constantTimeEquals(provided, expectedSecret)) ||
        (provided &&
          rawBody &&
          constantTimeEquals(
            provided,
            crypto.createHmac('sha256', expectedSecret).update(rawBody).digest('base64')
          ));

      if (!valid) {
        throw new UnauthorizedException('Invalid DocuSign webhook signature');
      }
    }

    const envelopeId = body?.envelopeId ?? body?.envelopeSummary?.envelopeId ?? body?.data?.envelopeId;
    const rawStatus = body?.status ?? body?.envelopeStatus ?? body?.data?.status ?? body?.envelopeSummary?.status;

    if (!envelopeId || !rawStatus) {
      return { ok: true, ignored: true };
    }

    const status = String(rawStatus).toLowerCase();
    const isFinal = ['completed', 'voided', 'declined'].includes(status);

    await this.docusign.handleEnvelopeStatusUpdate({
      envelopeId,
      status,
      isFinal
    });

    return { ok: true };
  }
}
