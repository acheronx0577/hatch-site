import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import {
  LeadScoreTier,
  LeadTaskStatus,
  LeadTouchpointType,
  MessageChannel,
  PersonStage,
  Prisma,
  Stage
} from '@hatch/db';
import { differenceInHours, subDays } from 'date-fns';

import type { RequestContext } from '../common/request-context';
import { PipelinesService } from '../pipelines/pipelines.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto, LeadFitInput } from './dto/create-lead.dto';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { CreateLeadTaskDto } from './dto/create-lead-task.dto';
import { IdentifyLeadDto } from './dto/identify-lead.dto';
import { ListLeadsQueryDto } from './dto/list-leads.dto';
import { CreateLeadTouchpointDto } from './dto/create-lead-touchpoint.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadTaskDto } from './dto/update-lead-task.dto';

type LeadListPayload = Prisma.PersonGetPayload<{
  include: {
    owner: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        email: true;
        role: true;
      };
    };
    pipeline: true;
    pipelineStage: true;
    leadFit: true;
    activityRollup: true;
  };
}>;

type LeadDetailPayload = Prisma.PersonGetPayload<{
  include: {
    owner: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        email: true;
        role: true;
      };
    };
    pipeline: true;
    pipelineStage: true;
    leadFit: true;
    activityRollup: true;
    leadNotes: {
      orderBy: { createdAt: 'desc' };
      include: {
        author: {
          select: {
            id: true;
            firstName: true;
            lastName: true;
            email: true;
          };
        };
      };
    };
    leadTasks: {
      orderBy: { createdAt: 'desc' };
      include: {
        assignee: {
          select: {
            id: true;
            firstName: true;
            lastName: true;
            email: true;
          };
        };
      };
    };
    siteEvents: {
      orderBy: { timestamp: 'desc' };
      take: 50;
    };
    deals: true;
  };
}>;

