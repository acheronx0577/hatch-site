import { Module } from '@nestjs/common';

import { CommissionPlansModule } from '../commission-plans/commission-plans.module';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [CommissionPlansModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService]
})
export class PayoutsModule {}
