import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { differenceInMinutes, subDays } from 'date-fns';

import {
  ConsentChannel,
  ConsentStatus,
  LeadScoreTier,
  LeadTaskStatus,
  type Pipeline,
  type Prisma,
  type Stage
} from '@hatch/db';

import { PrismaService } from '@/shared/prisma.service';

const CONSENT_CHANNEL_SMS: ConsentChannel = 'SMS';
const CONSENT_CHANNEL_EMAIL: ConsentChannel = 'EMAIL';
const BADGE_CONSENT_CHANNELS: ConsentChannel[] = [
  CONSENT_CHANNEL_SMS,
  CONSENT_CHANNEL_EMAIL
];
const CONSENT_STATUS_GRANTED: ConsentStatus = 'GRANTED';

type BoardViewRecord = {
  id: string;
  pipelineId: string;
  name: string;
  filters: unknown;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type PipelineBoardCard = {
  dealId: string;
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  ageHours: number;
  score: number | null;
  owner: { id: string; name: string } | null;
  badges: {
    sla: boolean;
    dup: boolean;
    consentSms: boolean;
    consentEmail?: boolean;
  };
  lastActivityAt: string | null;
  nextTask: { dueAt: string | null; title: string } | null;
};

type BoardFilters = {
  ownerId?: string;
  scoreTier?: LeadScoreTier[];
  lastActivityDays?: number;
  preapprovedOnly?: boolean;
  queueId?: string;
};

type PersonBoardRecord = Prisma.PersonGetPayload<{
  select: {
    id: true;
    firstName: true;
    lastName: true;
    primaryEmail: true;
    primaryPhone: true;
    leadScore: true;
    lastActivityAt: true;
    stageEnteredAt: true;
    updatedAt: true;
    createdAt: true;
    owner: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        email: true;
      };
    };
    leadTasks: {
      where: { status: LeadTaskStatus };
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }];
      take: 1;
      select: {
        dueAt: true;
        title: true;
      };
    };
    consents: {
      orderBy: { capturedAt: 'desc' };
      select: { channel: true };
    };
    activityRollup: {
      select: {
        lastTouchpointAt: true;
        lastReplyAt: true;
      };
    };
  };
}>;

@Injectable()
export class PipelineBoardService {
  private readonly savedViews = new Map<string, Map<string, BoardViewRecord>>();

  constructor(private readonly prisma: PrismaService) {}

