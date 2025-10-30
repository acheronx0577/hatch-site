import { Module } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module';
import { PlatformModule } from '../../platform/platform.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  imports: [OutboxModule, PlatformModule],
  controllers: [ContactsController],
  providers: [ContactsService]
})
export class ContactsModule {}
