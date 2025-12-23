import { Body, Controller, ForbiddenException, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Agreement } from '@hatch/db';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '@/modules/common';
import { AgreementsService } from './agreements.service';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { SignAgreementDto } from './dto/sign-agreement.dto';

@Controller('agreements')
@UseGuards(JwtAuthGuard)
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Post()
  async create(@Req() req: FastifyRequest, @Body() dto: CreateAgreementDto): Promise<Agreement> {
    const ctx = resolveRequestContext(req);
    if (dto.tenantId && ctx.tenantId && dto.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    return this.agreements.create({ ...dto, tenantId: ctx.tenantId ?? dto.tenantId });
  }

  @Post(':id/sign')
  async sign(@Req() req: FastifyRequest, @Param('id') id: string, @Body() dto: SignAgreementDto): Promise<Agreement> {
    const ctx = resolveRequestContext(req);
    if (dto.tenantId && ctx.tenantId && dto.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    if (dto.actorUserId && ctx.userId && dto.actorUserId !== ctx.userId) {
      throw new ForbiddenException('actorUserId does not match authenticated user');
    }
    return this.agreements.sign(id, {
      ...dto,
      tenantId: ctx.tenantId ?? dto.tenantId,
      actorUserId: ctx.userId ?? dto.actorUserId
    });
  }
}
