import { Module } from '@nestjs/common';

import { PrismaModule } from '@/modules/prisma/prisma.module';

import { MlsImporterService } from './mls-importer.service';

@Module({
  imports: [PrismaModule],
  providers: [MlsImporterService],
  exports: [MlsImporterService]
})
export class MlsModule {}
