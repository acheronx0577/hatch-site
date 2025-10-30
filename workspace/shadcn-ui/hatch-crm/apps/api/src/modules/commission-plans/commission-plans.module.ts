import { Module } from '@nestjs/common';

import { CommissionPlansController } from './commission-plans.controller';
import { CommissionPlansService } from './commission-plans.service';

@Module({
  controllers: [CommissionPlansController],
  providers: [CommissionPlansService],
  exports: [CommissionPlansService]
})
export class CommissionPlansModule {}
