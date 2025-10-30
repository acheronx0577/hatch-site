import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('Opportunities CRUD Integration', () => {
  let app: INestApplication;
  let accountId: string;

  beforeAll(async () => {
    app = await setupTestApp();

    const client = request(app.getHttpServer());
    const account = await client
      .post('/accounts')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({ name: 'Pipeline Industries' })
      .expect(201);
    accountId = account.body.id;
  });

  afterAll(async () => {
    if (app) {
      try {
        await request(app.getHttpServer())
          .delete(`/accounts/${accountId}`)
          .set('x-org-id', 'org-hatch');
      } catch {
        // ignore cleanup failures for skipped runs
      }
      await app.close();
    }
  });

  it('creates, reads, updates, and soft deletes an opportunity (placeholder)', async () => {
    // TODO: expand with stage transitions and revenue forecasting assertions.
    const client = request(app.getHttpServer());

    const create = await client
      .post('/opportunities')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({ name: 'Expansion Deal', stage: 'Qualification', amount: 125000, accountId })
      .expect(201);

    const opportunityId = create.body.id;
    expect(opportunityId).toBeDefined();

    await client.get(`/opportunities/${opportunityId}`).set('x-org-id', 'org-hatch').expect(200);

    await client
      .patch(`/opportunities/${opportunityId}`)
      .set('x-org-id', 'org-hatch')
      .send({ stage: 'Proposal', amount: 150000 })
      .expect(200);

    await client.delete(`/opportunities/${opportunityId}`).set('x-org-id', 'org-hatch').expect(200);
  });
});
