import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('Payouts generation', () => {
  let app: INestApplication;
  let opportunityId: string;
  let payoutId: string;

  beforeAll(async () => {
    app = await setupTestApp();
    const client = request(app.getHttpServer());

    const account = await client
      .post('/accounts')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({ name: 'Payout Demo Account' })
      .expect(201);

    const plan = await client
      .post('/commission-plans')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({ name: 'Demo 70/30', brokerSplit: 0.3, agentSplit: 0.7 })
      .expect(201);
    expect(plan.body.id).toBeDefined();

    const opportunity = await client
      .post('/opportunities')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({
        name: 'Commission Test Opportunity',
        stage: 'Proposal',
        amount: 100000,
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

  it('generates payouts and marks them as paid', async () => {
    const client = request(app.getHttpServer());

    const generate = await client
      .post('/payouts/generate')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({ opportunityId })
      .expect(201);

    expect(Array.isArray(generate.body)).toBe(true);
    expect(generate.body.length).toBeGreaterThan(0);

    payoutId = generate.body[0].id;

    await client
      .post(`/payouts/${payoutId}/mark-paid`)
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .expect(201);

    const list = await client
      .get('/payouts?status=PAID')
      .set('x-org-id', 'org-hatch')
      .expect(200);

    expect(list.body.find((entry: any) => entry.id === payoutId)).toBeTruthy();
  });
});
