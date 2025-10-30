import { Controller, Get, Query } from '@nestjs/common';

import { mockConsumerProperties } from './consumer.mock';

@Controller('consumer-properties')
export class ConsumerPropertiesController {
  @Get()
  list(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    const items = parsedLimit ? mockConsumerProperties.slice(0, parsedLimit) : mockConsumerProperties;

    return {
      data: items,
      total: mockConsumerProperties.length
    };
  }
}
