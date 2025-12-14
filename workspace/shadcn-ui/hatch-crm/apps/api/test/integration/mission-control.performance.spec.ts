import request from 'supertest';
import jwt from 'jsonwebtoken';

import { RUN_INTEGRATION, describeIf } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

// Lightweight smoke to ensure mission-control endpoints stay responsive and return key fields.
describeIf(RUN_INTEGRATION)('Mission Control performance smoke', () => {
  let app: Awaited<ReturnType<typeof setupTestApp>>;
  let tenantId: string;
  let orgId: string;
  let brokerAuth: string;

  beforeAll(async () => {
    app = await setupTestApp();
    const prisma = (app as any).prisma as import('@hatch/db').PrismaClient;
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

  const withBroker = (req: request.Test) => req.set('Authorization', brokerAuth).set('x-tenant-id', tenantId).set('x-org-id', orgId);

  it('serves overview/agents/compliance quickly with core metrics present', async () => {
    const start = Date.now();

    const overview = await withBroker(
      request(app.getHttpServer()).get(`/organizations/${orgId}/mission-control/overview`)
    ).expect(200);
    expect(overview.body).toHaveProperty('organizationId', orgId);
    expect(overview.body).toHaveProperty('listings.total');
    expect(overview.body).toHaveProperty('transactions.total');

    const agents = await withBroker(
      request(app.getHttpServer()).get(`/organizations/${orgId}/mission-control/agents`)
    ).expect(200);
    expect(Array.isArray(agents.body)).toBe(true);

    const compliance = await withBroker(
      request(app.getHttpServer()).get(`/organizations/${orgId}/mission-control/compliance`)
    ).expect(200);
    expect(compliance.body).toHaveProperty('organizationId', orgId);
    expect(compliance.body).toHaveProperty('totalAgents');

    const duration = Date.now() - start;
    // Guardrail against regressions; 2s keeps this stable in CI while catching full table scans.
    expect(duration).toBeLessThan(2000);
  });
});
