import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

import { Prisma, PrismaClient } from '@prisma/client';

interface RuleFixture {
  object: string;
  name: string;
  active?: boolean;
  dsl: Record<string, unknown>;
}

interface FixtureFile {
  validation?: RuleFixture[];
  assignment?: RuleFixture[];
}

const prisma = new PrismaClient();

const DEFAULT_FIXTURE_PATH = resolve(__dirname, 'fixtures', 'rules_demo.json');
const DEFAULT_ORG_IDS = (process.env.RULES_ORGS ?? process.env.DEFAULT_ORG_ID ?? 'org-hatch')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function resolveFixturePath() {
  const override =
    process.env.RULES_FIXTURE_PATH ?? process.argv.find((arg) => arg.startsWith('--fixture='));
  if (!override) {
    return DEFAULT_FIXTURE_PATH;
  }

  if (override.startsWith('--fixture=')) {
    return resolve(process.cwd(), override.replace('--fixture=', ''));
  }

  return resolve(process.cwd(), override);
}

function stableId(kind: 'validation' | 'assignment', orgId: string, object: string, name: string) {
  const hash = createHash('sha1').update(`${kind}:${orgId}:${object}:${name}`).digest('hex');
  return `${kind}-${hash.slice(0, 24)}`;
}

async function upsertValidationRule(orgId: string, fixture: RuleFixture) {
  const id = stableId('validation', orgId, fixture.object, fixture.name);
  await prisma.validationRule.upsert({
    where: { id },
    update: {
      name: fixture.name,
      object: fixture.object,
      active: fixture.active ?? true,
      dsl: fixture.dsl as Prisma.InputJsonValue
    },
    create: {
      id,
      orgId,
      object: fixture.object,
      name: fixture.name,
      active: fixture.active ?? true,
      dsl: fixture.dsl as Prisma.InputJsonValue
    }
  });
}

async function upsertAssignmentRule(orgId: string, fixture: RuleFixture) {
  const id = stableId('assignment', orgId, fixture.object, fixture.name);
  await prisma.assignmentRule.upsert({
    where: { id },
    update: {
      name: fixture.name,
      object: fixture.object,
      active: fixture.active ?? true,
      dsl: fixture.dsl as Prisma.InputJsonValue
    },
    create: {
      id,
      orgId,
      object: fixture.object,
      name: fixture.name,
      active: fixture.active ?? true,
      dsl: fixture.dsl as Prisma.InputJsonValue
    }
  });
}

async function seedFromFixture(orgId: string, fixturePath: string) {
  const raw = await readFile(fixturePath, 'utf-8');
  const parsed = JSON.parse(raw) as FixtureFile;

  for (const rule of parsed.validation ?? []) {
    await upsertValidationRule(orgId, rule);
  }

  for (const rule of parsed.assignment ?? []) {
    await upsertAssignmentRule(orgId, rule);
  }
}

async function main() {
  const fixturePath = resolveFixturePath();
  const orgIds = DEFAULT_ORG_IDS;

  for (const orgId of orgIds) {
    console.log(`Seeding rules fixture for ${orgId} from ${fixturePath}`);
    await seedFromFixture(orgId, fixturePath);
  }
}

main()
  .catch((error) => {
    console.error('Failed to seed rules fixtures', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
