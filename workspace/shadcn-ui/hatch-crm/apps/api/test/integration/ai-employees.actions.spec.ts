import request from 'supertest';
import jwt from 'jsonwebtoken';

import { RUN_INTEGRATION, describeIf } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

describeIf(RUN_INTEGRATION)('AI employees - actions & usage smoke', () => {
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

  const withBroker = (req: request.Test) =>
    req
      .set('Authorization', brokerAuth)
      .set('x-tenant-id', tenantId)
      .set('x-org-id', orgId)
      .set('x-user-role', 'BROKER');

  it('approves/rejects actions and reports usage', async () => {
    const instance = await prisma.aiEmployeeInstance.findFirstOrThrow({
      where: { tenantId },
      include: { template: true }
    });

    const pending = await prisma.aiProposedAction.create({
      data: {
        employeeInstanceId: instance.id,
        tenantId,
        actionType: 'noop_tool',
        payload: { example: true },
        status: 'requires-approval',
        requiresApproval: true,
        dryRun: true
      }
    });

    const list = await withBroker(request(app.getHttpServer()).get('/ai/employees/actions')).expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.find((action: any) => action.id === pending.id)).toBeDefined();

    const approved = await withBroker(
      request(app.getHttpServer()).post(`/ai/employees/actions/${pending.id}/approve`).send({ note: 'looks good' })
    ).expect(201);
    expect(approved.body.status).toBe('executed');
    expect(approved.body.dryRun).toBe(true);

    const rejectTarget = await prisma.aiProposedAction.create({
      data: {
        employeeInstanceId: instance.id,
        tenantId,
        actionType: 'noop_tool',
        payload: { example: false },
        status: 'requires-approval',
        requiresApproval: true
      }
    });

    const rejected = await withBroker(
      request(app.getHttpServer()).post(`/ai/employees/actions/${rejectTarget.id}/reject`).send({ note: 'not safe' })
    ).expect(201);
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.errorMessage).toBe('not safe');

    const usage = await withBroker(request(app.getHttpServer()).get('/ai/employees/usage')).expect(200);
    expect(Array.isArray(usage.body)).toBe(true);
    const usageEntry = usage.body.find((row: any) => row.personaKey === instance.template.key);
    expect(usageEntry).toBeDefined();
    expect(usageEntry.totalActions).toBeGreaterThan(0);
  });
});
