// NOTE: run manually when ready.
import { promises as fs } from 'fs';
import path from 'path';
import NodeModule from 'module';


async function main() {
  const outputFlag = process.argv.find((arg) => arg.startsWith('--output='));
  const outputPath = outputFlag
    ? path.resolve(outputFlag.split('=')[1] ?? '')
    : path.resolve(__dirname, '../openapi/openapi.json');

  const apiNodeModules = path.resolve(__dirname, '../apps/api/node_modules');
  const rootNodeModules = path.resolve(__dirname, '../node_modules');
  const nodePathEntries = [apiNodeModules, rootNodeModules, process.env.NODE_PATH ?? '']
    .filter(Boolean)
    .join(path.delimiter);
  process.env.NODE_PATH = nodePathEntries;
  (NodeModule as any)._initPaths();

  const localRequire = NodeModule.createRequire(__filename);
  localRequire('reflect-metadata');
  const tsconfigPath = path.resolve(__dirname, '../apps/api/tsconfig.json');
  const tsconfigRaw = await fs.readFile(tsconfigPath, 'utf8');
  const tsconfig = JSON.parse(tsconfigRaw);
  const tsconfigPaths = localRequire('tsconfig-paths');
  tsconfigPaths.register({
    baseUrl: path.resolve(__dirname, '../apps/api'),
    paths: (tsconfig.compilerOptions?.paths ?? {}) as Record<string, string[]>
  });
  const { DocumentBuilder, SwaggerModule } = localRequire('@nestjs/swagger');
  const { FastifyAdapter } = localRequire('@nestjs/platform-fastify');
  const { Test } = localRequire('@nestjs/testing');
  const { Module } = localRequire('@nestjs/common');
  const { ConfigModule } = localRequire('@nestjs/config');
  const { FlsService } = localRequire('../apps/api/src/platform/security/fls.service');
  const { PlatformModule } = localRequire('../apps/api/src/platform/platform.module');
  const { PrismaModule } = localRequire('../apps/api/src/modules/prisma/prisma.module');
  const { AccountsModule } = localRequire('../apps/api/src/modules/accounts/accounts.module');
  const { OpportunitiesModule } = localRequire('../apps/api/src/modules/opportunities/opportunities.module');
  const { CasesModule } = localRequire('../apps/api/src/modules/cases/cases.module');
  const { FilesModule } = localRequire('../apps/api/src/modules/files/files.module');
  const { DealDeskModule } = localRequire('../apps/api/src/modules/deal-desk/deal-desk.module');
  const { CommissionPlansModule } = localRequire('../apps/api/src/modules/commission-plans/commission-plans.module');
  const { PayoutsModule } = localRequire('../apps/api/src/modules/payouts/payouts.module');
  const { ReportingModule } = localRequire('../apps/api/src/modules/reporting/reporting.module');
  const { OffersModule } = localRequire('../apps/api/src/modules/re/offers/offers.module');
  const { TransactionsModule } = localRequire('../apps/api/src/modules/re/transactions/transactions.module');
  const { ReListingsModule } = localRequire('../apps/api/src/modules/re/listings/listings.module');
  const { RulesModule } = localRequire('../apps/api/src/modules/rules/rules.module');
  const { ToursModule } = localRequire('../apps/api/src/modules/tours/tours.module');
  const { MlsModule } = localRequire('../apps/api/src/modules/mls/mls.module');
  const { RoutingModule } = localRequire('../apps/api/src/modules/routing/routing.module');
  const { JourneysModule } = localRequire('../apps/api/src/modules/journeys/journeys.module');
  const { WebhooksModule } = localRequire('../apps/api/src/modules/webhooks/webhooks.module');
  const { DashboardsModule } = localRequire('../apps/api/src/modules/dashboards/dashboards.module');

  class FlsServiceStub {
    async filterRead<T>(_: unknown, __: string, payload: T): Promise<T> {
      return payload;
    }

    async filterWrite<T>(_: unknown, __: string, payload: T): Promise<T> {
      return payload;
    }

    async readableSet() {
      return new Set<string>();
    }

    async writableSet() {
      return new Set<string>();
    }
  }

  const documentationImports = [
    ConfigModule.forRoot({ isGlobal: true }),
    PlatformModule,
    PrismaModule,
    AccountsModule,
    OpportunitiesModule,
    CasesModule,
    FilesModule,
    DealDeskModule,
    CommissionPlansModule,
    PayoutsModule,
    ReportingModule,
    OffersModule,
    TransactionsModule,
    ReListingsModule,
    RulesModule,
    ToursModule,
    MlsModule,
    RoutingModule,
    JourneysModule,
    WebhooksModule,
    DashboardsModule
  ];

  @Module({
    imports: documentationImports,
    providers: [{ provide: FlsService, useClass: FlsServiceStub }],
    exports: [FlsService]
  })
  class DocumentationModule {}

  const testingModule = await Test.createTestingModule({
    imports: [DocumentationModule]
  }).compile();

  const app = testingModule.createNestApplication(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix('api');
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('Hatch CRM API')
    .setDescription('API surface for Hatch CRM MVP')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true
  });
  await app.close();

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  console.log(`Discovered ${Object.keys(document.paths ?? {}).length} paths in OpenAPI document.`);
  await fs.writeFile(outputPath, JSON.stringify(document, null, 2));

  console.log(`OpenAPI spec written to ${outputPath}`);
}

main().catch((error) => {
  console.error('Failed to generate OpenAPI spec', error);
  process.exitCode = 1;
});
