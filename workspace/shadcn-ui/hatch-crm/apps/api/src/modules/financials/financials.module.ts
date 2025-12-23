import { Module } from '@nestjs/common';

import { QuickBooksModule } from '@/modules/integrations/quickbooks/quickbooks.module';
import { FinancialsController } from './financials.controller';
import { FinancialsService } from './financials.service';
import { InternalFinancialsService } from './internal-financials.service';

@Module({
  imports: [QuickBooksModule],
  controllers: [FinancialsController],
  providers: [FinancialsService, InternalFinancialsService],
  exports: [FinancialsService]
})
export class FinancialsModule {}