  async getPipeline(tenantId: string, pipelineId: string): Promise<Pipeline & { stages: Stage[] }> {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId },
      include: {
        stages: {
          orderBy: { order: 'asc' }
        }
      }
    });
    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }
    return pipeline;
  }

  async getColumns(tenantId: string, pipelineId: string, rawFilters?: string) {
    const pipeline = await this.getPipeline(tenantId, pipelineId);
    const filters = this.parseFilters(rawFilters);
    const now = new Date();

    const stageIds = pipeline.stages.map((stage) => stage.id);
    const whereAllStages = this.buildPersonWhereForStageIds(tenantId, pipelineId, stageIds, filters, now);

    const totalCountsPromise =
      filters.queueId === 'overdue'
        ? Promise.resolve([] as Array<{ stageId: string | null; _count: { _all: number } }>)
        : this.prisma.person.groupBy({
            by: ['stageId'],
            where: whereAllStages,
            _count: { _all: true }
          });

    const oldestRowsPromise = this.prisma.person.findMany({
      where: whereAllStages,
      distinct: ['stageId'],
      orderBy: [{ stageId: 'asc' }, { stageEnteredAt: 'asc' }, { createdAt: 'asc' }],
      select: { stageId: true, stageEnteredAt: true, createdAt: true }
    });

    const slaStageClauses = pipeline.stages
      .filter((stage) => stage.slaMinutes !== null && stage.slaMinutes !== undefined)
      .map((stage) => {
        const threshold = new Date(now.getTime() - stage.slaMinutes! * 60 * 1000);
        return {
          stageId: stage.id,
          OR: [
            { lastActivityAt: { lt: threshold } },
            {
              AND: [{ lastActivityAt: null }, { stageEnteredAt: { lt: threshold } }]
            }
          ]
        } satisfies Prisma.PersonWhereInput;
      });

    const slaBreachesPromise =
      slaStageClauses.length === 0
        ? Promise.resolve([] as Array<{ stageId: string | null; _count: { _all: number } }>)
        : this.prisma.person.groupBy({
            by: ['stageId'],
            where: { AND: [whereAllStages, { OR: slaStageClauses }] },
            _count: { _all: true }
          });

    const [totalCounts, oldestRows, slaBreaches] = await Promise.all([
      totalCountsPromise,
      oldestRowsPromise,
      slaBreachesPromise
    ]);

    const totalCountByStage = new Map<string, number>();
    for (const group of totalCounts) {
      if (group.stageId) {
        totalCountByStage.set(group.stageId, group._count._all);
      }
    }

    const slaBreachesByStage = new Map<string, number>();
    for (const group of slaBreaches) {
      if (group.stageId) {
        slaBreachesByStage.set(group.stageId, group._count._all);
      }
    }

    const oldestDateByStage = new Map<string, Date>();
    for (const row of oldestRows) {
      if (!row.stageId) continue;
      const date = row.stageEnteredAt ?? row.createdAt ?? null;
      if (date) {
        oldestDateByStage.set(row.stageId, date);
      }
    }

    const stages = pipeline.stages.map((stage) => {
      const slaBreachesForStage =
        stage.slaMinutes === null || stage.slaMinutes === undefined
          ? 0
          : slaBreachesByStage.get(stage.id) ?? 0;
      const count =
        filters.queueId === 'overdue'
          ? slaBreachesForStage
          : totalCountByStage.get(stage.id) ?? 0;
      const oldestDate = oldestDateByStage.get(stage.id) ?? null;
      const oldestHours =
        oldestDate !== null ? Math.max(0, Math.floor(differenceInMinutes(now, oldestDate) / 60)) : 0;

      return {
        id: stage.id,
        name: stage.name,
        count,
        slaBreaches: slaBreachesForStage,
        oldestHours
      };
    });

    return {
      pipelineId: pipeline.id,
      stages
    };
  }

  async getStageMetrics(
    tenantId: string,
    pipelineId: string,
    stageId: string,
    rawFilters?: string
  ) {
    const stage = await this.ensureStage(tenantId, pipelineId, stageId);
    const filters = this.parseFilters(rawFilters);
    const now = new Date();
    const where = this.buildPersonWhere(tenantId, pipelineId, stageId, filters);

    const slaBreachesPromise = this.countSlaBreaches(where, stage, now);
    const countPromise =
      filters.queueId === 'overdue' ? Promise.resolve<number | null>(null) : this.prisma.person.count({ where });
    const oldestPromise = this.findOldestStageDate(where);

    const [slaBreaches, counted, oldestDate] = await Promise.all([
      slaBreachesPromise,
      countPromise,
      oldestPromise
    ]);

    const count = filters.queueId === 'overdue' ? slaBreaches : counted ?? 0;
    const oldestHours =
      oldestDate !== null ? Math.max(0, Math.floor(differenceInMinutes(now, oldestDate) / 60)) : 0;

    return {
      count,
      slaBreaches,
      oldestHours
    };
  }

  async getStageCards(
    tenantId: string,
    pipelineId: string,
    stageId: string,
    options?: { limit?: number; cursor?: string; filters?: string }
  ) {
    const stage = await this.ensureStage(tenantId, pipelineId, stageId);
    const filters = this.parseFilters(options?.filters);
    const where = this.buildPersonWhere(tenantId, pipelineId, stageId, filters);
    const limit =
      typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
        ? Math.min(Math.trunc(options.limit), 200)
        : 200;

    const people = await this.prisma.person.findMany({
      where,
      orderBy: [
        { stageEnteredAt: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' }
      ],
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        primaryEmail: true,
        primaryPhone: true,
        leadScore: true,
        lastActivityAt: true,
        stageEnteredAt: true,
        updatedAt: true,
        createdAt: true,
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        leadTasks: {
          where: { status: LeadTaskStatus.OPEN },
          orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
          take: 1,
          select: {
            dueAt: true,
            title: true
          }
        },
        consents: {
          where: {
            channel: { in: BADGE_CONSENT_CHANNELS },
            status: CONSENT_STATUS_GRANTED
          },
          orderBy: { capturedAt: 'desc' },
          select: { channel: true }
        },
        activityRollup: {
          select: {
            lastTouchpointAt: true,
            lastReplyAt: true
          }
        }
      }
    });

    const now = new Date();
    const cards = people.map((person) => this.mapPersonToCard(person, stage, now));
    const filteredCards = this.applyQueueFilter(cards, filters.queueId);

    return {
      rows: filteredCards,
      nextCursor: null
    };
  }

  async listViews(pipelineId: string) {
    return Array.from(this.ensureViewStore(pipelineId).values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
  }

  async createView(
    pipelineId: string,
    payload: { name: string; filters: unknown; isDefault?: boolean }
  ) {
    const store = this.ensureViewStore(pipelineId);
    const now = new Date().toISOString();
    const view: BoardViewRecord = {
      id: randomUUID(),
      pipelineId,
      name: payload.name,
      filters: payload.filters ?? {},
      isDefault: Boolean(payload.isDefault),
      createdAt: now,
      updatedAt: now
    };
    if (view.isDefault) {
      this.clearDefault(store);
    }
    store.set(view.id, view);
    return view;
  }

  async updateView(
    pipelineId: string,
    viewId: string,
    payload: Partial<{ name: string; filters: unknown; isDefault: boolean }>
  ) {
    const store = this.ensureViewStore(pipelineId);
    const existing = store.get(viewId);
    if (!existing) {
      throw new NotFoundException('View not found');
    }
    const updated: BoardViewRecord = {
      ...existing,
      name: payload.name ?? existing.name,
      filters: payload.filters ?? existing.filters,
      isDefault: payload.isDefault ?? existing.isDefault,
      updatedAt: new Date().toISOString()
    };
    if (updated.isDefault) {
      this.clearDefault(store, viewId);
    }
    store.set(viewId, updated);
    return updated;
  }

  async deleteView(pipelineId: string, viewId: string) {
    const store = this.ensureViewStore(pipelineId);
    store.delete(viewId);
  }

  async setDefaultView(pipelineId: string, viewId: string) {
    const store = this.ensureViewStore(pipelineId);
    const existing = store.get(viewId);
    if (!existing) {
      throw new NotFoundException('View not found');
    }
    this.clearDefault(store, viewId);
    const updated = {
      ...existing,
      isDefault: true,
      updatedAt: new Date().toISOString()
    };
    store.set(viewId, updated);
    return updated;
  }

  private ensureViewStore(pipelineId: string) {
    if (!this.savedViews.has(pipelineId)) {
      this.savedViews.set(pipelineId, new Map());
    }
    return this.savedViews.get(pipelineId)!;
  }

  private clearDefault(store: Map<string, BoardViewRecord>, exceptId?: string) {
    store.forEach((value, key) => {
      if (key === exceptId) return;
      if (!value.isDefault) return;
      store.set(key, {
        ...value,
        isDefault: false,
        updatedAt: new Date().toISOString()
      });
    });
  }

  private async ensureStage(tenantId: string, pipelineId: string, stageId: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, pipelineId, tenantId }
    });
    if (!stage) {
      throw new NotFoundException('Stage not found');
    }
    return stage;
  }

  private parseFilters(raw?: string | null): BoardFilters {
    if (!raw) {
      return {};
    }
    let value: unknown = raw;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) {
        return {};
      }
      try {
        value = JSON.parse(trimmed);
      } catch {
        return {};
      }
    }
    if (!value || typeof value !== 'object') {
      return {};
    }
    const input = value as Record<string, unknown>;
    const filters: BoardFilters = {};

    if (typeof input.ownerId === 'string' && input.ownerId.trim() && input.ownerId.trim() !== 'all') {
      filters.ownerId = input.ownerId.trim();
    }

    if (Array.isArray(input.scoreTier)) {
      const tiers = input.scoreTier
        .map((tier) => (typeof tier === 'string' ? tier.trim().toUpperCase() : null))
        .filter((tier): tier is LeadScoreTier => this.isValidScoreTier(tier));
      if (tiers.length > 0) {
        filters.scoreTier = tiers;
      }
    } else if (typeof input.scoreTier === 'string') {
      const tier = input.scoreTier.trim().toUpperCase();
      if (this.isValidScoreTier(tier)) {
        filters.scoreTier = [tier];
      }
    }

    if (typeof input.lastActivityDays === 'number' && Number.isFinite(input.lastActivityDays)) {
      filters.lastActivityDays = Math.max(0, Math.trunc(input.lastActivityDays));
    } else if (
      typeof input.lastActivityDays === 'string' &&
      input.lastActivityDays.trim().length > 0 &&
      !Number.isNaN(Number(input.lastActivityDays))
    ) {
      const parsed = Number(input.lastActivityDays);
      if (Number.isFinite(parsed)) {
        filters.lastActivityDays = Math.max(0, Math.trunc(parsed));
      }
    }

    if (typeof input.preapprovedOnly === 'boolean') {
      filters.preapprovedOnly = input.preapprovedOnly;
    }

    if (typeof input.queueId === 'string' && input.queueId.trim()) {
      filters.queueId = input.queueId.trim();
    }

    return filters;
  }

  private isValidScoreTier(value: unknown): value is LeadScoreTier {
    return value === 'A' || value === 'B' || value === 'C' || value === 'D';
  }

  private buildPersonWhere(
    tenantId: string,
    pipelineId: string,
    stageId: string,
    filters: BoardFilters
  ): Prisma.PersonWhereInput {
    const where: Prisma.PersonWhereInput = {
      tenantId,
      pipelineId,
      stageId,
      deletedAt: null
    };

    if (filters.queueId === 'unassigned') {
      where.ownerId = null;
    } else if (filters.ownerId) {
      where.ownerId = filters.ownerId;
    }

    if (filters.scoreTier && filters.scoreTier.length > 0) {
      where.scoreTier = { in: filters.scoreTier };
    }

    if (filters.preapprovedOnly) {
      where.leadFit = {
        is: {
          preapproved: true
        }
      };
    }

    if (filters.queueId === 'hot') {
      where.leadScore = { gte: 80 };
    }

    if (filters.lastActivityDays && filters.lastActivityDays > 0) {
      const threshold = subDays(new Date(), filters.lastActivityDays);
      const existing = where.AND;
      const normalized = Array.isArray(existing)
        ? existing
        : existing
        ? [existing]
        : [];
      normalized.push({
        OR: [
          { lastActivityAt: { gte: threshold } },
          {
            AND: [
              { lastActivityAt: null },
              { stageEnteredAt: { gte: threshold } }
            ]
          }
        ]
      });
      where.AND = normalized;
    }

    return where;
  }

  private buildPersonWhereForStageIds(
    tenantId: string,
    pipelineId: string,
    stageIds: string[],
    filters: BoardFilters,
    now: Date
  ): Prisma.PersonWhereInput {
    const where: Prisma.PersonWhereInput = {
      tenantId,
      pipelineId,
      stageId: { in: stageIds },
      deletedAt: null
    };

    if (filters.queueId === 'unassigned') {
      where.ownerId = null;
    } else if (filters.ownerId) {
      where.ownerId = filters.ownerId;
    }

    if (filters.scoreTier && filters.scoreTier.length > 0) {
      where.scoreTier = { in: filters.scoreTier };
    }

    if (filters.preapprovedOnly) {
      where.leadFit = {
        is: {
          preapproved: true
        }
      };
    }

    if (filters.queueId === 'hot') {
      where.leadScore = { gte: 80 };
    }

    if (filters.lastActivityDays && filters.lastActivityDays > 0) {
      const threshold = subDays(now, filters.lastActivityDays);
      const existing = where.AND;
      const normalized = Array.isArray(existing) ? existing : existing ? [existing] : [];
      normalized.push({
        OR: [
          { lastActivityAt: { gte: threshold } },
          { AND: [{ lastActivityAt: null }, { stageEnteredAt: { gte: threshold } }] }
        ]
      });
      where.AND = normalized;
    }

    return where;
  }

  private async computeStageSummary(
    tenantId: string,
    pipelineId: string,
    stage: Stage,
    filters: BoardFilters,
    now: Date
  ) {
    const where = this.buildPersonWhere(tenantId, pipelineId, stage.id, filters);
    const slaBreachesPromise = this.countSlaBreaches(where, stage, now);
    const countPromise =
      filters.queueId === 'overdue' ? Promise.resolve<number | null>(null) : this.prisma.person.count({ where });
    const oldestPromise = this.findOldestStageDate(where);

    const [slaBreaches, counted, oldestDate] = await Promise.all([
      slaBreachesPromise,
      countPromise,
      oldestPromise
    ]);

    const count = filters.queueId === 'overdue' ? slaBreaches : counted ?? 0;
    const oldestHours =
      oldestDate !== null ? Math.max(0, Math.floor(differenceInMinutes(now, oldestDate) / 60)) : 0;

    return {
      id: stage.id,
      name: stage.name,
      count,
      slaBreaches,
      oldestHours
    };
  }

  private async countSlaBreaches(
    baseWhere: Prisma.PersonWhereInput,
    stage: Stage,
    now: Date
  ): Promise<number> {
    if (stage.slaMinutes === null || stage.slaMinutes === undefined) {
      return 0;
    }
    const threshold = new Date(now.getTime() - stage.slaMinutes * 60 * 1000);
    const where: Prisma.PersonWhereInput = {
      ...baseWhere,
      OR: [
        { lastActivityAt: { lt: threshold } },
        {
          AND: [
            { lastActivityAt: null },
            { stageEnteredAt: { lt: threshold } }
          ]
        }
      ]
    };
    return this.prisma.person.count({ where });
  }

  private async findOldestStageDate(where: Prisma.PersonWhereInput): Promise<Date | null> {
    const record = await this.prisma.person.findFirst({
      where,
      orderBy: [
        { stageEnteredAt: 'asc' },
        { createdAt: 'asc' }
      ],
      select: {
        stageEnteredAt: true,
        createdAt: true
      }
    });
    if (!record) {
      return null;
    }
    return record.stageEnteredAt ?? record.createdAt ?? null;
  }

  private mapPersonToCard(person: PersonBoardRecord, stage: Stage, now: Date): PipelineBoardCard {
    const displayName =
      this.formatName(person.firstName, person.lastName) ||
      person.primaryEmail ||
      person.primaryPhone ||
      person.id;
    const lastInteraction = this.resolveLastInteraction(person);
    const ageMinutes = differenceInMinutes(
      now,
      person.stageEnteredAt ?? person.createdAt ?? now
    );
    const ageHours = ageMinutes > 0 ? Math.max(0, Math.floor(ageMinutes / 60)) : 0;
    const slaBreached = this.isSlaBreached(stage, person, lastInteraction, now);
    const owner =
      person.owner !== null
        ? {
            id: person.owner.id,
            name:
              this.formatName(person.owner.firstName, person.owner.lastName) ||
              person.owner.email ||
              person.owner.id
          }
        : null;
    const nextTask = person.leadTasks[0]
      ? {
          dueAt: person.leadTasks[0].dueAt ? person.leadTasks[0].dueAt.toISOString() : null,
          title: person.leadTasks[0].title
        }
      : null;
    const consents = new Set(person.consents.map((consent) => consent.channel));

    return {
      dealId: person.id,
      contactId: person.id,
      name: displayName,
      email: person.primaryEmail ?? null,
      phone: person.primaryPhone ?? null,
      ageHours,
      score:
        typeof person.leadScore === 'number' && Number.isFinite(person.leadScore)
          ? Math.round(person.leadScore)
          : null,
      owner,
      badges: {
        sla: slaBreached,
        dup: false,
        consentSms: consents.has(CONSENT_CHANNEL_SMS),
        consentEmail: consents.has(CONSENT_CHANNEL_EMAIL)
      },
      lastActivityAt: lastInteraction ? lastInteraction.toISOString() : null,
      nextTask
    };
  }

  private applyQueueFilter(cards: PipelineBoardCard[], queueId?: string | null) {
    if (!queueId || queueId === 'all') {
      return cards;
    }
    switch (queueId) {
      case 'unassigned':
        return cards.filter((card) => !card.owner);
      case 'hot':
        return cards.filter((card) => (card.score ?? 0) >= 80);
      case 'overdue':
        return cards.filter((card) => card.badges.sla);
      default:
        return cards;
    }
  }

  private resolveLastInteraction(person: PersonBoardRecord): Date | null {
    const candidates = [
      person.activityRollup?.lastTouchpointAt ?? null,
      person.activityRollup?.lastReplyAt ?? null,
      person.lastActivityAt ?? null,
      person.stageEnteredAt ?? null,
      person.updatedAt ?? null,
      person.createdAt ?? null
    ].filter((value): value is Date => value instanceof Date);
    return candidates.length > 0 ? candidates[0] : null;
  }

  private isSlaBreached(
    stage: Stage,
    person: PersonBoardRecord,
    lastInteraction: Date | null,
    now: Date
  ): boolean {
    if (stage.slaMinutes === null || stage.slaMinutes === undefined) {
      return false;
    }
    const reference =
      lastInteraction ??
      person.stageEnteredAt ??
      person.updatedAt ??
      person.createdAt ??
      null;
    if (!reference) {
      return false;
    }
    return differenceInMinutes(now, reference) > stage.slaMinutes;
  }

  private formatName(first?: string | null, last?: string | null): string {
    const parts = [first, last]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    return parts.join(' ');
  }
}
