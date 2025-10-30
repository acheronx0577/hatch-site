/**
 * Seed baseline data for S2 (Deal Desk + Commission Plans + Payouts).
 * Run after applying the corresponding Prisma migration:
 *
 *   pnpm --filter @hatch/db prisma migrate deploy
 *   ts-node scripts/seed_s2_baseline.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureCommissionPlan(orgId: string) {
  const existing = await prisma.orgCommissionPlan.findFirst({ where: { orgId } });
  if (existing) return existing;

  return prisma.orgCommissionPlan.create({
    data: {
      orgId,
      name: 'Baseline 70 / 30',
      brokerSplit: 0.3,
      agentSplit: 0.7,
      tiers: null
    }
  });
}

async function ensureDealDeskRequest(orgId: string, opportunityId: string) {
  const existing = await prisma.dealDeskRequest.findFirst({
    where: { orgId, opportunityId }
  });
  if (existing) return existing;

  return prisma.dealDeskRequest.create({
    data: {
      orgId,
      requesterId: 'user-broker',
      opportunityId,
      amount: 250000,
      discountPct: 5,
      reason: 'Demo seed: approval for strategic client'
    }
  });
}

async function main() {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' }
  });

  if (!org) {
    console.warn('No organization found; skipping S2 seed.');
    return;
  }

  await ensureCommissionPlan(org.id);

  const opportunity = await prisma.opportunity.findFirst({
    where: { orgId: org.id },
    orderBy: { createdAt: 'desc' }
  });

  if (opportunity) {
    await ensureDealDeskRequest(org.id, opportunity.id);
  } else {
    console.warn('No opportunity found to attach a Deal Desk request.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
