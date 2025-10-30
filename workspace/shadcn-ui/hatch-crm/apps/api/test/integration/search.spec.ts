import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('Search Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await setupTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns hits, cursor, and facets', async () => {
    const client = request(app.getHttpServer());

    const response = await client
      .get('/search')
      .set('x-user-id', 'user-broker')
      .set('x-user-role', 'BROKER')
      .set('x-org-id', 'org-hatch')
      .set('x-tenant-id', 'tenant-hatch')
      .query({ q: 'smith', limit: 5 })
      .expect(200);

    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body).toHaveProperty('facets');
    expect(response.body).toHaveProperty('nextCursor');
  });
});
