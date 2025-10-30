import { LeadScoreTier, Prisma } from '@prisma/client';
import { addHours } from 'date-fns';

import { prisma } from './index';

interface PipelineSeedDefinition {
  name: string;
  type: string;
  order: number;
  stages: Array<{ name: string; slaMinutes?: number | null }>;
}

const S_SERIES_STAGES = Array.from({ length: 10 }, (_, index) => ({
  name: `S${index + 1}`,
  slaMinutes: null
}));

const DEFAULT_PIPELINES: PipelineSeedDefinition[] = [
  {
    name: 'S-Series',
    type: 'buyer',
    order: 0,
    stages: S_SERIES_STAGES
  },
  {
    name: 'Buyer',
    type: 'buyer',
    order: 1,
    stages: [
      { name: 'New', slaMinutes: 60 },
      { name: 'Engaged', slaMinutes: 240 },
      { name: 'Qualified', slaMinutes: 720 },
      { name: 'Showing', slaMinutes: 1440 },
      { name: 'Offer' },
      { name: 'Under Contract' },
      { name: 'Closed' },
      { name: 'Nurture' }
    ]
  },
  {
    name: 'Seller',
    type: 'seller',
    order: 2,
    stages: [
      { name: 'New', slaMinutes: 60 },
      { name: 'Discovery', slaMinutes: 240 },
      { name: 'Pre-List', slaMinutes: 720 },
      { name: 'Active Listing' },
      { name: 'Under Contract' },
      { name: 'Closed' },
      { name: 'Nurture' }
    ]
  }
];

