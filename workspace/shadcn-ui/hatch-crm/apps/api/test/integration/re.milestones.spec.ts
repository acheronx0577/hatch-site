import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { DealStage, ListingStatus, Prisma } from '@hatch/db';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';
import { PrismaService } from '../../src/modules/prisma/prisma.service';

const ORG_ID = 'org-hatch';
const TENANT_ID = 'tenant-hatch';
const USER_ID = 'user-broker';

describeIf(RUN_INTEGRATION)('Real-estate milestones', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let transactionId: string;

  beforeAll(async () => {
    const setup = await setupTestApp();
    app = setup;
    prisma = setup.prisma;

    const buyer =
      (await prisma.person.findFirst({ where: { organizationId: ORG_ID } })) ??
      (await prisma.person.create({
        data: {
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          ownerId: USER_ID,
          firstName: 'Escrow',
          lastName: 'Buyer',
          stage: 'ACTIVE'
        }
      }));

    const listing = await prisma.listing.create({
      data: {
        tenantId: TENANT_ID,
        personId: buyer.id,
        status: ListingStatus.PENDING,
        addressLine1: '456 Escrow Ave',
        city: 'Orlando',
        state: 'FL',
        postalCode: '32801',
        country: 'USA'
      }
    });

    const deal = await prisma.deal.create({
      data: {
        tenantId: TENANT_ID,
        personId: buyer.id,
        listingId: listing.id,
        stage: DealStage.UNDER_CONTRACT,
        milestoneChecklist: { items: [] },
        forecastGci: new Prisma.Decimal(10000)
      }
    });

    transactionId = deal.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('updates milestones and emits events', async () => {
    const client = request(app.getHttpServer());

    const response = await client
      .patch(`/re/transactions/${transactionId}/milestone`)
      .set('x-org-id', ORG_ID)
      .set('x-tenant-id', TENANT_ID)
      .set('x-user-id', USER_ID)
      .send({
        name: 'Inspection Complete',
        completedAt: new Date().toISOString(),
        notes: 'All good'
      })
      .expect(200);

    expect(response.body.milestoneChecklist.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Inspection Complete'
        })
      ])
    );

    const outboxExists = prisma?.outbox?.findMany !== undefined;
    if (outboxExists) {
      const events = await prisma.outbox.findMany({
        where: { tenantId: TENANT_ID, eventType: 're.transaction.milestone.completed' },
        orderBy: { createdAt: 'desc' }
      });
      expect(events.length).toBeGreaterThan(0);
    }
  });
});
