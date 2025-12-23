import { BadRequestException, Controller, ForbiddenException, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common';
import { QuickBooksService } from './quickbooks.service';

@Controller('integrations/quickbooks')
export class QuickBooksController {
  constructor(private readonly qb: QuickBooksService) {}

  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  async authorize(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const ctx = resolveRequestContext(req);
    const queryOrgId = (req.query as Record<string, string | undefined>)?.orgId?.trim() || null;
    if (queryOrgId && ctx.orgId && queryOrgId !== ctx.orgId) {
      throw new ForbiddenException('orgId does not match authenticated organization');
    }
    const orgId = ctx.orgId || queryOrgId || process.env.DEFAULT_ORG_ID || 'org-hatch';
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
    const dashboardBase =
      process.env.DASHBOARD_BASE_URL ||
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:5173/broker';
    const normalized = dashboardBase.replace(/\/+$/, '');
    const target = normalized.endsWith('/broker')
      ? `${normalized}/financials?quickbooks=connected`
      : `${normalized}/broker/financials?quickbooks=connected`;
    return res.redirect(302, target);
  }
}
