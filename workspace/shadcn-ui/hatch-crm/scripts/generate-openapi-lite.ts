import './utils/with-docs-ts.js';

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { DocsAppModule } from '../apps/api/src/docs/docs-app.module';
import { buildTaggedSpec } from './helpers/buildTaggedSpec';

async function main() {
  const app = await NestFactory.create(DocsAppModule, new FastifyAdapter(), {
    logger: false
  });
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('Hatch CRM API (Lite)')
    .setDescription('Accounts, Opportunities, Cases, Files, Reporting')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
    include: [DocsAppModule]
  });
  const taggedSpec = buildTaggedSpec(document);

  const outputs = [
    path.resolve('apps/openapi/openapi.lite.json'),
    path.resolve('openapi/openapi.lite.json')
  ];

  for (const outPath of outputs) {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(taggedSpec, null, 2), 'utf8');
  }

  await app.close();
  console.log('[spec] wrote:', outputs.join(', '));
}

main().catch((err) => {
  console.error('[spec] generation failed:', err);
  process.exit(1);
});
