import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';
import { PrismaService } from '../../src/modules/prisma/prisma.service';

describeIf(RUN_INTEGRATION)('Deal Desk flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let opportunityId: string;

  beforeAll(async () => {
    app = await setupTestApp();
    prisma = app.get(PrismaService);

    const client = request(app.getHttpServer());

    const account = await client
      .post('/accounts')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({ name: 'Deal Desk Seed Co.' })
      .expect(201);

    const opportunity = await client
      .post('/opportunities')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({
        name: 'High Discount Opportunity',
        stage: 'Qualification',
        amount: 250000,
        accountId: account.body.id
      })
      .expect(201);

    opportunityId = opportunity.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('creates, approves, and records an outbox event', async () => {
    const client = request(app.getHttpServer());

    const create = await client
      .post('/deal-desk/requests')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({
        opportunityId,
        amount: 240000,
        discountPct: 5,
        reason: 'Strategic partnership discount'
      })
      .expect(201);

    const requestId = create.body.id;

    await client
      .post(`/deal-desk/requests/${requestId}/approve`)
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .expect(201);

    const approvedList = await client
      .get('/deal-desk/requests?status=APPROVED')
      .set('x-org-id', 'org-hatch')
      .expect(200);

    expect(approvedList.body.find((entry: any) => entry.id === requestId)).toBeTruthy();

    if (prisma && (prisma as any).outbox?.findMany) {
      const events = await (prisma as any).outbox.findMany({
        where: { orgId: 'org-hatch', event: 'deal_desk.approved' },
        orderBy: { createdAt: 'desc' }
      });
      expect(events.length).toBeGreaterThan(0);
    }
  });
});
