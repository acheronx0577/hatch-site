import { Module } from '@nestjs/common';

import { PipelinesModule } from '../pipelines/pipelines.module';
import { PlatformModule } from '../../platform/platform.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [PipelinesModule, PlatformModule],
  controllers: [LeadsController],
  providers: [LeadsService]
})
export class LeadsModule {}
