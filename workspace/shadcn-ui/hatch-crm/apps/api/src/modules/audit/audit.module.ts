import { Module } from '@nestjs/common';

import { AuditController } from './audit.controller';
import { AuditLogService } from './audit.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditLogService],
  exports: [AuditLogService]
})
export class AuditModule {}
