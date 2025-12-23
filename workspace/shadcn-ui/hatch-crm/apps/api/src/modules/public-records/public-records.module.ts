import { Module } from '@nestjs/common';

import { PrismaModule } from '@/modules/prisma/prisma.module';
import { S3Service } from '@/modules/storage/s3.service';
import { PublicRecordsCron } from './public-records.cron';
import { PublicRecordsService } from './public-records.service';

@Module({
  imports: [PrismaModule],
  providers: [S3Service, PublicRecordsService, PublicRecordsCron],
  exports: [PublicRecordsService]
})
export class PublicRecordsModule {}

