import { BadRequestException, Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { QuickBooksService } from './quickbooks.service';

@Controller('integrations/quickbooks')
export class QuickBooksController {
  constructor(private readonly qb: QuickBooksService) {}

  @Get('authorize')
  async authorize(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const orgId =
      (req.query as Record<string, string | undefined>)?.orgId ||
      (req.headers['x-org-id'] as string | undefined)?.trim() ||
      process.env.DEFAULT_ORG_ID ||
      'org-hatch';
    const url = this.qb.buildAuthorizeUrl(orgId);
    return res.redirect(302, url);
  }

  @Get('callback')
  async callback(
    @Req() req: FastifyRequest,
    @Query('state') state: string,
    @Query('realmId') realmId: string,
    @Res() res: FastifyReply
  ) {
    if (!state || !realmId) {
      throw new BadRequestException('Missing state or realmId');
    }
    const orgId = this.qb.parseAndVerifyState(state);
    const host = req.headers['host'];
    const protocol = (req.headers['x-forwarded-proto'] as string) ?? (req.protocol as string) ?? 'http';
    const fullUrl = `${protocol}://${host}${req.raw.url}`;
    const { tokenJson } = await this.qb.handleCallback(fullUrl, realmId);
    await this.qb.saveTokens(orgId, realmId, tokenJson);
    const frontendBase =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.FRONTEND_URL ||
      'http://localhost:5173';
    const target = `${frontendBase.replace(/\/$/, '')}/broker/financials?quickbooks=connected`;
    return res.redirect(302, target);
  }
}
