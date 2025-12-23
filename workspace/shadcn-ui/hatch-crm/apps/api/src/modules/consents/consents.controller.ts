import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { ConsentsService } from './consents.service';
import { AddConsentDto } from './dto/add-consent.dto';
import { RevokeConsentDto } from './dto/revoke-consent.dto';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common';

@Controller('contacts/:personId/consents')
@UseGuards(JwtAuthGuard)
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Post()
  async addConsent(@Param('personId') personId: string, @Body() dto: AddConsentDto, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    const userAgent = (req.headers['user-agent'] as string | undefined)?.trim();

    return this.consents.addConsent({
      ...dto,
      tenantId: ctx.tenantId,
      personId,
      actorUserId: ctx.userId || dto.actorUserId,
      ip: dto.ip ?? req.ip,
      userAgent: dto.userAgent ?? userAgent
    });
  }

  @Post(':channel/revoke')
  async revokeConsent(
    @Param('personId') personId: string,
    @Param('channel') channel: string,
    @Body() dto: RevokeConsentDto,
    @Req() req: FastifyRequest
  ) {
    const ctx = resolveRequestContext(req);
    return this.consents.revokeConsent({
      ...dto,
      tenantId: ctx.tenantId,
      personId,
      channel: channel.toUpperCase() as any,
      actorUserId: ctx.userId || dto.actorUserId
    });
  }
}
