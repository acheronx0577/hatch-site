import { BadRequestException, Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { ApiModule, ApiStandardErrors, resolveRequestContext } from '../common';
import { RequestTourDto } from './dto/request-tour.dto';
import { TourRequestResponseDto, TourStatusResponseDto } from './dto/tour-response.dto';
import { ToursService } from './tours.service';

@ApiModule('Tours')
@ApiStandardErrors()
@Controller('tours')
export class ToursController {
  constructor(private readonly tours: ToursService) {}

  @Post()
  @ApiBody({ type: RequestTourDto })
  @ApiOkResponse({ type: TourRequestResponseDto })
  async requestTour(@Body() dto: RequestTourDto) {
    return this.tours.requestTour(dto);
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
