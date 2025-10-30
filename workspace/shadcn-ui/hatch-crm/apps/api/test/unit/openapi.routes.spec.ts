// Does not write files; safe to run any time.
import 'reflect-metadata';
import 'tsconfig-paths/register';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/modules/prisma/prisma.service';

const REQUIRED_PATHS = ['/api/accounts', '/api/opportunities', '/api/reporting/metrics', '/api/re/offers'];

describe('OpenAPI route coverage', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        enableShutdownHooks: jest.fn().mockResolvedValue(undefined),
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined)
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('exposes key paths in the generated document', async () => {
    const config = new DocumentBuilder()
      .setTitle('Hatch CRM API')
      .setDescription('API surface for Hatch CRM MVP')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      deepScanRoutes: true
    });

    for (const path of REQUIRED_PATHS) {
      expect(document.paths[path]).toBeDefined();
    }
  });
});
