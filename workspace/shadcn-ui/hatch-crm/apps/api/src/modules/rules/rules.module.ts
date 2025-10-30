import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PlatformModule } from '../../platform/platform.module';
import { RulesService } from './rules.service';
import { RulesMiddleware } from './rules.middleware';
import { AdminRulesController } from './admin.rules.controller';

@Module({
  imports: [PrismaModule, PlatformModule],
  controllers: [AdminRulesController],
  providers: [RulesService, RulesMiddleware],
  exports: [RulesService]
})
export class RulesModule implements NestModule {
  constructor(private readonly middleware: RulesMiddleware) {}

  private bind(object: string) {
    return (
      req: Parameters<RulesMiddleware['use']>[0],
      res: Parameters<RulesMiddleware['use']>[1],
      next: Parameters<RulesMiddleware['use']>[2]
    ) => this.middleware.use(req, res, next, object);
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(this.bind('accounts'))
      .forRoutes(
        { path: 'accounts', method: RequestMethod.POST },
        { path: 'accounts/:id', method: RequestMethod.PATCH }
      );

    consumer
      .apply(this.bind('opportunities'))
      .forRoutes(
        { path: 'opportunities', method: RequestMethod.POST },
        { path: 'opportunities/:id', method: RequestMethod.PATCH }
      );

    consumer
      .apply(this.bind('cases'))
      .forRoutes(
        { path: 'cases', method: RequestMethod.POST },
        { path: 'cases/:id', method: RequestMethod.PATCH }
      );

    consumer
      .apply(this.bind('re_offers'))
      .forRoutes({ path: 're/offers', method: RequestMethod.POST });

    consumer
      .apply(this.bind('re_transactions'))
      .forRoutes(
        { path: 're/transactions/:id/milestone', method: RequestMethod.PATCH },
        { path: 're/transactions/:id/payouts', method: RequestMethod.POST }
      );
  }
}
