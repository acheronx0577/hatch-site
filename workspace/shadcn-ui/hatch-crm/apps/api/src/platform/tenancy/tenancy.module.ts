import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { TenancyMiddleware } from './tenancy.middleware';

@Module({
  providers: [TenancyMiddleware],
  exports: [TenancyMiddleware]
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenancyMiddleware).forRoutes('*');
  }
}
