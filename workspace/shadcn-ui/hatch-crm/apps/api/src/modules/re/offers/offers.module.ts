import { Module } from '@nestjs/common';

import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { TransactionsModule } from '../transactions/transactions.module';

import { OutboxModule } from '../../outbox/outbox.module';

@Module({
  imports: [TransactionsModule, OutboxModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService]
})
export class OffersModule {}
