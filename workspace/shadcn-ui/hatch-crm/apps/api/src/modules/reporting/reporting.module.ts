import { Module } from '@nestjs/common';

import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { AggregatorService } from './jobs/aggregator.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, AggregatorService],
  exports: [ReportingService]
})
export class ReportingModule {}
