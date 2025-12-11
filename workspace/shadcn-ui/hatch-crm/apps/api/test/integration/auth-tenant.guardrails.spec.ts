import request from 'supertest';
import jwt from 'jsonwebtoken';

import { RUN_INTEGRATION, describeIf } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('Auth/Tenant guardrails - contacts & files', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>;
  let prisma: import('@hatch/db').PrismaClient;
  let tenantId: string;
  let orgId: string;
  let brokerAuth: string;

  beforeAll(async () => {
    app = await setupTestApp();
    prisma = (app as any).prisma as import('@hatch/db').PrismaClient;
    const tenant = await prisma.tenant.findFirstOrThrow();
    tenantId = tenant.id;
    orgId = tenant.organizationId;
    const secret = process.env.JWT_ACCESS_SECRET ?? process.env.API_JWT_SECRET ?? 'dev-secret';
    brokerAuth = `Bearer ${jwt.sign(
      { sub: 'user-broker', tenantId, orgId, roles: ['broker'], role: 'BROKER' },
      secret,
      { expiresIn: '2h' }
    )}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  const withBroker = (req: request.Test, overrides?: Record<string, string>) => {
    const base = req
      .set('Authorization', brokerAuth)
      .set('x-tenant-id', tenantId)
      .set('x-org-id', orgId)
      .set('x-user-role', 'BROKER');
    if (overrides) {
      Object.entries(overrides).forEach(([key, value]) => {
        base.set(key, value);
      });
    }
    return base;
  };

  it('converts contacts within the current org/tenant only', async () => {
    const contact = await prisma.person.create({
      data: {
        tenantId,
        organizationId: orgId,
        ownerId: 'user-broker',
        firstName: 'Guard',
        lastName: 'Rail'
      }
    });

    const ok = await withBroker(
      request(app.getHttpServer()).post(`/contacts/${contact.id}/convert-to-opportunity`).send({
        opportunityName: 'Guardrail Opp'
      })
    ).expect(200);
    expect(ok.body.opportunity).toBeDefined();
    expect(ok.body.account).toBeDefined();

    await withBroker(
      request(app.getHttpServer())
        .post(`/contacts/${contact.id}/convert-to-opportunity`)
        .send({})
        .set('x-tenant-id', 'tenant-other')
    ).expect(404);

    await withBroker(
      request(app.getHttpServer())
        .post(`/contacts/${contact.id}/convert-to-opportunity`)
        .send({})
        .set('x-org-id', 'org-other')
    ).expect(404);
  });

  it('scopes file links by org for listings', async () => {
    const listing = await prisma.orgListing.findFirstOrThrow({
      where: { organizationId: orgId }
    });

    const file = await prisma.fileObject.create({
      data: {
        orgId,
        ownerId: 'user-broker',
        fileName: 'guard.txt',
        mimeType: 'text/plain',
        byteSize: 42,
        storageKey: `test/guard-${Date.now()}`
      }
    });

    await prisma.fileLink.create({
      data: {
        orgId,
        fileId: file.id,
        object: 'listings',
        recordId: listing.id
      }
    });

    const list = await withBroker(request(app.getHttpServer()).get(`/files/listings/${listing.id}`)).expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((entry: any) => entry.file?.id === file.id)).toBe(true);

    const cross = await withBroker(
      request(app.getHttpServer()).get(`/files/listings/${listing.id}`),
      { 'x-org-id': 'org-other' }
    ).expect(200);
    expect(Array.isArray(cross.body)).toBe(true);
    expect(cross.body.length).toBe(0);
  });
});
