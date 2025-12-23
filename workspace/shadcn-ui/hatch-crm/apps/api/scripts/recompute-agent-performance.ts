import { PrismaClient } from '@hatch/db';

import { AgentPerformanceService } from '../src/modules/agent-performance/agent-performance.service';

async function main() {
  const orgId = process.argv[2] ?? process.env.DEFAULT_ORG_ID ?? process.env.NEXT_PUBLIC_ORG_ID ?? null;
  if (!orgId) {
    // eslint-disable-next-line no-console
    console.error('Usage: pnpm --filter @hatch/api run agent-performance:recompute <orgId>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  await prisma.$connect();
  try {
    const service = new AgentPerformanceService(prisma as any);
    await service.generateSnapshots(orgId);
    // eslint-disable-next-line no-console
    console.log(`[agent-performance] recompute complete for org ${orgId}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();

