import { Module } from '@nestjs/common';

import { ConsumerPropertiesController } from './consumer.controller';

@Module({
  controllers: [ConsumerPropertiesController]
})
export class ConsumerModule {}
