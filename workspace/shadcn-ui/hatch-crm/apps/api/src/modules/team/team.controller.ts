import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { resolveRequestContext } from '../common/request-context';
import { TeamService } from './team.service';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';

@Controller('team')
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
    return this.team.create({
      ...dto,
      tenantId: dto.tenantId ?? ctx.tenantId
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTeamMemberDto) {
    return this.team.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.team.remove(id);
  }
}
