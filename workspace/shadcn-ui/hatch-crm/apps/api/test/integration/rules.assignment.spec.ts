import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { Prisma } from '@hatch/db';

import type { PrismaService } from '../../src/modules/prisma/prisma.service';
import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

const ORG_ID = 'org-hatch';

describeIf(RUN_INTEGRATION)('Rules assignment middleware', () => {
  let app: (INestApplication & { prisma: PrismaService }) | null = null;

  beforeAll(async () => {
    app = await setupTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(async () => {
    if (!app) return;
    await app.prisma.assignmentRule.deleteMany({ where: { orgId: ORG_ID } });
    await app.prisma.opportunity.deleteMany({ where: { orgId: ORG_ID, name: { contains: 'Rule Test Opportunity' } } });
  });

  it('auto-assigns opportunity owner when rule matches', async () => {
    if (!app) return;

    await app.prisma.assignmentRule.create({
      data: {
        id: randomUUID(),
        orgId: ORG_ID,
        object: 'opportunities',
        name: 'High value routing',
        active: true,
        dsl: {
          when: "amount >= 50000",
          assign: {
            type: 'static_owner',
            ownerId: 'user-enterprise'
          }
        } as Prisma.InputJsonValue
      }
    });

    const client = request(app.getHttpServer());
    const created = await client
      .post('/opportunities')
      .set('x-org-id', ORG_ID)
      .set('x-user-id', 'user-broker')
      .send({
        name: 'Rule Test Opportunity',
        stage: 'Qualification',
        amount: 60000
      })
      .expect(201);

    expect(created.body.ownerId).toBe('user-enterprise');

    const stored = await app.prisma.opportunity.findUnique({ where: { id: created.body.id } });
    expect(stored?.ownerId).toBe('user-enterprise');
  });
});
