import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import { JwtAuthGuard } from '@/auth/jwt-auth.guard'
import { resolveRequestContext } from '@/modules/common'
import { CalendarService } from './calendar.service'
import { CreateCalendarEventDto } from './dto/create-calendar-event.dto'
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto'

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  async list(
    @Req() req: FastifyRequest,
    @Query('tenantId') tenantId: string | undefined,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('assignedAgentId') assignedAgentId?: string
  ) {
    const ctx = resolveRequestContext(req)
    const resolvedTenantId = ctx.tenantId || tenantId
    if (!resolvedTenantId) {
      throw new BadRequestException('tenantId is required')
    }
    if (tenantId && ctx.tenantId && tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant')
    }

    const startDate = start ? new Date(start) : undefined
    const endDate = end ? new Date(end) : undefined

    return this.calendar.list(resolvedTenantId, startDate, endDate, assignedAgentId)
  }

  @Post()
  create(@Req() req: FastifyRequest, @Body() dto: CreateCalendarEventDto) {
    const ctx = resolveRequestContext(req)
    if (dto.tenantId && ctx.tenantId && dto.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant')
    }
    const tenantId = ctx.tenantId || dto.tenantId
    if (!tenantId) {
      throw new BadRequestException('tenantId is required')
    }
    return this.calendar.create({ ...dto, tenantId })
  }

  @Patch(':id')
  update(@Req() req: FastifyRequest, @Param('id') id: string, @Body() dto: UpdateCalendarEventDto) {
    const ctx = resolveRequestContext(req)
    if (dto.tenantId && ctx.tenantId && dto.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant')
    }
    return this.calendar.update(id, { ...dto, tenantId: ctx.tenantId || dto.tenantId })
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.calendar.remove(id)
    return { id }
  }
}
