import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@hatch/db';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';
import { AiToolRegistry } from '@/modules/ai-employees/ai-tool.registry';
import type { PrismaService } from '@/modules/prisma/prisma.service';

const ORG_ID = 'org-ai-tools';
const TENANT_ID = 'tenant-ai-tools';

describeIf(RUN_INTEGRATION)('AI persona tools (hot leads and overdue tasks)', () => {
  let app: INestApplication & { prisma: PrismaService };
  let prisma: PrismaService;
  let registry: AiToolRegistry;

  const ctx = {
    tenantId: TENANT_ID,
    orgId: ORG_ID,
    actorId: 'user-ai-tools',
    actorRole: UserRole.BROKER,
    sessionId: 'session-ai-tools',
    employeeInstanceId: 'emp-ai-tools'
  };

  beforeAll(async () => {
    app = await setupTestApp();
    prisma = app.prisma;
    registry = app.get(AiToolRegistry);

    // ensure org + tenant exist
    await prisma.organization.upsert({
      where: { id: ORG_ID },
      update: { name: 'AI Tools Org' },
      create: { id: ORG_ID, name: 'AI Tools Org' }
    });
    await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      update: { name: 'AI Tools Tenant', organizationId: ORG_ID },
      create: { id: TENANT_ID, name: 'AI Tools Tenant', organizationId: ORG_ID, slug: 'ai-tools' }
    });
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await prisma.leadTask.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.person.deleteMany({ where: { tenantId: TENANT_ID } });
  });

  it('returns hottest leads for tenant', async () => {
    const now = new Date();
    await prisma.person.createMany({
      data: [
        {
          id: 'persona-hot-1',
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          firstName: 'Hot',
          lastName: 'Lead',
          primaryEmail: 'hot@example.com',
          primaryPhone: '+13055551010',
          scoreTier: 'A',
          leadScore: 92,
          lastActivityAt: now
        },
        {
          id: 'persona-cold-1',
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          firstName: 'Cold',
          lastName: 'Lead',
          primaryEmail: 'cold@example.com',
          primaryPhone: '+13055551011',
          scoreTier: 'D',
          leadScore: 10,
          lastActivityAt: null
        }
      ]
    });

    const result = await registry.execute<{ limit?: number }, { leads: Array<Record<string, unknown>> }>(
      'get_hot_leads',
      { limit: 5 },
      ctx
    );

    expect(result.leads.length).toBeGreaterThan(0);
    const ids = result.leads.map((lead: any) => lead.id);
    expect(ids).toContain('persona-hot-1');
    expect(ids).not.toContain('persona-cold-1'); // should filter low-score
  });

  it('returns overdue tasks for tenant', async () => {
    const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const person = await prisma.person.create({
      data: {
        id: 'persona-task-lead',
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        firstName: 'Task',
        lastName: 'Lead',
        primaryEmail: 'task@example.com',
        primaryPhone: '+13055551012',
        scoreTier: 'B',
        leadScore: 70,
        lastActivityAt: pastDue
      }
    });

    await prisma.leadTask.create({
      data: {
        id: 'persona-overdue-task',
        tenantId: TENANT_ID,
        personId: person.id,
        title: 'Call this lead',
        status: 'OPEN',
        dueAt: pastDue
      }
    });

    const result = await registry.execute<{ limit?: number }, { tasks: Array<Record<string, unknown>> }>(
      'get_overdue_tasks',
      { limit: 10 },
      ctx
    );

    expect(result.tasks.length).toBeGreaterThan(0);
    const task = result.tasks.find((entry: any) => entry.id === 'persona-overdue-task');
    expect(task).toBeDefined();
    expect(task?.personId).toBe(person.id);
  });
});
