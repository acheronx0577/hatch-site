import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { QuickBooksService } from './quickbooks.service';
import { QuickBooksController } from './quickbooks.controller';
import { PrismaService } from '@/modules/prisma/prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [QuickBooksController],
  providers: [QuickBooksService, PrismaService],
  exports: [QuickBooksService]
})
export class QuickBooksModule {}
