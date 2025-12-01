import { Module } from '@nestjs/common';

import { FilesController } from './files.controller';
import { PropertyMediaController } from './property-media.controller';
import { FilesService } from './files.service';
import { S3Service } from '../storage/s3.service';

@Module({
  controllers: [FilesController, PropertyMediaController],
  providers: [FilesService, S3Service],
  exports: [FilesService]
})
export class FilesModule {}
