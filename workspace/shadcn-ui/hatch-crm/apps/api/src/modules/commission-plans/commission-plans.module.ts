import { Module } from '@nestjs/common';

import { CommissionPlansController } from './commission-plans.controller';
import { CommissionPlansService } from './commission-plans.service';
import { CapLedgerService } from './cap-ledger.service';
import { PlanAssignmentService } from './plan-assignment.service';

@Module({
  controllers: [CommissionPlansController],
  providers: [CommissionPlansService, CapLedgerService, PlanAssignmentService],
  exports: [CommissionPlansService, CapLedgerService, PlanAssignmentService]
})
export class CommissionPlansModule {}
