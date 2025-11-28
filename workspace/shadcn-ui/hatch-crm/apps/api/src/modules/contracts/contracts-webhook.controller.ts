import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ContractsDocuSignService } from './contracts.docusign.service';

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
    @Headers('x-docusign-signature-1') signature?: string
  ) {
    const expectedSecret = this.config.get<string>('DOCUSIGN_WEBHOOK_SECRET');
    if (expectedSecret) {
      if (!signature || signature !== expectedSecret) {
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