export interface LeadOwnerSummary {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface LeadStageSummary {
  id: string;
  name: string;
  order: number;
  pipelineId: string;
  pipelineName: string;
  pipelineType: string;
  slaMinutes: number | null;
}

export interface LeadListItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  score: number;
  scoreTier: LeadScoreTier;
  pipelineId?: string | null;
  pipelineName?: string | null;
  pipelineType?: string | null;
  stageId?: string | null;
  owner?: LeadOwnerSummary;
  stage?: LeadStageSummary;
  lastActivityAt?: string | null;
  stageEnteredAt?: string | null;
  preapproved?: boolean;
  budgetMax?: number | null;
  budgetMin?: number | null;
  timeframeDays?: number | null;
  activityRollup?: {
    last7dListingViews: number;
    last7dSessions: number;
    lastReplyAt?: string | null;
    lastEmailOpenAt?: string | null;
    lastTouchpointAt?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface LeadListResponse {
  items: LeadListItem[];
  nextCursor?: string | null;
}

export interface RecordLeadTouchpointResult {
  touchpoint: LeadTouchpointView;
  lead: LeadListItem;
}

export interface LeadNoteView {
  id: string;
  body: string;
  createdAt: string;
  author: LeadOwnerSummary;
}

export interface LeadTaskView {
  id: string;
  title: string;
  status: LeadTaskStatus;
  dueAt: string | null;
  assignee?: LeadOwnerSummary;
  createdAt: string;
  updatedAt: string;
}

export interface LeadTouchpointView {
  id: string;
  type: LeadTouchpointType;
  channel?: MessageChannel | null;
  occurredAt: string;
  summary?: string | null;
  body?: string | null;
  metadata?: Prisma.JsonValue;
  recordedBy?: LeadOwnerSummary;
}

export interface LeadDetail extends LeadListItem {
  notes: LeadNoteView[];
  tasks: LeadTaskView[];
  activityRollup?: {
    last7dListingViews: number;
    last7dSessions: number;
    lastReplyAt?: string | null;
    lastEmailOpenAt?: string | null;
    lastTouchpointAt?: string | null;
  };
  fit?: LeadFitInput | null;
  consents: Array<{
    id: string;
    channel: string;
    scope: string;
    status: string;
    capturedAt: string | null;
  }>;
  events: Array<{
    id: string;
    name: string;
    timestamp: string;
    properties?: Prisma.JsonValue;
  }>;
  touchpoints: LeadTouchpointView[];
}

const LIST_INCLUDE = {
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true
    }
  },
  pipeline: true,
  pipelineStage: true,
  leadFit: true,
  activityRollup: true
} satisfies Prisma.PersonInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelines: PipelinesService
  ) {}

  async list(query: ListLeadsQueryDto, ctx: RequestContext): Promise<LeadListResponse> {
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    await this.pipelines.list(ctx.tenantId); // ensures defaults

    const where: Prisma.PersonWhereInput = {
      tenantId: ctx.tenantId,
      deletedAt: null
    };
    const andFilters: Prisma.PersonWhereInput[] = [];

    if (query.ownerId) {
      where.ownerId = query.ownerId;
    }

    if (query.pipelineId) {
      where.pipelineId = query.pipelineId;
    }

    if (query.stageId?.length) {
      where.stageId = { in: query.stageId };
    }

    if (query.scoreTier?.length) {
      where.scoreTier = { in: query.scoreTier };
    }

    if (query.q) {
      const search = query.q.trim();
      if (search) {
        andFilters.push({
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { primaryEmail: { contains: search, mode: 'insensitive' } },
            { primaryPhone: { contains: search, mode: 'insensitive' } }
          ]
        });
      }
    }

    if (query.lastActivityDays) {
      const since = subDays(new Date(), query.lastActivityDays);
      where.lastActivityAt = { gte: since };
    }

    if (query.preapproved === true) {
      andFilters.push({
        leadFit: { is: { preapproved: true } }
      });
    } else if (query.preapproved === false) {
      andFilters.push({
        OR: [{ leadFit: { is: null } }, { leadFit: { is: { preapproved: false } } }]
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const take = Math.min(query.limit ?? 25, 100);
    const items = await this.prisma.person.findMany({
      where,
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ stageEnteredAt: 'asc' }, { createdAt: 'desc' }],
    include: LIST_INCLUDE
    });

    let nextCursor: string | null = null;
    if (items.length > take) {
      const next = items.pop();
      nextCursor = next?.id ?? null;
    }

    return {
      items: items.map((person) => this.toLeadListItem(person)),
      nextCursor
    };
  }

  async getById(id: string, tenantId: string): Promise<LeadDetail> {
    await this.pipelines.list(tenantId);

    const person = await this.prisma.person.findFirst({
      where: { id, tenantId },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        },
        pipeline: true,
        pipelineStage: true,
        leadFit: true,
        activityRollup: true,
        consents: true,
        leadNotes: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true
              }
            }
          }
        },
        leadTasks: {
          orderBy: { createdAt: 'desc' },
          include: {
            assignee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true
              }
            }
          }
        },
        touchpoints: {
          orderBy: { occurredAt: 'desc' },
          take: 20,
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true
              }
            }
          }
        },
        siteEvents: {
          orderBy: { timestamp: 'desc' },
          take: 50
        }
      }
    });

    if (!person) {
      throw new NotFoundException('Lead not found');
    }

    const summary = this.toLeadListItem(person);
    return {
      ...summary,
      notes: person.leadNotes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        author: {
          id: note.author.id,
          name: `${note.author.firstName ?? ''} ${note.author.lastName ?? ''}`.trim(),
          email: note.author.email,
          role: note.author.role
        }
      })),
      tasks: person.leadTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueAt: task.dueAt ? task.dueAt.toISOString() : null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        assignee: task.assignee
          ? {
              id: task.assignee.id,
              name: `${task.assignee.firstName ?? ''} ${task.assignee.lastName ?? ''}`.trim(),
              email: task.assignee.email,
              role: task.assignee.role
            }
          : undefined
      })),
      activityRollup: person.activityRollup
        ? {
            last7dListingViews: person.activityRollup.last7dListingViews,
            last7dSessions: person.activityRollup.last7dSessions,
            lastReplyAt: person.activityRollup.lastReplyAt
              ? person.activityRollup.lastReplyAt.toISOString()
              : null,
            lastEmailOpenAt: person.activityRollup.lastEmailOpenAt
              ? person.activityRollup.lastEmailOpenAt.toISOString()
              : null,
            lastTouchpointAt: person.activityRollup.lastTouchpointAt
              ? person.activityRollup.lastTouchpointAt.toISOString()
              : null
          }
        : undefined,
      fit: person.leadFit
        ? {
            preapproved: person.leadFit.preapproved,
            budgetMin: person.leadFit.budgetMin ?? undefined,
            budgetMax: person.leadFit.budgetMax ?? undefined,
            timeframeDays: person.leadFit.timeframeDays ?? undefined,
            geo: person.leadFit.geo ?? undefined,
            inventoryMatch: person.leadFit.inventoryMatch ?? undefined
          }
        : undefined,
      consents: person.consents.map((consent) => ({
        id: consent.id,
        channel: consent.channel,
        scope: consent.scope,
        status: consent.status,
        capturedAt: consent.capturedAt ? consent.capturedAt.toISOString() : null
      })),
      events: person.siteEvents.map((event) => ({
        id: event.id,
        name: event.name,
        timestamp: event.timestamp.toISOString(),
        properties: event.properties ?? undefined
      })),
      touchpoints: person.touchpoints.map((touchpoint) => this.toTouchpointView(touchpoint))
    };
  }

  async create(dto: CreateLeadDto, ctx: RequestContext): Promise<LeadDetail> {
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, organizationId: true }
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const { pipelineId, stage } = await this.resolveStageForMutation(ctx.tenantId, dto.pipelineId, dto.stageId);

    const now = new Date();
    const person = await this.prisma.person.create({
      data: {
        tenantId: ctx.tenantId,
        organizationId: tenant.organizationId,
        ownerId: dto.ownerId ?? ctx.userId,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        primaryEmail: dto.email ?? null,
        primaryPhone: dto.phone ?? null,
        source: dto.source ?? null,
        stage: this.mapStageNameToPersonStage(stage?.name),
        pipelineId,
        stageId: stage?.id ?? null,
        stageEnteredAt: now,
        leadScore: 0,
        scoreTier: LeadScoreTier.D,
        scoreUpdatedAt: now,
        utmSource: dto.utmSource ?? null,
        utmMedium: dto.utmMedium ?? null,
        utmCampaign: dto.utmCampaign ?? null,
        gclid: dto.gclid ?? null,
        doNotContact: dto.doNotContact ?? false
      },
      include: LIST_INCLUDE
    });

    if (dto.fit) {
      await this.upsertLeadFit(person.id, ctx.tenantId, dto.fit);
    }

    if (dto.consentEmail || dto.consentSMS) {
      await this.seedConsent(person.id, ctx.tenantId, {
        consentEmail: dto.consentEmail,
        consentSMS: dto.consentSMS
      });
    }

    const full = await this.getById(person.id, ctx.tenantId);
    return full;
  }

  async update(id: string, dto: UpdateLeadDto, ctx: RequestContext): Promise<LeadDetail> {
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    const existing = await this.prisma.person.findFirst({
      where: { id, tenantId: ctx.tenantId }
    });
    if (!existing) {
      throw new NotFoundException('Lead not found');
    }

    const updateData: Prisma.PersonUpdateInput = {};

    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.email !== undefined) updateData.primaryEmail = dto.email ?? null;
    if (dto.phone !== undefined) updateData.primaryPhone = dto.phone ?? null;
    if (dto.source !== undefined) updateData.source = dto.source ?? null;
    if (dto.utmSource !== undefined) updateData.utmSource = dto.utmSource ?? null;
    if (dto.utmMedium !== undefined) updateData.utmMedium = dto.utmMedium ?? null;
    if (dto.utmCampaign !== undefined) updateData.utmCampaign = dto.utmCampaign ?? null;
    if (dto.gclid !== undefined) updateData.gclid = dto.gclid ?? null;
    if (dto.ownerId !== undefined) {
      updateData.owner = dto.ownerId
        ? { connect: { id: dto.ownerId } }
        : { disconnect: true };
    }
    if (dto.doNotContact !== undefined) updateData.doNotContact = dto.doNotContact;

    if (dto.stageId || dto.pipelineId) {
      const { pipelineId, stage } = await this.resolveStageForMutation(
        ctx.tenantId,
        dto.pipelineId,
        dto.stageId
      );
      updateData.pipeline = pipelineId
        ? { connect: { id: pipelineId } }
        : { disconnect: true };
      updateData.pipelineStage = stage ? { connect: { id: stage.id } } : { disconnect: true };
      updateData.stageEnteredAt = new Date();
      updateData.stage = this.mapStageNameToPersonStage(stage?.name);
    }

    await this.prisma.person.update({
      where: { id },
      data: updateData
    });

    if (dto.fit !== undefined) {
      if (dto.fit === null) {
        await this.prisma.leadFit.deleteMany({
          where: { personId: id, tenantId: ctx.tenantId }
        });
      } else {
        await this.upsertLeadFit(id, ctx.tenantId, dto.fit);
      }
    }

    if (dto.consentEmail !== undefined || dto.consentSMS !== undefined) {
      await this.seedConsent(id, ctx.tenantId, {
        consentEmail: dto.consentEmail,
        consentSMS: dto.consentSMS
      });
    }

    return this.getById(id, ctx.tenantId);
  }

  async addNote(leadId: string, dto: CreateLeadNoteDto, ctx: RequestContext): Promise<LeadNoteView> {
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    const person = await this.prisma.person.findFirst({
      where: { id: leadId, tenantId: ctx.tenantId }
    });
    if (!person) {
      throw new NotFoundException('Lead not found');
    }

    const authorId = dto.ownerId ?? ctx.userId;
    const note = await this.prisma.leadNote.create({
      data: {
        tenantId: ctx.tenantId,
        personId: person.id,
        userId: authorId,
        body: dto.body
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        }
      }
    });

    return {
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      author: {
        id: note.author.id,
        name: `${note.author.firstName ?? ''} ${note.author.lastName ?? ''}`.trim(),
        email: note.author.email,
        role: note.author.role
      }
    };
  }

  async addTask(leadId: string, dto: CreateLeadTaskDto, ctx: RequestContext): Promise<LeadTaskView> {
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    const person = await this.prisma.person.findFirst({
      where: { id: leadId, tenantId: ctx.tenantId }
    });
    if (!person) {
      throw new NotFoundException('Lead not found');
    }

    const task = await this.prisma.leadTask.create({
      data: {
        tenantId: ctx.tenantId,
        personId: leadId,
        title: dto.title,
        assigneeId: dto.assigneeId ?? ctx.userId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        status: dto.status ?? LeadTaskStatus.OPEN
      },
      include: {
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        }
      }
    });

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      dueAt: task.dueAt ? task.dueAt.toISOString() : null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      assignee: task.assignee
        ? {
            id: task.assignee.id,
            name: `${task.assignee.firstName ?? ''} ${task.assignee.lastName ?? ''}`.trim(),
            email: task.assignee.email,
            role: task.assignee.role
          }
        : undefined
    };
  }

  async recordTouchpoint(
    leadId: string,
    dto: CreateLeadTouchpointDto,
    ctx: RequestContext
  ): Promise<RecordLeadTouchpointResult> {
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const touchpoint = await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.findFirst({
        where: { id: leadId, tenantId: ctx.tenantId },
        include: {
          pipelineStage: true,
          pipeline: true,
          leadFit: true,
          activityRollup: true
        }
      });

      if (!person) {
        throw new NotFoundException('Lead not found');
      }

      const created = await tx.leadTouchpoint.create({
        data: {
          tenantId: ctx.tenantId,
          personId: leadId,
          userId: ctx.userId ?? null,
          type: dto.type,
          channel: dto.channel ?? null,
          occurredAt,
          summary: dto.summary ?? null,
          body: dto.body ?? null,
          metadata:
            dto.metadata !== undefined
              ? (dto.metadata as Prisma.InputJsonValue)
              : Prisma.JsonNull
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true
            }
          }
        }
      });

      const rollup = await tx.leadActivityRollup.upsert({
        where: { personId: leadId },
        create: {
          tenantId: ctx.tenantId,
          personId: leadId,
          lastTouchpointAt: occurredAt,
          lastReplyAt: dto.type === LeadTouchpointType.MESSAGE ? occurredAt : null
        },
        update: {
          lastTouchpointAt: occurredAt,
          ...(dto.type === LeadTouchpointType.MESSAGE ? { lastReplyAt: occurredAt } : {})
        }
      });

      const { score, scoreTier } = this.calculateLeadScore({
        stage: person.pipelineStage,
        rollup,
        fit: person.leadFit ?? undefined,
        lastActivityAt: person.lastActivityAt ?? undefined,
        touchpointAt: occurredAt
      });

      await tx.person.update({
        where: { id: leadId },
        data: {
          lastActivityAt: occurredAt,
          leadScore: score,
          scoreTier,
          scoreUpdatedAt: new Date()
        }
      });

      return created;
    });

    const refreshed = await this.prisma.person.findFirst({
      where: { id: leadId, tenantId: ctx.tenantId },
      include: LIST_INCLUDE
    });

    if (!refreshed) {
      throw new NotFoundException('Lead not found');
    }

    const leadSummary = this.toLeadListItem(refreshed);

    return {
      touchpoint: this.toTouchpointView(touchpoint, leadSummary.owner),
      lead: leadSummary
    };
  }

  async updateTask(
    leadId: string,
    taskId: string,
    dto: UpdateLeadTaskDto,
    ctx: RequestContext
  ): Promise<LeadTaskView> {
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    const existing = await this.prisma.leadTask.findFirst({
      where: { id: taskId, personId: leadId, tenantId: ctx.tenantId }
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const data: Prisma.LeadTaskUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.assigneeId !== undefined) {
      data.assignee = dto.assigneeId
        ? { connect: { id: dto.assigneeId } }
        : { disconnect: true };
    }
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await this.prisma.leadTask.update({
      where: { id: taskId },
      data,
      include: {
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true
          }
        }
      }
    });

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      dueAt: updated.dueAt ? updated.dueAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      assignee: updated.assignee
        ? {
            id: updated.assignee.id,
            name: `${updated.assignee.firstName ?? ''} ${updated.assignee.lastName ?? ''}`.trim(),
            email: updated.assignee.email,
            role: updated.assignee.role
          }
        : undefined
    };
  }

  async identify(leadId: string, dto: IdentifyLeadDto, ctx: RequestContext): Promise<{ success: boolean }> {
    if (!ctx.tenantId) {
      throw new UnauthorizedException('tenantId header (x-tenant-id) is required');
    }

    const person = await this.prisma.person.findFirst({
      where: { id: leadId, tenantId: ctx.tenantId }
    });
    if (!person) {
      throw new NotFoundException('Lead not found');
    }

    const anonymousId = dto.anonymous_id.trim();
    if (!anonymousId) {
      throw new BadRequestException('anonymous_id is required');
    }

    await this.prisma.event.updateMany({
      where: {
        tenantId: ctx.tenantId,
        anonymousId,
        OR: [{ personId: null }, { personId: leadId }]
      },
      data: {
        personId: leadId
      }
    });

    // Optionally future: merge traits
    return { success: true };
  }

  private toTouchpointView(
    touchpoint: Prisma.LeadTouchpointGetPayload<{
      include: {
        user: {
          select: {
            id: true;
            firstName: true;
            lastName: true;
            email: true;
            role: true;
          };
        };
      };
    }>,
    owner?: LeadOwnerSummary
  ): LeadTouchpointView {
    const recordedBy = touchpoint.user
      ? {
          id: touchpoint.user.id,
          name: `${touchpoint.user.firstName ?? ''} ${touchpoint.user.lastName ?? ''}`.trim(),
          email: touchpoint.user.email,
          role: touchpoint.user.role
        }
      : owner;

    return {
      id: touchpoint.id,
      type: touchpoint.type,
      channel: touchpoint.channel,
      occurredAt: touchpoint.occurredAt.toISOString(),
      summary: touchpoint.summary ?? undefined,
      body: touchpoint.body ?? undefined,
      metadata: touchpoint.metadata ?? undefined,
      recordedBy
    };
  }

  private calculateLeadScore(params: {
    stage?: Stage | null;
    rollup?: {
      lastTouchpointAt?: Date | null;
      last7dListingViews: number;
      last7dSessions: number;
    };
    fit?: {
      preapproved?: boolean;
      budgetMin?: number | null;
      budgetMax?: number | null;
      timeframeDays?: number | null;
    };
    lastActivityAt?: Date | null;
    touchpointAt: Date;
  }): { score: number; scoreTier: LeadScoreTier } {
    const now = new Date();
    const lastTouch = params.rollup?.lastTouchpointAt ?? params.lastActivityAt ?? params.touchpointAt;
    const hoursSinceTouch = lastTouch ? Math.max(0, differenceInHours(now, lastTouch)) : 999;

    let recencyScore = 0;
    if (hoursSinceTouch <= 6) {
      recencyScore = 40;
    } else if (hoursSinceTouch <= 24) {
      recencyScore = 32;
    } else if (hoursSinceTouch <= 48) {
      recencyScore = 24;
    } else if (hoursSinceTouch <= 96) {
      recencyScore = 16;
    } else if (hoursSinceTouch <= 168) {
      recencyScore = 8;
    }

    const stageScore = Math.min(20, ((params.stage?.order ?? 0) + 1) * 5);

    const activityScore = Math.min(
      20,
      (params.rollup?.last7dListingViews ?? 0) * 3 + (params.rollup?.last7dSessions ?? 0) * 2
    );

    const fitScore =
      (params.fit?.preapproved ? 10 : 0) +
      (params.fit?.budgetMax ? 5 : 0) +
      (params.fit?.timeframeDays && params.fit.timeframeDays <= 30 ? 5 : 0);

    const baseScore = 20;
    const score = Math.min(100, baseScore + recencyScore + stageScore + activityScore + fitScore);

    const scoreTier =
      score >= 80
        ? LeadScoreTier.A
        : score >= 60
        ? LeadScoreTier.B
        : score >= 40
        ? LeadScoreTier.C
        : LeadScoreTier.D;

    return { score, scoreTier };
  }

  private toLeadListItem(person: LeadListPayload): LeadListItem {
    const owner = person.owner
      ? {
          id: person.owner.id,
          name: `${person.owner.firstName ?? ''} ${person.owner.lastName ?? ''}`.trim(),
          email: person.owner.email,
          role: person.owner.role
        }
      : undefined;

    const stage = person.pipelineStage
      ? {
          id: person.pipelineStage.id,
          name: person.pipelineStage.name,
          order: person.pipelineStage.order,
          pipelineId: person.pipelineStage.pipelineId,
          pipelineName: person.pipeline?.name ?? '',
          pipelineType: person.pipeline?.type ?? '',
          slaMinutes: person.pipelineStage.slaMinutes ?? null
        }
      : undefined;

    const stageId = stage?.id ?? person.stageId ?? null;
    const pipelineId = stage?.pipelineId ?? person.pipelineId ?? null;

    return {
      id: person.id,
      firstName: person.firstName ?? null,
      lastName: person.lastName ?? null,
      email: person.primaryEmail ?? null,
      phone: person.primaryPhone ?? null,
      score: person.leadScore ?? 0,
      scoreTier: person.scoreTier ?? LeadScoreTier.D,
      owner,
      stage,
      pipelineId,
      pipelineName: stage?.pipelineName ?? person.pipeline?.name ?? null,
      pipelineType: stage?.pipelineType ?? person.pipeline?.type ?? null,
      stageId,
      lastActivityAt: person.lastActivityAt ? person.lastActivityAt.toISOString() : null,
      stageEnteredAt: person.stageEnteredAt ? person.stageEnteredAt.toISOString() : null,
      preapproved: person.leadFit?.preapproved ?? undefined,
      budgetMin: person.leadFit?.budgetMin ?? undefined,
      budgetMax: person.leadFit?.budgetMax ?? undefined,
      timeframeDays: person.leadFit?.timeframeDays ?? undefined,
      activityRollup: person.activityRollup
        ? {
            last7dListingViews: person.activityRollup.last7dListingViews,
            last7dSessions: person.activityRollup.last7dSessions,
            lastReplyAt: person.activityRollup.lastReplyAt
              ? person.activityRollup.lastReplyAt.toISOString()
              : null,
            lastEmailOpenAt: person.activityRollup.lastEmailOpenAt
              ? person.activityRollup.lastEmailOpenAt.toISOString()
              : null,
            lastTouchpointAt: person.activityRollup.lastTouchpointAt
              ? person.activityRollup.lastTouchpointAt.toISOString()
              : null
          }
        : undefined,
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString()
    };
  }

  private async resolveStageForMutation(
    tenantId: string,
    pipelineId?: string,
    stageId?: string
  ): Promise<{ pipelineId: string; stage?: Stage | null }> {
    if (stageId) {
      const stage = await this.prisma.stage.findFirst({
        where: { id: stageId, tenantId },
        include: { pipeline: true }
      });
      if (!stage) {
        throw new NotFoundException('Stage not found');
      }
      return { pipelineId: stage.pipelineId, stage };
    }

    if (pipelineId) {
      const pipeline = await this.prisma.pipeline.findFirst({
        where: { id: pipelineId, tenantId },
        include: { stages: { orderBy: { order: 'asc' }, take: 1 } }
      });
      if (!pipeline) {
        throw new NotFoundException('Pipeline not found');
      }
      const stage = pipeline.stages[0] ?? null;
      return { pipelineId: pipeline.id, stage };
    }

    const pipelines = await this.pipelines.list(tenantId);
    const buyer = pipelines.find((p) => p.type === 'buyer') ?? pipelines[0];
    if (!buyer) {
      throw new NotFoundException('No pipeline configured');
    }
    const stage = buyer.stages[0] ?? null;
    return { pipelineId: buyer.id, stage };
  }

  private async upsertLeadFit(personId: string, tenantId: string, fit: LeadFitInput) {
    await this.prisma.leadFit.upsert({
      where: { personId },
      create: {
        personId,
        tenantId,
        preapproved: fit.preapproved ?? false,
        budgetMin: fit.budgetMin ?? null,
        budgetMax: fit.budgetMax ?? null,
        timeframeDays: fit.timeframeDays ?? null,
        geo: fit.geo ?? null,
        inventoryMatch: fit.inventoryMatch ?? null
      },
      update: {
        preapproved: fit.preapproved ?? false,
        budgetMin: fit.budgetMin ?? null,
        budgetMax: fit.budgetMax ?? null,
        timeframeDays: fit.timeframeDays ?? null,
        geo: fit.geo ?? null,
        inventoryMatch: fit.inventoryMatch ?? null
      }
    });
  }

  private async seedConsent(
    personId: string,
    tenantId: string,
    opts: { consentEmail?: boolean; consentSMS?: boolean }
  ) {
    const now = new Date();

    if (opts.consentEmail !== undefined) {
      const existingEmail = await this.prisma.consent.findFirst({
        where: { tenantId, personId, channel: 'EMAIL' }
      });
      if (existingEmail) {
        await this.prisma.consent.update({
          where: { id: existingEmail.id },
          data: {
            status: opts.consentEmail ? 'GRANTED' : 'REVOKED',
            capturedAt: now,
            updatedAt: now
          }
        });
      } else {
        await this.prisma.consent.create({
          data: {
            tenantId,
            personId,
            channel: 'EMAIL',
            scope: 'TRANSACTIONAL',
            status: opts.consentEmail ? 'GRANTED' : 'REVOKED',
            verbatimText: opts.consentEmail ? 'Captured via CRM' : 'Revoked via CRM',
            source: 'crm',
            capturedAt: now
          }
        });
      }
    }

    if (opts.consentSMS !== undefined) {
      const existingSms = await this.prisma.consent.findFirst({
        where: { tenantId, personId, channel: 'SMS' }
      });
      if (existingSms) {
        await this.prisma.consent.update({
          where: { id: existingSms.id },
          data: {
            status: opts.consentSMS ? 'GRANTED' : 'REVOKED',
            capturedAt: now,
            updatedAt: now
          }
        });
      } else {
        await this.prisma.consent.create({
          data: {
            tenantId,
            personId,
            channel: 'SMS',
            scope: 'PROMOTIONAL',
            status: opts.consentSMS ? 'GRANTED' : 'REVOKED',
            verbatimText: opts.consentSMS ? 'Captured via CRM' : 'Revoked via CRM',
            source: 'crm',
            capturedAt: now
          }
        });
      }
    }
  }

  private mapStageNameToPersonStage(name?: string | null): PersonStage {
    if (!name) return PersonStage.NEW;
    const normalized = name.toLowerCase();
    if (normalized.includes('new')) return PersonStage.NEW;
    if (normalized.includes('engaged') || normalized.includes('qualified') || normalized.includes('showing')) {
      return PersonStage.ACTIVE;
    }
    if (normalized.includes('under contract')) return PersonStage.UNDER_CONTRACT;
    if (normalized.includes('closed')) return PersonStage.CLOSED;
    if (normalized.includes('nurture')) return PersonStage.NURTURE;
    return PersonStage.ACTIVE;
  }
}
