import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

const ORG_ID = 'org-hatch';
const TENANT_ID = 'tenant-hatch';
const USER_ID = 'user-broker';

describeIf(RUN_INTEGRATION)('Cases CRUD', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates, validates transitions, updates, and soft deletes', async () => {
    const client = request(app.getHttpServer());

    const createResponse = await client
      .post('/cases')
      .set('x-org-id', ORG_ID)
      .set('x-tenant-id', TENANT_ID)
      .set('x-user-id', USER_ID)
      .send({
        subject: 'Email deliverability issue',
        priority: 'High',
        origin: 'Web',
        description: 'Customer reports bouncing messages.'
      })
      .expect(201);

    const caseId: string = createResponse.body.id;
    expect(caseId).toBeDefined();

    await client
      .get(`/cases/${caseId}`)
      .set('x-org-id', ORG_ID)
      .expect(200);

    await client
      .patch(`/cases/${caseId}`)
      .set('x-org-id', ORG_ID)
      .set('x-user-id', USER_ID)
      .send({ status: 'Resolved' })
      .expect(400);

    await client
      .patch(`/cases/${caseId}`)
      .set('x-org-id', ORG_ID)
      .set('x-user-id', USER_ID)
      .send({ status: 'Resolved', description: 'Issue mitigated.' })
      .expect(200);

    await client
      .delete(`/cases/${caseId}`)
      .set('x-org-id', ORG_ID)
      .set('x-user-id', USER_ID)
      .expect(200);

    await client
      .get(`/cases/${caseId}`)
      .set('x-org-id', ORG_ID)
      .expect(404);
  });
});
