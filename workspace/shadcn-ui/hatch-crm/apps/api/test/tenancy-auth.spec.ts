import request from 'supertest';

import { RUN_INTEGRATION, describeIf } from './helpers/cond';
import { setupTestApp } from './setupTestApp';

describeIf(RUN_INTEGRATION)('Tenancy & Auth integration', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>;

  beforeAll(async () => {
    app = await setupTestApp();
    // TODO: seed minimal org/user/membership data for auth tests.
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects missing authentication headers', async () => {
    await request(app.getHttpServer()).get('/accounts/some-id').set('x-org-id', 'org-test').expect(401);
  });

  it('rejects access across org boundaries', async () => {
    const token = 'Bearer test-access-token';
    await request(app.getHttpServer())
      .get('/accounts/some-id')
      .set('Authorization', token)
      .set('x-org-id', 'org-one')
      .set('x-user-id', 'user-one')
      .expect(403);
  });
});
