import '../../../scripts/utils/with-docs-ts.js';
import 'reflect-metadata';

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
  console.log('[spec-smoke] creating spec');
  const document = buildTaggedSpec(await createOpenApiSpec());

  const expectFullSpec = process.env.DOCS_EXPECT_FULL_SPEC !== 'false';
  const pathCount = Object.keys(document.paths ?? {}).length;
  const tagCount = document.tags?.length ?? 0;
  console.log(`[spec-smoke] stats paths=${pathCount} tags=${tagCount}`);

  if (expectFullSpec) {
    const requiredTags = [
      'Contacts',
      'Leads',
      'Deal Desk',
      'Commission Plans',
      'Payouts',
      'RE Offers',
      'Tours',
      'MLS',
      'Routing',
      'Journeys',
      'Webhooks',
      'Dashboards'
    ];

    const discoveredTags = (document.tags ?? []).map((tag) => tag.name);
    for (const tag of requiredTags) {
      if (!discoveredTags.includes(tag)) {
        throw new Error(`missing tag in spec: ${tag}`);
      }
    }

    const requiredPaths = [
      '/contacts',
      '/deal-desk/requests',
      '/deal-desk/requests/{id}/approve',
      '/payouts',
      '/re/offers',
      '/reporting/metrics',
      '/tours',
      '/mls/profiles',
      '/routing/rules',
      '/admin/rules/assignment',
      '/journeys/{id}/simulate',
      '/webhooks/subscriptions',
      '/dashboards/broker'
    ];

    const paths = document.paths ?? {};
    for (const path of requiredPaths) {
      if (!paths[path]) {
        throw new Error(`missing path in spec: ${path}`);
      }
    }

    const contacts401 = paths['/contacts']?.get?.responses?.['401'];
    const errorContent = contacts401 && 'content' in contacts401 ? contacts401.content : undefined;
    const errorRef = errorContent?.['application/json']?.schema?.['$ref'];
    if (errorRef !== '#/components/schemas/ErrorResponseDto') {
      throw new Error('contacts list missing shared error schema reference');
    }
  }

  const outDir = join(moduleDir, '../../openapi');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'openapi.lite.json');
  console.log('[spec-smoke] writing spec to', outPath);
  writeFileSync(outPath, JSON.stringify(document, null, 2));

  console.log('[spec-smoke] OpenAPI spec written to', outPath);
}

main().catch((error) => {
  console.error('[spec-smoke] failed:', error);
  process.exit(1);
});

process.on('exit', (code) => {
  console.log('[spec-smoke] process exit', code);
});
