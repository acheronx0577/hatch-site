import { Module } from '@nestjs/common';

import { LayoutsController } from './layouts.controller';
import { LayoutsService } from './layouts.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LayoutsController],
  providers: [LayoutsService],
  exports: [LayoutsService]
})
export class LayoutsModule {}
