import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { PrismaService } from '@/modules/prisma/prisma.service';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, PrismaService],
  exports: [AccountingService]
})
export class AccountingModule {}
