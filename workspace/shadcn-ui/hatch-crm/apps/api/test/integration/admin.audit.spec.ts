import request from 'supertest';

jest.mock('pdf-parse', () => jest.fn(async () => ({ text: '' })));

import { AuditAction } from '@hatch/db';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('Admin audit viewer', () => {
  const headers = {
    'x-user-id': 'user-demo-admin',
    'x-org-id': 'org-demo',
    'x-tenant-id': 'tenant-demo',
    'x-user-role': 'BROKER'
  } as const;

  let app: Awaited<ReturnType<typeof setupTestApp>>;

  beforeAll(async () => {
    app = await setupTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.prisma.auditEvent.deleteMany({ where: { orgId: headers['x-org-id'] } });

    await app.prisma.auditEvent.create({
      data: {
        orgId: headers['x-org-id'],
        actorId: headers['x-user-id'],
        object: 'accounts',
        recordId: 'acct-001',
        action: AuditAction.CREATE,
        diff: { name: 'Acme Co.' },
        createdAt: new Date('2024-06-01T12:00:00.000Z')
      }
    });

    await app.prisma.auditEvent.create({
      data: {
        orgId: headers['x-org-id'],
        actorId: headers['x-user-id'],
        object: 'accounts',
        recordId: 'acct-002',
        action: AuditAction.UPDATE,
        diff: { before: { stage: 'Prospect' }, after: { stage: 'Active' } },
        createdAt: new Date('2024-06-02T15:00:00.000Z')
      }
    });
  });

  it('lists audit records with paging and filters', async () => {
    const client = request(app.getHttpServer());

    const firstPage = await client
      .get('/admin/audit')
      .set(headers)
      .query({ object: 'accounts', limit: 1 })
      .expect(200);

    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.items[0]).toMatchObject({
      object: 'accounts',
      objectId: 'acct-002',
      action: 'UPDATE'
    });
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await client
      .get('/admin/audit')
      .set(headers)
      .query({ object: 'accounts', cursor: firstPage.body.nextCursor })
      .expect(200);

    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0]).toMatchObject({
      objectId: 'acct-001',
      action: 'CREATE'
    });
    expect(secondPage.body.nextCursor).toBeNull();

    const filtered = await client
      .get('/admin/audit')
      .set(headers)
      .query({
        object: 'accounts',
        action: 'CREATE',
        from: '2024-06-01T00:00:00.000Z',
        to: '2024-06-01T23:59:59.999Z'
      })
      .expect(200);

    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].action).toBe('CREATE');
  });
});
