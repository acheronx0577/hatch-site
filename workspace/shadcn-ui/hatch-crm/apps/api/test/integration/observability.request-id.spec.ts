import request from 'supertest';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('Observability request id middleware', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>;

  beforeAll(async () => {
    app = await setupTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('echoes the x-request-id header when provided', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'test-request-id')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('test-request-id');
  });
});
