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
    id: 'ai-instance-hatch',
    templateKey: 'hatch_assistant',
    nameOverride: 'Hatch',
    status: 'active',
    autoMode: 'auto-run',
    userKey: 'broker',
    settings: { orchestrateWorkflows: true }
  },
  {
    id: 'ai-instance-echo',
    templateKey: 'agent_copilot',
    nameOverride: 'Echo',
    status: 'active',
    autoMode: 'auto-run',
    userKey: 'agent',
    settings: { includeFollowUps: true }
  },
  {
    id: 'ai-instance-lumen',
    templateKey: 'lead_nurse',
    nameOverride: 'Lumen',
    status: 'active',
    autoMode: 'auto-run',
    userKey: 'isa',
    settings: { warmOutreach: true, nurtureSequences: true }
  },
  {
    id: 'ai-instance-haven',
    templateKey: 'listing_concierge',
    nameOverride: 'Haven',
    status: 'active',
    autoMode: 'auto-run',
    userKey: 'broker',
    settings: { listingDescriptions: true, marketingCopy: true }
  },
  {
    id: 'ai-instance-atlas',
    templateKey: 'market_analyst',
    nameOverride: 'Atlas',
    status: 'active',
    autoMode: 'auto-run',
    userKey: 'none',
    settings: { includeBenchmarks: true }
  },
  {
    id: 'ai-instance-nova',
    templateKey: 'transaction_coordinator',
    nameOverride: 'Nova',
    status: 'active',
    autoMode: 'auto-run',
    userKey: 'broker',
    settings: { trackMilestones: true, alertBeforeDeadlineHours: 24 }
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

  // Additional agent users for expanded demo data
  const agent4 = await prisma.user.upsert({
    where: { id: 'user-agent-4' },
    update: { email: 'marcus.cruz@hatchcrm.test' },
    create: {
      id: 'user-agent-4',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'marcus.cruz@hatchcrm.test',
      firstName: 'Marcus',
      lastName: 'Cruz',
      role: 'AGENT'
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'uom-agent-4' },
    update: { userId: agent4.id, orgId: organization.id },
    create: {
      id: 'uom-agent-4',
      userId: agent4.id,
      orgId: organization.id,
      isOrgAdmin: false
    }
  });

  const agent5 = await prisma.user.upsert({
    where: { id: 'user-agent-5' },
    update: { email: 'sarah.kim@hatchcrm.test' },
    create: {
      id: 'user-agent-5',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'sarah.kim@hatchcrm.test',
      firstName: 'Sarah',
      lastName: 'Kim',
      role: 'AGENT'
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'uom-agent-5' },
    update: { userId: agent5.id, orgId: organization.id },
    create: {
      id: 'uom-agent-5',
      userId: agent5.id,
      orgId: organization.id,
      isOrgAdmin: false
    }
  });

  const agent6 = await prisma.user.upsert({
    where: { id: 'user-agent-6' },
    update: { email: 'derek.wilson@hatchcrm.test' },
    create: {
      id: 'user-agent-6',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'derek.wilson@hatchcrm.test',
      firstName: 'Derek',
      lastName: 'Wilson',
      role: 'AGENT'
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'uom-agent-6' },
    update: { userId: agent6.id, orgId: organization.id },
    create: {
      id: 'uom-agent-6',
      userId: agent6.id,
      orgId: organization.id,
      isOrgAdmin: false
    }
  });

  const agent7 = await prisma.user.upsert({
    where: { id: 'user-agent-7' },
    update: { email: 'lily.patel@hatchcrm.test' },
    create: {
      id: 'user-agent-7',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'lily.patel@hatchcrm.test',
      firstName: 'Lily',
      lastName: 'Patel',
      role: 'AGENT'
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'uom-agent-7' },
    update: { userId: agent7.id, orgId: organization.id },
    create: {
      id: 'uom-agent-7',
      userId: agent7.id,
      orgId: organization.id,
      isOrgAdmin: false
    }
  });

  const agent8 = await prisma.user.upsert({
    where: { id: 'user-agent-8' },
    update: { email: 'tyler.nguyen@hatchcrm.test' },
    create: {
      id: 'user-agent-8',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'tyler.nguyen@hatchcrm.test',
      firstName: 'Tyler',
      lastName: 'Nguyen',
      role: 'AGENT'
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'uom-agent-8' },
    update: { userId: agent8.id, orgId: organization.id },
    create: {
      id: 'uom-agent-8',
      userId: agent8.id,
      orgId: organization.id,
      isOrgAdmin: false
    }
  });

  const agent9 = await prisma.user.upsert({
    where: { id: 'user-agent-9' },
    update: { email: 'patricia.johnson@hatchcrm.test' },
    create: {
      id: 'user-agent-9',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'patricia.johnson@hatchcrm.test',
      firstName: 'Patricia',
      lastName: 'Johnson',
      role: 'AGENT'
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'uom-agent-9' },
    update: { userId: agent9.id, orgId: organization.id },
    create: {
      id: 'uom-agent-9',
      userId: agent9.id,
      orgId: organization.id,
      isOrgAdmin: false
    }
  });

  const agent10 = await prisma.user.upsert({
    where: { id: 'user-agent-10' },
    update: { email: 'alex.rodriguez@hatchcrm.test' },
    create: {
      id: 'user-agent-10',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'alex.rodriguez@hatchcrm.test',
      firstName: 'Alex',
      lastName: 'Rodriguez',
      role: 'AGENT'
    }
  });

  await prisma.userOrgMembership.upsert({
    where: { id: 'uom-agent-10' },
    update: { userId: agent10.id, orgId: organization.id },
    create: {
      id: 'uom-agent-10',
      userId: agent10.id,
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

  // Additional agent profiles for expanded demo data
  const agent4Profile = await prisma.agentProfile.upsert({
    where: { id: 'agent-profile-4' },
    update: {
      licenseNumber: 'FL-MC-400',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 300),
      isCompliant: true,
      requiresAction: false,
      riskLevel: 'LOW',
      riskScore: 15,
      lifecycleStage: 'ACTIVE'
    },
    create: {
      id: 'agent-profile-4',
      organizationId: organization.id,
      userId: agent4.id,
      licenseNumber: 'FL-MC-400',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 300),
      title: 'Senior Agent',
      isCompliant: true,
      requiresAction: false,
      riskLevel: 'LOW',
      riskScore: 15,
      lifecycleStage: 'ACTIVE',
      ceCycleStartAt: subDays(now, 120),
      ceCycleEndAt: addDays(now, 245),
      ceHoursRequired: 14,
      ceHoursCompleted: 14
    }
  });

  const agent5Profile = await prisma.agentProfile.upsert({
    where: { id: 'agent-profile-5' },
    update: {
      licenseNumber: 'FL-SK-500',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 180),
      isCompliant: true,
      requiresAction: true,
      riskLevel: 'MEDIUM',
      riskScore: 42,
      lifecycleStage: 'ACTIVE'
    },
    create: {
      id: 'agent-profile-5',
      organizationId: organization.id,
      userId: agent5.id,
      licenseNumber: 'FL-SK-500',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 180),
      title: 'Agent',
      isCompliant: true,
      requiresAction: true,
      riskLevel: 'MEDIUM',
      riskScore: 42,
      lifecycleStage: 'ACTIVE',
      ceCycleStartAt: subDays(now, 60),
      ceCycleEndAt: addDays(now, 305),
      ceHoursRequired: 14,
      ceHoursCompleted: 8
    }
  });

  const agent6Profile = await prisma.agentProfile.upsert({
    where: { id: 'agent-profile-6' },
    update: {
      licenseNumber: 'FL-DW-600',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 45),
      isCompliant: false,
      requiresAction: true,
      riskLevel: 'HIGH',
      riskScore: 85,
      lifecycleStage: 'ACTIVE'
    },
    create: {
      id: 'agent-profile-6',
      organizationId: organization.id,
      userId: agent6.id,
      licenseNumber: 'FL-DW-600',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 45),
      title: 'Agent',
      isCompliant: false,
      requiresAction: true,
      riskLevel: 'HIGH',
      riskScore: 85,
      lifecycleStage: 'ACTIVE',
      ceCycleStartAt: subDays(now, 45),
      ceCycleEndAt: addDays(now, 45),
      ceHoursRequired: 14,
      ceHoursCompleted: 0
    }
  });

  const agent7Profile = await prisma.agentProfile.upsert({
    where: { id: 'agent-profile-7' },
    update: {
      licenseNumber: 'FL-LP-700',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 350),
      isCompliant: true,
      requiresAction: false,
      riskLevel: 'LOW',
      riskScore: 20,
      lifecycleStage: 'ONBOARDING'
    },
    create: {
      id: 'agent-profile-7',
      organizationId: organization.id,
      userId: agent7.id,
      licenseNumber: 'FL-LP-700',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 350),
      title: 'Junior Agent',
      isCompliant: true,
      requiresAction: false,
      riskLevel: 'LOW',
      riskScore: 20,
      lifecycleStage: 'ONBOARDING',
      ceCycleStartAt: subDays(now, 10),
      ceCycleEndAt: addDays(now, 355),
      ceHoursRequired: 14,
      ceHoursCompleted: 14
    }
  });

  const agent8Profile = await prisma.agentProfile.upsert({
    where: { id: 'agent-profile-8' },
    update: {
      licenseNumber: 'FL-TN-800',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 90),
      isCompliant: false,
      requiresAction: true,
      riskLevel: 'MEDIUM',
      riskScore: 55,
      lifecycleStage: 'ONBOARDING'
    },
    create: {
      id: 'agent-profile-8',
      organizationId: organization.id,
      userId: agent8.id,
      licenseNumber: 'FL-TN-800',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 90),
      title: 'Junior Agent',
      isCompliant: false,
      requiresAction: true,
      riskLevel: 'MEDIUM',
      riskScore: 55,
      lifecycleStage: 'ONBOARDING',
      ceCycleStartAt: subDays(now, 20),
      ceCycleEndAt: addDays(now, 90),
      ceHoursRequired: 14,
      ceHoursCompleted: 5
    }
  });

  const agent9Profile = await prisma.agentProfile.upsert({
    where: { id: 'agent-profile-9' },
    update: {
      licenseNumber: 'FL-PJ-900',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 500),
      isCompliant: true,
      requiresAction: false,
      riskLevel: 'LOW',
      riskScore: 12,
      lifecycleStage: 'OFFBOARDING'
    },
    create: {
      id: 'agent-profile-9',
      organizationId: organization.id,
      userId: agent9.id,
      licenseNumber: 'FL-PJ-900',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 500),
      title: 'Senior Advisor',
      isCompliant: true,
      requiresAction: false,
      riskLevel: 'LOW',
      riskScore: 12,
      lifecycleStage: 'OFFBOARDING',
      ceCycleStartAt: subDays(now, 200),
      ceCycleEndAt: addDays(now, 165),
      ceHoursRequired: 14,
      ceHoursCompleted: 14
    }
  });

  const agent10Profile = await prisma.agentProfile.upsert({
    where: { id: 'agent-profile-10' },
    update: {
      licenseNumber: 'FL-AR-1000',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 150),
      isCompliant: true,
      requiresAction: false,
      riskLevel: 'MEDIUM',
      riskScore: 38,
      lifecycleStage: 'ACTIVE'
    },
    create: {
      id: 'agent-profile-10',
      organizationId: organization.id,
      userId: agent10.id,
      licenseNumber: 'FL-AR-1000',
      licenseState: 'FL',
      licenseExpiresAt: addDays(now, 150),
      title: 'Agent',
      isCompliant: true,
      requiresAction: false,
      riskLevel: 'MEDIUM',
      riskScore: 38,
      lifecycleStage: 'ACTIVE',
      ceCycleStartAt: subDays(now, 75),
      ceCycleEndAt: addDays(now, 290),
      ceHoursRequired: 14,
      ceHoursCompleted: 10
    }
  });

  const agents = [ariaProfile, novaProfile, isaProfile, agent4Profile, agent5Profile, agent6Profile, agent7Profile, agent8Profile, agent9Profile, agent10Profile];

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
    },
    // A-Tier Leads (scores 80-100)
    { id: 'lead-a-001', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'QUALIFIED', source: 'MANUAL', name: 'Morgan Chen', email: 'morgan.chen@example.com', phone: '+13055550200', createdByUserId: broker.id },
    { id: 'lead-a-002', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'APPOINTMENT_SET', source: 'PORTAL_SIGNUP', name: 'Alex Rivera', email: 'alex.rivera@example.com', phone: '+13055550201', createdByUserId: agent.id },
    { id: 'lead-a-003', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'QUALIFIED', source: 'LISTING_INQUIRY', name: 'Jordan Kim', email: 'jordan.kim@example.com', phone: '+13055550202', createdByUserId: broker.id },
    { id: 'lead-a-004', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Casey Thompson', email: 'casey.t@example.com', phone: '+13055550203', createdByUserId: additionalAgent.id},
    { id: 'lead-a-005', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'APPOINTMENT_SET', source: 'OTHER', name: 'Riley Patel', email: 'riley.patel@example.com', phone: '+13055550204', createdByUserId: broker.id },
    { id: 'lead-a-006', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'QUALIFIED', source: 'PORTAL_SIGNUP', name: 'Quinn Martinez', email: 'quinn.m@example.com', phone: '+13055550205', createdByUserId: agent.id },
    { id: 'lead-a-007', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'QUALIFIED', source: 'LISTING_INQUIRY', name: 'Cameron Wu', email: 'cameron.wu@example.com', phone: '+13055550206', createdByUserId: broker.id },
    { id: 'lead-a-008', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'APPOINTMENT_SET', source: 'MANUAL', name: 'Avery Johnson', email: 'avery.j@example.com', phone: '+13055550207', createdByUserId: additionalAgent.id},
    { id: 'lead-a-009', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'CONTACTED', source: 'PORTAL_SIGNUP', name: 'Peyton Lee', email: 'peyton.lee@example.com', phone: '+13055550208', createdByUserId: broker.id },
    { id: 'lead-a-010', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'QUALIFIED', source: 'OTHER', name: 'Taylor Brown', email: 'taylor.brown@example.com', phone: '+13055550209', createdByUserId: agent.id },
    { id: 'lead-a-011', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'APPOINTMENT_SET', source: 'LISTING_INQUIRY', name: 'Skylar Garcia', email: 'skylar.g@example.com', phone: '+13055550210', createdByUserId: broker.id },
    { id: 'lead-a-012', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'QUALIFIED', source: 'MANUAL', name: 'Sage Anderson', email: 'sage.a@example.com', phone: '+13055550211', createdByUserId: additionalAgent.id},
    { id: 'lead-a-013', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'CONTACTED', source: 'PORTAL_SIGNUP', name: 'Rowan Davis', email: 'rowan.d@example.com', phone: '+13055550212', createdByUserId: broker.id },
    { id: 'lead-a-014', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'APPOINTMENT_SET', source: 'OTHER', name: 'Phoenix Wilson', email: 'phoenix.w@example.com', phone: '+13055550213', createdByUserId: agent.id },
    { id: 'lead-a-015', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'QUALIFIED', source: 'LISTING_INQUIRY', name: 'Dakota Miller', email: 'dakota.m@example.com', phone: '+13055550214', createdByUserId: broker.id },

    // B-Tier Leads (scores 60-79)
    { id: 'lead-b-001', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'CONTACTED', source: 'PORTAL_SIGNUP', name: 'Jesse Moore', email: 'jesse.moore@example.com', phone: '+13055550215', createdByUserId: broker.id },
    { id: 'lead-b-002', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'QUALIFIED', source: 'OTHER', name: 'Harper Taylor', email: 'harper.t@example.com', phone: '+13055550216', createdByUserId: agent.id },
    { id: 'lead-b-003', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'CONTACTED', source: 'LISTING_INQUIRY', name: 'Finley Thomas', email: 'finley.t@example.com', phone: '+13055550217', createdByUserId: broker.id },
    { id: 'lead-b-004', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'MANUAL', name: 'Emerson Jackson', email: 'emerson.j@example.com', phone: '+13055550218', createdByUserId: additionalAgent.id },
    { id: 'lead-b-005', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'CONTACTED', source: 'PORTAL_SIGNUP', name: 'Blake White', email: 'blake.white@example.com', phone: '+13055550219', createdByUserId: broker.id },
    { id: 'lead-b-006', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'QUALIFIED', source: 'OTHER', name: 'Reese Harris', email: 'reese.h@example.com', phone: '+13055550220', createdByUserId: agent.id },
    { id: 'lead-b-007', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'CONTACTED', source: 'LISTING_INQUIRY', name: 'Charlie Martin', email: 'charlie.m@example.com', phone: '+13055550221', createdByUserId: broker.id },
    { id: 'lead-b-008', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'MANUAL', name: 'Oakley Clark', email: 'oakley.c@example.com', phone: '+13055550222', createdByUserId: additionalAgent.id },
    { id: 'lead-b-009', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'QUALIFIED', source: 'PORTAL_SIGNUP', name: 'River Lewis', email: 'river.lewis@example.com', phone: '+13055550223', createdByUserId: broker.id },
    { id: 'lead-b-010', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Kai Robinson', email: 'kai.r@example.com', phone: '+13055550224', createdByUserId: agent.id },
    { id: 'lead-b-011', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Sutton Walker', email: 'sutton.w@example.com', phone: '+13055550225', createdByUserId: broker.id },
    { id: 'lead-b-012', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Lennox Hall', email: 'lennox.h@example.com', phone: '+13055550226', createdByUserId: additionalAgent.id },
    { id: 'lead-b-013', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'QUALIFIED', source: 'PORTAL_SIGNUP', name: 'Marlowe Allen', email: 'marlowe.a@example.com', phone: '+13055550227', createdByUserId: broker.id },
    { id: 'lead-b-014', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Sloane Young', email: 'sloane.y@example.com', phone: '+13055550228', createdByUserId: agent.id },
    { id: 'lead-b-015', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Indigo King', email: 'indigo.k@example.com', phone: '+13055550229', createdByUserId: broker.id },
    { id: 'lead-b-016', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Atlas Wright', email: 'atlas.w@example.com', phone: '+13055550230', createdByUserId: additionalAgent.id },
    { id: 'lead-b-017', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'QUALIFIED', source: 'PORTAL_SIGNUP', name: 'Briar Lopez', email: 'briar.l@example.com', phone: '+13055550231', createdByUserId: broker.id },
    { id: 'lead-b-018', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Zion Hill', email: 'zion.h@example.com', phone: '+13055550232', createdByUserId: agent.id },
    { id: 'lead-b-019', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Echo Scott', email: 'echo.s@example.com', phone: '+13055550233', createdByUserId: broker.id },
    { id: 'lead-b-020', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Wren Green', email: 'wren.g@example.com', phone: '+13055550234', createdByUserId: additionalAgent.id },
    { id: 'lead-b-021', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'QUALIFIED', source: 'PORTAL_SIGNUP', name: 'Hayes Adams', email: 'hayes.a@example.com', phone: '+13055550235', createdByUserId: broker.id },
    { id: 'lead-b-022', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Crew Baker', email: 'crew.b@example.com', phone: '+13055550236', createdByUserId: agent.id },
    { id: 'lead-b-023', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Wilder Nelson', email: 'wilder.n@example.com', phone: '+13055550237', createdByUserId: broker.id },
    { id: 'lead-b-024', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Ellis Carter', email: 'ellis.c@example.com', phone: '+13055550238', createdByUserId: additionalAgent.id },
    { id: 'lead-b-025', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'QUALIFIED', source: 'PORTAL_SIGNUP', name: 'Remy Mitchell', email: 'remy.m@example.com', phone: '+13055550239', createdByUserId: broker.id },

    // C-Tier Leads (scores 40-59)
    { id: 'lead-c-001', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Hollis Perez', email: 'hollis.p@example.com', phone: '+13055550240', createdByUserId: broker.id },
    { id: 'lead-c-002', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Palmer Roberts', email: 'palmer.r@example.com', phone: '+13055550241', createdByUserId: agent.id },
    { id: 'lead-c-003', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Bellamy Turner', email: 'bellamy.t@example.com', phone: '+13055550242', createdByUserId: broker.id },
    { id: 'lead-c-004', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Cove Phillips', email: 'cove.p@example.com', phone: '+13055550243', createdByUserId: additionalAgent.id },
    { id: 'lead-c-005', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Arden Campbell', email: 'arden.c@example.com', phone: '+13055550244', createdByUserId: broker.id },
    { id: 'lead-c-006', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Cedar Parker', email: 'cedar.p@example.com', phone: '+13055550245', createdByUserId: agent.id },
    { id: 'lead-c-007', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Lark Evans', email: 'lark.e@example.com', phone: '+13055550246', createdByUserId: broker.id },
    { id: 'lead-c-008', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Onyx Edwards', email: 'onyx.e@example.com', phone: '+13055550247', createdByUserId: additionalAgent.id },
    { id: 'lead-c-009', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Quincy Collins', email: 'quincy.c@example.com', phone: '+13055550248', createdByUserId: broker.id },
    { id: 'lead-c-010', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Story Stewart', email: 'story.s@example.com', phone: '+13055550249', createdByUserId: agent.id },
    { id: 'lead-c-011', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Merit Sanchez', email: 'merit.s@example.com', phone: '+13055550250', createdByUserId: broker.id },
    { id: 'lead-c-012', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Harbor Morris', email: 'harbor.m@example.com', phone: '+13055550251', createdByUserId: additionalAgent.id },
    { id: 'lead-c-013', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Noble Rogers', email: 'noble.r@example.com', phone: '+13055550252', createdByUserId: broker.id },
    { id: 'lead-c-014', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Arrow Reed', email: 'arrow.r@example.com', phone: '+13055550253', createdByUserId: agent.id },
    { id: 'lead-c-015', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Vale Cook', email: 'vale.c@example.com', phone: '+13055550254', createdByUserId: broker.id },
    { id: 'lead-c-016', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Lyric Morgan', email: 'lyric.m@example.com', phone: '+13055550255', createdByUserId: additionalAgent.id },
    { id: 'lead-c-017', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Dune Bell', email: 'dune.b@example.com', phone: '+13055550256', createdByUserId: broker.id },
    { id: 'lead-c-018', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Grove Bailey', email: 'grove.b@example.com', phone: '+13055550257', createdByUserId: agent.id },
    { id: 'lead-c-019', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Blaze Rivera', email: 'blaze.r@example.com', phone: '+13055550258', createdByUserId: broker.id },
    { id: 'lead-c-020', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Canyon Cooper', email: 'canyon.c@example.com', phone: '+13055550259', createdByUserId: additionalAgent.id },
    { id: 'lead-c-021', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Fleet Richardson', email: 'fleet.r@example.com', phone: '+13055550260', createdByUserId: broker.id },
    { id: 'lead-c-022', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Linden Cox', email: 'linden.c@example.com', phone: '+13055550261', createdByUserId: agent.id },
    { id: 'lead-c-023', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Sparrow Howard', email: 'sparrow.h@example.com', phone: '+13055550262', createdByUserId: broker.id },
    { id: 'lead-c-024', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Caspian Ward', email: 'caspian.w@example.com', phone: '+13055550263', createdByUserId: additionalAgent.id },
    { id: 'lead-c-025', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Frost Torres', email: 'frost.t@example.com', phone: '+13055550264', createdByUserId: broker.id },
    { id: 'lead-c-026', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Everest Peterson', email: 'everest.p@example.com', phone: '+13055550265', createdByUserId: agent.id },
    { id: 'lead-c-027', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Summit Gray', email: 'summit.g@example.com', phone: '+13055550266', createdByUserId: broker.id },
    { id: 'lead-c-028', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'MANUAL', name: 'Journey Ramirez', email: 'journey.r@example.com', phone: '+13055550267', createdByUserId: additionalAgent.id },
    { id: 'lead-c-029', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Halo James', email: 'halo.j@example.com', phone: '+13055550268', createdByUserId: broker.id },
    { id: 'lead-c-030', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'CONTACTED', source: 'OTHER', name: 'Kodiak Watson', email: 'kodiak.w@example.com', phone: '+13055550269', createdByUserId: agent.id },

    // D-Tier Leads (scores 0-39)
    { id: 'lead-d-001', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Nova Brooks', email: 'nova.b@example.com', phone: '+13055550270', createdByUserId: broker.id },
    { id: 'lead-d-002', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'OTHER', name: 'Breeze Kelly', email: 'breeze.k@example.com', phone: '+13055550271', createdByUserId: agent.id },
    { id: 'lead-d-003', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Storm Sanders', email: 'storm.s@example.com', phone: '+13055550272', createdByUserId: broker.id },
    { id: 'lead-d-004', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'MANUAL', name: 'Coral Price', email: 'coral.p@example.com', phone: '+13055550273', createdByUserId: additionalAgent.id },
    { id: 'lead-d-005', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Rain Bennett', email: 'rain.b@example.com', phone: '+13055550274', createdByUserId: broker.id },
    { id: 'lead-d-006', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'OTHER', name: 'Ocean Wood', email: 'ocean.w@example.com', phone: '+13055550275', createdByUserId: agent.id },
    { id: 'lead-d-007', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Cloud Barnes', email: 'cloud.b@example.com', phone: '+13055550276', createdByUserId: broker.id },
    { id: 'lead-d-008', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'MANUAL', name: 'Dawn Ross', email: 'dawn.r@example.com', phone: '+13055550277', createdByUserId: additionalAgent.id },
    { id: 'lead-d-009', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Meadow Henderson', email: 'meadow.h@example.com', phone: '+13055550278', createdByUserId: broker.id },
    { id: 'lead-d-010', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'OTHER', name: 'Ridge Coleman', email: 'ridge.c@example.com', phone: '+13055550279', createdByUserId: agent.id },
    { id: 'lead-d-011', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Bluff Jenkins', email: 'bluff.j@example.com', phone: '+13055550280', createdByUserId: broker.id },
    { id: 'lead-d-012', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'MANUAL', name: 'Prairie Perry', email: 'prairie.p@example.com', phone: '+13055550281', createdByUserId: additionalAgent.id },
    { id: 'lead-d-013', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Forest Powell', email: 'forest.p@example.com', phone: '+13055550282', createdByUserId: broker.id },
    { id: 'lead-d-014', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'OTHER', name: 'Valley Long', email: 'valley.l@example.com', phone: '+13055550283', createdByUserId: agent.id },
    { id: 'lead-d-015', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Branch Hughes', email: 'branch.h@example.com', phone: '+13055550284', createdByUserId: broker.id },
    { id: 'lead-d-016', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'MANUAL', name: 'Delta Flores', email: 'delta.f@example.com', phone: '+13055550285', createdByUserId: additionalAgent.id },
    { id: 'lead-d-017', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Frost Washington', email: 'frost.w@example.com', phone: '+13055550286', createdByUserId: broker.id },
    { id: 'lead-d-018', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'OTHER', name: 'Peak Butler', email: 'peak.b@example.com', phone: '+13055550287', createdByUserId: agent.id },
    { id: 'lead-d-019', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Brook Simmons', email: 'brook.s@example.com', phone: '+13055550288', createdByUserId: broker.id },
    { id: 'lead-d-020', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'MANUAL', name: 'Tide Foster', email: 'tide.f@example.com', phone: '+13055550289', createdByUserId: additionalAgent.id },
    { id: 'lead-d-021', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Cliff Gonzales', email: 'cliff.g@example.com', phone: '+13055550290', createdByUserId: broker.id },
    { id: 'lead-d-022', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'OTHER', name: 'Stone Bryant', email: 'stone.b@example.com', phone: '+13055550291', createdByUserId: agent.id },
    { id: 'lead-d-023', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'LISTING_INQUIRY', name: 'Glen Alexander', email: 'glen.a@example.com', phone: '+13055550292', createdByUserId: broker.id },
    { id: 'lead-d-024', organizationId: organization.id, agentProfileId: novaProfile.id, status: 'NEW', source: 'MANUAL', name: 'Rift Russell', email: 'rift.r@example.com', phone: '+13055550293', createdByUserId: additionalAgent.id },
    { id: 'lead-d-025', organizationId: organization.id, agentProfileId: ariaProfile.id, status: 'NEW', source: 'PORTAL_SIGNUP', name: 'Gale Griffin', email: 'gale.g@example.com', phone: '+13055550294', createdByUserId: broker.id },
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
    update: {
      // Password: password123
      passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
    },
    create: {
      id: 'user-broker',
      organizationId: organization.id,
      tenantId: tenant.id,
      email: 'broker@hatchcrm.test',
      firstName: 'Brianna',
      lastName: 'Broker',
      role: 'BROKER',
      // Password: password123
      passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
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

  const now = new Date();

  // Additional demo leads so lead scoring / prioritization can be exercised.
  const demoLeads: Array<{
    id: string;
    firstName: string;
    lastName: string;
    primaryEmail: string;
    primaryPhone: string;
    ownerId: string;
    stage: 'NEW' | 'ACTIVE';
    tags: string[];
    source: string;
    leadScore: number;
    scoreTier: LeadScoreTier;
    stageId: string | null;
    stageEnteredAt: Date;
    lastActivityAt: Date;
  }> = [
    {
      id: 'contact-demo-ava',
      firstName: 'Ava',
      lastName: 'Alvarez',
      primaryEmail: 'ava.alvarez@hatchcrm.test',
      primaryPhone: '+14155550125',
      ownerId: agent.id,
      stage: 'ACTIVE',
      tags: ['hot', 'buyer'],
      source: 'website',
      leadScore: 91,
      scoreTier: LeadScoreTier.A,
      stageId: stageS5Id ?? stageS3Id ?? stageS1Id ?? null,
      stageEnteredAt: addHours(now, -20),
      lastActivityAt: addHours(now, -2)
    },
    {
      id: 'contact-demo-ben',
      firstName: 'Ben',
      lastName: 'Brooks',
      primaryEmail: 'ben.brooks@hatchcrm.test',
      primaryPhone: '+14155550126',
      ownerId: agent.id,
      stage: 'ACTIVE',
      tags: ['seller'],
      source: 'referral',
      leadScore: 78,
      scoreTier: LeadScoreTier.B,
      stageId: stageS3Id ?? stageS1Id ?? null,
      stageEnteredAt: addHours(now, -72),
      lastActivityAt: addHours(now, -10)
    },
    {
      id: 'contact-demo-chloe',
      firstName: 'Chloe',
      lastName: 'Chen',
      primaryEmail: 'chloe.chen@hatchcrm.test',
      primaryPhone: '+14155550127',
      ownerId: agent.id,
      stage: 'ACTIVE',
      tags: ['buyer'],
      source: 'open_house',
      leadScore: 72,
      scoreTier: LeadScoreTier.B,
      stageId: stageS3Id ?? stageS1Id ?? null,
      stageEnteredAt: addHours(now, -40),
      lastActivityAt: addHours(now, -6)
    },
    {
      id: 'contact-demo-diego',
      firstName: 'Diego',
      lastName: 'Diaz',
      primaryEmail: 'diego.diaz@hatchcrm.test',
      primaryPhone: '+14155550128',
      ownerId: isa.id,
      stage: 'ACTIVE',
      tags: ['idle', 'buyer'],
      source: 'portal',
      leadScore: 58,
      scoreTier: LeadScoreTier.C,
      stageId: stageS1Id ?? null,
      stageEnteredAt: addHours(now, -200),
      lastActivityAt: subDays(now, 8)
    },
    {
      id: 'contact-demo-ella',
      firstName: 'Ella',
      lastName: 'Evans',
      primaryEmail: 'ella.evans@hatchcrm.test',
      primaryPhone: '+14155550129',
      ownerId: isa.id,
      stage: 'NEW',
      tags: ['new-lead'],
      source: 'instagram',
      leadScore: 43,
      scoreTier: LeadScoreTier.C,
      stageId: stageS1Id ?? null,
      stageEnteredAt: addHours(now, -6),
      lastActivityAt: subDays(now, 4)
    },
    {
      id: 'contact-demo-finn',
      firstName: 'Finn',
      lastName: 'Foster',
      primaryEmail: 'finn.foster@hatchcrm.test',
      primaryPhone: '+14155550130',
      ownerId: isa.id,
      stage: 'ACTIVE',
      tags: ['idle', 'seller'],
      source: 'zillow',
      leadScore: 34,
      scoreTier: LeadScoreTier.D,
      stageId: stageS1Id ?? null,
      stageEnteredAt: addHours(now, -260),
      lastActivityAt: subDays(now, 12)
    },
    {
      id: 'contact-demo-grace',
      firstName: 'Grace',
      lastName: 'Green',
      primaryEmail: 'grace.green@hatchcrm.test',
      primaryPhone: '+14155550131',
      ownerId: agent.id,
      stage: 'ACTIVE',
      tags: ['hot', 'buyer'],
      source: 'referral',
      leadScore: 87,
      scoreTier: LeadScoreTier.A,
      stageId: stageS5Id ?? stageS3Id ?? stageS1Id ?? null,
      stageEnteredAt: addHours(now, -30),
      lastActivityAt: addHours(now, -3)
    }
  ];

  for (const demoLead of demoLeads) {
    const update: Prisma.PersonUncheckedUpdateInput = {
      organizationId: organization.id,
      tenantId: tenant.id,
      ownerId: demoLead.ownerId,
      firstName: demoLead.firstName,
      lastName: demoLead.lastName,
      primaryEmail: demoLead.primaryEmail,
      primaryPhone: demoLead.primaryPhone,
      stage: demoLead.stage,
      tags: demoLead.tags,
      source: demoLead.source,
      pipelineId: sSeriesPipeline.pipeline.id,
      stageId: demoLead.stageId,
      stageEnteredAt: demoLead.stageEnteredAt,
      leadScore: demoLead.leadScore,
      scoreTier: demoLead.scoreTier,
      scoreUpdatedAt: now,
      lastActivityAt: demoLead.lastActivityAt,
      doNotContact: false,
      deletedAt: null
    };

    await prisma.person.upsert({
      where: { id: demoLead.id },
      update,
      create: {
        id: demoLead.id,
        ...update
      }
    });
  }

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

  const account4 = await prisma.account.upsert({
    where: { id: 'account-miami-tech-ventures' },
    update: {
      ownerId: agent.id,
      name: 'Miami Tech Ventures LLC',
      industry: 'Technology',
      phone: '+13055551003',
      website: 'https://miamitechventures.com',
      annualRevenue: new Prisma.Decimal(8500000)
    },
    create: {
      id: 'account-miami-tech-ventures',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Miami Tech Ventures LLC',
      industry: 'Technology',
      phone: '+13055551003',
      website: 'https://miamitechventures.com',
      annualRevenue: new Prisma.Decimal(8500000)
    }
  });

  const account5 = await prisma.account.upsert({
    where: { id: 'account-coastal-properties' },
    update: {
      ownerId: broker.id,
      name: 'Coastal Properties International',
      industry: 'Real Estate',
      phone: '+13055551004',
      website: 'https://coastalpropertiesintl.com',
      annualRevenue: new Prisma.Decimal(12000000)
    },
    create: {
      id: 'account-coastal-properties',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Coastal Properties International',
      industry: 'Real Estate',
      phone: '+13055551004',
      website: 'https://coastalpropertiesintl.com',
      annualRevenue: new Prisma.Decimal(12000000)
    }
  });

  const account6 = await prisma.account.upsert({
    where: { id: 'account-martinez-family' },
    update: {
      ownerId: agent.id,
      name: 'Martinez Family Trust',
      phone: '+13055551005',
      billingAddress: {
        street: '450 Ocean Drive',
        city: 'Miami Beach',
        state: 'FL'
      } as Prisma.JsonObject
    },
    create: {
      id: 'account-martinez-family',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Martinez Family Trust',
      phone: '+13055551005',
      billingAddress: {
        street: '450 Ocean Drive',
        city: 'Miami Beach',
        state: 'FL'
      } as Prisma.JsonObject
    }
  });

  const account7 = await prisma.account.upsert({
    where: { id: 'account-pinnacle-investments' },
    update: {
      ownerId: broker.id,
      name: 'Pinnacle Investment Group',
      industry: 'Finance',
      phone: '+13055551006',
      website: 'https://pinnacleinvest.com',
      annualRevenue: new Prisma.Decimal(25000000)
    },
    create: {
      id: 'account-pinnacle-investments',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Pinnacle Investment Group',
      industry: 'Finance',
      phone: '+13055551006',
      website: 'https://pinnacleinvest.com',
      annualRevenue: new Prisma.Decimal(25000000)
    }
  });

  const account8 = await prisma.account.upsert({
    where: { id: 'account-evergreen-holdings' },
    update: {
      ownerId: agent.id,
      name: 'Evergreen Holdings Corp',
      industry: 'Real Estate',
      phone: '+13055551007',
      website: 'https://evergreenholdings.com',
      annualRevenue: new Prisma.Decimal(6800000)
    },
    create: {
      id: 'account-evergreen-holdings',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Evergreen Holdings Corp',
      industry: 'Real Estate',
      phone: '+13055551007',
      website: 'https://evergreenholdings.com',
      annualRevenue: new Prisma.Decimal(6800000)
    }
  });

  const account9 = await prisma.account.upsert({
    where: { id: 'account-chen-enterprises' },
    update: {
      ownerId: broker.id,
      name: 'Chen Enterprises',
      industry: 'Manufacturing',
      phone: '+13055551008',
      website: 'https://chenenterprises.com',
      annualRevenue: new Prisma.Decimal(15000000)
    },
    create: {
      id: 'account-chen-enterprises',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Chen Enterprises',
      industry: 'Manufacturing',
      phone: '+13055551008',
      website: 'https://chenenterprises.com',
      annualRevenue: new Prisma.Decimal(15000000)
    }
  });

  const account10 = await prisma.account.upsert({
    where: { id: 'account-south-beach-hotel' },
    update: {
      ownerId: agent.id,
      name: 'South Beach Hotel Group',
      industry: 'Hospitality',
      phone: '+13055551009',
      website: 'https://southbeachhotels.com',
      annualRevenue: new Prisma.Decimal(42000000),
      billingAddress: {
        street: '1200 Collins Ave',
        city: 'Miami Beach',
        state: 'FL'
      } as Prisma.JsonObject
    },
    create: {
      id: 'account-south-beach-hotel',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'South Beach Hotel Group',
      industry: 'Hospitality',
      phone: '+13055551009',
      website: 'https://southbeachhotels.com',
      annualRevenue: new Prisma.Decimal(42000000),
      billingAddress: {
        street: '1200 Collins Ave',
        city: 'Miami Beach',
        state: 'FL'
      } as Prisma.JsonObject
    }
  });

  const account11 = await prisma.account.upsert({
    where: { id: 'account-anderson-portfolio' },
    update: {
      ownerId: broker.id,
      name: 'Anderson Real Estate Portfolio',
      industry: 'Real Estate',
      phone: '+13055551010',
      annualRevenue: new Prisma.Decimal(4200000)
    },
    create: {
      id: 'account-anderson-portfolio',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Anderson Real Estate Portfolio',
      industry: 'Real Estate',
      phone: '+13055551010',
      annualRevenue: new Prisma.Decimal(4200000)
    }
  });

  const account12 = await prisma.account.upsert({
    where: { id: 'account-sterling-capital' },
    update: {
      ownerId: agent.id,
      name: 'Sterling Capital Partners',
      industry: 'Finance',
      phone: '+13055551011',
      website: 'https://sterlingcapital.com',
      annualRevenue: new Prisma.Decimal(18500000)
    },
    create: {
      id: 'account-sterling-capital',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Sterling Capital Partners',
      industry: 'Finance',
      phone: '+13055551011',
      website: 'https://sterlingcapital.com',
      annualRevenue: new Prisma.Decimal(18500000)
    }
  });

  const account13 = await prisma.account.upsert({
    where: { id: 'account-lee-family' },
    update: {
      ownerId: broker.id,
      name: 'Lee Family Holdings',
      phone: '+13055551012',
      billingAddress: {
        street: '2200 S Ocean Dr',
        city: 'Fort Lauderdale',
        state: 'FL'
      } as Prisma.JsonObject
    },
    create: {
      id: 'account-lee-family',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Lee Family Holdings',
      phone: '+13055551012',
      billingAddress: {
        street: '2200 S Ocean Dr',
        city: 'Fort Lauderdale',
        state: 'FL'
      } as Prisma.JsonObject
    }
  });

  const account14 = await prisma.account.upsert({
    where: { id: 'account-apex-development' },
    update: {
      ownerId: agent.id,
      name: 'Apex Development Corporation',
      industry: 'Construction',
      phone: '+13055551013',
      website: 'https://apexdevelopment.com',
      annualRevenue: new Prisma.Decimal(32000000)
    },
    create: {
      id: 'account-apex-development',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Apex Development Corporation',
      industry: 'Construction',
      phone: '+13055551013',
      website: 'https://apexdevelopment.com',
      annualRevenue: new Prisma.Decimal(32000000)
    }
  });

  const account15 = await prisma.account.upsert({
    where: { id: 'account-oceanview-resort' },
    update: {
      ownerId: broker.id,
      name: 'Oceanview Resort & Spa',
      industry: 'Hospitality',
      phone: '+13055551014',
      website: 'https://oceanviewresort.com',
      annualRevenue: new Prisma.Decimal(28000000),
      billingAddress: {
        street: '5500 Collins Ave',
        city: 'Miami Beach',
        state: 'FL'
      } as Prisma.JsonObject
    },
    create: {
      id: 'account-oceanview-resort',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Oceanview Resort & Spa',
      industry: 'Hospitality',
      phone: '+13055551014',
      website: 'https://oceanviewresort.com',
      annualRevenue: new Prisma.Decimal(28000000),
      billingAddress: {
        street: '5500 Collins Ave',
        city: 'Miami Beach',
        state: 'FL'
      } as Prisma.JsonObject
    }
  });

  const account16 = await prisma.account.upsert({
    where: { id: 'account-riverside-medical' },
    update: {
      ownerId: agent.id,
      name: 'Riverside Medical Center',
      industry: 'Healthcare',
      phone: '+13055551015',
      website: 'https://riversidemedical.com',
      annualRevenue: new Prisma.Decimal(55000000)
    },
    create: {
      id: 'account-riverside-medical',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Riverside Medical Center',
      industry: 'Healthcare',
      phone: '+13055551015',
      website: 'https://riversidemedical.com',
      annualRevenue: new Prisma.Decimal(55000000)
    }
  });

  const account17 = await prisma.account.upsert({
    where: { id: 'account-kim-associates' },
    update: {
      ownerId: broker.id,
      name: 'Kim & Associates LLC',
      industry: 'Professional Services',
      phone: '+13055551016',
      website: 'https://kimassociates.com',
      annualRevenue: new Prisma.Decimal(3800000)
    },
    create: {
      id: 'account-kim-associates',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Kim & Associates LLC',
      industry: 'Professional Services',
      phone: '+13055551016',
      website: 'https://kimassociates.com',
      annualRevenue: new Prisma.Decimal(3800000)
    }
  });

  const account18 = await prisma.account.upsert({
    where: { id: 'account-patel-trust' },
    update: {
      ownerId: agent.id,
      name: 'Patel Family Trust',
      phone: '+13055551017',
      billingAddress: {
        street: '888 Brickell Ave',
        city: 'Miami',
        state: 'FL'
      } as Prisma.JsonObject
    },
    create: {
      id: 'account-patel-trust',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Patel Family Trust',
      phone: '+13055551017',
      billingAddress: {
        street: '888 Brickell Ave',
        city: 'Miami',
        state: 'FL'
      } as Prisma.JsonObject
    }
  });

  const account19 = await prisma.account.upsert({
    where: { id: 'account-horizon-equity' },
    update: {
      ownerId: broker.id,
      name: 'Horizon Equity Group',
      industry: 'Real Estate',
      phone: '+13055551018',
      website: 'https://horizonequity.com',
      annualRevenue: new Prisma.Decimal(9200000)
    },
    create: {
      id: 'account-horizon-equity',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Horizon Equity Group',
      industry: 'Real Estate',
      phone: '+13055551018',
      website: 'https://horizonequity.com',
      annualRevenue: new Prisma.Decimal(9200000)
    }
  });

  const account20 = await prisma.account.upsert({
    where: { id: 'account-bayfront-ventures' },
    update: {
      ownerId: agent.id,
      name: 'Bayfront Ventures Inc',
      industry: 'Technology',
      phone: '+13055551019',
      website: 'https://bayfrontventures.com',
      annualRevenue: new Prisma.Decimal(7500000)
    },
    create: {
      id: 'account-bayfront-ventures',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Bayfront Ventures Inc',
      industry: 'Technology',
      phone: '+13055551019',
      website: 'https://bayfrontventures.com',
      annualRevenue: new Prisma.Decimal(7500000)
    }
  });

  const account21 = await prisma.account.upsert({
    where: { id: 'account-gold-coast-retail' },
    update: {
      ownerId: broker.id,
      name: 'Gold Coast Retail Properties',
      industry: 'Retail',
      phone: '+13055551020',
      website: 'https://goldcoastretail.com',
      annualRevenue: new Prisma.Decimal(14500000)
    },
    create: {
      id: 'account-gold-coast-retail',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Gold Coast Retail Properties',
      industry: 'Retail',
      phone: '+13055551020',
      website: 'https://goldcoastretail.com',
      annualRevenue: new Prisma.Decimal(14500000)
    }
  });

  const account22 = await prisma.account.upsert({
    where: { id: 'account-nguyen-holdings' },
    update: {
      ownerId: agent.id,
      name: 'Nguyen Holdings LLC',
      phone: '+13055551021',
      billingAddress: {
        street: '1500 Alton Rd',
        city: 'Miami Beach',
        state: 'FL'
      } as Prisma.JsonObject
    },
    create: {
      id: 'account-nguyen-holdings',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Nguyen Holdings LLC',
      phone: '+13055551021',
      billingAddress: {
        street: '1500 Alton Rd',
        city: 'Miami Beach',
        state: 'FL'
      } as Prisma.JsonObject
    }
  });

  const account23 = await prisma.account.upsert({
    where: { id: 'account-palmetto-logistics' },
    update: {
      ownerId: broker.id,
      name: 'Palmetto Logistics Solutions',
      industry: 'Transportation',
      phone: '+13055551022',
      website: 'https://palmettologistics.com',
      annualRevenue: new Prisma.Decimal(21000000)
    },
    create: {
      id: 'account-palmetto-logistics',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Palmetto Logistics Solutions',
      industry: 'Transportation',
      phone: '+13055551022',
      website: 'https://palmettologistics.com',
      annualRevenue: new Prisma.Decimal(21000000)
    }
  });

  const account24 = await prisma.account.upsert({
    where: { id: 'account-atlantic-consulting' },
    update: {
      ownerId: agent.id,
      name: 'Atlantic Consulting Partners',
      industry: 'Professional Services',
      phone: '+13055551023',
      website: 'https://atlanticconsulting.com',
      annualRevenue: new Prisma.Decimal(5600000)
    },
    create: {
      id: 'account-atlantic-consulting',
      orgId: organization.id,
      ownerId: agent.id,
      name: 'Atlantic Consulting Partners',
      industry: 'Professional Services',
      phone: '+13055551023',
      website: 'https://atlanticconsulting.com',
      annualRevenue: new Prisma.Decimal(5600000)
    }
  });

  const account25 = await prisma.account.upsert({
    where: { id: 'account-williams-estate' },
    update: {
      ownerId: broker.id,
      name: 'Williams Family Estate',
      phone: '+13055551024',
      billingAddress: {
        street: '3000 Island Blvd',
        city: 'Aventura',
        state: 'FL'
      } as Prisma.JsonObject
    },
    create: {
      id: 'account-williams-estate',
      orgId: organization.id,
      ownerId: broker.id,
      name: 'Williams Family Estate',
      phone: '+13055551024',
      billingAddress: {
        street: '3000 Island Blvd',
        city: 'Aventura',
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

  const opportunity4 = await prisma.opportunity.upsert({
    where: { id: 'opp-miami-tech-headquarters' },
    update: {
      ownerId: agent.id,
      accountId: account4.id,
      name: 'Miami Tech New Headquarters',
      stage: 'Proposal',
      amount: new Prisma.Decimal(4200000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-miami-tech-headquarters',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account4.id,
      name: 'Miami Tech New Headquarters',
      stage: 'Proposal',
      amount: new Prisma.Decimal(4200000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity5 = await prisma.opportunity.upsert({
    where: { id: 'opp-coastal-portfolio-expansion' },
    update: {
      ownerId: broker.id,
      accountId: account5.id,
      name: 'Coastal Portfolio Expansion',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(8500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-coastal-portfolio-expansion',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account5.id,
      name: 'Coastal Portfolio Expansion',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(8500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity6 = await prisma.opportunity.upsert({
    where: { id: 'opp-martinez-investment-property' },
    update: {
      ownerId: agent.id,
      accountId: account6.id,
      name: 'Martinez Investment Property',
      stage: 'Closing',
      amount: new Prisma.Decimal(1650000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-martinez-investment-property',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account6.id,
      name: 'Martinez Investment Property',
      stage: 'Closing',
      amount: new Prisma.Decimal(1650000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity7 = await prisma.opportunity.upsert({
    where: { id: 'opp-pinnacle-commercial-complex' },
    update: {
      ownerId: broker.id,
      accountId: account7.id,
      name: 'Pinnacle Commercial Complex',
      stage: 'Qualification',
      amount: new Prisma.Decimal(12000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-pinnacle-commercial-complex',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account7.id,
      name: 'Pinnacle Commercial Complex',
      stage: 'Qualification',
      amount: new Prisma.Decimal(12000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity8 = await prisma.opportunity.upsert({
    where: { id: 'opp-evergreen-retail-acquisition' },
    update: {
      ownerId: agent.id,
      accountId: account8.id,
      name: 'Evergreen Retail Space Acquisition',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(3200000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-evergreen-retail-acquisition',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account8.id,
      name: 'Evergreen Retail Space Acquisition',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(3200000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity9 = await prisma.opportunity.upsert({
    where: { id: 'opp-chen-warehouse-lease' },
    update: {
      ownerId: broker.id,
      accountId: account9.id,
      name: 'Chen Enterprises Warehouse Lease',
      stage: 'Proposal',
      amount: new Prisma.Decimal(875000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-chen-warehouse-lease',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account9.id,
      name: 'Chen Enterprises Warehouse Lease',
      stage: 'Proposal',
      amount: new Prisma.Decimal(875000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity10 = await prisma.opportunity.upsert({
    where: { id: 'opp-south-beach-renovation' },
    update: {
      ownerId: agent.id,
      accountId: account10.id,
      name: 'South Beach Hotel Renovation Project',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(18500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-south-beach-renovation',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account10.id,
      name: 'South Beach Hotel Renovation Project',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(18500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity11 = await prisma.opportunity.upsert({
    where: { id: 'opp-anderson-condo-conversion' },
    update: {
      ownerId: broker.id,
      accountId: account11.id,
      name: 'Anderson Condo Conversion',
      stage: 'Closed Lost',
      amount: new Prisma.Decimal(2100000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-anderson-condo-conversion',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account11.id,
      name: 'Anderson Condo Conversion',
      stage: 'Closed Lost',
      amount: new Prisma.Decimal(2100000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity12 = await prisma.opportunity.upsert({
    where: { id: 'opp-sterling-office-tower' },
    update: {
      ownerId: agent.id,
      accountId: account12.id,
      name: 'Sterling Capital Office Tower',
      stage: 'Qualification',
      amount: new Prisma.Decimal(22000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-sterling-office-tower',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account12.id,
      name: 'Sterling Capital Office Tower',
      stage: 'Qualification',
      amount: new Prisma.Decimal(22000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity13 = await prisma.opportunity.upsert({
    where: { id: 'opp-lee-beachfront-villa' },
    update: {
      ownerId: broker.id,
      accountId: account13.id,
      name: 'Lee Family Beachfront Villa',
      stage: 'Closing',
      amount: new Prisma.Decimal(5800000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-lee-beachfront-villa',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account13.id,
      name: 'Lee Family Beachfront Villa',
      stage: 'Closing',
      amount: new Prisma.Decimal(5800000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity14 = await prisma.opportunity.upsert({
    where: { id: 'opp-apex-mixed-use' },
    update: {
      ownerId: agent.id,
      accountId: account14.id,
      name: 'Apex Mixed-Use Development',
      stage: 'Proposal',
      amount: new Prisma.Decimal(45000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-apex-mixed-use',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account14.id,
      name: 'Apex Mixed-Use Development',
      stage: 'Proposal',
      amount: new Prisma.Decimal(45000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity15 = await prisma.opportunity.upsert({
    where: { id: 'opp-oceanview-expansion' },
    update: {
      ownerId: broker.id,
      accountId: account15.id,
      name: 'Oceanview Resort Expansion Wing',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(15000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-oceanview-expansion',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account15.id,
      name: 'Oceanview Resort Expansion Wing',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(15000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity16 = await prisma.opportunity.upsert({
    where: { id: 'opp-riverside-medical-campus' },
    update: {
      ownerId: agent.id,
      accountId: account16.id,
      name: 'Riverside Medical Campus Lease',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(6500000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-riverside-medical-campus',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account16.id,
      name: 'Riverside Medical Campus Lease',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(6500000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity17 = await prisma.opportunity.upsert({
    where: { id: 'opp-kim-office-space' },
    update: {
      ownerId: broker.id,
      accountId: account17.id,
      name: 'Kim & Associates Office Relocation',
      stage: 'Qualification',
      amount: new Prisma.Decimal(650000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-kim-office-space',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account17.id,
      name: 'Kim & Associates Office Relocation',
      stage: 'Qualification',
      amount: new Prisma.Decimal(650000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity18 = await prisma.opportunity.upsert({
    where: { id: 'opp-patel-rental-portfolio' },
    update: {
      ownerId: agent.id,
      accountId: account18.id,
      name: 'Patel Rental Property Portfolio',
      stage: 'Proposal',
      amount: new Prisma.Decimal(3400000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-patel-rental-portfolio',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account18.id,
      name: 'Patel Rental Property Portfolio',
      stage: 'Proposal',
      amount: new Prisma.Decimal(3400000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity19 = await prisma.opportunity.upsert({
    where: { id: 'opp-horizon-retail-center' },
    update: {
      ownerId: broker.id,
      accountId: account19.id,
      name: 'Horizon Equity Retail Center',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(9800000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-horizon-retail-center',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account19.id,
      name: 'Horizon Equity Retail Center',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(9800000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity20 = await prisma.opportunity.upsert({
    where: { id: 'opp-bayfront-startup-space' },
    update: {
      ownerId: agent.id,
      accountId: account20.id,
      name: 'Bayfront Startup Office Space',
      stage: 'Closing',
      amount: new Prisma.Decimal(1250000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-bayfront-startup-space',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account20.id,
      name: 'Bayfront Startup Office Space',
      stage: 'Closing',
      amount: new Prisma.Decimal(1250000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity21 = await prisma.opportunity.upsert({
    where: { id: 'opp-gold-coast-flagship' },
    update: {
      ownerId: broker.id,
      accountId: account21.id,
      name: 'Gold Coast Flagship Store',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(7200000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-gold-coast-flagship',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account21.id,
      name: 'Gold Coast Flagship Store',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(7200000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity22 = await prisma.opportunity.upsert({
    where: { id: 'opp-nguyen-waterfront' },
    update: {
      ownerId: agent.id,
      accountId: account22.id,
      name: 'Nguyen Waterfront Condo',
      stage: 'Qualification',
      amount: new Prisma.Decimal(2850000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 48 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-nguyen-waterfront',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account22.id,
      name: 'Nguyen Waterfront Condo',
      stage: 'Qualification',
      amount: new Prisma.Decimal(2850000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 48 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity23 = await prisma.opportunity.upsert({
    where: { id: 'opp-palmetto-distribution' },
    update: {
      ownerId: broker.id,
      accountId: account23.id,
      name: 'Palmetto Distribution Center',
      stage: 'Proposal',
      amount: new Prisma.Decimal(11500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 95 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-palmetto-distribution',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account23.id,
      name: 'Palmetto Distribution Center',
      stage: 'Proposal',
      amount: new Prisma.Decimal(11500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 95 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity24 = await prisma.opportunity.upsert({
    where: { id: 'opp-atlantic-coworking' },
    update: {
      ownerId: agent.id,
      accountId: account24.id,
      name: 'Atlantic Coworking Space Lease',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(485000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-atlantic-coworking',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account24.id,
      name: 'Atlantic Coworking Space Lease',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(485000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 32 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity25 = await prisma.opportunity.upsert({
    where: { id: 'opp-williams-estate-expansion' },
    update: {
      ownerId: broker.id,
      accountId: account25.id,
      name: 'Williams Estate Land Acquisition',
      stage: 'Closed Lost',
      amount: new Prisma.Decimal(8900000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-williams-estate-expansion',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account25.id,
      name: 'Williams Estate Land Acquisition',
      stage: 'Closed Lost',
      amount: new Prisma.Decimal(8900000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    }
  });

  // Additional opportunities for variety
  const opportunity26 = await prisma.opportunity.upsert({
    where: { id: 'opp-acme-second-location' },
    update: {
      ownerId: agent.id,
      accountId: account1.id,
      name: 'Acme Second Location',
      stage: 'Qualification',
      amount: new Prisma.Decimal(1800000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 85 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-acme-second-location',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account1.id,
      name: 'Acme Second Location',
      stage: 'Qualification',
      amount: new Prisma.Decimal(1800000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 85 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity27 = await prisma.opportunity.upsert({
    where: { id: 'opp-coastal-miami-office' },
    update: {
      ownerId: broker.id,
      accountId: account5.id,
      name: 'Coastal Miami Office Lease',
      stage: 'Proposal',
      amount: new Prisma.Decimal(2250000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-coastal-miami-office',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account5.id,
      name: 'Coastal Miami Office Lease',
      stage: 'Proposal',
      amount: new Prisma.Decimal(2250000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity28 = await prisma.opportunity.upsert({
    where: { id: 'opp-pinnacle-downtown-tower' },
    update: {
      ownerId: broker.id,
      accountId: account7.id,
      name: 'Pinnacle Downtown Tower',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(28000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-pinnacle-downtown-tower',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account7.id,
      name: 'Pinnacle Downtown Tower',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(28000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity29 = await prisma.opportunity.upsert({
    where: { id: 'opp-chen-office-building' },
    update: {
      ownerId: broker.id,
      accountId: account9.id,
      name: 'Chen Manufacturing Office Building',
      stage: 'Closing',
      amount: new Prisma.Decimal(5100000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-chen-office-building',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account9.id,
      name: 'Chen Manufacturing Office Building',
      stage: 'Closing',
      amount: new Prisma.Decimal(5100000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity30 = await prisma.opportunity.upsert({
    where: { id: 'opp-sterling-portfolio-sale' },
    update: {
      ownerId: agent.id,
      accountId: account12.id,
      name: 'Sterling Portfolio Sale',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(16500000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-sterling-portfolio-sale',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account12.id,
      name: 'Sterling Portfolio Sale',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(16500000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity31 = await prisma.opportunity.upsert({
    where: { id: 'opp-evergreen-apartment-complex' },
    update: {
      ownerId: agent.id,
      accountId: account8.id,
      name: 'Evergreen Apartment Complex',
      stage: 'Qualification',
      amount: new Prisma.Decimal(14200000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 110 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-evergreen-apartment-complex',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account8.id,
      name: 'Evergreen Apartment Complex',
      stage: 'Qualification',
      amount: new Prisma.Decimal(14200000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 110 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity32 = await prisma.opportunity.upsert({
    where: { id: 'opp-riverside-clinic-expansion' },
    update: {
      ownerId: agent.id,
      accountId: account16.id,
      name: 'Riverside Urgent Care Clinic',
      stage: 'Proposal',
      amount: new Prisma.Decimal(3750000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 58 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-riverside-clinic-expansion',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account16.id,
      name: 'Riverside Urgent Care Clinic',
      stage: 'Proposal',
      amount: new Prisma.Decimal(3750000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 58 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity33 = await prisma.opportunity.upsert({
    where: { id: 'opp-gold-coast-mall' },
    update: {
      ownerId: broker.id,
      accountId: account21.id,
      name: 'Gold Coast Shopping Mall',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(32000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 135 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-gold-coast-mall',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account21.id,
      name: 'Gold Coast Shopping Mall',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(32000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 135 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity34 = await prisma.opportunity.upsert({
    where: { id: 'opp-horizon-mixed-retail' },
    update: {
      ownerId: broker.id,
      accountId: account19.id,
      name: 'Horizon Mixed Retail Development',
      stage: 'Qualification',
      amount: new Prisma.Decimal(19500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 125 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-horizon-mixed-retail',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account19.id,
      name: 'Horizon Mixed Retail Development',
      stage: 'Qualification',
      amount: new Prisma.Decimal(19500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 125 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity35 = await prisma.opportunity.upsert({
    where: { id: 'opp-miami-tech-lab-space' },
    update: {
      ownerId: agent.id,
      accountId: account4.id,
      name: 'Miami Tech Research Lab',
      stage: 'Closed Lost',
      amount: new Prisma.Decimal(6200000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-miami-tech-lab-space',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account4.id,
      name: 'Miami Tech Research Lab',
      stage: 'Closed Lost',
      amount: new Prisma.Decimal(6200000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity36 = await prisma.opportunity.upsert({
    where: { id: 'opp-apex-luxury-condos' },
    update: {
      ownerId: agent.id,
      accountId: account14.id,
      name: 'Apex Luxury Condos Phase 1',
      stage: 'Closing',
      amount: new Prisma.Decimal(38000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-apex-luxury-condos',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account14.id,
      name: 'Apex Luxury Condos Phase 1',
      stage: 'Closing',
      amount: new Prisma.Decimal(38000000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity37 = await prisma.opportunity.upsert({
    where: { id: 'opp-south-beach-penthouse' },
    update: {
      ownerId: agent.id,
      accountId: account10.id,
      name: 'South Beach Hotel Penthouse Suite',
      stage: 'Proposal',
      amount: new Prisma.Decimal(8750000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 62 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-south-beach-penthouse',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account10.id,
      name: 'South Beach Hotel Penthouse Suite',
      stage: 'Proposal',
      amount: new Prisma.Decimal(8750000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 62 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity38 = await prisma.opportunity.upsert({
    where: { id: 'opp-oceanview-ballroom' },
    update: {
      ownerId: broker.id,
      accountId: account15.id,
      name: 'Oceanview Event Ballroom',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(4800000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-oceanview-ballroom',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account15.id,
      name: 'Oceanview Event Ballroom',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(4800000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity39 = await prisma.opportunity.upsert({
    where: { id: 'opp-palmetto-warehouse-hub' },
    update: {
      ownerId: broker.id,
      accountId: account23.id,
      name: 'Palmetto Regional Warehouse Hub',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(17500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 88 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-palmetto-warehouse-hub',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account23.id,
      name: 'Palmetto Regional Warehouse Hub',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(17500000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 88 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity40 = await prisma.opportunity.upsert({
    where: { id: 'opp-bayfront-coworking' },
    update: {
      ownerId: agent.id,
      accountId: account20.id,
      name: 'Bayfront Coworking Hub',
      stage: 'Proposal',
      amount: new Prisma.Decimal(2100000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 47 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-bayfront-coworking',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account20.id,
      name: 'Bayfront Coworking Hub',
      stage: 'Proposal',
      amount: new Prisma.Decimal(2100000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 47 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity41 = await prisma.opportunity.upsert({
    where: { id: 'opp-patel-commercial-plaza' },
    update: {
      ownerId: agent.id,
      accountId: account18.id,
      name: 'Patel Commercial Plaza',
      stage: 'Qualification',
      amount: new Prisma.Decimal(11200000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 98 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-patel-commercial-plaza',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account18.id,
      name: 'Patel Commercial Plaza',
      stage: 'Qualification',
      amount: new Prisma.Decimal(11200000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 98 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity42 = await prisma.opportunity.upsert({
    where: { id: 'opp-lee-vacation-rental' },
    update: {
      ownerId: broker.id,
      accountId: account13.id,
      name: 'Lee Family Vacation Rental',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(1950000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-lee-vacation-rental',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account13.id,
      name: 'Lee Family Vacation Rental',
      stage: 'Closed Won',
      amount: new Prisma.Decimal(1950000),
      currency: 'USD',
      closeDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity43 = await prisma.opportunity.upsert({
    where: { id: 'opp-anderson-townhouse-project' },
    update: {
      ownerId: broker.id,
      accountId: account11.id,
      name: 'Anderson Townhouse Project',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(5650000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 72 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-anderson-townhouse-project',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account11.id,
      name: 'Anderson Townhouse Project',
      stage: 'Negotiation',
      amount: new Prisma.Decimal(5650000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 72 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity44 = await prisma.opportunity.upsert({
    where: { id: 'opp-kim-suite-expansion' },
    update: {
      ownerId: broker.id,
      accountId: account17.id,
      name: 'Kim Suite Expansion',
      stage: 'Closing',
      amount: new Prisma.Decimal(980000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-kim-suite-expansion',
      orgId: organization.id,
      ownerId: broker.id,
      accountId: account17.id,
      name: 'Kim Suite Expansion',
      stage: 'Closing',
      amount: new Prisma.Decimal(980000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  const opportunity45 = await prisma.opportunity.upsert({
    where: { id: 'opp-atlantic-headquarters' },
    update: {
      ownerId: agent.id,
      accountId: account24.id,
      name: 'Atlantic Consulting New Headquarters',
      stage: 'Proposal',
      amount: new Prisma.Decimal(3950000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 54 * 24 * 60 * 60 * 1000)
    },
    create: {
      id: 'opp-atlantic-headquarters',
      orgId: organization.id,
      ownerId: agent.id,
      accountId: account24.id,
      name: 'Atlantic Consulting New Headquarters',
      stage: 'Proposal',
      amount: new Prisma.Decimal(3950000),
      currency: 'USD',
      closeDate: new Date(Date.now() + 54 * 24 * 60 * 60 * 1000)
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

  // ============================================
  // Seed External Market Data (MLS)
  // ============================================
  console.info('Seeding external MLS market data...');

  const naplesMlsListings = [
    {
      mlsId: 'NABOR-224001234',
      mlsSource: 'NABOR',
      addressLine1: '123 Gulf Shore Blvd N',
      city: 'Naples',
      state: 'FL',
      postalCode: '34102',
      county: 'Collier',
      latitude: 26.1420,
      longitude: -81.8037,
      listPrice: new Prisma.Decimal(2850000),
      bedrooms: 4,
      bathrooms: 4.5,
      squareFeet: 3800,
      lotSize: 8000,
      yearBuilt: 2018,
      propertyType: 'Single Family',
      status: 'ACTIVE',
      listingDate: subDays(new Date(), 15),
      daysOnMarket: 15,
      description: 'Stunning Gulf-front estate with panoramic water views',
      photoUrls: []
    },
    {
      mlsId: 'NABOR-224001235',
      mlsSource: 'NABOR',
      addressLine1: '456 Moorings Park Dr',
      city: 'Naples',
      state: 'FL',
      postalCode: '34105',
      county: 'Collier',
      latitude: 26.2166,
      longitude: -81.8023,
      listPrice: new Prisma.Decimal(1250000),
      bedrooms: 3,
      bathrooms: 3,
      squareFeet: 2400,
      lotSize: null,
      yearBuilt: 2020,
      propertyType: 'Condo',
      status: 'ACTIVE',
      listingDate: subDays(new Date(), 7),
      daysOnMarket: 7,
      description: 'Luxury high-rise condo in prestigious Moorings Park',
      photoUrls: []
    },
    {
      mlsId: 'NABOR-224001236',
      mlsSource: 'NABOR',
      addressLine1: '789 Vanderbilt Beach Rd',
      city: 'Naples',
      state: 'FL',
      postalCode: '34108',
      county: 'Collier',
      latitude: 26.2364,
      longitude: -81.8105,
      listPrice: new Prisma.Decimal(895000),
      bedrooms: 3,
      bathrooms: 2.5,
      squareFeet: 2100,
      lotSize: 5500,
      yearBuilt: 2015,
      propertyType: 'Single Family',
      status: 'ACTIVE',
      listingDate: subDays(new Date(), 22),
      daysOnMarket: 22,
      description: 'Beautiful pool home near Vanderbilt Beach',
      photoUrls: []
    },
    {
      mlsId: 'NABOR-224001237',
      mlsSource: 'NABOR',
      addressLine1: '321 Fifth Ave S',
      city: 'Naples',
      state: 'FL',
      postalCode: '34102',
      county: 'Collier',
      latitude: 26.1398,
      longitude: -81.7948,
      listPrice: new Prisma.Decimal(675000),
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1600,
      lotSize: null,
      yearBuilt: 2019,
      propertyType: 'Condo',
      status: 'ACTIVE',
      listingDate: subDays(new Date(), 3),
      daysOnMarket: 3,
      description: 'Downtown Naples condo, walk to shops and restaurants',
      photoUrls: []
    },
    {
      mlsId: 'NABOR-224001238',
      mlsSource: 'NABOR',
      addressLine1: '555 Park Shore Dr',
      city: 'Naples',
      state: 'FL',
      postalCode: '34103',
      county: 'Collier',
      latitude: 26.1752,
      longitude: -81.8065,
      listPrice: new Prisma.Decimal(1950000),
      bedrooms: 4,
      bathrooms: 4,
      squareFeet: 3200,
      lotSize: null,
      yearBuilt: 2021,
      propertyType: 'Condo',
      status: 'PENDING',
      listingDate: subDays(new Date(), 45),
      daysOnMarket: 45,
      description: 'Beachfront luxury living in Park Shore',
      photoUrls: []
    },
    // Miami Listings
    { mlsId: 'MIAMI-224002001', mlsSource: 'MIAMI', addressLine1: '1000 Brickell Bay Dr', city: 'Miami', state: 'FL', postalCode: '33131', county: 'Miami-Dade', latitude: 25.7617, longitude: -80.1918, listPrice: new Prisma.Decimal(3500000), bedrooms: 4, bathrooms: 4.5, squareFeet: 3500, lotSize: null, yearBuilt: 2020, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 10), daysOnMarket: 10, description: 'Luxury waterfront condo in Brickell', photoUrls: [] },
    { mlsId: 'MIAMI-224002002', mlsSource: 'MIAMI', addressLine1: '2500 SW 3rd Ave', city: 'Miami', state: 'FL', postalCode: '33129', county: 'Miami-Dade', latitude: 25.7959, longitude: -80.2001, listPrice: new Prisma.Decimal(1250000), bedrooms: 3, bathrooms: 3, squareFeet: 2200, lotSize: 5000, yearBuilt: 2018, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 5), daysOnMarket: 5, description: 'Modern home in Coral Way neighborhood', photoUrls: [] },
    { mlsId: 'MIAMI-224002003', mlsSource: 'MIAMI', addressLine1: '300 S Pointe Dr', city: 'Miami Beach', state: 'FL', postalCode: '33139', county: 'Miami-Dade', latitude: 25.7659, longitude: -80.1305, listPrice: new Prisma.Decimal(4200000), bedrooms: 5, bathrooms: 5.5, squareFeet: 4500, lotSize: null, yearBuilt: 2019, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 20), daysOnMarket: 20, description: 'South of Fifth luxury penthouse', photoUrls: [] },
    { mlsId: 'MIAMI-224002004', mlsSource: 'MIAMI', addressLine1: '1400 SW 1st St', city: 'Miami', state: 'FL', postalCode: '33135', county: 'Miami-Dade', latitude: 25.7743, longitude: -80.2196, listPrice: new Prisma.Decimal(850000), bedrooms: 2, bathrooms: 2.5, squareFeet: 1800, lotSize: null, yearBuilt: 2021, propertyType: 'Townhouse', status: 'PENDING', listingDate: subDays(new Date(), 35), daysOnMarket: 35, description: 'Contemporary townhouse near Brickell', photoUrls: [] },
    { mlsId: 'MIAMI-224002005', mlsSource: 'MIAMI', addressLine1: '650 NE 64th St', city: 'Miami', state: 'FL', postalCode: '33138', county: 'Miami-Dade', latitude: 25.8343, longitude: -80.1868, listPrice: new Prisma.Decimal(2100000), bedrooms: 4, bathrooms: 4, squareFeet: 3100, lotSize: 7500, yearBuilt: 2017, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 12), daysOnMarket: 12, description: 'Upper East Side waterfront home', photoUrls: [] },
    { mlsId: 'MIAMI-224002006', mlsSource: 'MIAMI', addressLine1: '1500 Bay Rd', city: 'Miami Beach', state: 'FL', postalCode: '33139', county: 'Miami-Dade', latitude: 25.7886, longitude: -80.1395, listPrice: new Prisma.Decimal(1650000), bedrooms: 3, bathrooms: 3, squareFeet: 2400, lotSize: null, yearBuilt: 2022, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 8), daysOnMarket: 8, description: 'Sunset Harbour modern condo', photoUrls: [] },
    { mlsId: 'MIAMI-224002007', mlsSource: 'MIAMI', addressLine1: '3400 SW 27th Ave', city: 'Miami', state: 'FL', postalCode: '33133', county: 'Miami-Dade', latitude: 25.7380, longitude: -80.2386, listPrice: new Prisma.Decimal(975000), bedrooms: 3, bathrooms: 2.5, squareFeet: 2000, lotSize: 6000, yearBuilt: 2015, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 18), daysOnMarket: 18, description: 'Coconut Grove charming family home', photoUrls: [] },
    { mlsId: 'MIAMI-224002008', mlsSource: 'MIAMI', addressLine1: '6000 Collins Ave', city: 'Miami Beach', state: 'FL', postalCode: '33140', county: 'Miami-Dade', latitude: 25.8242, longitude: -80.1220, listPrice: new Prisma.Decimal(725000), bedrooms: 2, bathrooms: 2, squareFeet: 1500, lotSize: null, yearBuilt: 2016, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 25), daysOnMarket: 25, description: 'Mid-Beach oceanfront condo', photoUrls: [] },
    { mlsId: 'MIAMI-224002009', mlsSource: 'MIAMI', addressLine1: '2200 N Bayshore Dr', city: 'Miami', state: 'FL', postalCode: '33137', county: 'Miami-Dade', latitude: 25.7980, longitude: -80.1874, listPrice: new Prisma.Decimal(2850000), bedrooms: 4, bathrooms: 4.5, squareFeet: 3300, lotSize: null, yearBuilt: 2020, propertyType: 'Condo', status: 'PENDING', listingDate: subDays(new Date(), 50), daysOnMarket: 50, description: 'Edgewater luxury bayfront residence', photoUrls: [] },
    { mlsId: 'MIAMI-224002010', mlsSource: 'MIAMI', addressLine1: '4200 NW 2nd Ave', city: 'Miami', state: 'FL', postalCode: '33127', county: 'Miami-Dade', latitude: 25.8145, longitude: -80.1987, listPrice: new Prisma.Decimal(650000), bedrooms: 3, bathrooms: 2, squareFeet: 1900, lotSize: 5500, yearBuilt: 2010, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 14), daysOnMarket: 14, description: 'Wynwood arts district home', photoUrls: [] },
    // Fort Lauderdale Listings
    { mlsId: 'FTL-224003001', mlsSource: 'FTL', addressLine1: '3500 Galt Ocean Dr', city: 'Fort Lauderdale', state: 'FL', postalCode: '33308', county: 'Broward', latitude: 26.1726, longitude: -80.1003, listPrice: new Prisma.Decimal(1850000), bedrooms: 3, bathrooms: 3.5, squareFeet: 2800, lotSize: null, yearBuilt: 2019, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 9), daysOnMarket: 9, description: 'Galt Ocean Mile luxury beachfront', photoUrls: [] },
    { mlsId: 'FTL-224003002', mlsSource: 'FTL', addressLine1: '1200 SE 15th St', city: 'Fort Lauderdale', state: 'FL', postalCode: '33316', county: 'Broward', latitude: 26.1029, longitude: -80.1222, listPrice: new Prisma.Decimal(1350000), bedrooms: 4, bathrooms: 3, squareFeet: 2600, lotSize: 6500, yearBuilt: 2016, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 11), daysOnMarket: 11, description: 'Tarpon River waterfront estate', photoUrls: [] },
    { mlsId: 'FTL-224003003', mlsSource: 'FTL', addressLine1: '610 W Las Olas Blvd', city: 'Fort Lauderdale', state: 'FL', postalCode: '33312', county: 'Broward', latitude: 26.1186, longitude: -80.1468, listPrice: new Prisma.Decimal(2250000), bedrooms: 4, bathrooms: 4, squareFeet: 3000, lotSize: null, yearBuilt: 2021, propertyType: 'Condo', status: 'PENDING', listingDate: subDays(new Date(), 42), daysOnMarket: 42, description: 'Las Olas Boulevard penthouse', photoUrls: [] },
    { mlsId: 'FTL-224003004', mlsSource: 'FTL', addressLine1: '2850 NE 32nd St', city: 'Fort Lauderdale', state: 'FL', postalCode: '33306', county: 'Broward', latitude: 26.1590, longitude: -80.1190, listPrice: new Prisma.Decimal(950000), bedrooms: 3, bathrooms: 2.5, squareFeet: 2100, lotSize: 5800, yearBuilt: 2014, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 16), daysOnMarket: 16, description: 'East Fort Lauderdale pool home', photoUrls: [] },
    { mlsId: 'FTL-224003005', mlsSource: 'FTL', addressLine1: '4240 Galt Ocean Dr', city: 'Fort Lauderdale', state: 'FL', postalCode: '33308', county: 'Broward', latitude: 26.1795, longitude: -80.0988, listPrice: new Prisma.Decimal(625000), bedrooms: 2, bathrooms: 2, squareFeet: 1400, lotSize: null, yearBuilt: 2018, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 6), daysOnMarket: 6, description: 'Oceanfront condo with direct beach access', photoUrls: [] },
    // Boca Raton Listings
    { mlsId: 'BOCA-224004001', mlsSource: 'BOCA', addressLine1: '200 S Ocean Blvd', city: 'Boca Raton', state: 'FL', postalCode: '33432', county: 'Palm Beach', latitude: 26.3444, longitude: -80.0759, listPrice: new Prisma.Decimal(3200000), bedrooms: 4, bathrooms: 5, squareFeet: 4200, lotSize: null, yearBuilt: 2020, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 13), daysOnMarket: 13, description: 'Oceanfront luxury in downtown Boca', photoUrls: [] },
    { mlsId: 'BOCA-224004002', mlsSource: 'BOCA', addressLine1: '950 SW 4th Ave', city: 'Boca Raton', state: 'FL', postalCode: '33486', county: 'Palm Beach', latitude: 26.3557, longitude: -80.0889, listPrice: new Prisma.Decimal(1450000), bedrooms: 5, bathrooms: 4, squareFeet: 3400, lotSize: 8000, yearBuilt: 2017, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 19), daysOnMarket: 19, description: 'Royal Palm Yacht & Country Club home', photoUrls: [] },
    { mlsId: 'BOCA-224004003', mlsSource: 'BOCA', addressLine1: '7194 Promenade Dr', city: 'Boca Raton', state: 'FL', postalCode: '33433', county: 'Palm Beach', latitude: 26.3684, longitude: -80.1124, listPrice: new Prisma.Decimal(575000), bedrooms: 3, bathrooms: 2.5, squareFeet: 1850, lotSize: null, yearBuilt: 2015, propertyType: 'Townhouse', status: 'ACTIVE', listingDate: subDays(new Date(), 8), daysOnMarket: 8, description: 'Boca Promenade gated community', photoUrls: [] },
    { mlsId: 'BOCA-224004004', mlsSource: 'BOCA', addressLine1: '250 NE 5th Ave', city: 'Boca Raton', state: 'FL', postalCode: '33432', county: 'Palm Beach', latitude: 26.3603, longitude: -80.0783, listPrice: new Prisma.Decimal(2500000), bedrooms: 4, bathrooms: 4.5, squareFeet: 3600, lotSize: null, yearBuilt: 2022, propertyType: 'Condo', status: 'PENDING', listingDate: subDays(new Date(), 38), daysOnMarket: 38, description: 'New construction downtown luxury', photoUrls: [] },
    { mlsId: 'BOCA-224004005', mlsSource: 'BOCA', addressLine1: '1150 Boca Rio Dr', city: 'Boca Raton', state: 'FL', postalCode: '33487', county: 'Palm Beach', latitude: 26.3327, longitude: -80.1048, listPrice: new Prisma.Decimal(825000), bedrooms: 3, bathrooms: 3, squareFeet: 2000, lotSize: 6200, yearBuilt: 2013, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 22), daysOnMarket: 22, description: 'Boca Raton waterfront pool home', photoUrls: [] },
    // West Palm Beach Listings
    { mlsId: 'WPB-224005001', mlsSource: 'WPB', addressLine1: '529 S Flagler Dr', city: 'West Palm Beach', state: 'FL', postalCode: '33401', county: 'Palm Beach', latitude: 26.7094, longitude: -80.0398, listPrice: new Prisma.Decimal(4500000), bedrooms: 5, bathrooms: 6, squareFeet: 5200, lotSize: null, yearBuilt: 2021, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 15), daysOnMarket: 15, description: 'Flagler Drive waterfront penthouse', photoUrls: [] },
    { mlsId: 'WPB-224005002', mlsSource: 'WPB', addressLine1: '1450 N Flagler Dr', city: 'West Palm Beach', state: 'FL', postalCode: '33401', county: 'Palm Beach', latitude: 26.7231, longitude: -80.0398, listPrice: new Prisma.Decimal(1750000), bedrooms: 4, bathrooms: 4, squareFeet: 3100, lotSize: 7200, yearBuilt: 2018, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 10), daysOnMarket: 10, description: 'El Cid historic district estate', photoUrls: [] },
    { mlsId: 'WPB-224005003', mlsSource: 'WPB', addressLine1: '801 S Olive Ave', city: 'West Palm Beach', state: 'FL', postalCode: '33401', county: 'Palm Beach', latitude: 26.7065, longitude: -80.0531, listPrice: new Prisma.Decimal(695000), bedrooms: 2, bathrooms: 2, squareFeet: 1550, lotSize: null, yearBuilt: 2020, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 7), daysOnMarket: 7, description: 'Downtown high-rise with city views', photoUrls: [] },
    { mlsId: 'WPB-224005004', mlsSource: 'WPB', addressLine1: '525 Clematis St', city: 'West Palm Beach', state: 'FL', postalCode: '33401', county: 'Palm Beach', latitude: 26.7142, longitude: -80.0545, listPrice: new Prisma.Decimal(1150000), bedrooms: 3, bathrooms: 3, squareFeet: 2300, lotSize: null, yearBuilt: 2019, propertyType: 'Condo', status: 'PENDING', listingDate: subDays(new Date(), 40), daysOnMarket: 40, description: 'Clematis Street urban luxury', photoUrls: [] },
    { mlsId: 'WPB-224005005', mlsSource: 'WPB', addressLine1: '318 Pilgrim Rd', city: 'West Palm Beach', state: 'FL', postalCode: '33405', county: 'Palm Beach', latitude: 26.7328, longitude: -80.0654, listPrice: new Prisma.Decimal(2350000), bedrooms: 5, bathrooms: 5, squareFeet: 4000, lotSize: 9500, yearBuilt: 2016, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 24), daysOnMarket: 24, description: 'Old Northwood Historic estate', photoUrls: [] },
    // Tampa Listings
    { mlsId: 'TAMPA-224006001', mlsSource: 'TAMPA', addressLine1: '506 S Armenia Ave', city: 'Tampa', state: 'FL', postalCode: '33609', county: 'Hillsborough', latitude: 27.9404, longitude: -82.4924, listPrice: new Prisma.Decimal(895000), bedrooms: 4, bathrooms: 3, squareFeet: 2500, lotSize: 6000, yearBuilt: 2015, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 12), daysOnMarket: 12, description: 'Hyde Park charming bungalow', photoUrls: [] },
    { mlsId: 'TAMPA-224006002', mlsSource: 'TAMPA', addressLine1: '777 N Ashley Dr', city: 'Tampa', state: 'FL', postalCode: '33602', county: 'Hillsborough', latitude: 27.9498, longitude: -82.4583, listPrice: new Prisma.Decimal(625000), bedrooms: 2, bathrooms: 2, squareFeet: 1600, lotSize: null, yearBuilt: 2018, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 9), daysOnMarket: 9, description: 'Downtown Tampa high-rise condo', photoUrls: [] },
    { mlsId: 'TAMPA-224006003', mlsSource: 'TAMPA', addressLine1: '1325 Bayshore Blvd', city: 'Tampa', state: 'FL', postalCode: '33606', county: 'Hillsborough', latitude: 27.9247, longitude: -82.4715, listPrice: new Prisma.Decimal(3100000), bedrooms: 5, bathrooms: 5.5, squareFeet: 4800, lotSize: null, yearBuilt: 2020, propertyType: 'Condo', status: 'PENDING', listingDate: subDays(new Date(), 48), daysOnMarket: 48, description: 'Bayshore Boulevard waterfront luxury', photoUrls: [] },
    { mlsId: 'TAMPA-224006004', mlsSource: 'TAMPA', addressLine1: '4202 S MacDill Ave', city: 'Tampa', state: 'FL', postalCode: '33611', county: 'Hillsborough', latitude: 27.9147, longitude: -82.5079, listPrice: new Prisma.Decimal(1250000), bedrooms: 4, bathrooms: 3.5, squareFeet: 2900, lotSize: 7500, yearBuilt: 2017, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 17), daysOnMarket: 17, description: 'South Tampa pool home with guest house', photoUrls: [] },
    { mlsId: 'TAMPA-224006005', mlsSource: 'TAMPA', addressLine1: '2700 N Rocky Point Dr', city: 'Tampa', state: 'FL', postalCode: '33607', county: 'Hillsborough', latitude: 27.9831, longitude: -82.5208, listPrice: new Prisma.Decimal(425000), bedrooms: 2, bathrooms: 2, squareFeet: 1300, lotSize: null, yearBuilt: 2016, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 5), daysOnMarket: 5, description: 'Rocky Point waterfront condo', photoUrls: [] },
    // St. Petersburg & Clearwater
    { mlsId: 'STPETE-224007001', mlsSource: 'STPETE', addressLine1: '175 1st St N', city: 'St. Petersburg', state: 'FL', postalCode: '33701', county: 'Pinellas', latitude: 27.7697, longitude: -82.6376, listPrice: new Prisma.Decimal(1950000), bedrooms: 3, bathrooms: 3.5, squareFeet: 2800, lotSize: null, yearBuilt: 2021, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 14), daysOnMarket: 14, description: 'Downtown St Pete penthouse', photoUrls: [] },
    { mlsId: 'STPETE-224007002', mlsSource: 'STPETE', addressLine1: '525 5th Ave NE', city: 'St. Petersburg', state: 'FL', postalCode: '33701', county: 'Pinellas', latitude: 27.7745, longitude: -82.6289, listPrice: new Prisma.Decimal(875000), bedrooms: 3, bathrooms: 2.5, squareFeet: 2200, lotSize: 5500, yearBuilt: 2014, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 20), daysOnMarket: 20, description: 'Historic Old Northeast bungalow', photoUrls: [] },
    { mlsId: 'CLEAR-224007003', mlsSource: 'CLEAR', addressLine1: '1560 Gulf Blvd', city: 'Clearwater', state: 'FL', postalCode: '33767', county: 'Pinellas', latitude: 27.9773, longitude: -82.8316, listPrice: new Prisma.Decimal(725000), bedrooms: 2, bathrooms: 2, squareFeet: 1450, lotSize: null, yearBuilt: 2019, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 11), daysOnMarket: 11, description: 'Clearwater Beach beachfront condo', photoUrls: [] },
    { mlsId: 'CLEAR-224007004', mlsSource: 'CLEAR', addressLine1: '2850 Countryside Blvd', city: 'Clearwater', state: 'FL', postalCode: '33761', county: 'Pinellas', latitude: 27.9656, longitude: -82.7462, listPrice: new Prisma.Decimal(495000), bedrooms: 3, bathrooms: 2.5, squareFeet: 1950, lotSize: null, yearBuilt: 2017, propertyType: 'Townhouse', status: 'ACTIVE', listingDate: subDays(new Date(), 8), daysOnMarket: 8, description: 'Countryside gated community townhome', photoUrls: [] },
    { mlsId: 'STPETE-224007005', mlsSource: 'STPETE', addressLine1: '6800 Sunset Way', city: 'St. Pete Beach', state: 'FL', postalCode: '33706', county: 'Pinellas', latitude: 27.7253, longitude: -82.7409, listPrice: new Prisma.Decimal(2650000), bedrooms: 5, bathrooms: 5, squareFeet: 4200, lotSize: 8500, yearBuilt: 2020, propertyType: 'Single Family', status: 'PENDING', listingDate: subDays(new Date(), 52), daysOnMarket: 52, description: 'Sunset Beach waterfront estate', photoUrls: [] },
    // Sarasota Listings
    { mlsId: 'SARA-224008001', mlsSource: 'SARA', addressLine1: '1155 N Gulfstream Ave', city: 'Sarasota', state: 'FL', postalCode: '34236', county: 'Sarasota', latitude: 27.3444, longitude: -82.5454, listPrice: new Prisma.Decimal(3750000), bedrooms: 4, bathrooms: 5, squareFeet: 4500, lotSize: null, yearBuilt: 2022, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 16), daysOnMarket: 16, description: 'Luxury bayfront residence', photoUrls: [] },
    { mlsId: 'SARA-224008002', mlsSource: 'SARA', addressLine1: '1350 Main St', city: 'Sarasota', state: 'FL', postalCode: '34236', county: 'Sarasota', latitude: 27.3364, longitude: -82.5407, listPrice: new Prisma.Decimal(1425000), bedrooms: 3, bathrooms: 3, squareFeet: 2600, lotSize: null, yearBuilt: 2020, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 13), daysOnMarket: 13, description: 'Downtown Sarasota modern condo', photoUrls: [] },
    { mlsId: 'SARA-224008003', mlsSource: 'SARA', addressLine1: '7070 Longboat Dr S', city: 'Longboat Key', state: 'FL', postalCode: '34228', county: 'Sarasota', latitude: 27.3903, longitude: -82.6584, listPrice: new Prisma.Decimal(2950000), bedrooms: 4, bathrooms: 4.5, squareFeet: 3800, lotSize: null, yearBuilt: 2018, propertyType: 'Condo', status: 'PENDING', listingDate: subDays(new Date(), 45), daysOnMarket: 45, description: 'Longboat Key beachfront luxury', photoUrls: [] },
    { mlsId: 'SARA-224008004', mlsSource: 'SARA', addressLine1: '1500 Ringling Blvd', city: 'Sarasota', state: 'FL', postalCode: '34236', county: 'Sarasota', latitude: 27.3298, longitude: -82.5437, listPrice: new Prisma.Decimal(925000), bedrooms: 3, bathrooms: 3, squareFeet: 2100, lotSize: 6000, yearBuilt: 2016, propertyType: 'Single Family', status: 'ACTIVE', listingDate: subDays(new Date(), 19), daysOnMarket: 19, description: 'Historic Sarasota neighborhood home', photoUrls: [] },
    { mlsId: 'SARA-224008005', mlsSource: 'SARA', addressLine1: '2040 Benjamin Franklin Dr', city: 'Sarasota', state: 'FL', postalCode: '34236', county: 'Sarasota', latitude: 27.3127, longitude: -82.5662, listPrice: new Prisma.Decimal(1175000), bedrooms: 3, bathrooms: 3, squareFeet: 2300, lotSize: null, yearBuilt: 2019, propertyType: 'Condo', status: 'ACTIVE', listingDate: subDays(new Date(), 21), daysOnMarket: 21, description: 'Lido Beach waterfront condo', photoUrls: [] }
  ];

  await prisma.mlsListing.createMany({
    data: naplesMlsListings,
    skipDuplicates: true
  });

  // Seed recent comparable sales
  const naplesComparables = [
    {
      mlsId: 'NABOR-224000890',
      mlsSource: 'NABOR',
      addressLine1: '234 Gulf Shore Blvd N',
      city: 'Naples',
      state: 'FL',
      postalCode: '34102',
      county: 'Collier',
      latitude: 26.1425,
      longitude: -81.8040,
      salePrice: new Prisma.Decimal(2650000),
      originalListPrice: new Prisma.Decimal(2750000),
      bedrooms: 4,
      bathrooms: 4,
      squareFeet: 3600,
      lotSize: 7500,
      yearBuilt: 2017,
      propertyType: 'Single Family',
      saleDate: subDays(new Date(), 12),
      daysOnMarket: 38
    },
    {
      mlsId: 'NABOR-224000891',
      mlsSource: 'NABOR',
      addressLine1: '678 Moorings Park Dr',
      city: 'Naples',
      state: 'FL',
      postalCode: '34105',
      county: 'Collier',
      latitude: 26.2170,
      longitude: -81.8025,
      salePrice: new Prisma.Decimal(1175000),
      originalListPrice: new Prisma.Decimal(1225000),
      bedrooms: 3,
      bathrooms: 3,
      squareFeet: 2300,
      lotSize: null,
      yearBuilt: 2019,
      propertyType: 'Condo',
      saleDate: subDays(new Date(), 25),
      daysOnMarket: 52
    },
    {
      mlsId: 'NABOR-224000892',
      mlsSource: 'NABOR',
      addressLine1: '890 Vanderbilt Beach Rd',
      city: 'Naples',
      state: 'FL',
      postalCode: '34108',
      county: 'Collier',
      latitude: 26.2368,
      longitude: -81.8110,
      salePrice: new Prisma.Decimal(825000),
      originalListPrice: new Prisma.Decimal(875000),
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 2000,
      lotSize: 5000,
      yearBuilt: 2014,
      propertyType: 'Single Family',
      saleDate: subDays(new Date(), 18),
      daysOnMarket: 41
    },
    {
      mlsId: 'NABOR-224000893',
      mlsSource: 'NABOR',
      addressLine1: '432 Fifth Ave S',
      city: 'Naples',
      state: 'FL',
      postalCode: '34102',
      county: 'Collier',
      latitude: 26.1400,
      longitude: -81.7950,
      salePrice: new Prisma.Decimal(650000),
      originalListPrice: new Prisma.Decimal(675000),
      bedrooms: 2,
      bathrooms: 2,
      squareFeet: 1550,
      lotSize: null,
      yearBuilt: 2018,
      propertyType: 'Condo',
      saleDate: subDays(new Date(), 8),
      daysOnMarket: 28
    },
    {
      mlsId: 'NABOR-224000894',
      mlsSource: 'NABOR',
      addressLine1: '666 Park Shore Dr',
      city: 'Naples',
      state: 'FL',
      postalCode: '34103',
      county: 'Collier',
      latitude: 26.1755,
      longitude: -81.8068,
      salePrice: new Prisma.Decimal(1875000),
      originalListPrice: new Prisma.Decimal(1950000),
      bedrooms: 4,
      bathrooms: 4,
      squareFeet: 3100,
      lotSize: null,
      yearBuilt: 2020,
      propertyType: 'Condo',
      saleDate: subDays(new Date(), 35),
      daysOnMarket: 67
    }
  ];

  await prisma.marketComparable.createMany({
    data: naplesComparables,
    skipDuplicates: true
  });

  console.info('✓ External MLS market data seeded');
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
