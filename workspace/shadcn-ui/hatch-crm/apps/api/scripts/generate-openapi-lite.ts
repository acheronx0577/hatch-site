import '../../../scripts/utils/with-docs-ts.js';

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { OpenAPIObject } from '@nestjs/swagger';

import { buildTaggedSpec } from '../../../scripts/helpers/buildTaggedSpec.ts';

const require = createRequire(import.meta.url);
const moduleDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

async function main() {
  const { createOpenApiSpec } = require('../src/docs/create-openapi-spec.ts') as {
    createOpenApiSpec: () => Promise<OpenAPIObject>;
  };
  const document = await createOpenApiSpec();
  const tagged = buildTaggedSpec(document);

  const outDir = join(moduleDir, '../../openapi');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'openapi.lite.json');
  writeFileSync(outPath, JSON.stringify(tagged, null, 2));
}

main().catch((error) => {
  console.error('[openapi-lite] failed:', error);
  process.exit(1);
});
