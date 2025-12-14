import request from 'supertest';
import jwt from 'jsonwebtoken';

import { RUN_INTEGRATION, describeIf } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

jest.setTimeout(20000);

describeIf(RUN_INTEGRATION)('Phase 8 — Listings backbone', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>;
  let tenantId: string;
  let seedOrgId: string;
  let brokerAuth: string;

  beforeAll(async () => {
    app = await setupTestApp();
    const prisma = (app as any).prisma as import('@hatch/db').PrismaClient;
    const tenant = await prisma.tenant.findFirstOrThrow();
    tenantId = tenant.id;
    seedOrgId = tenant.organizationId;
    const secret = process.env.JWT_ACCESS_SECRET ?? process.env.API_JWT_SECRET ?? 'dev-secret';
    brokerAuth = `Bearer ${jwt.sign(
      { sub: 'user-broker', tenantId, orgId: seedOrgId, roles: ['broker'], role: 'BROKER' },
      secret,
      { expiresIn: '2h' }
    )}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  const withBroker = (orgId: string, req: request.Test) =>
    req.set('Authorization', brokerAuth).set('x-tenant-id', tenantId).set('x-org-id', orgId);

  const createOrg = async (name: string) => {
    const res = await withBroker(seedOrgId, request(app.getHttpServer()).post('/organizations'))
      .send({ name })
      .expect(201);
    return res.body.id as string;
  };

  const acceptInvite = async (orgId: string, email: string) => {
    const invite = await withBroker(
      orgId,
      request(app.getHttpServer()).post(`/organizations/${orgId}/invites`)
    )
      .send({ email })
      .expect(201);
    const token = invite.body.token as string;
    return request(app.getHttpServer())
      .post('/agent-invites/accept')
      .set('x-tenant-id', tenantId)
      .set('x-org-id', orgId)
      .send({ token, password: 'Password!234', firstName: 'Listing', lastName: 'Agent' })
      .expect(201);
  };

  const createAgentProfile = (orgId: string, userId: string) =>
    withBroker(orgId, request(app.getHttpServer()).post(`/organizations/${orgId}/agents/profile`))
      .send({ userId })
      .expect(201);

  const createOrgFile = async (orgId: string, ownerId: string, label: string) => {
    const prisma = (app as any).prisma as import('@hatch/db').PrismaClient;
    const fileObject = await prisma.fileObject.create({
      data: {
        orgId,
        ownerId,
        fileName: `${label}.pdf`,
        storageKey: `org/${orgId}/${Date.now()}-${label}`,
        byteSize: 123
      }
    });
    const orgFile = await prisma.orgFile.create({
      data: {
        orgId,
        name: `${label} File`,
        description: 'auto',
        category: 'OTHER',
        fileId: fileObject.id,
        uploadedByUserId: ownerId
      }
    });
    return orgFile;
  };

  it('allows agent/broker workflow for listings and exposes mission control stats', async () => {
    const orgId = await createOrg(`Listings Org ${Date.now()}`);
    const agentEmail = `listing_agent_${Date.now()}@example.com`;
    await acceptInvite(orgId, agentEmail);
    const prisma = (app as any).prisma as import('@hatch/db').PrismaClient;
    const agentUser = await prisma.user.findUniqueOrThrow({ where: { email: agentEmail.toLowerCase() } });
    const profileRes = await createAgentProfile(orgId, agentUser.id);
    const agentProfileId = profileRes.body.id as string;

    const agentToken = `Bearer ${jwt.sign(
      { sub: agentUser.id, tenantId, orgId, roles: ['agent'], role: 'AGENT' },
      process.env.JWT_ACCESS_SECRET ?? process.env.API_JWT_SECRET ?? 'dev-secret',
      { expiresIn: '1h' }
    )}`;

    const listingRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/listings`)
      .set('Authorization', agentToken)
      .set('x-tenant-id', tenantId)
      .set('x-org-id', orgId)
      .send({
        agentProfileId,
        addressLine1: '123 Main',
        city: 'Miami',
        state: 'FL',
        postalCode: '33101',
        listPrice: 500000
      })
      .expect(201);
    const listingId = listingRes.body.id as string;

    await request(app.getHttpServer())
      .post(`/organizations/${orgId}/listings/${listingId}/request-approval`)
      .set('Authorization', agentToken)
      .set('x-tenant-id', tenantId)
      .set('x-org-id', orgId)
      .expect(200);

    const approval = await withBroker(
      orgId,
      request(app.getHttpServer()).post(`/organizations/${orgId}/listings/${listingId}/approve`)
    ).expect(200);
    expect(approval.body.status).toBe('ACTIVE');
    expect(approval.body.brokerApproved).toBe(true);

    const orgFile = await createOrgFile(orgId, agentUser.id, 'listing-doc');
    await withBroker(
      orgId,
      request(app.getHttpServer()).post(`/organizations/${orgId}/listings/${listingId}/documents`)
    )
      .send({ orgFileId: orgFile.id, type: 'LISTING_AGREEMENT' })
      .expect(201);

    const overview = await withBroker(
      orgId,
      request(app.getHttpServer()).get(`/organizations/${orgId}/mission-control/overview`)
    ).expect(200);
    expect(overview.body.listings.total).toBeGreaterThanOrEqual(1);
    expect(overview.body.listings.active).toBeGreaterThanOrEqual(1);

    const agents = await withBroker(
      orgId,
      request(app.getHttpServer()).get(`/organizations/${orgId}/mission-control/agents`)
    ).expect(200);
    const row = agents.body.find((entry: any) => entry.agentProfileId === agentProfileId);
    expect(row.listingCount).toBeGreaterThanOrEqual(1);
    expect(row.activeListingCount).toBeGreaterThanOrEqual(1);
  });

  it('prevents non-members from modifying listings', async () => {
    const orgId = await createOrg(`Listings Restrict Org ${Date.now()}`);
    const listing = await withBroker(
      orgId,
      request(app.getHttpServer()).post(`/organizations/${orgId}/listings`)
    )
      .send({ addressLine1: '456 Elm', city: 'Tampa', state: 'FL', postalCode: '33602' })
      .expect(201);
    const outsiderToken = `Bearer ${jwt.sign(
      { sub: 'not-member', tenantId, orgId: 'other-org', roles: ['agent'], role: 'AGENT' },
      process.env.JWT_ACCESS_SECRET ?? process.env.API_JWT_SECRET ?? 'dev-secret',
      { expiresIn: '1h' }
    )}`;
    await request(app.getHttpServer())
      .patch(`/organizations/${orgId}/listings/${listing.body.id}`)
      .set('Authorization', outsiderToken)
      .set('x-tenant-id', tenantId)
      .set('x-org-id', orgId)
      .send({ listPrice: 100 })
      .expect(403);
  });
});
