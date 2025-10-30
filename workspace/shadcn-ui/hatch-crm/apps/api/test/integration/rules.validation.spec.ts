import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';

import { Prisma } from '@hatch/db';

import type { PrismaService } from '../../src/modules/prisma/prisma.service';
import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';

const ORG_ID = 'org-hatch';

describeIf(RUN_INTEGRATION)('Rules validation middleware', () => {
  let app: (INestApplication & { prisma: PrismaService }) | null = null;

  beforeAll(async () => {
    app = await setupTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(async () => {
    if (!app) return;
    await app.prisma.validationRule.deleteMany({ where: { orgId: ORG_ID } });
    await app.prisma.case.deleteMany({ where: { orgId: ORG_ID, subject: { contains: 'Rule Test' } } });
  });

  it('rejects case close without description and allows compliant payload', async () => {
    if (!app) return;

    await app.prisma.validationRule.create({
      data: {
        id: randomUUID(),
        orgId: ORG_ID,
        object: 'cases',
        name: 'Require description when resolved',
        active: true,
        dsl: {
          if: "status in ['Resolved','Closed']",
          then_required: ['description']
        } as Prisma.InputJsonValue
      }
    });

    const client = request(app.getHttpServer());

    const violation = await client
      .post('/cases')
      .set('x-org-id', ORG_ID)
      .set('x-user-id', 'user-broker')
      .send({ subject: 'Rule Test Case', status: 'Resolved' })
      .expect(400);

    expect(Array.isArray(violation.body?.violations)).toBe(true);
    expect(violation.body.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'description' })
      ])
    );

    const success = await client
      .post('/cases')
      .set('x-org-id', ORG_ID)
      .set('x-user-id', 'user-broker')
      .send({
        subject: 'Rule Test Case OK',
        status: 'Resolved',
        description: 'Customer called back and confirmed resolution.'
      })
      .expect(201);

    expect(success.body).toMatchObject({ description: 'Customer called back and confirmed resolution.' });
  });
});
