import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsAiModule } from '../documents-ai/documents-ai.module';
import { PlaybooksModule } from '../playbooks/playbooks.module';
import { AiModule } from '../ai/ai.module';
import { OrgEventsModule } from '../org-events/org-events.module';
import { OrgListingsController } from './org-listings.controller';
import { OrgListingsService } from './org-listings.service';
import { OrgListingDetailsService } from './org-listing-details.service';
import { OrgListingRecommendationsService } from './org-listing-recommendations.service';

@Module({
  imports: [PrismaModule, DocumentsAiModule, PlaybooksModule, AiModule, OrgEventsModule],
  controllers: [OrgListingsController],
  providers: [OrgListingsService, OrgListingDetailsService, OrgListingRecommendationsService],
  exports: [OrgListingsService]
})
export class OrgListingsModule {}
