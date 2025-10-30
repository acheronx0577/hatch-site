import request from 'supertest';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('Admin layouts integration', () => {
  const orgHeaders = {
    'x-user-id': 'user-demo-admin',
    'x-org-id': 'org-demo',
    'x-tenant-id': 'tenant-demo',
    'x-user-role': 'BROKER'
  } as const;

  const manifestBody = {
    object: 'contacts',
    kind: 'list' as const,
    fields: [
      { field: 'primaryEmail', order: 0 },
      { field: 'primaryPhone', order: 1 }
    ]
  };

  let app: Awaited<ReturnType<typeof setupTestApp>>;

  beforeAll(async () => {
    app = await setupTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists layout updates and returns the resolved manifest', async () => {
    const client = request(app.getHttpServer());

    await client
      .post('/admin/layouts/upsert')
      .set(orgHeaders)
      .send(manifestBody)
      .expect(200);

    const resolve = await client
      .get('/admin/layouts/resolve')
      .set(orgHeaders)
      .query({ object: 'contacts', kind: 'list' })
      .expect(200);

    const fields: Array<{ field: string }> = resolve.body.fields ?? [];
    expect(fields.map((f) => f.field).slice(0, 2)).toEqual(['primaryEmail', 'primaryPhone']);
  });
});
