import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { OrgEventsModule } from '../org-events/org-events.module';
import { SellerOpportunitiesController } from './seller-opportunities.controller';
import { SellerOpportunitiesCron } from './seller-opportunities.cron';
import { SellerOpportunitiesService } from './seller-opportunities.service';

@Module({
  imports: [PrismaModule, OrgEventsModule],
  controllers: [SellerOpportunitiesController],
  providers: [SellerOpportunitiesService, SellerOpportunitiesCron],
  exports: [SellerOpportunitiesService]
})
export class SellerOpportunitiesModule {}

