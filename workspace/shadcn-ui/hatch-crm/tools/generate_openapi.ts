import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '../apps/api/src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: false
  });

  const config = new DocumentBuilder().setTitle('CRM API').setVersion('1.0.0').addBearerAuth().build();
  const document = SwaggerModule.createDocument(app, config);

  const outputDir = join(__dirname, '..', 'openapi');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir);
  }
  const outputPath = join(outputDir, 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2));

  await app.close();

  // eslint-disable-next-line no-console
  console.log(`Wrote ${outputPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate OpenAPI document', err);
  process.exitCode = 1;
});
