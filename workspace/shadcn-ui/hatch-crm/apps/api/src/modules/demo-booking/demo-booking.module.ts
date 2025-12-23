import { Module } from '@nestjs/common';

import { DemoBookingPublicController } from './demo-booking-public.controller';
import { DemoBookingService } from './demo-booking.service';

@Module({
  controllers: [DemoBookingPublicController],
  providers: [DemoBookingService],
  exports: [DemoBookingService]
})
export class DemoBookingModule {}

