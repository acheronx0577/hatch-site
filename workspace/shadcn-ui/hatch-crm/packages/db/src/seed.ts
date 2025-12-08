import { LeadScoreTier, Prisma } from '@prisma/client';
import { addDays, addHours, subDays } from 'date-fns';

import { prisma } from './index';
import { seedAiEmployees as seedAiEmployeeTemplates } from '../prisma/seed/ai-employees.seed';

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

type AiInstanceUserKey = 'agent' | 'broker' | 'isa' | 'none';

interface AiInstanceSeed {
  id: string;
  templateKey: string;
  nameOverride?: string;
  status: 'active' | 'paused' | 'deleted';
  autoMode: 'suggest-only' | 'requires-approval' | 'auto-run';
  userKey?: AiInstanceUserKey;
  settings?: Record<string, unknown>;
}

const AI_INSTANCE_DEFINITIONS: AiInstanceSeed[] = [
  {
    id: 'ai-instance-luna',
    templateKey: 'lead_nurse',
    nameOverride: 'Luna (Lead Nurse)',
    status: 'active',
    autoMode: 'requires-approval',
    userKey: 'isa',
    settings: { idleLeadThresholdDays: 3, escalateOwner: true }
  },
  {
    id: 'ai-instance-marlo',
    templateKey: 'listing_concierge',
    nameOverride: 'Marlo (Listing Concierge)',
    status: 'active',
    autoMode: 'suggest-only',
    userKey: 'broker',
    settings: { preferredChannels: ['email', 'social'] }
  },
  {
    id: 'ai-instance-taryn',
    templateKey: 'transaction_coordinator',
    nameOverride: 'Taryn (Transaction Coordinator)',
    status: 'active',
    autoMode: 'requires-approval',
    userKey: 'broker',
    settings: { alertBeforeDeadlineHours: 24 }
  },
  {
    id: 'ai-instance-atlas',
    templateKey: 'market_analyst',
    nameOverride: 'Atlas (Market Analyst)',
    status: 'active',
    autoMode: 'suggest-only',
    userKey: 'none',
    settings: { includeBenchmarks: true }
  },
  {
    id: 'ai-instance-echo',
    templateKey: 'agent_copilot',
    nameOverride: 'Echo (Agent Copilot)',
    status: 'active',
    autoMode: 'requires-approval',
    userKey: 'agent',
    settings: { includeFollowUps: true }
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

async function seedAiEmployeeInstances(params: {
  tenantId: string;
  brokerId: string;
  agentId: string;
  isaId: string;
}) {
  const { tenantId, brokerId, agentId, isaId } = params;
  const userLookup: Record<Exclude<AiInstanceUserKey, 'none'>, string> = {
    broker: brokerId,
    agent: agentId,
    isa: isaId
  };

  await seedAiEmployeeTemplates(prisma);

  const desiredKeys = Array.from(new Set(AI_INSTANCE_DEFINITIONS.map((def) => def.templateKey)));
  const templates = await prisma.aiEmployeeTemplate.findMany({
    where: { key: { in: desiredKeys } }
  });
  const templateIdByKey = new Map(templates.map((template) => [template.key, template.id]));

  for (const instanceDefinition of AI_INSTANCE_DEFINITIONS) {
    const templateId = templateIdByKey.get(instanceDefinition.templateKey);
    if (!templateId) continue;
    const userId =
      instanceDefinition.userKey && instanceDefinition.userKey !== 'none'
        ? userLookup[instanceDefinition.userKey]
        : null;
    await prisma.aiEmployeeInstance.upsert({
      where: { id: instanceDefinition.id },
      update: {
        nameOverride: instanceDefinition.nameOverride ?? null,
        status: instanceDefinition.status,
        autoMode: instanceDefinition.autoMode,
        settings: (instanceDefinition.settings ?? {}) as Prisma.JsonObject,
        userId
      },
      create: {
        id: instanceDefinition.id,
        templateId,
        tenantId,
        userId,
        nameOverride: instanceDefinition.nameOverride ?? null,
        settings: (instanceDefinition.settings ?? {}) as Prisma.JsonObject,
        status: instanceDefinition.status,
        autoMode: instanceDefinition.autoMode
      }
    });
  }
}

async function seedMissionControlData({
  organization,
  tenant,
  broker,
  agent,
  isa
}: {
  organization: { id: string };
  tenant: { id: string };
  broker: { id: string };
  agent: { id: string };
  isa: { id: string };
}) {
  const now = new Date();
  const optionalSeed = async <T>(operationName: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
        console.warn(`[mission-control-seed] skipped ${operationName}; table missing`);
        return null;
      }
      throw error;
    }
  };

  const additionalAgent = await prisma.user.upsert({
    where: { id: 'user-agent-nova' },
    update: {
      email: 'nova.agent@hatchcrm.test'
    },
    create: {
      id: 'user-agent-nova',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'nova.agent@hatchcrm.test',
      firstName: 'Nova',
      lastName: 'North',
      role: 'AGENT'
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'uom-agent-nova' },
    update: {
      userId: additionalAgent.id,
      orgId: organization.id
    },
    create: {
      id: 'uom-agent-nova',
      userId: additionalAgent.id,
      orgId: organization.id,
      isOrgAdmin: false
    }
  });

  const consumer = await prisma.user.upsert({
    where: { id: 'user-consumer-jordan' },
    update: {
      email: 'jordan.consumer@hatchcrm.test'
    },
    create: {
      id: 'user-consumer-jordan',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'jordan.consumer@hatchcrm.test',
      firstName: 'Jordan',
      lastName: 'Consumer',
      role: 'CONSUMER'
    }
  });

  const [ariaProfile, novaProfile, isaProfile] = await Promise.all([
    prisma.agentProfile.upsert({
      where: { id: 'agent-profile-aria' },
      update: {
        licenseNumber: 'FL-AR-100',
        licenseState: 'FL',
        licenseExpiresAt: addDays(now, 240),
        isCompliant: true,
        requiresAction: false,
        riskLevel: 'LOW',
        riskScore: 18,
        lifecycleStage: 'ACTIVE',
        ceCycleStartAt: subDays(now, 90),
        ceCycleEndAt: addDays(now, 275),
        ceHoursRequired: 14,
        ceHoursCompleted: 11
      },
      create: {
        id: 'agent-profile-aria',
        organizationId: organization.id,
        userId: agent.id,
        licenseNumber: 'FL-AR-100',
        licenseState: 'FL',
        licenseExpiresAt: addDays(now, 240),
        title: 'Senior Advisor',
        isCompliant: true,
        requiresAction: false,
        riskLevel: 'LOW',
        riskScore: 18,
        lifecycleStage: 'ACTIVE',
        ceCycleStartAt: subDays(now, 90),
        ceCycleEndAt: addDays(now, 275),
        ceHoursRequired: 14,
        ceHoursCompleted: 11
      }
    }),
    prisma.agentProfile.upsert({
      where: { id: 'agent-profile-nova' },
      update: {
        licenseNumber: 'FL-NN-200',
        licenseState: 'FL',
        licenseExpiresAt: addDays(now, 60),
        isCompliant: false,
        requiresAction: true,
        riskLevel: 'HIGH',
        riskScore: 72,
        lifecycleStage: 'ONBOARDING',
        ceCycleStartAt: subDays(now, 30),
        ceCycleEndAt: addDays(now, 60),
        ceHoursRequired: 14,
        ceHoursCompleted: 2
      },
      create: {
        id: 'agent-profile-nova',
        organizationId: organization.id,
        userId: additionalAgent.id,
        licenseNumber: 'FL-NN-200',
        licenseState: 'FL',
        licenseExpiresAt: addDays(now, 60),
        title: 'Associate',
        isCompliant: false,
        requiresAction: true,
        riskLevel: 'HIGH',
        riskScore: 72,
        lifecycleStage: 'ONBOARDING',
        ceCycleStartAt: subDays(now, 30),
        ceCycleEndAt: addDays(now, 60),
        ceHoursRequired: 14,
        ceHoursCompleted: 2
      }
    }),
    prisma.agentProfile.upsert({
      where: { id: 'agent-profile-isa' },
      update: {
        licenseNumber: 'FL-IS-300',
        licenseState: 'FL',
        licenseExpiresAt: addDays(now, 400),
        lifecycleStage: 'OFFBOARDING',
        riskLevel: 'MEDIUM',
        riskScore: 35
      },
      create: {
        id: 'agent-profile-isa',
        organizationId: organization.id,
        userId: isa.id,
        licenseNumber: 'FL-IS-300',
        licenseState: 'FL',
        licenseExpiresAt: addDays(now, 400),
        title: 'ISA',
        isCompliant: true,
        requiresAction: false,
        riskLevel: 'MEDIUM',
        riskScore: 35,
        lifecycleStage: 'OFFBOARDING',
        ceCycleStartAt: subDays(now, 180),
        ceCycleEndAt: addDays(now, 180),
        ceHoursRequired: 14,
        ceHoursCompleted: 14
      }
    })
  ]);

  await Promise.all([
    prisma.agentMembership.upsert({
      where: { id: 'agent-membership-aria-mls' },
      update: {
        expiresAt: addDays(now, 120)
      },
      create: {
        id: 'agent-membership-aria-mls',
        agentProfileId: ariaProfile.id,
        type: 'MLS',
        name: 'Miami Realtors',
        status: 'ACTIVE',
        startedAt: subDays(now, 365),
        expiresAt: addDays(now, 120)
      }
    }),
    prisma.agentMembership.upsert({
      where: { id: 'agent-membership-nova-mls' },
      update: {
        status: 'PENDING'
      },
      create: {
        id: 'agent-membership-nova-mls',
        agentProfileId: novaProfile.id,
        type: 'MLS',
        name: 'Stellar MLS',
        status: 'PENDING',
        startedAt: subDays(now, 15),
        expiresAt: addDays(now, 30)
      }
    })
  ]);

  await prisma.agentInvite.upsert({
    where: { id: 'agent-invite-newcomer' },
    update: {
      status: 'PENDING',
      expiresAt: addDays(now, 7)
    },
    create: {
      id: 'agent-invite-newcomer',
      organizationId: organization.id,
      email: 'future.agent@hatchcrm.test',
      token: 'invite-token-command-center',
      status: 'PENDING',
      invitedByUserId: broker.id,
      expiresAt: addDays(now, 7)
    }
  });

  const [complianceFile, marketingFile] = await Promise.all([
    prisma.fileObject.upsert({
      where: { id: 'file-compliance-manual' },
      update: {
        fileName: 'Compliance Handbook.pdf'
      },
      create: {
        id: 'file-compliance-manual',
        orgId: organization.id,
        ownerId: broker.id,
        fileName: 'Compliance Handbook.pdf',
        mimeType: 'application/pdf',
        byteSize: 1250000,
        storageKey: 'org-hatch/compliance-handbook.pdf'
      }
    }),
    prisma.fileObject.upsert({
      where: { id: 'file-marketing-kit' },
      update: {
        fileName: 'Spring Marketing Kit.zip'
      },
      create: {
        id: 'file-marketing-kit',
        orgId: organization.id,
        ownerId: broker.id,
        fileName: 'Spring Marketing Kit.zip',
        mimeType: 'application/zip',
        byteSize: 2300000,
        storageKey: 'org-hatch/marketing-kit.zip'
      }
    })
  ]);

  await Promise.all([
    prisma.orgFile.upsert({
      where: { id: 'orgfile-compliance-manual' },
      update: {
        fileId: complianceFile.id
      },
      create: {
        id: 'orgfile-compliance-manual',
        orgId: organization.id,
        tenantId: tenant.id,
        name: 'Compliance Handbook',
        description: 'Updated DBPR requirements',
        category: 'COMPLIANCE',
        fileId: complianceFile.id,
        uploadedByUserId: broker.id
      }
    }),
    prisma.orgFile.upsert({
      where: { id: 'orgfile-marketing-kit' },
      update: {
        fileId: marketingFile.id
      },
      create: {
        id: 'orgfile-marketing-kit',
        orgId: organization.id,
        tenantId: tenant.id,
        name: 'Spring Marketing Kit',
        description: 'Templates for luxury listings',
        category: 'MARKETING',
        fileId: marketingFile.id,
        uploadedByUserId: agent.id
      }
    })
  ]);

  const [complianceModule, marketingModule] = await Promise.all([
    prisma.agentTrainingModule.upsert({
      where: { id: 'training-compliance-foundations' },
      update: {},
      create: {
        id: 'training-compliance-foundations',
        organizationId: organization.id,
        title: 'Compliance Foundations',
        description: 'Florida CE refresher',
        required: true,
        estimatedMinutes: 60,
        createdByUserId: broker.id
      }
    }),
    prisma.agentTrainingModule.upsert({
      where: { id: 'training-digital-marketing' },
      update: {},
      create: {
        id: 'training-digital-marketing',
        organizationId: organization.id,
        title: 'Digital Marketing Playbook',
        description: 'Social + nurture strategy',
        required: false,
        estimatedMinutes: 45,
        createdByUserId: broker.id
      }
    })
  ]);

  await Promise.all([
    prisma.agentTrainingProgress.upsert({
      where: {
        agentProfileId_moduleId: { agentProfileId: ariaProfile.id, moduleId: complianceModule.id }
      },
      update: {
        status: 'COMPLETED',
        completedAt: subDays(now, 5),
        score: 95
      },
      create: {
        id: 'training-progress-aria-compliance',
        agentProfileId: ariaProfile.id,
        moduleId: complianceModule.id,
        status: 'COMPLETED',
        completedAt: subDays(now, 5),
        score: 95
      }
    }),
    prisma.agentTrainingProgress.upsert({
      where: {
        agentProfileId_moduleId: { agentProfileId: ariaProfile.id, moduleId: marketingModule.id }
      },
      update: {
        status: 'IN_PROGRESS'
      },
      create: {
        id: 'training-progress-aria-marketing',
        agentProfileId: ariaProfile.id,
        moduleId: marketingModule.id,
        status: 'IN_PROGRESS'
      }
    }),
    prisma.agentTrainingProgress.upsert({
      where: {
        agentProfileId_moduleId: { agentProfileId: novaProfile.id, moduleId: complianceModule.id }
      },
      update: {
        status: 'IN_PROGRESS'
      },
      create: {
        id: 'training-progress-nova-compliance',
        agentProfileId: novaProfile.id,
        moduleId: complianceModule.id,
        status: 'IN_PROGRESS'
      }
    }),
    prisma.agentTrainingProgress.upsert({
      where: {
        agentProfileId_moduleId: { agentProfileId: novaProfile.id, moduleId: marketingModule.id }
      },
      update: {
        status: 'NOT_STARTED'
      },
      create: {
        id: 'training-progress-nova-marketing',
        agentProfileId: novaProfile.id,
        moduleId: marketingModule.id,
        status: 'NOT_STARTED'
      }
    })
  ]);

  const [channelConversation, directConversation] = await Promise.all([
    prisma.orgConversation.upsert({
      where: { id: 'org-conversation-ops' },
      update: {},
      create: {
        id: 'org-conversation-ops',
        organizationId: organization.id,
        tenantId: tenant.id,
        type: 'CHANNEL',
        name: 'Brokerage Ops',
        createdByUserId: broker.id
      }
    }),
    prisma.orgConversation.upsert({
      where: { id: 'org-conversation-direct-coaching' },
      update: {},
      create: {
        id: 'org-conversation-direct-coaching',
        organizationId: organization.id,
        tenantId: tenant.id,
        type: 'DIRECT',
        name: 'Coaching thread',
        createdByUserId: broker.id
      }
    })
  ]);

  await Promise.all([
    prisma.orgMessage.upsert({
      where: { id: 'org-message-ops-1' },
      update: {
        content: 'Reminder: upload CE certificates by Friday.'
      },
      create: {
        id: 'org-message-ops-1',
        organizationId: organization.id,
        conversationId: channelConversation.id,
        senderId: broker.id,
        content: 'Reminder: upload CE certificates by Friday.',
        createdAt: subDays(now, 2)
      }
    }),
    prisma.orgMessage.upsert({
      where: { id: 'org-message-ops-2' },
      update: {
        content: 'AI compliance flagged two listings for review.'
      },
      create: {
        id: 'org-message-ops-2',
        organizationId: organization.id,
        conversationId: channelConversation.id,
        senderId: broker.id,
        content: 'AI compliance flagged two listings for review.',
        createdAt: subDays(now, 1)
      }
    }),
    prisma.orgMessage.upsert({
      where: { id: 'org-message-direct-1' },
      update: {
        content: 'Let us know once onboarding paperwork is done.'
      },
      create: {
        id: 'org-message-direct-1',
        organizationId: organization.id,
        conversationId: directConversation.id,
        senderId: broker.id,
        content: 'Let us know once onboarding paperwork is done.',
        createdAt: subDays(now, 3)
      }
    })
  ]);

  const listingOcean = await prisma.orgListing.upsert({
    where: { id: 'org-listing-ocean' },
    update: {
      status: 'ACTIVE',
      brokerApproved: true
    },
    create: {
      id: 'org-listing-ocean',
      organizationId: organization.id,
      agentProfileId: ariaProfile.id,
      mlsNumber: 'MC-1001',
      addressLine1: '801 Ocean Drive',
      city: 'Miami Beach',
      state: 'FL',
      postalCode: '33139',
      listPrice: 1450000,
      propertyType: 'Condo',
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1800,
      status: 'ACTIVE',
      brokerApproved: true,
      brokerApprovedAt: subDays(now, 1),
      brokerApprovedByUserId: broker.id,
      listedAt: subDays(now, 6),
      expiresAt: addDays(now, 25),
      createdByUserId: broker.id
    }
  });

  const listingPending = await prisma.orgListing.upsert({
    where: { id: 'org-listing-pending-approval' },
    update: {
      status: 'PENDING_BROKER_APPROVAL'
    },
    create: {
      id: 'org-listing-pending-approval',
      organizationId: organization.id,
      agentProfileId: novaProfile.id,
      mlsNumber: 'MC-2002',
      addressLine1: '55 Brickell Key Dr',
      city: 'Miami',
      state: 'FL',
      postalCode: '33131',
      listPrice: 980000,
      propertyType: 'Condo',
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1500,
      status: 'PENDING_BROKER_APPROVAL',
      createdByUserId: novaProfile.userId ?? additionalAgent.id
    }
  });

  const listingExpiring = await prisma.orgListing.upsert({
    where: { id: 'org-listing-expiring' },
    update: {
      expiresAt: addDays(now, 5)
    },
    create: {
      id: 'org-listing-expiring',
      organizationId: organization.id,
      agentProfileId: ariaProfile.id,
      mlsNumber: 'MC-3003',
      addressLine1: '120 Sunset Blvd',
      city: 'Miami',
      state: 'FL',
      postalCode: '33140',
      listPrice: 760000,
      propertyType: 'Single Family',
      bedrooms: 4,
      bathrooms: 3,
      squareFeet: 2200,
      status: 'ACTIVE',
      listedAt: subDays(now, 20),
      expiresAt: addDays(now, 5),
      createdByUserId: agent.id
    }
  });

  const [closedTransaction, upcomingTransaction, reviewTransaction] = await Promise.all([
    prisma.orgTransaction.upsert({
      where: { id: 'org-transaction-closed' },
      update: {},
      create: {
        id: 'org-transaction-closed',
        organizationId: organization.id,
        listingId: listingOcean.id,
        agentProfileId: ariaProfile.id,
        status: 'CLOSED',
        buyerName: 'Lisa Buyer',
        sellerName: 'Omar Seller',
        closingDate: subDays(now, 7),
        createdByUserId: broker.id
      }
    }),
    prisma.orgTransaction.upsert({
      where: { id: 'org-transaction-upcoming' },
      update: {
        closingDate: addDays(now, 14)
      },
      create: {
        id: 'org-transaction-upcoming',
        organizationId: organization.id,
        listingId: listingExpiring.id,
        agentProfileId: ariaProfile.id,
        status: 'UNDER_CONTRACT',
        buyerName: 'Carmen Contract',
        sellerName: 'Paula Pending',
        closingDate: addDays(now, 14),
        createdByUserId: broker.id
      }
    }),
    prisma.orgTransaction.upsert({
      where: { id: 'org-transaction-review' },
      update: {
        requiresAction: true
      },
      create: {
        id: 'org-transaction-review',
        organizationId: organization.id,
        listingId: listingPending.id,
        agentProfileId: novaProfile.id,
        status: 'CONTINGENT',
        buyerName: 'Risky Buyer',
        sellerName: 'Careful Seller',
        isCompliant: false,
        requiresAction: true,
        closingDate: addDays(now, 45),
        createdByUserId: broker.id
      }
    })
  ]);

  await Promise.all([
    prisma.agentWorkflowTask.upsert({
      where: { id: 'workflow-onboarding-forms' },
      update: {
        status: 'COMPLETED',
        completedAt: subDays(now, 1),
        completedByUserId: broker.id
      },
      create: {
        id: 'workflow-onboarding-forms',
        organizationId: organization.id,
        agentProfileId: novaProfile.id,
        type: 'ONBOARDING',
        title: 'Submit onboarding paperwork',
        assignedToRole: 'Operations',
        status: 'COMPLETED',
        completedAt: subDays(now, 1),
        completedByUserId: broker.id
      }
    }),
    prisma.agentWorkflowTask.upsert({
      where: { id: 'workflow-onboarding-shadow' },
      update: {
        status: 'IN_PROGRESS'
      },
      create: {
        id: 'workflow-onboarding-shadow',
        organizationId: organization.id,
        agentProfileId: novaProfile.id,
        type: 'ONBOARDING',
        title: 'Shadow experienced agent',
        assignedToRole: 'Mentor',
        status: 'IN_PROGRESS',
        dueAt: addDays(now, 3)
      }
    }),
    prisma.agentWorkflowTask.upsert({
      where: { id: 'workflow-offboarding-archives' },
      update: {
        status: 'PENDING'
      },
      create: {
        id: 'workflow-offboarding-archives',
        organizationId: organization.id,
        agentProfileId: isaProfile.id,
        type: 'OFFBOARDING',
        title: 'Archive ISA assets',
        assignedToRole: 'Operations',
        status: 'PENDING',
        dueAt: addDays(now, 5)
      }
    })
  ]);

  const leadsData: Array<Prisma.LeadUncheckedCreateInput> = [
    {
      id: 'mc-lead-new',
      organizationId: organization.id,
      agentProfileId: novaProfile.id,
      status: 'NEW',
      source: 'PORTAL_SIGNUP',
      name: 'Jamie Prospect',
      email: 'jamie@example.com',
      phone: '+13055550110',
      createdByUserId: broker.id
    },
    {
      id: 'mc-lead-contacted',
      organizationId: organization.id,
      agentProfileId: ariaProfile.id,
      status: 'CONTACTED',
      source: 'LISTING_INQUIRY',
      name: 'River Client',
      email: 'river@example.com',
      phone: '+13055550111',
      createdByUserId: agent.id
    },
    {
      id: 'mc-lead-qualified',
      organizationId: organization.id,
      agentProfileId: ariaProfile.id,
      status: 'QUALIFIED',
      source: 'OTHER',
      name: 'Taylor Ready',
      email: 'taylor@example.com',
      phone: '+13055550112',
      createdByUserId: broker.id
    },
    {
      id: 'mc-lead-appointment',
      organizationId: organization.id,
      agentProfileId: novaProfile.id,
      status: 'APPOINTMENT_SET',
      source: 'MANUAL',
      name: 'Sky Appointment',
      email: 'sky@example.com',
      phone: '+13055550113',
      createdByUserId: additionalAgent.id,
      desiredMoveIn: addDays(now, 45)
    }
  ];

  for (const lead of leadsData) {
    await prisma.lead.upsert({
      where: { id: lead.id },
      update: {
        status: lead.status
      },
      create: lead
    });
  }

  await Promise.all([
    prisma.offerIntent.upsert({
      where: { id: 'offer-intent-harbor' },
      update: {
        status: 'SUBMITTED',
        offeredPrice: 1400000
      },
      create: {
        id: 'offer-intent-harbor',
        organizationId: organization.id,
        listingId: listingOcean.id,
        leadId: 'mc-lead-qualified',
        status: 'SUBMITTED',
        offeredPrice: 1400000,
        financingType: 'CONVENTIONAL',
        closingTimeline: '30 days'
      }
    }),
    prisma.offerIntent.upsert({
      where: { id: 'offer-intent-brickell' },
      update: {
        status: 'ACCEPTED'
      },
      create: {
        id: 'offer-intent-brickell',
        organizationId: organization.id,
        listingId: listingExpiring.id,
        leadId: 'mc-lead-appointment',
        status: 'ACCEPTED',
        offeredPrice: 770000,
        financingType: 'CASH',
        contingencies: 'Inspection'
      }
    })
  ]);

  const rentalProperty = await prisma.rentalProperty.upsert({
    where: { id: 'rental-prop-biscayne' },
    update: {},
    create: {
      id: 'rental-prop-biscayne',
      organizationId: organization.id,
      listingId: listingExpiring.id,
      addressLine1: '88 Bayside Ct',
      city: 'Miami',
      state: 'FL',
      postalCode: '33137',
      propertyType: 'CONDO',
      status: 'UNDER_MGMT',
      ownerName: 'Dana Owner',
      ownerContact: 'dana@example.com'
    }
  });

  const [unitA, unitB] = await Promise.all([
    prisma.rentalUnit.upsert({
      where: { id: 'rental-unit-a' },
      update: {
        status: 'OCCUPIED'
      },
      create: {
        id: 'rental-unit-a',
        propertyId: rentalProperty.id,
        name: 'Unit 12A',
        bedrooms: 2,
        bathrooms: 2,
        squareFeet: 1250,
        status: 'OCCUPIED'
      }
    }),
    prisma.rentalUnit.upsert({
      where: { id: 'rental-unit-b' },
      update: {},
      create: {
        id: 'rental-unit-b',
        propertyId: rentalProperty.id,
        name: 'Unit 12B',
        bedrooms: 3,
        bathrooms: 2,
        squareFeet: 1500,
        status: 'VACANT'
      }
    })
  ]);

  const [seasonalLease, annualLease] = await Promise.all([
    prisma.rentalLease.upsert({
      where: { id: 'rental-lease-seasonal' },
      update: {
        rentAmount: 7800
      },
      create: {
        id: 'rental-lease-seasonal',
        organizationId: organization.id,
        unitId: unitA.id,
        tenancyType: 'SEASONAL',
        tenantName: 'Olivia Snowbird',
        tenantContact: 'olivia@example.com',
        startDate: subDays(now, 15),
        endDate: addDays(now, 90),
        rentAmount: 7800,
        requiresTaxFiling: true
      }
    }),
    prisma.rentalLease.upsert({
      where: { id: 'rental-lease-annual' },
      update: {},
      create: {
        id: 'rental-lease-annual',
        organizationId: organization.id,
        unitId: unitB.id,
        tenancyType: 'ANNUAL',
        tenantName: 'Carter Longstay',
        tenantContact: 'carter@example.com',
        startDate: subDays(now, 60),
        endDate: addDays(now, 305),
        rentAmount: 4200,
        requiresTaxFiling: false
      }
    })
  ]);

  await Promise.all([
    prisma.rentalTaxSchedule.upsert({
      where: { id: 'rental-tax-upcoming' },
      update: {
        dueDate: addDays(now, 20),
        status: 'PENDING'
      },
      create: {
        id: 'rental-tax-upcoming',
        leaseId: seasonalLease.id,
        periodLabel: 'Q1',
        dueDate: addDays(now, 20),
        amountDue: 1200,
        status: 'PENDING'
      }
    }),
    prisma.rentalTaxSchedule.upsert({
      where: { id: 'rental-tax-overdue' },
      update: {
        status: 'OVERDUE'
      },
      create: {
        id: 'rental-tax-overdue',
        leaseId: annualLease.id,
        periodLabel: 'Q4',
        dueDate: subDays(now, 10),
        amountDue: 900,
        status: 'OVERDUE'
      }
    })
  ]);

  await Promise.all([
    prisma.transactionAccountingRecord.upsert({
      where: { transactionId: closedTransaction.id },
      update: {
        syncStatus: 'SYNCED',
        lastSyncAt: subDays(now, 1)
      },
      create: {
        id: 'accounting-record-closed',
        organizationId: organization.id,
        transactionId: closedTransaction.id,
        provider: 'QUICKBOOKS',
        syncStatus: 'SYNCED',
        lastSyncAt: subDays(now, 1)
      }
    }),
    prisma.transactionAccountingRecord.upsert({
      where: { transactionId: upcomingTransaction.id },
      update: {
        syncStatus: 'FAILED',
        errorMessage: 'Token expired'
      },
      create: {
        id: 'accounting-record-upcoming',
        organizationId: organization.id,
        transactionId: upcomingTransaction.id,
        provider: 'QUICKBOOKS',
        syncStatus: 'FAILED',
        errorMessage: 'Token expired'
      }
    })
  ]);

  await Promise.all([
    prisma.rentalLeaseAccountingRecord.upsert({
      where: { leaseId: seasonalLease.id },
      update: {
        syncStatus: 'SYNCED'
      },
      create: {
        id: 'rental-accounting-seasonal',
        organizationId: organization.id,
        leaseId: seasonalLease.id,
        provider: 'QUICKBOOKS',
        syncStatus: 'SYNCED'
      }
    }),
    prisma.rentalLeaseAccountingRecord.upsert({
      where: { leaseId: annualLease.id },
      update: {
        syncStatus: 'FAILED',
        errorMessage: 'Missing class mapping'
      },
      create: {
        id: 'rental-accounting-annual',
        organizationId: organization.id,
        leaseId: annualLease.id,
        provider: 'QUICKBOOKS',
        syncStatus: 'FAILED',
        errorMessage: 'Missing class mapping'
      }
    })
  ]);

  const listingSearchIndexes = await optionalSeed('listingSearchIndex', () =>
    Promise.all([
      prisma.listingSearchIndex.upsert({
        where: { id: 'search-index-ocean' },
        update: {
          listPrice: listingOcean.listPrice ?? 1450000
        },
        create: {
          id: 'search-index-ocean',
          organizationId: organization.id,
          listingId: null,
          mlsNumber: 'MC-1001',
          addressLine1: listingOcean.addressLine1,
          city: listingOcean.city,
          state: listingOcean.state,
          postalCode: listingOcean.postalCode,
          propertyType: 'Condo',
          listPrice: listingOcean.listPrice ?? 1450000,
          bedrooms: listingOcean.bedrooms ?? 3,
          bathrooms: listingOcean.bathrooms ?? 2,
          squareFeet: listingOcean.squareFeet ?? 1800,
          isActive: true,
          isRental: false,
          searchText: '801 Ocean Drive Miami Beach FL'
        }
      }),
      prisma.listingSearchIndex.upsert({
        where: { id: 'search-index-expiring' },
        update: {},
        create: {
          id: 'search-index-expiring',
          organizationId: organization.id,
          listingId: null,
          mlsNumber: 'MC-3003',
          addressLine1: listingExpiring.addressLine1,
          city: listingExpiring.city,
          state: listingExpiring.state,
          postalCode: listingExpiring.postalCode,
          propertyType: 'Single Family',
          listPrice: listingExpiring.listPrice ?? 760000,
          bedrooms: listingExpiring.bedrooms ?? 4,
          bathrooms: listingExpiring.bathrooms ?? 3,
          squareFeet: listingExpiring.squareFeet ?? 2200,
          isActive: true,
          isRental: false,
          searchText: '120 Sunset Blvd Miami FL'
        }
      }),
      prisma.listingSearchIndex.upsert({
        where: { id: 'search-index-rental' },
        update: {
          isRental: true
        },
        create: {
          id: 'search-index-rental',
          organizationId: organization.id,
          listingId: null,
          mlsNumber: 'MC-2002',
          addressLine1: listingPending.addressLine1,
          city: listingPending.city,
          state: listingPending.state,
          postalCode: listingPending.postalCode,
          propertyType: 'Condo',
          listPrice: 6500,
          bedrooms: listingPending.bedrooms ?? 2,
          bathrooms: listingPending.bathrooms ?? 2,
          squareFeet: listingPending.squareFeet ?? 1500,
          isActive: true,
          isRental: true,
          searchText: '55 Brickell Key Dr Miami FL'
        }
      })
    ])
  );
  const saleIndex = listingSearchIndexes?.[0] ?? null;
  const rentalIndex = listingSearchIndexes?.[2] ?? null;

  await optionalSeed('savedSearch', () =>
    Promise.all([
      prisma.savedSearch.upsert({
        where: { id: 'saved-search-daily' },
        update: {
          criteria: { city: 'Miami Beach', minBeds: 2 } as Prisma.JsonObject
        },
        create: {
          id: 'saved-search-daily',
          organizationId: organization.id,
          consumerId: consumer.id,
          name: 'Waterfront Condos',
          criteria: { city: 'Miami Beach', minBeds: 2 } as Prisma.JsonObject,
          alertsEnabled: true,
          frequency: 'DAILY'
        }
      }),
      prisma.savedSearch.upsert({
        where: { id: 'saved-search-weekly' },
        update: {
          alertsEnabled: false
        },
        create: {
          id: 'saved-search-weekly',
          organizationId: organization.id,
          consumerId: consumer.id,
          name: 'Brickell Rentals',
          criteria: { city: 'Miami', maxPrice: 7000 } as Prisma.JsonObject,
          alertsEnabled: false,
          frequency: 'WEEKLY'
        }
      })
    ])
  );

  if (saleIndex && rentalIndex) {
    await optionalSeed('savedListing', () =>
      Promise.all([
        prisma.savedListing.upsert({
          where: { id: 'saved-listing-ocean' },
          update: {},
          create: {
            id: 'saved-listing-ocean',
            organizationId: organization.id,
            consumerId: consumer.id,
            searchIndexId: saleIndex.id
          }
        }),
        prisma.savedListing.upsert({
          where: { id: 'saved-listing-rental' },
          update: {},
          create: {
            id: 'saved-listing-rental',
            organizationId: organization.id,
            consumerId: consumer.id,
            searchIndexId: rentalIndex.id
          }
        })
      ])
    );
  }

  await optionalSeed('mlsFeedConfig', () =>
    prisma.mlsFeedConfig.upsert({
      where: { organizationId: organization.id },
      update: {
        provider: 'MATRIX',
        boardName: 'Miami Association of Realtors',
        lastFullSyncAt: subDays(now, 1),
        lastIncrementalSyncAt: now
      },
      create: {
        id: 'mls-config-hatch',
        organizationId: organization.id,
        provider: 'MATRIX',
        boardName: 'Miami Association of Realtors',
        boardUrl: 'https://www.miamirealtors.com',
        lastFullSyncAt: subDays(now, 1),
        lastIncrementalSyncAt: now
      }
    })
  );

  await Promise.all([
    prisma.orgEvent.upsert({
      where: { id: 'org-event-listing-risk' },
      update: {
        payload: {
          riskLevel: 'HIGH',
          listingId: listingPending.id
        } as Prisma.JsonObject
      },
      create: {
        id: 'org-event-listing-risk',
        organizationId: organization.id,
        tenantId: tenant.id,
        actorId: broker.id,
        type: 'ORG_LISTING_EVALUATED',
        message: 'AI flagged Brickell Key listing as high risk.',
        payload: {
          riskLevel: 'HIGH',
          listingId: listingPending.id
        } as Prisma.JsonObject,
        createdAt: subDays(now, 1)
      }
    }),
    prisma.orgEvent.upsert({
      where: { id: 'org-event-transaction-risk' },
      update: {
        payload: {
          riskLevel: 'HIGH',
          transactionId: reviewTransaction.id
        } as Prisma.JsonObject
      },
      create: {
        id: 'org-event-transaction-risk',
        organizationId: organization.id,
        tenantId: tenant.id,
        actorId: broker.id,
        type: 'ORG_TRANSACTION_EVALUATED',
        message: 'Transaction review required for contingency issues.',
        payload: {
          riskLevel: 'HIGH',
          transactionId: reviewTransaction.id
        } as Prisma.JsonObject,
        createdAt: subDays(now, 2)
      }
    }),
    prisma.orgEvent.upsert({
      where: { id: 'org-event-new-agent' },
      update: {},
      create: {
        id: 'org-event-new-agent',
        organizationId: organization.id,
        tenantId: tenant.id,
        actorId: broker.id,
        type: 'AGENT_INVITE_CREATED',
        message: 'Invited new agent to join brokerage.',
        createdAt: subDays(now, 3)
      }
    })
  ]);
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

  // Seed Accounts
  const account1 = await prisma.account.upsert({
    where: { id: 'account-acme-corp' },
    update: {
      ownerId: agent.id,
      name: 'Acme Corporation',
      industry: 'Technology',
      phone: '+13055551000',
      website: 'https://acmecorp.example.com',
      annualRevenue: new Prisma.Decimal(5000000)
    },
    create: {
      id: 'account-acme-corp',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Acme Corporation',
      industry: 'Technology',
      phone: '+13055551000',
      website: 'https://acmecorp.example.com',
      annualRevenue: new Prisma.Decimal(5000000)
    }
  });

  const account2 = await prisma.account.upsert({
    where: { id: 'account-sunshine-realty' },
    update: {
      ownerId: broker.id,
      name: 'Sunshine Realty Group',
      industry: 'Real Estate',
      phone: '+13055551001',
      website: 'https://sunshinerealtygroup.com',
      annualRevenue: new Prisma.Decimal(3200000)
    },
    create: {
      id: 'account-sunshine-realty',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Sunshine Realty Group',
      industry: 'Real Estate',
      phone: '+13055551001',
      website: 'https://sunshinerealtygroup.com',
      annualRevenue: new Prisma.Decimal(3200000)
    }
  });

  const account3 = await prisma.account.upsert({
    where: { id: 'account-johnson-family' },
    update: {
      ownerId: agent.id,
      name: 'Johnson Family Trust',
      phone: '+13055551002',
      billingAddress: {
        street: '77 Biscayne Blvd',
        city: 'Miami',
        state: 'FL'
      } as Prisma.JsonObject
    },
    create: {
      id: 'account-johnson-family',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Johnson Family Trust',
      phone: '+13055551002',
      billingAddress: {
        street: '77 Biscayne Blvd',
        city: 'Miami',
        state: 'FL'
      } as Prisma.JsonObject
    }
  });

  // Seed Opportunities
  const opportunity1 = await prisma.opportunity.upsert({
    where: { id: 'opp-acme-office-space' },
    update: {
      ownerId: agent.id,
      accountId: account1.id,
      name: 'Acme Office Space Expansion',
      stage: 'Qualification',
      amount: new Prisma.Decimal(2500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000) // 45 days from now
    },
    create: {
      id: 'opp-acme-office-space',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account1.id,
      name: 'Acme Office Space Expansion',
      stage: 'Qualification',
      amount: new Prisma.Decimal(2500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000) // 45 days from now
    }
  });

  const opportunity2 = await prisma.opportunity.upsert({
    where: { id: 'opp-sunshine-partnership' },
    update: {
      ownerId: broker.id,
      accountId: account2.id,
      name: 'Sunshine Strategic Partnership',
      stage: 'Proposal',
      amount: new Prisma.Decimal(1800000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    },
    create: {
      id: 'opp-sunshine-partnership',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account2.id,
      name: 'Sunshine Strategic Partnership',
      stage: 'Proposal',
      amount: new Prisma.Decimal(1800000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    }
  });

  const opportunity3 = await prisma.opportunity.upsert({
    where: { id: 'opp-johnson-vacation-home' },
    update: {
      ownerId: agent.id,
      accountId: account3.id,
      name: 'Johnson Vacation Home Purchase',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(950000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 days from now
    },
    create: {
      id: 'opp-johnson-vacation-home',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account3.id,
      name: 'Johnson Vacation Home Purchase',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(950000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 days from now
    }
  });

  const [accountBriefFile, opportunityDeckFile] = await Promise.all([
    prisma.fileObject.upsert({
      where: { id: 'file-account-acme-brief' },
      update: {
        fileName: 'Acme Expansion Brief.pdf',
        storageKey: 'org-hatch/accounts/acme-expansion-brief.pdf'
      },
      create: {
        id: 'file-account-acme-brief',
        orgId: organization.id,
        ownerId: agent.id,
        fileName: 'Acme Expansion Brief.pdf',
        mimeType: 'application/pdf',
        byteSize: 480000,
        storageKey: 'org-hatch/accounts/acme-expansion-brief.pdf'
      }
    }),
    prisma.fileObject.upsert({
      where: { id: 'file-opp-sunshine-deck' },
      update: {
        fileName: 'Partnership Pitch Deck.pdf',
        storageKey: 'org-hatch/opportunities/sunshine-pitch-deck.pdf'
      },
      create: {
        id: 'file-opp-sunshine-deck',
        orgId: organization.id,
        ownerId: broker.id,
        fileName: 'Partnership Pitch Deck.pdf',
        mimeType: 'application/pdf',
        byteSize: 820000,
        storageKey: 'org-hatch/opportunities/sunshine-pitch-deck.pdf'
      }
    })
  ]);

  await Promise.all([
    prisma.fileLink.upsert({
      where: { id: 'filelink-account-acme-brief' },
      update: {},
      create: {
        id: 'filelink-account-acme-brief',
        orgId: organization.id,
        fileId: accountBriefFile.id,
        object: 'accounts',
        recordId: account1.id
      }
    }),
    prisma.fileLink.upsert({
      where: { id: 'filelink-opp-sunshine-deck' },
      update: {},
      create: {
        id: 'filelink-opp-sunshine-deck',
        orgId: organization.id,
        fileId: opportunityDeckFile.id,
        object: 'opportunities',
        recordId: opportunity2.id
      }
    }),
    prisma.fileLink.upsert({
      where: { id: 'filelink-opp-johnson-brief' },
      update: {},
      create: {
        id: 'filelink-opp-johnson-brief',
        orgId: organization.id,
        fileId: accountBriefFile.id,
        object: 'opportunities',
        recordId: opportunity3.id
      }
    })
  ]);

  await seedMissionControlData({
    organization,
    tenant,
    broker,
    agent,
    isa
  });

  await seedAiEmployeeInstances({
    tenantId: tenant.id,
    brokerId: broker.id,
    agentId: agent.id,
    isaId: isa.id
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
