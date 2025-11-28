import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractsAutofillService } from './contracts-autofill.service';
import { ContractsRecommendationService } from './contracts-recommendation.service';
import { ContractsDocuSignService } from './contracts.docusign.service';
import { ContractsWebhookController } from './contracts-webhook.controller';
import { S3Service } from '../storage/s3.service';

@Module({
  imports: [PrismaModule],
  controllers: [ContractsController, ContractsWebhookController],
  providers: [
    ContractsService,
    ContractsAutofillService,
    ContractsRecommendationService,
    ContractsDocuSignService,
    S3Service
  ],
  exports: [ContractsService]
})
export class ContractsModule {}
