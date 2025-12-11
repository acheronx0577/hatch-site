import request from 'supertest';
import jwt from 'jsonwebtoken';

import { RUN_INTEGRATION, describeIf } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('AI Employees - templates response shape', () => {
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

  const withBroker = (req: request.Test) =>
    req.set('Authorization', brokerAuth).set('x-tenant-id', tenantId).set('x-org-id', orgId);

  it('includes canonical keys and avatar metadata for known personas', async () => {
    const res = await withBroker(request(app.getHttpServer()).get('/ai/employees/templates')).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const templates = res.body as Array<Record<string, any>>;
    const expected = new Set([
      'hatch_assistant',
      'agent_copilot',
      'lead_nurse',
      'listing_concierge',
      'market_analyst',
      'transaction_coordinator'
    ]);

    expected.forEach((canonical) => {
      const match = templates.find((tpl) => tpl.canonicalKey === canonical);
      expect(match).toBeDefined();
      if (match) {
        expect(typeof match.personaColor === 'string' && match.personaColor.startsWith('#')).toBe(true);
        expect(typeof match.avatarShape).toBe('string');
        expect(typeof match.avatarInitial === 'string' && match.avatarInitial.length >= 1).toBe(true);
        expect(match.defaultSettings).toBeDefined();
        expect(Array.isArray(match.allowedTools)).toBe(true);
      }
    });

    // All returned templates should expose the metadata fields (even for unknown personas)
    templates.forEach((tpl) => {
      expect(tpl).toHaveProperty('canonicalKey');
      expect(tpl).toHaveProperty('personaColor');
      expect(tpl).toHaveProperty('avatarShape');
      expect(tpl).toHaveProperty('avatarInitial');
    });
  });
});
