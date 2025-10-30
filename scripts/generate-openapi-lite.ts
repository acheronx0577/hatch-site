import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import { DocsAppModule } from '../apps/api/src/docs/docs-app.module';

async function main() {
  // Create a minimal HTTP app (Express by default). No server listen needed.
  const app = await NestFactory.create(DocsAppModule, { logger: false });
  console.log('[openapi-lite] app ctor', (app as any)?.constructor?.name);
  await app.init(); // important: wires up controllers so Swagger can scan

  const config = new DocumentBuilder()
    .setTitle('Hatch CRM API (Lite)')
    .setDescription('Accounts, Opportunities, Cases, Files, Reporting')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const doc = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true, // traverse metadata without a running server
  });

  mkdirSync('openapi', { recursive: true });
  const out = join('openapi', 'openapi.lite.json');
  writeFileSync(out, JSON.stringify(doc, null, 2));
  await app.close();
  console.log('Wrote', out);
}

main().catch((e) => {
  console.error('[openapi-lite] failed:', e);
  process.exit(1);
});
