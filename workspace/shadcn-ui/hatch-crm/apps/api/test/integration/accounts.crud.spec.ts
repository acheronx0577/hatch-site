import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('Accounts CRUD Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('round-trips account lifecycle (seeded placeholder)', async () => {
    // TODO: replace with full account CRUD coverage once migrations are applied.
    const client = request(app.getHttpServer());

    const create = await client
      .post('/accounts')
      .set('x-user-id', 'user-broker')
      .set('x-org-id', 'org-hatch')
      .send({ name: 'Acme Holdings', industry: 'Manufacturing' })
      .expect(201);

    const accountId = create.body.id;
    expect(accountId).toBeDefined();

    await client.get(`/accounts/${accountId}`).set('x-org-id', 'org-hatch').expect(200);

    await client
      .patch(`/accounts/${accountId}`)
      .set('x-org-id', 'org-hatch')
      .send({ phone: '+1-555-0100' })
      .expect(200);

    await client.delete(`/accounts/${accountId}`).set('x-org-id', 'org-hatch').expect(200);
  });
});
