import 'reflect-metadata';

import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';

import { DocsAppModule } from './docs-app.module';

export async function createOpenApiSpec(): Promise<OpenAPIObject> {
  const testingModule = await Test.createTestingModule({
    imports: [DocsAppModule]
  }).compile();

  const app = testingModule.createNestApplication(new FastifyAdapter({ logger: false }));
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('Hatch CRM API (Lite)')
    .setDescription('Docs-only surface for CRM modules')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
    include: [DocsAppModule]
  });

  await app.close();
  await testingModule.close();

  return document;
}
