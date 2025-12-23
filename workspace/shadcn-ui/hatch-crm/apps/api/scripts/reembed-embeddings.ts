import { existsSync } from 'node:fs';
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '@prisma/client';

const appRoot = path.resolve(__dirname, '..');
const envFiles = ['.env.local', '.env'].map((file) => path.join(appRoot, file));
for (const envFile of envFiles) {
  if (existsSync(envFile)) {
    loadEnv({ path: envFile, override: false });
  }
}

const prisma = new PrismaClient();

const embedModelId = process.env.AI_EMBEDDINGS_MODEL || 'mock-embeddings';
const batchSize = Number(process.env.AI_REEMBED_BATCH ?? 96);

const tenantFilter = process.env.AI_REEMBED_TENANT_ID?.trim() || undefined;
const orgFilter =
  process.env.AI_REEMBED_ORG_ID?.trim() ||
  process.env.AI_REEMBED_ORGANIZATION_ID?.trim() ||
  undefined;

const targets = new Set(
  String(process.env.AI_REEMBED_TARGETS || 'vectorchunk,searchvector')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

async function main() {
  console.log(
    [
      '[reembed]',
      `model=${embedModelId}`,
      `batch=${batchSize}`,
      tenantFilter ? `tenant=${tenantFilter}` : null,
      orgFilter ? `org=${orgFilter}` : null,
      `targets=${[...targets].join(',')}`
    ]
      .filter(Boolean)
      .join(' ')
  );

  if (targets.has('vectorchunk') || targets.has('vectorchunks')) {
    await reembedVectorChunks();
  }

  if (targets.has('searchvector') || targets.has('searchvectors')) {
    await reembedSearchVectors();
  }

  console.log('[reembed] done');
}

async function reembedVectorChunks() {
  console.log('[reembed] VectorChunk: start');
  let processed = 0;
  let updated = 0;
  let cursor: string | undefined;

  while (true) {
    const rows = await prisma.vectorChunk.findMany({
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor }
          }
        : {}),
      where: {
        ...(tenantFilter ? { tenantId: tenantFilter } : {})
      },
      select: { id: true, content: true }
    });

    if (!rows.length) break;
    processed += rows.length;

    const embeddings = await embed(rows.map((row) => row.content));

    await prisma.$transaction(
      rows.map((row, idx) =>
        prisma.vectorChunk.update({
          where: { id: row.id },
          data: { embeddingF8: embeddings[idx] as any }
        })
      )
    );

    updated += rows.length;
    cursor = rows[rows.length - 1]?.id;

    if (updated % (batchSize * 10) === 0) {
      console.log(`[reembed] VectorChunk: updated=${updated}`);
    }
  }

  console.log(`[reembed] VectorChunk: done processed=${processed} updated=${updated}`);
}

async function reembedSearchVectors() {
  console.log('[reembed] SearchVector: start');
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let cursor: string | undefined;

  while (true) {
    const rows = await prisma.searchVector.findMany({
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor }
          }
        : {}),
      where: {
        ...(orgFilter ? { organizationId: orgFilter } : {})
      },
      select: { id: true, content: true }
    });

    if (!rows.length) break;
    processed += rows.length;

    const usable = rows
      .map((row) => ({ id: row.id, content: (row.content ?? '').trim() }))
      .filter((row) => row.content.length > 0);

    skipped += rows.length - usable.length;

    if (!usable.length) {
      cursor = rows[rows.length - 1]?.id;
      continue;
    }

    const embeddings = await embed(usable.map((row) => row.content));

    await prisma.$transaction(
      usable.map((row, idx) =>
        prisma.searchVector.update({
          where: { id: row.id },
          data: { embedding: embeddings[idx] as any }
        })
      )
    );

    updated += usable.length;
    cursor = rows[rows.length - 1]?.id;

    if (updated % (batchSize * 10) === 0) {
      console.log(`[reembed] SearchVector: updated=${updated} skipped=${skipped}`);
    }
  }

  console.log(`[reembed] SearchVector: done processed=${processed} updated=${updated} skipped=${skipped}`);
}

async function embed(texts: string[]): Promise<number[][]> {
  return texts.map((text) => vec(text));
}

function vec(text: string) {
  const dim = 768;
  const out = new Array(dim).fill(0);
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
    out[(hash >>> 0) % dim] += 1;
  }
  const norm = Math.hypot(...out) || 1;
  return out.map((value) => value / norm);
}

main()
  .catch((error) => {
    console.error('[reembed] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
