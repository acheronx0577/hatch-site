import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { ApiModule, ApiStandardErrors } from '../common';
import { DemoBookingAvailabilityQueryDto, DemoBookingRequestDto } from './dto/demo-booking.dto';
import { DemoBookingService } from './demo-booking.service';

@ApiModule('Demo Booking', { secure: false })
@ApiTags('beta')
@ApiStandardErrors()
@Controller('demo-booking')
export class DemoBookingPublicController {
  constructor(private readonly demoBooking: DemoBookingService) {}

  @Get('availability')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        calendarTimeZone: { type: 'string' },
        slotMinutes: { type: 'number' },
        workStartHour: { type: 'number' },
        workEndHour: { type: 'number' },
        daysAhead: { type: 'number' },
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              slots: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    }
  })
  async availability(@Query() query: DemoBookingAvailabilityQueryDto) {
    return this.demoBooking.getAvailability(query);
  }

  @Post('book')
  @ApiBody({ type: DemoBookingRequestDto })
  async book(@Body() dto: DemoBookingRequestDto, @Req() req: FastifyRequest) {
    return this.demoBooking.bookDemo(dto, { ip: req.ip, headers: req.headers as any });
  }
}

