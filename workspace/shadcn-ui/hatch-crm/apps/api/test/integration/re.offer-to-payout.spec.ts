import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ListingStatus, DealStage, Prisma } from '@hatch/db';

import { describeIf, RUN_INTEGRATION } from '../helpers/cond';
import { setupTestApp } from '../setupTestApp';
import { PrismaService } from '../../src/modules/prisma/prisma.service';

const ORG_ID = 'org-hatch';
const TENANT_ID = 'tenant-hatch';
const USER_ID = 'user-broker';

describeIf(RUN_INTEGRATION)('Real-estate offer acceptance flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let listingId: string;
  let buyerId: string;
  let opportunityId: string;

  beforeAll(async () => {
    const setup = await setupTestApp();
    app = setup;
    prisma = setup.prisma;

    await prisma.orgCommissionPlan.upsert({
      where: { id: 'seed-plan' },
      update: {},
      create: {
        id: 'seed-plan',
        orgId: ORG_ID,
        name: 'Seed Plan 70/30',
        brokerSplit: 0.3,
        agentSplit: 0.7
      }
    });

    const buyer =
      (await prisma.person.findFirst({ where: { organizationId: ORG_ID } })) ??
      (await prisma.person.create({
        data: {
          tenantId: TENANT_ID,
          organizationId: ORG_ID,
          ownerId: USER_ID,
          firstName: 'Buyer',
          lastName: 'Test',
          stage: 'ACTIVE'
        }
      }));

    buyerId = buyer.id;

    const opportunity = await prisma.opportunity.create({
      data: {
        orgId: ORG_ID,
        ownerId: USER_ID,
        name: 'RE Flow Opportunity',
        stage: 'Qualification',
        amount: new Prisma.Decimal(300000),
        currency: 'USD'
      }
    });

    opportunityId = opportunity.id;

    const listing = await prisma.listing.create({
      data: {
        tenantId: TENANT_ID,
        personId: buyerId,
        opportunityId,
        status: ListingStatus.ACTIVE,
        addressLine1: '123 Demo Street',
        city: 'Miami',
        state: 'FL',
        postalCode: '33101',
        country: 'USA'
      }
    });

    listingId = listing.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('creates offer, accepts it, and generates payouts', async () => {
    const client = request(app.getHttpServer());

    const createResponse = await client
      .post('/re/offers')
      .set('x-org-id', ORG_ID)
      .set('x-tenant-id', TENANT_ID)
      .set('x-user-id', USER_ID)
      .send({
        listingId,
        buyerContactId: buyerId,
        amount: 285000,
        contingencies: ['Inspection', 'Finance']
      })
      .expect(201);

    const offerId = createResponse.body.id;
    expect(offerId).toBeDefined();

    const decideResponse = await client
      .post(`/re/offers/${offerId}/decide`)
      .set('x-org-id', ORG_ID)
      .set('x-tenant-id', TENANT_ID)
      .set('x-user-id', USER_ID)
      .send({ status: 'ACCEPTED' })
      .expect(200);

    const transactionId: string | undefined = decideResponse.body.transaction?.id;
    expect(transactionId).toBeDefined();

    const commission = await client
      .get(`/re/transactions/${transactionId}/commission`)
      .set('x-org-id', ORG_ID)
      .set('x-tenant-id', TENANT_ID)
      .set('x-user-id', USER_ID)
      .expect(200);

    expect(commission.body.gross).toBeGreaterThan(0);

    await client
      .post(`/re/transactions/${transactionId}/payouts`)
      .set('x-org-id', ORG_ID)
      .set('x-tenant-id', TENANT_ID)
      .set('x-user-id', USER_ID)
      .expect(201);

    const payouts = await prisma.payout.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'desc' }
    });

    expect(payouts.length).toBeGreaterThanOrEqual(1);

    const outboxExists = prisma?.outbox?.findMany !== undefined;
    if (outboxExists) {
      const events = await prisma.outbox.findMany({
        where: { tenantId: TENANT_ID, eventType: 're.payouts.generated' },
        orderBy: { createdAt: 'desc' }
      });
      expect(events.length).toBeGreaterThan(0);
    }

    const storedTransaction = await prisma.deal.findUnique({ where: { id: transactionId! } });
    expect(storedTransaction?.stage).toBe(DealStage.UNDER_CONTRACT);
  });
});
