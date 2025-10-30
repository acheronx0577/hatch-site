import { Module } from '@nestjs/common';

import { OffersModule } from '../offers/offers.module';
import { OutboxModule } from '../../outbox/outbox.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [OffersModule, OutboxModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService]
})
export class ReListingsModule {}
