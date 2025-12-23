import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '../common/request-context';
import { TeamService } from './team.service';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';

@Controller('team')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  async list(@Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    return this.team.list(ctx.tenantId);
  }

  @Post()
  async create(@Body() dto: CreateTeamMemberDto, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    if (dto.tenantId && ctx.tenantId && dto.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    return this.team.create({
      ...dto,
      tenantId: ctx.tenantId ?? dto.tenantId
    });
  }

  @Patch(':id')
  async update(@Req() req: FastifyRequest, @Param('id') id: string, @Body() dto: UpdateTeamMemberDto) {
    const ctx = resolveRequestContext(req);
    if (dto.tenantId && ctx.tenantId && dto.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    return this.team.update(id, { ...dto, tenantId: ctx.tenantId ?? dto.tenantId });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.team.remove(id);
  }
}