async function ensurePipelines(tenantId: string) {
  const pipelines: Record<
    string,
    {
      pipeline: { id: string };
      stages: Array<{ id: string; name: string }>;
    }
  > = {};

  for (const definition of DEFAULT_PIPELINES) {
    const pipeline = await prisma.pipeline.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: definition.name
        }
      },
      update: {
        type: definition.type,
        order: definition.order
      },
      create: {
        tenantId,
        name: definition.name,
        type: definition.type,
        order: definition.order
      }
    });

    for (const [index, stageDefinition] of definition.stages.entries()) {
      await prisma.stage.upsert({
        where: {
          tenantId_pipelineId_name: {
            tenantId,
            pipelineId: pipeline.id,
            name: stageDefinition.name
          }
        },
        update: {
          order: index,
          slaMinutes: stageDefinition.slaMinutes ?? null
        },
        create: {
          tenantId,
          pipelineId: pipeline.id,
          name: stageDefinition.name,
          order: index,
          slaMinutes: stageDefinition.slaMinutes ?? null
        }
      });
    }

    const full = await prisma.pipeline.findUnique({
      where: { id: pipeline.id },
      include: { stages: { orderBy: { order: 'asc' } } }
    });

    pipelines[definition.name] = {
      pipeline: { id: pipeline.id },
      stages: full?.stages.map((stage) => ({ id: stage.id, name: stage.name })) ?? []
    };
  }

  return pipelines;
}

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: 'org-hatch' },
    update: {},
    create: {
      id: 'org-hatch',
      name: 'Hatch Realty'
    }
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'hatch-brokerage' },
    update: {},
    create: {
      id: 'tenant-hatch',
      organizationId: organization.id,
      name: 'Hatch Brokerage',
      slug: 'hatch-brokerage',
      timezone: 'America/New_York',
      quietHoursStart: 21,
      quietHoursEnd: 8,
      tenDlcReady: true
    }
  });

  const broker = await prisma.user.upsert({
    where: { email: 'broker@hatchcrm.test' },
    update: {},
    create: {
      id: 'user-broker',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'broker@hatchcrm.test',
      firstName: 'Brianna',
      lastName: 'Broker',
      role: 'BROKER'
    }
  });

  const agent = await prisma.user.upsert({
    where: { email: 'agent@hatchcrm.test' },
    update: {},
    create: {
      id: 'user-agent',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'agent@hatchcrm.test',
      firstName: 'Aria',
      lastName: 'Agent',
      role: 'AGENT'
    }
  });

  const isa = await prisma.user.upsert({
    where: { email: 'isa@hatchcrm.test' },
    update: {},
    create: {
      id: 'user-isa',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'isa@hatchcrm.test',
      firstName: 'Ivan',
      lastName: 'ISA',
      role: 'ISA'
    }
  });

  const memberships: Array<{ id: string; userId: string; isOrgAdmin: boolean }> = [
    { id: 'uom-broker', userId: broker.id, isOrgAdmin: true },
    { id: 'uom-agent', userId: agent.id, isOrgAdmin: true },
    { id: 'uom-isa', userId: isa.id, isOrgAdmin: true }
  ];

  for (const membership of memberships) {
    await prisma.userOrgMembership.upsert({
      where: { id: membership.id },
      update: {
        isOrgAdmin: membership.isOrgAdmin
      },
      create: {
        id: membership.id,
        userId: membership.userId,
        orgId: organization.id,
        isOrgAdmin: membership.isOrgAdmin
      }
    });
  }

  const pipelines = await ensurePipelines(tenant.id);
  const sSeriesPipeline = pipelines['S-Series'];
  if (!sSeriesPipeline) {
    throw new Error('S-Series pipeline was not seeded');
  }
  const sSeriesStagesByName = Object.fromEntries(
    sSeriesPipeline.stages.map((stage) => [stage.name, stage])
  );
  const stageS1Id = sSeriesStagesByName['S1']?.id;
  const stageS3Id = sSeriesStagesByName['S3']?.id ?? stageS1Id;
  const stageS5Id = sSeriesStagesByName['S5']?.id ?? stageS3Id;

  const coldLeadData: Prisma.PersonUncheckedUpdateInput = {
    organizationId: organization.id,
    tenantId: tenant.id,
    ownerId: isa.id,
    firstName: 'Casey',
    lastName: 'ColdLead',
    primaryEmail: 'casey@example.com',
    primaryPhone: '+14155550123',
    stage: 'NEW',
    tags: ['new-lead'],
    source: 'portal',
    pipelineId: sSeriesPipeline.pipeline.id,
    stageId: stageS1Id ?? null,
    stageEnteredAt: addHours(new Date(), -12),
    leadScore: 18,
    scoreTier: LeadScoreTier.D,
    scoreUpdatedAt: new Date(),
    lastActivityAt: addHours(new Date(), -48)
  };

  const contactNoConsent = await prisma.person.upsert({
    where: { id: 'contact-no-consent' },
    update: coldLeadData,
    create: {
      id: 'contact-no-consent',
      ...coldLeadData
    }
  });

  const hotLeadData: Prisma.PersonUncheckedUpdateInput = {
    organizationId: organization.id,
    tenantId: tenant.id,
    ownerId: agent.id,
    firstName: 'Morgan',
    lastName: 'Mover',
    primaryEmail: 'morgan@example.com',
    primaryPhone: '+14155550124',
    stage: 'ACTIVE',
    tags: ['hot'],
    source: 'referral',
    pipelineId: sSeriesPipeline.pipeline.id,
    stageId: stageS5Id ?? stageS3Id ?? stageS1Id ?? null,
    stageEnteredAt: addHours(new Date(), -36),
    leadScore: 86,
    scoreTier: LeadScoreTier.A,
    scoreUpdatedAt: new Date(),
    lastActivityAt: addHours(new Date(), -4)
  };

  const contactWithBba = await prisma.person.upsert({
    where: { id: 'contact-bba' },
    update: hotLeadData,
    create: {
      id: 'contact-bba',
      ...hotLeadData
    }
  });

  await prisma.leadFit.upsert({
    where: { personId: contactWithBba.id },
    update: {
      preapproved: true,
      budgetMin: 500000,
      budgetMax: 1200000,
      timeframeDays: 60,
      geo: 'miami',
      inventoryMatch: 18,
      updatedAt: new Date()
    },
    create: {
      id: 'leadfit-morgan',
      tenantId: tenant.id,
      personId: contactWithBba.id,
      preapproved: true,
      budgetMin: 500000,
      budgetMax: 1200000,
      timeframeDays: 60,
      geo: 'miami',
      inventoryMatch: 18
    }
  });

  await prisma.leadActivityRollup.upsert({
    where: { personId: contactWithBba.id },
    update: {
      last7dListingViews: 6,
      last7dSessions: 4,
      lastReplyAt: new Date(),
      lastEmailOpenAt: new Date()
    },
    create: {
      id: 'activity-morgan',
      tenantId: tenant.id,
      personId: contactWithBba.id,
      last7dListingViews: 6,
      last7dSessions: 4,
      lastReplyAt: new Date(),
      lastEmailOpenAt: new Date()
    }
  });

  await prisma.leadTask.upsert({
    where: { id: 'task-follow-up' },
    update: {},
    create: {
      id: 'task-follow-up',
      tenantId: tenant.id,
      personId: contactWithBba.id,
      assigneeId: agent.id,
      title: 'Schedule tour for Harbor Way',
      dueAt: addHours(new Date(), 24),
      status: 'OPEN'
    }
  });

  await prisma.leadNote.upsert({
    where: { id: 'note-morgan-initial' },
    update: {},
    create: {
      id: 'note-morgan-initial',
      tenantId: tenant.id,
      personId: contactWithBba.id,
      userId: agent.id,
      body: 'Great conversation — interested in waterfront properties around Brickell.'
    }
  });

  await prisma.consent.createMany({
    data: [
      {
        id: 'consent-sms-morgan',
        tenantId: tenant.id,
        personId: contactWithBba.id,
        channel: 'SMS',
        scope: 'PROMOTIONAL',
        status: 'GRANTED',
        verbatimText: 'Morgan opted in via web form',
        source: 'landing_page',
        ipAddress: '203.0.113.1'
      },
      {
        id: 'consent-email-morgan',
        tenantId: tenant.id,
        personId: contactWithBba.id,
        channel: 'EMAIL',
        scope: 'TRANSACTIONAL',
        status: 'GRANTED',
        verbatimText: 'Morgan confirmed via email double opt-in',
        source: 'double_opt_in',
        ipAddress: '203.0.113.1'
      }
    ],
    skipDuplicates: true
  });

  await prisma.agreement.upsert({
    where: { id: 'bba-morgan' },
    update: {},
    create: {
      id: 'bba-morgan',
      tenantId: tenant.id,
      personId: contactWithBba.id,
      type: 'BUYER_REP',
      status: 'SIGNED',
      effectiveDate: new Date(),
      expiryDate: addHours(new Date(), 24 * 180),
      documentUri: 's3://hatch-evidence/bba-morgan.pdf',
      signatureLog: {
        signedBy: 'Morgan Mover',
        provider: 'docusign',
        signedAt: new Date().toISOString()
      },
      signedAt: new Date()
    }
  });

  const listing = await prisma.listing.upsert({
    where: { id: 'listing-1' },
    update: {},
    create: {
      id: 'listing-1',
      tenantId: tenant.id,
      mlsId: 'MLS123456',
      status: 'ACTIVE',
      addressLine1: '123 Harbor Way',
      city: 'Miami',
      state: 'FL',
      postalCode: '33101',
      price: new Prisma.Decimal(975000),
      beds: 3,
      baths: 2,
      latitude: 25.77427,
      longitude: -80.19366
    }
  });

  await prisma.tour.upsert({
    where: { id: 'tour-signed' },
    update: {},
    create: {
      id: 'tour-signed',
      tenantId: tenant.id,
      personId: contactWithBba.id,
      listingId: listing.id,
      agentId: agent.id,
      status: 'CONFIRMED',
      startAt: addHours(new Date(), 48),
      endAt: addHours(new Date(), 49),
      source: 'consumer_portal',
      routingScore: 0.82
    }
  });

  await prisma.mLSProfile.upsert({
    where: { id: 'mls-miami' },
    update: {},
    create: {
      id: 'mls-miami',
      tenantId: tenant.id,
      name: 'Miami MLS',
      disclaimerText: 'Information is deemed reliable but not guaranteed.',
      compensationDisplayRule: 'allowed',
      clearCooperationRequired: true,
      slaHours: 72,
      lastReviewedAt: new Date()
    }
  });

  await prisma.clearCooperationTimer.upsert({
    where: { id: 'clear-coop-1' },
    update: {},
    create: {
      id: 'clear-coop-1',
      tenantId: tenant.id,
      listingId: listing.id,
      status: 'GREEN',
      startedAt: new Date(),
      deadlineAt: addHours(new Date(), 72)
    }
  });

  await prisma.deliverabilityMetric.create({
    data: {
      tenantId: tenant.id,
      agentId: agent.id,
      channel: 'EMAIL',
      accepted: 10,
      delivered: 9,
      bounced: 1,
      optOuts: 0
    }
  });

  const conversation = await prisma.conversation.upsert({
    where: { id: 'conversation-morgan' },
    update: {},
    create: {
      id: 'conversation-morgan',
      tenantId: tenant.id,
      type: 'EXTERNAL',
      personId: contactWithBba.id,
      createdById: agent.id
    }
  });

  const agentParticipant = await prisma.conversationParticipant.upsert({
    where: { id: 'conversation-morgan-agent' },
    update: {},
    create: {
      id: 'conversation-morgan-agent',
      conversationId: conversation.id,
      userId: agent.id,
      role: 'OWNER'
    }
  });

  const brokerParticipant = await prisma.conversationParticipant.upsert({
    where: { id: 'conversation-morgan-broker' },
    update: {},
    create: {
      id: 'conversation-morgan-broker',
      conversationId: conversation.id,
      userId: broker.id,
      role: 'MEMBER'
    }
  });

  await prisma.conversationParticipant.upsert({
    where: { id: 'conversation-morgan-person' },
    update: {},
    create: {
      id: 'conversation-morgan-person',
      conversationId: conversation.id,
      personId: contactWithBba.id,
      role: 'MEMBER'
    }
  });

  await prisma.message.createMany({
    data: [
      {
        id: 'message-morgan-1',
        tenantId: tenant.id,
        conversationId: conversation.id,
        personId: contactWithBba.id,
        userId: agent.id,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        subject: 'Tour confirmation',
        body: 'Looking forward to seeing you at 123 Harbor Way',
        toAddress: 'morgan@example.com',
        fromAddress: 'agent@hatchcrm.test',
        status: 'DELIVERED',
        deliveredAt: new Date()
      },
      {
        id: 'message-morgan-2',
        tenantId: tenant.id,
        conversationId: conversation.id,
        personId: contactWithBba.id,
        channel: 'IN_APP',
        direction: 'INBOUND',
        body: 'Thanks! Can we also see the unit at 789 Bayfront tomorrow?',
        status: 'READ',
        deliveredAt: new Date()
      }
    ],
    skipDuplicates: true
  });

  await prisma.leadTouchpoint.upsert({
    where: { id: 'touchpoint-morgan-conversation' },
    update: {
      occurredAt: addHours(new Date(), -2)
    },
    create: {
      id: 'touchpoint-morgan-conversation',
      tenantId: tenant.id,
      personId: contactWithBba.id,
      userId: agent.id,
      type: 'MESSAGE',
      channel: 'IN_APP',
      occurredAt: addHours(new Date(), -2),
      summary: 'Replied in messenger',
      metadata: {
        conversationId: conversation.id,
        participantId: agentParticipant.id
      }
    }
  });

  await prisma.activity.createMany({
    data: [
      {
        tenantId: tenant.id,
        personId: contactWithBba.id,
        userId: agent.id,
        type: 'LEAD_CREATED',
        payload: { source: 'seed' }
      },
      {
        tenantId: tenant.id,
        personId: contactWithBba.id,
        type: 'CONSENT_CAPTURED',
        payload: { channel: 'SMS' }
      },
      {
        tenantId: tenant.id,
        personId: contactWithBba.id,
        type: 'TOUR_CONFIRMED',
        payload: { tourId: 'tour-signed' }
      }
    ],
    skipDuplicates: true
  });

  await prisma.outbox.create({
    data: {
      tenantId: tenant.id,
      eventType: 'lead.created',
      payload: {
        personId: contactNoConsent.id,
        tenantId: tenant.id,
        occurredAt: new Date().toISOString()
      }
    }
  });

  await prisma.webhookSubscription.upsert({
    where: { id: 'webhook-default' },
    update: {},
    create: {
      id: 'webhook-default',
      tenantId: tenant.id,
      name: 'Demo Listener',
      url: 'http://localhost:4500/hatch-webhooks',
      secret: 'demo-secret',
      eventTypes: ['lead.created', 'tour.requested', 'message.sent']
    }
  });

  const flatPlanDefinition = {
    type: 'FLAT',
    split: { agent: 0.7, brokerage: 0.3 },
    fees: [],
    bonuses: []
  };

  const capPlanDefinition = {
    type: 'CAP',
    cap: { amount: 15000, reset: 'ANNUAL' as const },
    preCapSplit: { agent: 0.7, brokerage: 0.3 },
    postCap: { agent: 1, brokerage: 0, transactionFee: { type: 'FLAT' as const, amount: 250 } },
    fees: [],
    bonuses: []
  };

  const flatPlan = await prisma.commissionPlan.upsert({
    where: { id: 'plan-flat-70-30' },
    update: {},
    create: {
      id: 'plan-flat-70-30',
      tenantId: tenant.id,
      name: '70/30 Flat Split',
      type: 'FLAT',
      description: 'Simple 70/30 split for standard agents.',
      definition: flatPlanDefinition,
      createdById: broker.id
    }
  });

  await prisma.planSnapshot.upsert({
    where: { planId_version: { planId: flatPlan.id, version: flatPlan.version } },
    update: {},
    create: {
      tenantId: tenant.id,
      planId: flatPlan.id,
      version: flatPlan.version,
      payload: flatPlanDefinition,
      createdById: broker.id
    }
  });

  const capPlan = await prisma.commissionPlan.upsert({
    where: { id: 'plan-cap-mentor' },
    update: {},
    create: {
      id: 'plan-cap-mentor',
      tenantId: tenant.id,
      name: 'Cap Plan w/ Mentor Fee',
      type: 'CAP',
      description: '70/30 until $15k cap, then 100% minus $250 fee.',
      definition: capPlanDefinition,
      createdById: broker.id
    }
  });

  await prisma.planSnapshot.upsert({
    where: { planId_version: { planId: capPlan.id, version: capPlan.version } },
    update: {},
    create: {
      tenantId: tenant.id,
      planId: capPlan.id,
      version: capPlan.version,
      payload: capPlanDefinition,
      createdById: broker.id
    }
  });

  await prisma.planAssignment.upsert({
    where: {
      tenantId_assigneeType_assigneeId_planId_effectiveFrom: {
        tenantId: tenant.id,
        assigneeType: 'USER',
        assigneeId: agent.id,
        planId: capPlan.id,
        effectiveFrom: new Date('2025-01-01T00:00:00.000Z')
      }
    },
    update: {},
    create: {
      id: 'plan-assignment-agent',
      tenantId: tenant.id,
      planId: capPlan.id,
      assigneeType: 'USER',
      assigneeId: agent.id,
      effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
      priority: 0,
      createdById: broker.id
    }
  });

  await prisma.capLedger.upsert({
    where: {
      tenantId_userId_planId_periodStart: {
        tenantId: tenant.id,
        userId: agent.id,
        planId: capPlan.id,
        periodStart: new Date('2025-01-01T00:00:00.000Z')
      }
    },
    update: {
      companyDollarYtd: new Prisma.Decimal(8200),
      postCapFeesYtd: new Prisma.Decimal(0),
      periodEnd: new Date('2025-12-31T23:59:59.999Z'),
      capAmount: new Prisma.Decimal(15000)
    },
    create: {
      id: 'cap-ledger-agent',
      tenantId: tenant.id,
      userId: agent.id,
      planId: capPlan.id,
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      periodEnd: new Date('2025-12-31T23:59:59.999Z'),
      capAmount: new Prisma.Decimal(15000),
      companyDollarYtd: new Prisma.Decimal(8200),
      postCapFeesYtd: new Prisma.Decimal(0),
      lastDealId: 'deal-sample'
    }
  });

  console.info('Seed data created successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
