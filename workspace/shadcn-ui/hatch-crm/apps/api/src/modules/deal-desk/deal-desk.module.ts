import { Module } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module';
import { DealDeskController } from './deal-desk.controller';
import { DealDeskService } from './deal-desk.service';

@Module({
  imports: [OutboxModule],
  controllers: [DealDeskController],
  providers: [DealDeskService],
  exports: [DealDeskService]
})
export class DealDeskModule {}
