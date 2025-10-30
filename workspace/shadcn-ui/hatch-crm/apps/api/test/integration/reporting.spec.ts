import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  ClearCooperationStatus,
  DealStage,
  MessageChannel,
  MessageDirection,
  MessageStatus,
  Prisma
} from '@hatch/db';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';
import { PrismaService } from '../../src/modules/prisma/prisma.service';

const ORG_ID = 'org-hatch';
const TENANT_ID = 'tenant-hatch';
const OWNER_ID = 'user-broker';

describeIf(RUN_INTEGRATION)('Reporting', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await setupTestApp();
    prisma = app.get(PrismaService);

    await seedTestData(prisma);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('recomputes metrics and returns time-series data', async () => {
    const from = new Date(Date.UTC(2024, 0, 1));
    const to = new Date(Date.UTC(2024, 0, 3));

    await request(app.getHttpServer())
      .post('/reporting/recompute')
      .set('x-org-id', ORG_ID)
      .set('x-user-id', OWNER_ID)
      .send({
        from: from.toISOString(),
        to: to.toISOString()
      })
      .expect(202);

    const seriesResponse = await request(app.getHttpServer())
      .get('/reporting/metrics')
      .set('x-org-id', ORG_ID)
      .query({
        key: 'leads.conversion',
        from: from.toISOString(),
        to: to.toISOString()
      })
      .expect(200);

    expect(seriesResponse.body.length).toBeGreaterThan(0);
    const latestPoint = seriesResponse.body.at(-1);
    expect(latestPoint).toMatchObject({
      valueJson: expect.objectContaining({
        newLeads: expect.any(Number),
        converted: expect.any(Number)
      })
    });

    const deliverabilitySeries = await request(app.getHttpServer())
      .get('/reporting/metrics')
      .set('x-org-id', ORG_ID)
      .query({
        key: 'messaging.deliverability',
        from: from.toISOString(),
        to: to.toISOString()
      })
      .expect(200);

    expect(deliverabilitySeries.body.at(-1)).toMatchObject({
      valueJson: expect.objectContaining({
        total: expect.any(Number),
        success: expect.any(Number)
      })
    });

    const pipelineSeries = await request(app.getHttpServer())
      .get('/reporting/metrics')
      .set('x-org-id', ORG_ID)
      .query({
        key: 'pipeline.value',
        from: from.toISOString(),
        to: to.toISOString()
      })
      .expect(200);

    expect(pipelineSeries.body.at(-1)?.valueJson).toBeTruthy();

    const metricsCount = await prisma.metricsDaily.count({
      where: { orgId: ORG_ID, key: 'leads.conversion' }
    });
    expect(metricsCount).toBeGreaterThan(0);
  });
});

async function seedTestData(prisma: PrismaService) {
  const baseDate = new Date(Date.UTC(2024, 0, 1));

  await prisma.metricsDaily?.deleteMany?.({ where: { orgId: ORG_ID } }).catch(() => undefined);
  await prisma.metricsRun?.deleteMany?.({ where: { orgId: ORG_ID } }).catch(() => undefined);

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const day = new Date(baseDate);
    day.setUTCDate(baseDate.getUTCDate() + dayOffset);

    const person = await prisma.person.create({
      data: {
        tenantId: TENANT_ID,
        organizationId: ORG_ID,
        ownerId: OWNER_ID,
        firstName: `Reporting`,
        lastName: `Lead ${dayOffset}`,
        createdAt: day,
        updatedAt: day
      }
    });

    await prisma.deal.create({
      data: {
        tenantId: TENANT_ID,
        personId: person.id,
        stage: DealStage.UNDER_CONTRACT,
        forecastGci: new Prisma.Decimal(10000 + dayOffset * 1000),
        actualGci: new Prisma.Decimal(5000 + dayOffset * 500),
        createdAt: day,
        updatedAt: day
      }
    });

    await prisma.message.create({
      data: {
        tenantId: TENANT_ID,
        channel: MessageChannel.EMAIL,
        direction: MessageDirection.OUTBOUND,
        status: dayOffset % 2 === 0 ? MessageStatus.DELIVERED : MessageStatus.SENT,
        createdAt: day,
        updatedAt: day
      }
    });

    await prisma.clearCooperationTimer.upsert({
      where: { listingId: `listing-${dayOffset}` },
      update: {
        status:
          dayOffset === 0
            ? ClearCooperationStatus.GREEN
            : dayOffset === 1
              ? ClearCooperationStatus.YELLOW
              : ClearCooperationStatus.RED,
        updatedAt: day
      },
      create: {
        tenantId: TENANT_ID,
        listingId: `listing-${dayOffset}`,
        status:
          dayOffset === 0
            ? ClearCooperationStatus.GREEN
            : dayOffset === 1
              ? ClearCooperationStatus.YELLOW
              : ClearCooperationStatus.RED,
        createdAt: day,
        updatedAt: day
      }
    });

    await prisma.opportunity.create({
      data: {
        orgId: ORG_ID,
        ownerId: OWNER_ID,
        name: `Opportunity ${dayOffset}`,
        stage: dayOffset === 2 ? 'Closed Won' : 'Proposal',
        amount: new Prisma.Decimal(250000 + dayOffset * 10000),
        createdAt: day,
        updatedAt: day
      }
    });
  }
}
