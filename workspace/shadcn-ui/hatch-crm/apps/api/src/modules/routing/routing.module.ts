import { Module, forwardRef } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RoutingController } from './routing.controller';
import { RoutingAiService } from './routing-ai.service';
import { RoutingService } from './routing.service';
import { RoutingSettingsService } from './routing-settings.service';

@Module({
  imports: [PrismaModule, OutboxModule, PermissionsModule, forwardRef(() => AiModule)],
  controllers: [RoutingController],
  providers: [RoutingService, RoutingAiService, RoutingSettingsService],
  exports: [RoutingService, RoutingSettingsService]
})
export class RoutingModule {}
