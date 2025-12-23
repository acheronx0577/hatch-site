import { BadRequestException, Body, Controller, ForbiddenException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { RequestTourDto } from './dto/request-tour.dto';
import { TourRequestResponseDto, TourStatusResponseDto } from './dto/tour-response.dto';
import { ToursService } from './tours.service';

@ApiModule('Tours')
@ApiStandardErrors()
@Controller('tours')
@UseGuards(JwtAuthGuard)
export class ToursController {
  constructor(private readonly tours: ToursService) {}

  @Post()
  @ApiBody({ type: RequestTourDto })
  @ApiOkResponse({ type: TourRequestResponseDto })
  async requestTour(@Req() req: FastifyRequest, @Body() dto: RequestTourDto) {
    const ctx = resolveRequestContext(req);
    if (dto.tenantId && ctx.tenantId && dto.tenantId !== ctx.tenantId) {
      throw new ForbiddenException('tenantId does not match authenticated tenant');
    }
    return this.tours.requestTour({ ...dto, tenantId: ctx.tenantId ?? dto.tenantId });
  }

  @Post(':id/kept')
  @ApiParam({ name: 'id', description: 'Tour identifier' })
  @ApiOkResponse({ type: TourStatusResponseDto })
  async markKept(@Param('id') id: string, @Req() req: FastifyRequest) {
    const ctx = resolveRequestContext(req);
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    return this.tours.markKept({
      tourId: id,
      tenantId,
      actorUserId: ctx.userId
    });
  }
}
