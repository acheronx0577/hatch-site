import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsAiModule } from '../documents-ai/documents-ai.module';
import { PlaybooksModule } from '../playbooks/playbooks.module';
import { OrgEventsModule } from '../org-events/org-events.module';
import { OrgTransactionsController } from './org-transactions.controller';
import { OrgTransactionsService } from './org-transactions.service';

@Module({
  imports: [PrismaModule, DocumentsAiModule, PlaybooksModule, OrgEventsModule],
  controllers: [OrgTransactionsController],
  providers: [OrgTransactionsService],
  exports: [OrgTransactionsService]
})
export class OrgTransactionsModule {}
