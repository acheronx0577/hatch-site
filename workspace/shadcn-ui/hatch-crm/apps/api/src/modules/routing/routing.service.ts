import { Injectable, Logger } from '@nestjs/common';
import {
  AssignmentReasonType,
  Consent,
  LeadRouteEvent,
  LeadSlaType,
  MessageChannel,
  Prisma,
  RoutingMode,
  UserRole
} from '@hatch/db';
import {
  evaluateLeadRoutingConditions,
  leadRoutingConditionsSchema,
  leadRoutingFallbackSchema,
  leadRoutingRuleConfigSchema,
  leadRoutingTargetSchema,
  routeLead,
  routingConfigSchema,
  scoreAgent
} from '@hatch/shared';
import type {
  AgentScore,
  AgentSnapshot,
  LeadRoutingContext,
  LeadRoutingEvaluationResult,
  LeadRoutingAgentFilter,
  LeadRoutingFallback,
  LeadRoutingListingContext,
  LeadRoutingRuleConfig,
  RoutingResult
} from '@hatch/shared';

import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';
import { assertJsonSafe, toJsonValue, toNullableJson } from '../common';
import { RoutingRulesQueryDto } from './dto/routing-query.dto';

type AssignPayload = {
  tenantId: string;
  person: Prisma.PersonGetPayload<Record<string, never>>;
  approvalPoolTeamId?: string;
  listing?:
    | (LeadRoutingListingContext & {
        id?: string;
      })
    | null;
  listingPrice?: number;
  listingLocation?: {
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  actorUserId?: string;
};

type AgentWithRelations = Prisma.UserGetPayload<{
  include: {
    tours: {
      where: {
        status: {
          in: ['REQUESTED', 'CONFIRMED'];
        };
      };
      include: {
        listing: true;
      };
    };
    memberships: true;
    agentProfilesForOrgs: true;
  };
}>;

export type RoutingDecisionCandidate = {
  agentId: string;
  fullName: string;
  status: 'SELECTED' | 'REJECTED' | 'DISQUALIFIED';
  score?: number;
  reasons: string[];
  capacityRemaining: number;
  consentReady: boolean;
  tenDlcReady: boolean;
  teamIds: string[];
};

export type RouteAssignmentResult = RoutingResult & {
  ruleId?: string;
  ruleName?: string;
  eventId: string;
  candidates: RoutingDecisionCandidate[];
  evaluation: LeadRoutingEvaluationResult;
  reasonCodes: string[];
};

type CandidateSnapshot = {
  agent: AgentWithRelations;
  snapshot: AgentSnapshot;
  capacityRemaining: number;
  gatingReasons: string[];
  teamIds: string[];
  attributes: {
    tags: string[];
    languages: string[];
    specialties: string[];
  };
};

const MINUTES = 60 * 1000;

const defaultScoreConfig = routingConfigSchema.parse({});

const consentStateFromConsents = (consents: Consent[]) => {
  const resolve = (channel: MessageChannel) => {
    const match = consents.find((consent) => consent.channel === channel);
    if (!match) return 'UNKNOWN' as const;
    if (match.status === 'GRANTED') return 'GRANTED' as const;
    if (match.status === 'REVOKED') return 'REVOKED' as const;
    return 'UNKNOWN' as const;
  };
  return {
    sms: resolve(MessageChannel.SMS),
    email: resolve(MessageChannel.EMAIL)
  };
};

const toListingContext = (payload: AssignPayload): LeadRoutingListingContext | undefined => {
  if (payload.listing) {
    return {
      price: payload.listing.price ?? null,
      city: payload.listing.city ?? null,
      state: payload.listing.state ?? null,
      postalCode: payload.listing.postalCode ?? null
    };
  }

  if (!payload.listingPrice && !payload.listingLocation) {
    return undefined;
  }

  return {
    price: payload.listingPrice ?? null,
    city: payload.listingLocation?.city ?? null,
    state: payload.listingLocation?.state ?? null,
    postalCode: payload.listingLocation?.postalCode ?? null
  };
};

const minutesFromNow = (minutes: number, now: Date) => new Date(now.getTime() + minutes * MINUTES);

type CustomFieldValueRow = {
  field?: { key?: string | null } | null;
  value?: unknown;
};

const parseCommaSeparated = (value: string | null | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeStringTokens = (values: unknown): string[] => {
  if (Array.isArray(values)) {
    return values
      .flatMap((value) => (typeof value === 'string' ? [value] : []))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof values === 'string') {
    return values
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeLowerUnique = (values: string[]) =>
  Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const toNumberMaybe = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const buildCustomFieldsMap = (values: CustomFieldValueRow[]) => {
  const customFields: Record<string, unknown> = {};
  const seen = new Set<string>();

  for (const entry of values) {
    const key = entry.field?.key ?? null;
    if (!key || seen.has(key)) continue;
    customFields[key] = (entry as any).value ?? null;
    seen.add(key);
  }

  return customFields;
};

const extractConventionalDemographics = (customFields: Record<string, unknown>) => {
  const age = toNumberMaybe(customFields.age);
  const languages = normalizeStringTokens(
    customFields.languages ?? customFields.language ?? customFields.preferredLanguage ?? customFields.preferredLanguages
  );
  const ethnicities = normalizeStringTokens(
    customFields.ethnicities ?? customFields.ethnicity ?? customFields.demographic ?? customFields.demographics
  );

  return {
    age: age === null ? undefined : age,
    languages: languages.length > 0 ? languages : undefined,
    ethnicities: ethnicities.length > 0 ? ethnicities : undefined
  };
};

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  async assign(payload: AssignPayload): Promise<RouteAssignmentResult> {
    const now = new Date();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: payload.tenantId }
    });

    const [rules, agents, consents, customFieldValues] = await Promise.all([
      this.prisma.routingRule.findMany({
        where: { tenantId: payload.tenantId, enabled: true },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
      }),
      this.prisma.user.findMany({
        where: {
          tenantId: payload.tenantId,
          role: {
            in: [UserRole.AGENT, UserRole.TEAM_LEAD]
          }
        },
        include: {
          tours: {
            where: {
              status: {
                in: ['REQUESTED', 'CONFIRMED']
              }
            },
            include: { listing: true }
          },
          memberships: true,
          agentProfilesForOrgs: true
        }
      }),
      this.prisma.consent.findMany({
        where: {
          tenantId: payload.tenantId,
          personId: payload.person.id,
          channel: {
            in: [MessageChannel.SMS, MessageChannel.EMAIL]
          }
        },
        orderBy: { capturedAt: 'desc' }
      }),
      this.prisma.customFieldValue.findMany({
        where: {
          tenantId: payload.tenantId,
          personId: payload.person.id
        },
        include: { field: { select: { key: true } } },
        orderBy: { updatedAt: 'desc' }
      })
    ]);

    const consentState = consentStateFromConsents(consents);
    const listingContext = toListingContext(payload);
    const quietHours = this.isQuietHours(now, tenant);

    const customFields = buildCustomFieldsMap(customFieldValues as unknown as CustomFieldValueRow[]);
    const demographics = extractConventionalDemographics(customFields);

    const context: LeadRoutingContext = {
      now,
      tenantTimezone: tenant.timezone ?? 'America/New_York',
      person: {
        source: payload.person.source,
        buyerRepStatus: payload.person.buyerRepStatus,
        tags: payload.person.tags ?? [],
        age: demographics.age ?? null,
        languages: demographics.languages ?? null,
        ethnicities: demographics.ethnicities ?? null,
        customFields,
        consent: consentState
      },
      listing: listingContext
    };

    const agentSnapshots = await this.buildCandidateSnapshots({
      tenantId: payload.tenantId,
      orgId: tenant.organizationId ?? null,
      leadType: (payload.person as any)?.leadType ?? null,
      agents,
      listing: listingContext,
      hasConsent: consentState.sms === 'GRANTED' || consentState.email === 'GRANTED',
      tenDlcReady: tenant.tenDlcReady
    });

    const teamMembers = this.buildTeamMembershipIndex(agentSnapshots);
    const reasonCodes: string[] = [];

    for (const rule of rules) {
      const parsed = this.parseRule(rule);
      if (!parsed) {
        reasonCodes.push('RULE_PARSE_FAILED');
        continue;
      }

      const evaluation = evaluateLeadRoutingConditions(parsed.conditions, context);
      if (!evaluation.matched) {
        continue;
      }

      const outcome = await this.applyRule({
        rule,
        evaluation,
        agentSnapshots,
        teamMembers,
        fallback: parsed.fallback,
        listing: listingContext,
        quietHours,
        now
      });

      if (!outcome) {
        continue;
      }

      const response = await this.finalizeDecision({
        payload,
        outcome,
        rule,
        evaluation,
        quietHours,
        context,
        now
      });

      return response;
    }

    return this.recordNoMatch({
      payload,
      quietHours,
      context,
      now,
      reasonCodes: reasonCodes.length ? reasonCodes : ['NO_RULE_MATCH']
    });
  }

  async listRules(tenantId: string, query: RoutingRulesQueryDto) {
    const take = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const rules = await this.prisma.routingRule.findMany({
      where: {
        tenantId,
        ...(query.q
          ? {
              name: {
                contains: query.q,
                mode: 'insensitive'
              }
            }
          : {}),
        ...(query.mode ? { mode: query.mode as RoutingMode } : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor }
          }
        : {})
    });

    let nextCursor: string | null = null;
    if (rules.length > take) {
      const next = rules.pop();
      nextCursor = next?.id ?? null;
    }

    return {
      items: rules.map((rule) => this.toRoutingRuleDto(rule)),
      nextCursor
    };
  }

  async createRule(
    tenantId: string,
    userId: string,
    input: {
      name: string;
      priority: number;
      mode: RoutingMode;
      enabled?: boolean;
      conditions?: unknown;
      targets: unknown;
      fallback?: unknown;
      slaFirstTouchMinutes?: number;
      slaKeptAppointmentMinutes?: number;
    }
  ) {
    const parsed = this.parseRuleConfig(input.conditions, input.targets, input.fallback);
    assertJsonSafe(parsed.conditions, 'routingRule.conditions');
    assertJsonSafe(parsed.targets, 'routingRule.targets');
    assertJsonSafe(parsed.fallback, 'routingRule.fallback');
    const rule = await this.prisma.routingRule.create({
      data: {
        tenantId,
        name: input.name,
        priority: input.priority,
        mode: input.mode,
        enabled: input.enabled ?? true,
        conditions: toJsonValue(parsed.conditions),
        targets: toJsonValue(parsed.targets),
        fallback: toNullableJson(parsed.fallback),
        slaFirstTouchMinutes: input.slaFirstTouchMinutes ?? null,
        slaKeptAppointmentMinutes: input.slaKeptAppointmentMinutes ?? null,
        createdById: userId
      }
    });

    return this.toRoutingRuleDto(rule);
  }

  async updateRule(
    id: string,
    tenantId: string,
    input: {
      name?: string;
      priority?: number;
      mode?: RoutingMode;
      enabled?: boolean;
      conditions?: unknown;
      targets?: unknown;
      fallback?: unknown;
      slaFirstTouchMinutes?: number | null;
      slaKeptAppointmentMinutes?: number | null;
    }
  ) {
    const rule = await this.prisma.routingRule.findFirst({
      where: { id, tenantId }
    });
    if (!rule) {
      throw new Error('Routing rule not found');
    }

    const parsed = this.parseRuleConfig(
      input.conditions ?? rule.conditions,
      input.targets ?? rule.targets,
      input.fallback ?? rule.fallback
    );
    assertJsonSafe(parsed.conditions, 'routingRule.conditions');
    assertJsonSafe(parsed.targets, 'routingRule.targets');
    assertJsonSafe(parsed.fallback, 'routingRule.fallback');

    const updated = await this.prisma.routingRule.update({
      where: { id },
      data: {
        name: input.name ?? rule.name,
        priority: input.priority ?? rule.priority,
        mode: input.mode ?? rule.mode,
        enabled: input.enabled ?? rule.enabled,
        conditions: toJsonValue(parsed.conditions),
        targets: toJsonValue(parsed.targets),
        fallback: toNullableJson(parsed.fallback),
        slaFirstTouchMinutes:
          input.slaFirstTouchMinutes !== undefined ? input.slaFirstTouchMinutes : rule.slaFirstTouchMinutes,
        slaKeptAppointmentMinutes:
          input.slaKeptAppointmentMinutes !== undefined ? input.slaKeptAppointmentMinutes : rule.slaKeptAppointmentMinutes
      }
    });

    return this.toRoutingRuleDto(updated);
  }

  async deleteRule(id: string, tenantId: string) {
    await this.prisma.routingRule.deleteMany({
      where: { id, tenantId }
    });
    return { id };
  }

  private toRoutingRuleDto(rule: Prisma.RoutingRuleGetPayload<Record<string, never>>) {
    const conditions = this.safeParse(leadRoutingConditionsSchema, rule.conditions) ?? null;
    const targets = (this.safeParse(leadRoutingTargetSchema.array(), rule.targets) ?? []) as
      | Record<string, unknown>[]
      | undefined;
    const fallback = this.safeParse(leadRoutingFallbackSchema, rule.fallback) ?? null;

    return {
      id: rule.id,
      tenantId: rule.tenantId,
      name: rule.name,
      priority: rule.priority,
      mode: rule.mode,
      enabled: rule.enabled,
      conditions,
      targets: targets ?? [],
      fallback,
      slaFirstTouchMinutes: rule.slaFirstTouchMinutes,
      slaKeptAppointmentMinutes: rule.slaKeptAppointmentMinutes,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString()
    };
  }

  async getCapacityView(tenantId: string) {
    const agents = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: [UserRole.AGENT, UserRole.TEAM_LEAD] }
      },
      include: {
        tours: {
          where: {
            status: {
              in: ['REQUESTED', 'CONFIRMED']
            }
          },
          include: { listing: true }
        },
        memberships: true,
        agentProfilesForOrgs: true
      }
    });

    const snapshots = await this.buildCandidateSnapshots({
      tenantId,
      orgId: null,
      leadType: null,
      agents,
      listing: undefined,
      hasConsent: true,
      tenDlcReady: true
    });

    return Array.from(snapshots.values()).map((candidate) => ({
      agentId: candidate.snapshot.userId,
      name: candidate.snapshot.fullName,
      activePipeline: candidate.snapshot.activePipeline,
      capacityTarget: candidate.snapshot.capacityTarget,
      capacityRemaining: candidate.capacityRemaining,
      keptApptRate: candidate.snapshot.keptApptRate,
      teamIds: candidate.teamIds
    }));
  }

  async listRouteEvents(tenantId: string, options: { limit?: number; cursor?: string } = {}) {
    const take = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const events = await this.prisma.leadRouteEvent.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(options.cursor
        ? {
            skip: 1,
            cursor: { id: options.cursor }
          }
        : {})
    });

    let nextCursor: string | null = null;
    if (events.length > take) {
      const next = events.pop();
      nextCursor = next?.id ?? null;
    }

    const items = events.map((event) => {
      const payload =
        ((event as any).payload ?? (event as any).data ?? {}) as Record<string, unknown>;
      return {
        id: event.id,
        tenantId: event.tenantId,
        leadId: event.leadId,
        ruleId: event.matchedRuleId ?? null,
        eventType: this.resolveRouteEventType(event),
        payload,
        createdAt: event.createdAt.toISOString()
      };
    });

    return { items, nextCursor };
  }

  private resolveRouteEventType(event: LeadRouteEvent): string {
    if (event.slaBreachedAt) {
      return 'lead-routing.sla.breached';
    }
    if (event.slaSatisfiedAt) {
      return 'lead-routing.sla.satisfied';
    }
    return 'lead-routing.assigned';
  }

  async getSlaDashboard(tenantId: string) {
    const timers = await this.prisma.leadSlaTimer.findMany({
      where: { tenantId },
      orderBy: { dueAt: 'asc' },
      take: 100
    });

    const summary = timers.reduce(
      (acc, timer) => {
        acc.total += 1;
        if (timer.status === 'PENDING') acc.pending += 1;
        if (timer.status === 'BREACHED') acc.breached += 1;
        if (timer.status === 'SATISFIED') acc.satisfied += 1;
        return acc;
      },
      { total: 0, pending: 0, breached: 0, satisfied: 0 }
    );

    return {
      summary,
      timers: timers.map((timer) => ({
        ...timer,
        dueAt: timer.dueAt.toISOString(),
        satisfiedAt: timer.satisfiedAt?.toISOString() ?? null,
        breachedAt: timer.breachedAt?.toISOString() ?? null,
        createdAt: timer.createdAt.toISOString(),
        updatedAt: timer.updatedAt.toISOString()
      }))
    };
  }

  async processSlaTimers(tenantId?: string) {
    const now = new Date();
    const timers = await this.prisma.leadSlaTimer.findMany({
      where: {
        status: 'PENDING',
        dueAt: { lte: now },
        ...(tenantId ? { tenantId } : {})
      },
      include: {
        rule: true
      }
    });

    for (const timer of timers) {
      await this.handleSlaBreach(timer, now);
    }

    return {
      processed: timers.length
    };
  }

  async recordFirstTouch(params: { tenantId: string; leadId: string; occurredAt?: Date; actorUserId?: string }) {
    const occurredAt = params.occurredAt ?? new Date();
    const timers = await this.prisma.leadSlaTimer.findMany({
      where: {
        tenantId: params.tenantId,
        leadId: params.leadId,
        type: LeadSlaType.FIRST_TOUCH,
        status: 'PENDING'
      }
    });

    if (timers.length === 0) return { updated: 0 };

    await this.prisma.$transaction(
      timers.map((timer) =>
        this.prisma.leadSlaTimer.update({
          where: { id: timer.id },
          data: {
            status: 'SATISFIED',
            satisfiedAt: occurredAt
          }
        })
      )
    );

    await this.prisma.leadRouteEvent.updateMany({
      where: {
        tenantId: params.tenantId,
        leadId: params.leadId
      },
      data: {
        slaSatisfiedAt: occurredAt,
        reasonCodes: ['FIRST_TOUCH_SATISFIED'] as Prisma.JsonArray
      }
    });

    await this.outbox.enqueue({
      tenantId: params.tenantId,
      eventType: 'lead-routing.sla.satisfied',
      occurredAt: occurredAt.toISOString(),
      resource: {
        id: params.leadId,
        type: 'lead'
      },
      data: {
        leadId: params.leadId,
        type: 'FIRST_TOUCH',
        timerIds: timers.map((timer) => timer.id)
      }
    });

    return { updated: timers.length };
  }

  async recordKeptAppointment(params: { tenantId: string; leadId: string; occurredAt?: Date; actorUserId?: string }) {
    const occurredAt = params.occurredAt ?? new Date();
    const timers = await this.prisma.leadSlaTimer.findMany({
      where: {
        tenantId: params.tenantId,
        leadId: params.leadId,
        type: LeadSlaType.KEPT_APPOINTMENT,
        status: 'PENDING'
      }
    });

    if (timers.length === 0) {
      return { updated: 0 };
    }

    await this.prisma.$transaction(
      timers.map((timer) =>
        this.prisma.leadSlaTimer.update({
          where: { id: timer.id },
          data: {
            status: 'SATISFIED',
            satisfiedAt: occurredAt
          }
        })
      )
    );

    await this.prisma.leadRouteEvent.updateMany({
      where: {
        tenantId: params.tenantId,
        leadId: params.leadId
      },
      data: {
        reasonCodes: ['KEPT_APPOINTMENT_SATISFIED'] as Prisma.JsonArray
      }
    });

    await this.outbox.enqueue({
      tenantId: params.tenantId,
      eventType: 'lead-routing.sla.satisfied',
      occurredAt: occurredAt.toISOString(),
      resource: {
        id: params.leadId,
        type: 'lead'
      },
      data: {
        leadId: params.leadId,
        type: 'KEPT_APPOINTMENT',
        timerIds: timers.map((timer) => timer.id)
      }
    });

    return { updated: timers.length };
  }

  async getMetrics(tenantId: string) {
    const firstTouchTimers = await this.prisma.leadSlaTimer.findMany({
      where: {
        tenantId,
        type: LeadSlaType.FIRST_TOUCH,
        status: { in: ['SATISFIED', 'BREACHED'] }
      }
    });

    const keptTimers = await this.prisma.leadSlaTimer.findMany({
      where: {
        tenantId,
        type: LeadSlaType.KEPT_APPOINTMENT
      }
    });

    const timeToFirstTouch = this.computeAverageTime(firstTouchTimers);
    const breachPct = this.computeBreachPercentage(firstTouchTimers, keptTimers);
    const ruleMetrics = await this.computeRuleMetrics(tenantId);
    const agentMetrics = await this.computeAgentMetrics(tenantId);

    return {
      firstTouch: timeToFirstTouch,
      breach: breachPct,
      rules: ruleMetrics,
      agents: agentMetrics
    };
  }

  private computeAverageTime(timers: Prisma.LeadSlaTimerGetPayload<Record<string, never>>[]) {
    const satisfied = timers.filter((timer) => timer.status === 'SATISFIED' && timer.satisfiedAt);
    if (satisfied.length === 0) {
      return {
        count: 0,
        averageMinutes: null
      };
    }

    const totalMinutes = satisfied.reduce((acc, timer) => {
      if (!timer.satisfiedAt) return acc;
      const diff = (timer.satisfiedAt.getTime() - timer.createdAt.getTime()) / MINUTES;
      return acc + diff;
    }, 0);

    return {
      count: satisfied.length,
      averageMinutes: Number((totalMinutes / satisfied.length).toFixed(1))
    };
  }

  private computeBreachPercentage(
    firstTouchTimers: Prisma.LeadSlaTimerGetPayload<Record<string, never>>[],
    keptTimers: Prisma.LeadSlaTimerGetPayload<Record<string, never>>[]
  ) {
    const summarize = (timers: Prisma.LeadSlaTimerGetPayload<Record<string, never>>[]) => {
      if (timers.length === 0) {
        return { total: 0, breached: 0, percentage: 0 };
      }
      const breached = timers.filter((timer) => timer.status === 'BREACHED').length;
      return {
        total: timers.length,
        breached,
        percentage: Number(((breached / timers.length) * 100).toFixed(1))
      };
    };

    return {
      firstTouch: summarize(firstTouchTimers),
      keptAppointment: summarize(keptTimers)
    };
  }

  private async computeRuleMetrics(tenantId: string) {
    const timers = await this.prisma.leadSlaTimer.groupBy({
      by: ['ruleId', 'type', 'status'],
      where: {
        tenantId,
        type: LeadSlaType.KEPT_APPOINTMENT
      },
      _count: { _all: true }
    });

    const rules = await this.prisma.routingRule.findMany({
      where: { tenantId },
      select: { id: true, name: true }
    });
    const ruleNameById = new Map(rules.map((rule) => [rule.id, rule.name]));

    const aggregates = timers.reduce<Record<string, { total: number; satisfied: number }>>((acc, entry) => {
      if (!entry.ruleId) return acc;
      const key = entry.ruleId;
      const current = acc[key] ?? { total: 0, satisfied: 0 };
      current.total += entry._count._all;
      if (entry.status === 'SATISFIED') current.satisfied += entry._count._all;
      acc[key] = current;
      return acc;
    }, {});

    return Object.entries(aggregates).map(([ruleId, data]) => ({
      ruleId,
      ruleName: ruleNameById.get(ruleId) ?? 'Unknown Rule',
      total: data.total,
      keptRate: data.total === 0 ? 0 : Number(((data.satisfied / data.total) * 100).toFixed(1))
    }));
  }

  private async computeAgentMetrics(tenantId: string) {
    const timers = await this.prisma.leadSlaTimer.groupBy({
      by: ['assignedAgentId', 'status'],
      where: {
        tenantId,
        type: LeadSlaType.KEPT_APPOINTMENT
      },
      _count: { _all: true }
    });

    const agentIds = timers.map((entry) => entry.assignedAgentId).filter(Boolean) as string[];
    const agents = agentIds.length
      ? await this.prisma.user.findMany({
          where: { tenantId, id: { in: agentIds } },
          select: { id: true, firstName: true, lastName: true }
        })
      : [];
    const agentNameById = new Map(agents.map((agent) => [agent.id, `${agent.firstName} ${agent.lastName}`.trim()]));

    const aggregates = timers.reduce<Record<string, { total: number; satisfied: number }>>((acc, entry) => {
      if (!entry.assignedAgentId) return acc;
      const current = acc[entry.assignedAgentId] ?? { total: 0, satisfied: 0 };
      current.total += entry._count._all;
      if (entry.status === 'SATISFIED') current.satisfied += entry._count._all;
      acc[entry.assignedAgentId] = current;
      return acc;
    }, {});

    return Object.entries(aggregates).map(([agentId, data]) => ({
      agentId,
      agentName: agentNameById.get(agentId) ?? 'Unknown Agent',
      total: data.total,
      keptRate: data.total === 0 ? 0 : Number(((data.satisfied / data.total) * 100).toFixed(1))
    }));
  }

  private async handleSlaBreach(
    timer: Prisma.LeadSlaTimerGetPayload<{
      include: { rule: true };
    }>,
    now: Date
  ) {
    await this.prisma.leadSlaTimer.update({
      where: { id: timer.id },
      data: {
        status: 'BREACHED',
        breachedAt: now
      }
    });

    await this.prisma.leadRouteEvent.updateMany({
      where: {
        tenantId: timer.tenantId,
        leadId: timer.leadId,
        matchedRuleId: timer.ruleId ?? undefined
      },
      data: {
        slaBreachedAt: now,
        reasonCodes: [
          timer.type === LeadSlaType.FIRST_TOUCH ? 'FIRST_TOUCH_BREACHED' : 'KEPT_APPOINTMENT_BREACHED'
        ] as Prisma.JsonArray
      }
    });

    const fallbackTeamId = this.extractFallbackTeamId(timer.rule);
    if (fallbackTeamId) {
      await this.prisma.assignment.create({
        data: {
          tenantId: timer.tenantId,
          personId: timer.leadId,
          teamId: fallbackTeamId,
          score: 0,
          reasons: {
            create: [
              {
                type: 'TEAM_POND',
                weight: 1,
                notes: 'SLA breached — routed to pond fallback'
              }
            ]
          }
        }
      });
    }

    await this.outbox.enqueue({
      tenantId: timer.tenantId,
      eventType: 'lead-routing.sla.breached',
      occurredAt: now.toISOString(),
      resource: {
        id: timer.leadId,
        type: 'lead'
      },
      data: {
        timerId: timer.id,
        type: timer.type,
        ruleId: timer.ruleId,
        fallbackTeamId
      }
    });
  }

  private extractFallbackTeamId(rule: Prisma.RoutingRuleGetPayload<Record<string, never>> | null) {
    if (!rule?.fallback) return null;
    const parsed = this.safeParse(leadRoutingFallbackSchema, rule.fallback);
    return parsed?.teamId ?? null;
  }

  private async finalizeDecision(params: {
    payload: AssignPayload;
    outcome: {
      selectedAgent?: AgentScore;
      assignedAgentId?: string;
      assignedTeamId?: string;
      fallbackTeamId?: string;
      usedFallback: boolean;
      candidates: RoutingDecisionCandidate[];
      candidateSnapshots: CandidateSnapshot[];
      reasonCodes: string[];
    };
    rule: Prisma.RoutingRuleGetPayload<Record<string, never>>;
    evaluation: LeadRoutingEvaluationResult;
    quietHours: boolean;
    context: LeadRoutingContext;
    now: Date;
  }): Promise<RouteAssignmentResult> {
    const { payload, outcome, rule, evaluation, quietHours, context, now } = params;
    const approvalPoolTeamId = payload.approvalPoolTeamId?.trim() || null;
    const queueForApproval = Boolean(approvalPoolTeamId);

    const assignedAgentId = queueForApproval ? undefined : outcome.assignedAgentId;
    const assignedTeamId = queueForApproval ? undefined : outcome.assignedTeamId;
    const fallbackTeamId = queueForApproval ? approvalPoolTeamId ?? undefined : outcome.fallbackTeamId;
    const fallbackUsed = queueForApproval ? true : outcome.usedFallback;

    const assignmentReasons = outcome.selectedAgent
      ? this.toAssignmentReasons(outcome.selectedAgent.reasons)
      : [
          {
            type: 'CAPACITY',
            description: 'No agent selected',
            weight: 0
          }
        ];

    const timersToCreate = this.prepareSlaTimers({
      rule,
      tenantId: payload.tenantId,
      leadId: payload.person.id,
      assignedAgentId,
      now
    });

    const eventPayload = {
      rule: {
        id: rule.id,
        name: rule.name,
        priority: rule.priority,
        mode: rule.mode
      },
      context: {
        source: context.person.source,
        buyerRepStatus: context.person.buyerRepStatus,
        listing: context.listing,
        quietHours
      },
      evaluation
    };

    const eventCandidates = outcome.candidates.map((candidate) => ({
      agentId: candidate.agentId,
      fullName: candidate.fullName,
      status: candidate.status,
      score: candidate.score,
      reasons: candidate.reasons,
      capacityRemaining: candidate.capacityRemaining,
      consentReady: candidate.consentReady,
      tenDlcReady: candidate.tenDlcReady,
      teamIds: candidate.teamIds
    }));

    assertJsonSafe(eventPayload, 'leadRouteEvent.payload');
    assertJsonSafe(eventCandidates, 'leadRouteEvent.candidates');
    assertJsonSafe(outcome.reasonCodes, 'leadRouteEvent.reasonCodes');

    const slaDueAt = timersToCreate.firstTouch?.dueAt ?? null;

    const event = await this.prisma.$transaction(async (tx) => {
      if (assignedAgentId) {
        const primaryTeamId =
          outcome.candidateSnapshots
            .find((candidate) => candidate.snapshot.userId === assignedAgentId)
            ?.teamIds?.[0] ?? null;

        await tx.assignment.create({
          data: {
            tenantId: payload.tenantId,
            personId: payload.person.id,
            agentId: assignedAgentId,
            teamId: assignedTeamId ?? primaryTeamId,
            score: outcome.selectedAgent?.score ?? 0,
            reasons: {
              create: assignmentReasons.map((reason) => ({
                type: reason.type as AssignmentReasonType,
                weight: reason.weight,
                notes: reason.description
              }))
            }
          }
        });
      } else if (fallbackTeamId) {
        await tx.assignment.create({
          data: {
            tenantId: payload.tenantId,
            personId: payload.person.id,
            teamId: fallbackTeamId,
            score: outcome.selectedAgent?.score ?? 0,
            reasons: {
              create: [
                ...assignmentReasons.map((reason) => ({
                  type: reason.type as AssignmentReasonType,
                  weight: reason.weight,
                  notes: reason.description
                })),
                {
                  type: 'TEAM_POND',
                  weight: 1,
                  notes: queueForApproval ? 'Broker approval pool' : 'Fallback pond assignment'
                }
              ]
            }
          }
        });
      }

      if (timersToCreate.records.length > 0) {
        await tx.leadSlaTimer.createMany({
          data: timersToCreate.records
        });
      }

      return tx.leadRouteEvent.create({
        data: {
          tenantId: payload.tenantId,
          leadId: payload.person.id,
          personId: payload.person.id,
          matchedRuleId: rule.id,
          mode: rule.mode,
          payload: toJsonValue(eventPayload),
          candidates: toJsonValue(eventCandidates),
          assignedAgentId: assignedAgentId ?? null,
          fallbackUsed,
          reasonCodes: toJsonValue(outcome.reasonCodes),
          slaDueAt,
          actorUserId: payload.actorUserId ?? null
        }
      });
    });

    const outboxFallbackTeamId = fallbackTeamId ?? undefined;

    await this.outbox.enqueue({
      tenantId: payload.tenantId,
      eventType: 'lead-routing.assigned',
      occurredAt: now.toISOString(),
      resource: {
        id: payload.person.id,
        type: 'lead'
      },
      data: {
        ruleId: rule.id,
        assignedAgentId,
        fallbackTeamId: outboxFallbackTeamId,
        reasonCodes: outcome.reasonCodes
      }
    });

    let selectedAgents = outcome.selectedAgent ? [outcome.selectedAgent] : [];
    if (outcome.selectedAgent && assignedAgentId) {
      const candidate = outcome.candidateSnapshots.find((entry) => entry.snapshot.userId === assignedAgentId);
      if (candidate) {
        selectedAgents = [await this.attachApiReason(outcome.selectedAgent, candidate)];
      }
    }

    return {
      leadId: payload.person.id,
      tenantId: payload.tenantId,
      selectedAgents,
      fallbackTeamId: outboxFallbackTeamId,
      usedFallback: fallbackUsed,
      quietHours,
      ruleId: rule.id,
      ruleName: rule.name,
      eventId: event.id,
      candidates: outcome.candidates,
      evaluation,
      reasonCodes: outcome.reasonCodes
    };
  }

  private toAssignmentReasons(reasons: AgentScore['reasons']): AgentScore['reasons'] {
    const allowed = new Set([
      'CAPACITY',
      'PERFORMANCE',
      'GEOGRAPHY',
      'PRICE_BAND',
      'CONSENT',
      'TEN_DLC',
      'ROUND_ROBIN',
      'TEAM_POND'
    ]);
    return reasons.filter((reason) => allowed.has(String(reason.type)) && reason.weight > 0);
  }

  private async attachApiReason(score: AgentScore, candidate: CandidateSnapshot): Promise<AgentScore> {
    const agentProfile =
      (candidate.agent.agentProfilesForOrgs ?? []).find(
        (profile: any) => profile.organizationId === candidate.agent.organizationId
      ) ?? (candidate.agent.agentProfilesForOrgs ?? [])[0] ?? null;

    const agentProfileId = agentProfile?.id ?? null;
    const performanceLatestModel = (this.prisma as any).agentPerformanceLatest;

    if (!agentProfileId || typeof performanceLatestModel?.findFirst !== 'function') {
      return score;
    }

    try {
      const latest = await performanceLatestModel.findFirst({
        where: {
          organizationId: candidate.agent.organizationId,
          agentProfileId,
          modelVersion: 'API_v1'
        },
        include: {
          snapshot: {
            select: {
              overallScore: true,
              confidenceBand: true,
              responsivenessReliabilityScore: true,
              capacityLoadScore: true,
              riskDragPenalty: true
            }
          }
        }
      });

      const snapshot = latest?.snapshot ?? null;
      if (!snapshot) {
        return {
          ...score,
          reasons: [
            ...score.reasons,
            {
              type: 'PERFORMANCE' as const,
              description: 'API_v1: No performance snapshot yet',
              weight: 0
            } as any
          ]
        };
      }

      const fit =
        ((candidate.snapshot.geographyFit ?? 0.7) +
          (candidate.snapshot.priceBandFit ?? 0.7) +
          (candidate.snapshot.leadTypeFit ?? 0.75)) /
        3;

      const overallPct = Math.round(Number(snapshot.overallScore ?? 0) * 100);
      const band = String(snapshot.confidenceBand ?? 'DEVELOPING');
      const respPct = Math.round(Number(snapshot.responsivenessReliabilityScore ?? 0) * 100);
      const capPct = Math.round(Number(snapshot.capacityLoadScore ?? 0) * 100);
      const fitPct = Math.round(fit * 100);
      const riskPenalty = Number(snapshot.riskDragPenalty ?? 0);

      const apiReason = {
        type: 'PERFORMANCE' as const,
        description: `API_v1 ${overallPct} (${band}) · Fit ${fitPct}% · Resp ${respPct}% · Capacity ${capPct}% · Risk drag ${Math.round(
          riskPenalty * 100
        )}pts`,
        weight: 0
      };

      return {
        ...score,
        reasons: [...score.reasons, apiReason as any]
      };
    } catch {
      return score;
    }
  }

  private prepareSlaTimers(params: {
    rule: Prisma.RoutingRuleGetPayload<Record<string, never>>;
    tenantId: string;
    leadId: string;
    assignedAgentId?: string;
    now: Date;
  }) {
    const records: Prisma.LeadSlaTimerCreateManyInput[] = [];
    let firstTouch: { dueAt: Date } | undefined;

    if (params.rule.slaFirstTouchMinutes) {
      const dueAt = minutesFromNow(params.rule.slaFirstTouchMinutes, params.now);
      records.push({
        tenantId: params.tenantId,
        leadId: params.leadId,
        assignedAgentId: params.assignedAgentId ?? null,
        ruleId: params.rule.id,
        type: LeadSlaType.FIRST_TOUCH,
        status: 'PENDING',
        dueAt
      });
      firstTouch = { dueAt };
    }

    if (params.rule.slaKeptAppointmentMinutes) {
      const dueAt = minutesFromNow(params.rule.slaKeptAppointmentMinutes, params.now);
      records.push({
        tenantId: params.tenantId,
        leadId: params.leadId,
        assignedAgentId: params.assignedAgentId ?? null,
        ruleId: params.rule.id,
        type: LeadSlaType.KEPT_APPOINTMENT,
        status: 'PENDING',
        dueAt
      });
    }

    return {
      records,
      firstTouch
    };
  }

  private async recordNoMatch(params: {
    payload: AssignPayload;
    quietHours: boolean;
    context: LeadRoutingContext;
    now: Date;
    reasonCodes: string[];
  }): Promise<RouteAssignmentResult> {
    const approvalPoolTeamId = params.payload.approvalPoolTeamId?.trim() || null;
    const payload = {
      context: {
        source: params.context.person.source,
        buyerRepStatus: params.context.person.buyerRepStatus,
        listing: params.context.listing,
        quietHours: params.quietHours
      },
      evaluation: null
    };

    assertJsonSafe(payload, 'leadRouteEvent.payload');
    assertJsonSafe(params.reasonCodes, 'leadRouteEvent.reasonCodes');

    const event = await this.prisma.$transaction(async (tx) => {
      if (approvalPoolTeamId) {
        await tx.assignment.create({
          data: {
            tenantId: params.payload.tenantId,
            personId: params.payload.person.id,
            teamId: approvalPoolTeamId,
            score: 0,
            reasons: {
              create: [
                {
                  type: 'TEAM_POND',
                  weight: 1,
                  notes: 'Broker approval pool'
                }
              ]
            }
          }
        });
      }

      return tx.leadRouteEvent.create({
        data: {
          tenantId: params.payload.tenantId,
          leadId: params.payload.person.id,
          personId: params.payload.person.id,
          matchedRuleId: null,
          mode: RoutingMode.FIRST_MATCH,
          payload: toJsonValue(payload),
          candidates: toJsonValue([]),
          assignedAgentId: null,
          fallbackUsed: true,
          reasonCodes: toJsonValue(params.reasonCodes),
          actorUserId: params.payload.actorUserId ?? null
        }
      });
    });

    return {
      leadId: params.payload.person.id,
      tenantId: params.payload.tenantId,
      selectedAgents: [],
      fallbackTeamId: approvalPoolTeamId ?? undefined,
      usedFallback: true,
      quietHours: params.quietHours,
      ruleId: undefined,
      ruleName: undefined,
      eventId: event.id,
      candidates: [],
      evaluation: { matched: false, checks: [] },
      reasonCodes: params.reasonCodes
    };
  }

  private parseRule(rule: Prisma.RoutingRuleGetPayload<Record<string, never>>): LeadRoutingRuleConfig | null {
    try {
      const config = leadRoutingRuleConfigSchema.parse({
        conditions: rule.conditions ?? {},
        targets: rule.targets ?? [],
        fallback: rule.fallback == null ? undefined : rule.fallback
      });
      return config;
    } catch (error) {
      this.logger.error(`Failed to parse routing rule ${rule.id}`, error as Error);
      return null;
    }
  }

  private parseRuleConfig(conditions: unknown, targets: unknown, fallback: unknown) {
    return leadRoutingRuleConfigSchema.parse({
      conditions: conditions ?? {},
      targets: targets ?? [],
      fallback: fallback == null ? undefined : fallback
    }) as LeadRoutingRuleConfig;
  }

  private buildTeamMembershipIndex(agentSnapshots: Map<string, CandidateSnapshot>) {
    const teamMembers = new Map<string, CandidateSnapshot[]>();
    for (const candidate of agentSnapshots.values()) {
      for (const teamId of candidate.teamIds) {
        const current = teamMembers.get(teamId) ?? [];
        current.push(candidate);
        teamMembers.set(teamId, current);
      }
    }
    return teamMembers;
  }

  private normalizeTeamRoles(includeRoles?: string[] | null) {
    if (!includeRoles || includeRoles.length === 0) return [];
    return Array.from(
      new Set(
        includeRoles
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }

  private candidateMatchesTeamRoles(candidate: CandidateSnapshot, teamId: string, includeRoles?: string[] | null) {
    const allowed = this.normalizeTeamRoles(includeRoles);
    if (allowed.length === 0) return true;
    const membership = candidate.agent.memberships?.find((entry) => entry.teamId === teamId);
    const role = membership?.role?.trim().toLowerCase() ?? 'member';
    return allowed.includes(role);
  }

  private filterTeamTargetMembers(teamId: string, members: CandidateSnapshot[], includeRoles?: string[] | null) {
    const allowed = this.normalizeTeamRoles(includeRoles);
    if (allowed.length === 0) {
      return members;
    }
    return members.filter((candidate) => this.candidateMatchesTeamRoles(candidate, teamId, allowed));
  }

  private membershipCreatedAt(candidate: CandidateSnapshot, teamId: string): number {
    const membership = candidate.agent.memberships?.find((entry) => entry.teamId === teamId);
    if (!membership?.createdAt) return Number.POSITIVE_INFINITY;
    return membership.createdAt.getTime();
  }

  private async pickRoundRobinCandidate(tenantId: string, teamId: string, candidates: CandidateSnapshot[]) {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const ordered = [...candidates].sort((a, b) => {
      const aCreated = this.membershipCreatedAt(a, teamId);
      const bCreated = this.membershipCreatedAt(b, teamId);
      if (aCreated !== bCreated) return aCreated - bCreated;
      return a.snapshot.userId.localeCompare(b.snapshot.userId);
    });

    const last = await this.prisma.assignment.findFirst({
      where: {
        tenantId,
        teamId,
        agentId: { not: null }
      },
      orderBy: { assignedAt: 'desc' },
      select: { agentId: true }
    });

    const lastAgentId = last?.agentId ?? null;
    const startIndex = lastAgentId ? ordered.findIndex((candidate) => candidate.snapshot.userId === lastAgentId) + 1 : 0;

    for (let offset = 0; offset < ordered.length; offset += 1) {
      const idx = (startIndex + offset) % ordered.length;
      const candidate = ordered[idx];
      if (candidate) return candidate;
    }

    return ordered[0] ?? null;
  }

  private evaluateStringSetFilter(
    label: string,
    filter: { include?: string[]; exclude?: string[]; match?: 'ANY' | 'ALL' },
    values: string[]
  ) {
    const reasons: string[] = [];
    const include = normalizeLowerUnique(filter.include ?? []);
    const exclude = normalizeLowerUnique(filter.exclude ?? []);
    const mode = filter.match ?? 'ANY';

    const excludedHit = exclude.find((item) => values.includes(item));
    if (excludedHit) {
      reasons.push(`${label} ${excludedHit} excluded`);
      return reasons;
    }

    if (include.length > 0) {
      const matched = mode === 'ALL'
        ? include.every((item) => values.includes(item))
        : include.some((item) => values.includes(item));

      if (!matched) {
        reasons.push(`${label} missing required (${mode}) values: ${include.join(', ')}`);
      }
    }

    return reasons;
  }

  private evaluateAgentFilter(candidate: CandidateSnapshot, filter?: LeadRoutingAgentFilter | null) {
    if (!filter) return [];

    const reasons: string[] = [];
    if (filter.tags) {
      reasons.push(...this.evaluateStringSetFilter('Tag', filter.tags, candidate.attributes.tags));
    }
    if (filter.languages) {
      reasons.push(...this.evaluateStringSetFilter('Language', filter.languages, candidate.attributes.languages));
    }
    if (filter.specialties) {
      reasons.push(...this.evaluateStringSetFilter('Specialty', filter.specialties, candidate.attributes.specialties));
    }

    if (filter.minKeptApptRate !== undefined && candidate.snapshot.keptApptRate < filter.minKeptApptRate) {
      reasons.push(
        `Kept appointment rate ${(candidate.snapshot.keptApptRate * 100).toFixed(0)}% below ${(filter.minKeptApptRate * 100).toFixed(0)}%`
      );
    }

    if (filter.minCapacityRemaining !== undefined && candidate.capacityRemaining < filter.minCapacityRemaining) {
      reasons.push(`Capacity remaining ${candidate.capacityRemaining} below ${filter.minCapacityRemaining}`);
    }

    return reasons;
  }

  private async applyRule(params: {
    rule: Prisma.RoutingRuleGetPayload<Record<string, never>>;
    evaluation: LeadRoutingEvaluationResult;
    agentSnapshots: Map<string, CandidateSnapshot>;
    teamMembers: Map<string, CandidateSnapshot[]>;
    fallback?: LeadRoutingFallback;
    listing?: LeadRoutingListingContext;
    quietHours: boolean;
    now: Date;
  }) {
    if (params.rule.mode === RoutingMode.FIRST_MATCH) {
      return this.applyFirstMatchRule({
        rule: params.rule,
        agentSnapshots: params.agentSnapshots,
        teamMembers: params.teamMembers,
        fallback: params.fallback,
        listing: params.listing,
        quietHours: params.quietHours
      });
    }

    return this.applyScoreAndAssignRule({
      rule: params.rule,
      agentSnapshots: params.agentSnapshots,
      teamMembers: params.teamMembers,
      fallback: params.fallback,
      listing: params.listing,
      quietHours: params.quietHours,
      now: params.now
    });
  }

  private async applyFirstMatchRule(params: {
    rule: Prisma.RoutingRuleGetPayload<Record<string, never>>;
    agentSnapshots: Map<string, CandidateSnapshot>;
    teamMembers: Map<string, CandidateSnapshot[]>;
    fallback?: LeadRoutingFallback;
    listing?: LeadRoutingListingContext;
    quietHours: boolean;
  }) {
    const reasonCodes = ['RULE_MATCHED'];
    const targets = this.safeParse(leadRoutingTargetSchema.array(), params.rule.targets) ?? [];
    const relaxAgentFilters = params.fallback?.relaxAgentFilters ?? false;
    const considered = new Map<string, CandidateSnapshot>();
    const eligibility = new Map<string, { eligible: boolean; reasons: Set<string> }>();

    const recordEligibility = (candidate: CandidateSnapshot, filter?: LeadRoutingAgentFilter | null) => {
      const entry = eligibility.get(candidate.snapshot.userId) ?? { eligible: false, reasons: new Set<string>() };
      const filterReasons = this.evaluateAgentFilter(candidate, filter);
      if (filterReasons.length === 0) {
        entry.eligible = true;
      } else {
        for (const reason of filterReasons) entry.reasons.add(reason);
      }
      eligibility.set(candidate.snapshot.userId, entry);
    };

    for (const target of targets) {
      if (target.type === 'AGENT') {
        const candidate = params.agentSnapshots.get(target.id);
        if (!candidate) continue;
        considered.set(candidate.snapshot.userId, candidate);
        recordEligibility(candidate, target.agentFilter);
      }

      if (target.type === 'TEAM') {
        const members = this.filterTeamTargetMembers(
          target.id,
          params.teamMembers.get(target.id) ?? [],
          target.includeRoles
        );
        for (const member of members) {
          considered.set(member.snapshot.userId, member);
          recordEligibility(member, target.agentFilter);
        }
      }
    }

    let assigned: CandidateSnapshot | undefined;
    let assignedTeamId: string | undefined;
    let selectedScore: AgentScore | null = null;
    let fallbackTeamId = params.fallback?.teamId ?? undefined;
    let usedFallback = false;
    let relaxed = false;

    for (const target of targets) {
      if (target.type === 'AGENT') {
        const candidate = params.agentSnapshots.get(target.id);
        if (!candidate) {
          continue;
        }
        if (candidate.gatingReasons.length > 0) {
          continue;
        }
        if (this.evaluateAgentFilter(candidate, target.agentFilter).length > 0) {
          continue;
        }
        const score = this.computeScore(candidate.snapshot);
        if (!score) {
          continue;
        }
        assigned = candidate;
        selectedScore = score;
        reasonCodes.push('DIRECT_AGENT');
        break;
      }

      if (target.type === 'TEAM') {
        const members = this.filterTeamTargetMembers(
          target.id,
          params.teamMembers.get(target.id) ?? [],
          target.includeRoles
        );
        const available = members.filter(
          (candidate) =>
            candidate.gatingReasons.length === 0 &&
            this.evaluateAgentFilter(candidate, target.agentFilter).length === 0
        );
        if (available.length === 0) {
          continue;
        }

        if (target.strategy === 'ROUND_ROBIN') {
          const candidate = await this.pickRoundRobinCandidate(params.rule.tenantId, target.id, available);
          if (!candidate) continue;
          const score = this.computeScore(candidate.snapshot);
          if (!score) continue;
          assigned = candidate;
          assignedTeamId = target.id;
          selectedScore = score;
          reasonCodes.push('ROUND_ROBIN');
          break;
        }

        const scored = available
          .map((candidate) => ({
            candidate,
            score: this.computeScore(candidate.snapshot)
          }))
          .filter((entry): entry is { candidate: CandidateSnapshot; score: AgentScore } => entry.score !== null)
          .sort((a, b) => b.score.score - a.score.score);
        if (scored.length === 0) {
          continue;
        }
        assigned = scored[0].candidate;
        assignedTeamId = target.id;
        selectedScore = scored[0].score;
        reasonCodes.push('BEST_FIT');
        break;
      }

      if (target.type === 'POND') {
        fallbackTeamId = target.id;
        usedFallback = true;
        reasonCodes.push('TEAM_POND');
        break;
      }
    }

    if (!assigned && relaxAgentFilters && !usedFallback) {
      for (const target of targets) {
        if (target.type === 'AGENT') {
          const candidate = params.agentSnapshots.get(target.id);
          if (!candidate) continue;
          if (candidate.gatingReasons.length > 0) continue;
          const score = this.computeScore(candidate.snapshot);
          if (!score) continue;
          assigned = candidate;
          selectedScore = score;
          reasonCodes.push('DIRECT_AGENT', 'RELAXED_AGENT_FILTERS');
          relaxed = true;
          break;
        }

        if (target.type === 'TEAM') {
          const members = this.filterTeamTargetMembers(
            target.id,
            params.teamMembers.get(target.id) ?? [],
            target.includeRoles
          );
          const available = members.filter((candidate) => candidate.gatingReasons.length === 0);
          if (available.length === 0) continue;

          if (target.strategy === 'ROUND_ROBIN') {
            const candidate = await this.pickRoundRobinCandidate(params.rule.tenantId, target.id, available);
            if (!candidate) continue;
            const score = this.computeScore(candidate.snapshot);
            if (!score) continue;
            assigned = candidate;
            assignedTeamId = target.id;
            selectedScore = score;
            reasonCodes.push('ROUND_ROBIN', 'RELAXED_AGENT_FILTERS');
            relaxed = true;
            break;
          }

          const scored = available
            .map((candidate) => ({
              candidate,
              score: this.computeScore(candidate.snapshot)
            }))
            .filter((entry): entry is { candidate: CandidateSnapshot; score: AgentScore } => entry.score !== null)
            .sort((a, b) => b.score.score - a.score.score);
          if (scored.length === 0) continue;
          assigned = scored[0].candidate;
          assignedTeamId = target.id;
          selectedScore = scored[0].score;
          reasonCodes.push('BEST_FIT', 'RELAXED_AGENT_FILTERS');
          relaxed = true;
          break;
        }

        if (target.type === 'POND') {
          fallbackTeamId = target.id;
          usedFallback = true;
          reasonCodes.push('TEAM_POND');
          break;
        }
      }
    }

    const scoreMapAll = new Map(
      Array.from(considered.values()).map((candidate) => [candidate.snapshot.userId, this.computeScore(candidate.snapshot)] as const)
    );

    const candidates = Array.from(considered.values()).map((candidate) => {
      const entry = eligibility.get(candidate.snapshot.userId);
      const filterReasons = entry && !entry.eligible ? Array.from(entry.reasons) : [];
      const disqualifying = relaxed ? [...candidate.gatingReasons] : [...candidate.gatingReasons, ...filterReasons];
      const extraReasons = relaxed && filterReasons.length > 0 ? filterReasons.map((reason) => `Relaxed filter: ${reason}`) : undefined;
      const score = relaxed
        ? scoreMapAll.get(candidate.snapshot.userId) ?? null
        : (entry?.eligible ?? true)
          ? scoreMapAll.get(candidate.snapshot.userId) ?? null
          : null;

      return this.toDecisionCandidate(
        candidate,
        assigned,
        score,
        disqualifying.length > 0 ? disqualifying : undefined,
        extraReasons
      );
    });

    return {
      selectedAgent: selectedScore ?? undefined,
      assignedAgentId: assigned?.snapshot.userId,
      assignedTeamId,
      fallbackTeamId,
      usedFallback: usedFallback || !assigned,
      candidates,
      candidateSnapshots: Array.from(considered.values()),
      reasonCodes
    };
  }

  private applyScoreAndAssignRule(params: {
    rule: Prisma.RoutingRuleGetPayload<Record<string, never>>;
    agentSnapshots: Map<string, CandidateSnapshot>;
    teamMembers: Map<string, CandidateSnapshot[]>;
    fallback?: LeadRoutingFallback;
    listing?: LeadRoutingListingContext;
    quietHours: boolean;
    now: Date;
  }) {
    const reasonCodes = ['RULE_MATCHED'];
    const targets = this.safeParse(leadRoutingTargetSchema.array(), params.rule.targets) ?? [];
    const relaxAgentFilters = params.fallback?.relaxAgentFilters ?? false;
    const considered = new Map<string, CandidateSnapshot>();
    const eligibility = new Map<string, { eligible: boolean; reasons: Set<string> }>();

    const recordEligibility = (candidate: CandidateSnapshot, filter?: LeadRoutingAgentFilter | null) => {
      const entry = eligibility.get(candidate.snapshot.userId) ?? { eligible: false, reasons: new Set<string>() };
      const filterReasons = this.evaluateAgentFilter(candidate, filter);
      if (filterReasons.length === 0) {
        entry.eligible = true;
      } else {
        for (const reason of filterReasons) entry.reasons.add(reason);
      }
      eligibility.set(candidate.snapshot.userId, entry);
    };

    for (const target of targets) {
      if (target.type === 'AGENT') {
        const candidate = params.agentSnapshots.get(target.id);
        if (!candidate) continue;
        considered.set(candidate.snapshot.userId, candidate);
        recordEligibility(candidate, target.agentFilter);
      } else if (target.type === 'TEAM') {
        const members = this.filterTeamTargetMembers(
          target.id,
          params.teamMembers.get(target.id) ?? [],
          target.includeRoles
        );
        for (const member of members) {
          considered.set(member.snapshot.userId, member);
          recordEligibility(member, target.agentFilter);
        }
      }
    }

    if (considered.size === 0) {
      reasonCodes.push('NO_CANDIDATES');
      return null;
    }

    const scoreConfig = defaultScoreConfig;
    const gatingCandidates = Array.from(considered.values()).filter((candidate) => candidate.gatingReasons.length === 0);
    const strictCandidates = gatingCandidates.filter((candidate) => eligibility.get(candidate.snapshot.userId)?.eligible ?? true);

    const scoreMapAll = new Map(
      gatingCandidates.map((candidate) => [candidate.snapshot.userId, scoreAgent(candidate.snapshot, scoreConfig)] as const)
    );

    const strictResult = routeLead({
      leadId: params.rule.id,
      tenantId: params.rule.tenantId,
      geographyImportance: params.listing?.city ? 0.3 : 0.15,
      priceBandImportance: params.listing?.price ? 0.2 : 0.1,
      agents: strictCandidates.map((candidate) => candidate.snapshot),
      config: scoreConfig,
      fallbackTeamId: params.fallback?.teamId,
      quietHours: params.quietHours
    });

    const strictSelectedAgent = strictResult.selectedAgents[0];
    const needsRelax = relaxAgentFilters && !strictSelectedAgent;

    const relaxedResult = needsRelax
      ? routeLead({
          leadId: params.rule.id,
          tenantId: params.rule.tenantId,
          geographyImportance: params.listing?.city ? 0.3 : 0.15,
          priceBandImportance: params.listing?.price ? 0.2 : 0.1,
          agents: gatingCandidates.map((candidate) => candidate.snapshot),
          config: scoreConfig,
          fallbackTeamId: params.fallback?.teamId,
          quietHours: params.quietHours
        })
      : null;

    const selectedAgent = strictSelectedAgent ?? relaxedResult?.selectedAgents[0];
    const assignedCandidate = selectedAgent ? considered.get(selectedAgent.userId) : undefined;
    const assignedTeamId =
      selectedAgent && assignedCandidate && !targets.some((target) => target.type === 'AGENT' && target.id === selectedAgent.userId)
        ? targets.find(
            (target) =>
              target.type === 'TEAM' &&
              assignedCandidate.teamIds.includes(target.id) &&
              this.candidateMatchesTeamRoles(assignedCandidate, target.id, target.includeRoles)
          )?.id
        : undefined;
    const effectiveResult = strictSelectedAgent ? strictResult : relaxedResult ?? strictResult;
    const relaxed = Boolean(needsRelax && selectedAgent && relaxedResult && !relaxedResult.usedFallback);
    if (relaxed) {
      reasonCodes.push('RELAXED_AGENT_FILTERS');
    }
    const usedFallback = effectiveResult.usedFallback || !selectedAgent;

    const candidates = Array.from(considered.values()).map((candidate) => {
      const entry = eligibility.get(candidate.snapshot.userId);
      const filterReasons = entry && !entry.eligible ? Array.from(entry.reasons) : [];
      const disqualifying = relaxed ? [...candidate.gatingReasons] : [...candidate.gatingReasons, ...filterReasons];
      const extraReasons = relaxed && filterReasons.length > 0 ? filterReasons.map((reason) => `Relaxed filter: ${reason}`) : undefined;
      const score = relaxed
        ? scoreMapAll.get(candidate.snapshot.userId) ?? null
        : (entry?.eligible ?? true) && candidate.gatingReasons.length === 0
          ? scoreMapAll.get(candidate.snapshot.userId) ?? null
          : null;
      return this.toDecisionCandidate(
        candidate,
        assignedCandidate,
        score,
        disqualifying.length > 0 ? disqualifying : undefined,
        extraReasons
      );
    });

    return {
      selectedAgent: selectedAgent ?? undefined,
      assignedAgentId: selectedAgent?.userId,
      assignedTeamId,
      fallbackTeamId: effectiveResult.fallbackTeamId ?? params.fallback?.teamId ?? undefined,
      usedFallback,
      candidates,
      candidateSnapshots: Array.from(considered.values()),
      reasonCodes
    };
  }

  private toDecisionCandidate(
    candidate: CandidateSnapshot,
    assigned?: CandidateSnapshot,
    score?: AgentScore | null,
    disqualifyingReasons?: string[],
    extraReasons?: string[]
  ): RoutingDecisionCandidate {
    const status =
      assigned && assigned.snapshot.userId === candidate.snapshot.userId
        ? 'SELECTED'
        : score
          ? 'REJECTED'
          : 'DISQUALIFIED';
    const reasonsBase =
      status === 'DISQUALIFIED'
        ? disqualifyingReasons ?? candidate.gatingReasons
        : score?.reasons.map((reason) => reason.description) ?? [];
    const reasons = extraReasons && extraReasons.length > 0 ? [...reasonsBase, ...extraReasons] : reasonsBase;

    return {
      agentId: candidate.snapshot.userId,
      fullName: candidate.snapshot.fullName,
      status,
      score: score?.score ?? undefined,
      reasons,
      capacityRemaining: candidate.capacityRemaining,
      consentReady: candidate.snapshot.consentReady,
      tenDlcReady: candidate.snapshot.tenDlcReady,
      teamIds: candidate.teamIds
    };
  }

  private computeScore(snapshot: AgentSnapshot): AgentScore | null {
    return scoreAgent(snapshot, defaultScoreConfig);
  }

  private resolveAgentRoutingProfile(agent: AgentWithRelations) {
    const profile =
      agent.agentProfilesForOrgs?.find((candidate) => candidate.organizationId === agent.organizationId) ??
      agent.agentProfilesForOrgs?.[0] ??
      null;

    const metadata = (profile?.metadata ?? {}) as Record<string, unknown>;
    const routingProfile =
      (metadata as any).routingProfile ??
      (metadata as any).routing ??
      {};

    const capacityTarget = toNumberMaybe((routingProfile as any).capacityTarget);
    const rawTags = [
      ...parseCommaSeparated(profile?.tags ?? null),
      ...normalizeStringTokens((routingProfile as any).tags)
    ];

    return {
      capacityTarget: capacityTarget && capacityTarget > 0 ? Math.round(capacityTarget) : 8,
      tags: normalizeLowerUnique(rawTags),
      languages: normalizeLowerUnique(normalizeStringTokens((routingProfile as any).languages)),
      specialties: normalizeLowerUnique(normalizeStringTokens((routingProfile as any).specialties))
    };
  }

  private async buildCandidateSnapshots(params: {
    tenantId: string;
    orgId: string | null;
    leadType?: string | null;
    agents: AgentWithRelations[];
    listing?: LeadRoutingListingContext;
    hasConsent: boolean;
    tenDlcReady: boolean;
  }): Promise<Map<string, CandidateSnapshot>> {
    const agentIds = params.agents.map((agent) => agent.id);
    const tourStats = agentIds.length
      ? await this.prisma.tour.groupBy({
          by: ['agentId', 'status'],
          where: {
            tenantId: params.tenantId,
            agentId: { in: agentIds },
            status: { in: ['CONFIRMED', 'KEPT', 'NO_SHOW'] }
          },
          _count: { _all: true }
        })
      : [];

    const performanceByAgent = new Map<string, { kept: number; total: number }>();
    for (const stat of tourStats) {
      if (!stat.agentId) continue;
      const entry = performanceByAgent.get(stat.agentId) ?? { kept: 0, total: 0 };
      entry.total += stat._count._all;
      if (stat.status === 'KEPT') entry.kept += stat._count._all;
      performanceByAgent.set(stat.agentId, entry);
    }

    const leadTypeGroups =
      params.orgId && agentIds.length
        ? await this.prisma.person.groupBy({
            by: ['ownerId', 'leadType'],
            where: {
              organizationId: params.orgId,
              deletedAt: null,
              stageId: { not: null },
              ownerId: { in: agentIds }
            },
            _count: { _all: true }
          })
        : [];

    const leadTypeCountsByOwnerId = new Map<string, { buyer: number; seller: number }>();
    for (const group of leadTypeGroups) {
      const ownerId = group.ownerId ?? null;
      if (!ownerId) continue;
      const entry = leadTypeCountsByOwnerId.get(ownerId) ?? { buyer: 0, seller: 0 };
      if (String(group.leadType).toUpperCase() === 'BUYER') {
        entry.buyer += group._count._all;
      } else if (String(group.leadType).toUpperCase() === 'SELLER') {
        entry.seller += group._count._all;
      }
      leadTypeCountsByOwnerId.set(ownerId, entry);
    }

    const snapshots = new Map<string, CandidateSnapshot>();
    for (const agent of params.agents) {
      const routingProfile = this.resolveAgentRoutingProfile(agent);
      const performance = performanceByAgent.get(agent.id) ?? { kept: 0, total: 0 };
      const keptRate = performance.total === 0 ? 0.5 : performance.kept / performance.total;
      const geographyFit = this.computeGeographyFit(agent, params.listing);
      const priceBandFit = this.computePriceBandFit(agent, params.listing);
      const activePipeline = agent.tours.length;
      const typeCounts = leadTypeCountsByOwnerId.get(agent.id) ?? { buyer: 0, seller: 0 };
      const knownTotal = typeCounts.buyer + typeCounts.seller;
      const buyerShare = knownTotal > 0 ? typeCounts.buyer / knownTotal : null;
      const orientation =
        buyerShare === null
          ? 'UNKNOWN'
          : buyerShare >= 0.67
            ? 'BUYER_HEAVY'
            : buyerShare <= 0.33
              ? 'SELLER_HEAVY'
              : 'BALANCED';
      const leadType = String(params.leadType ?? '').toUpperCase();
      const leadTypeFit =
        leadType === 'BUYER'
          ? orientation === 'BUYER_HEAVY'
            ? 1
            : orientation === 'BALANCED'
              ? 0.85
              : orientation === 'SELLER_HEAVY'
                ? 0.6
                : 0.75
          : leadType === 'SELLER'
            ? orientation === 'SELLER_HEAVY'
              ? 1
              : orientation === 'BALANCED'
                ? 0.85
                : orientation === 'BUYER_HEAVY'
                  ? 0.6
                  : 0.75
            : 0.75;

      const snapshot: AgentSnapshot = {
        userId: agent.id,
        fullName: `${agent.firstName} ${agent.lastName}`.trim(),
        capacityTarget: routingProfile.capacityTarget,
        activePipeline,
        geographyFit,
        priceBandFit,
        keptApptRate: keptRate,
        leadTypeFit,
        consentReady: params.hasConsent,
        tenDlcReady: params.tenDlcReady,
        teamId: agent.memberships?.[0]?.teamId,
        roundRobinOrder: 0
      };

      const gatingReasons: string[] = [];
      if (!snapshot.consentReady) gatingReasons.push('Missing compliant contact channel');
      if (!snapshot.tenDlcReady) gatingReasons.push('Tenant messaging readiness incomplete');

      snapshots.set(agent.id, {
        agent,
        snapshot,
        capacityRemaining: Math.max(snapshot.capacityTarget - snapshot.activePipeline, 0),
        gatingReasons,
        teamIds: agent.memberships?.map((membership) => membership.teamId) ?? [],
        attributes: {
          tags: routingProfile.tags,
          languages: routingProfile.languages,
          specialties: routingProfile.specialties
        }
      });
    }

    return snapshots;
  }

  private computeGeographyFit(agent: AgentWithRelations, listing?: LeadRoutingListingContext) {
    if (!listing?.city) return 0.7;
    const agentCities = agent.tours
      .map((tour) => tour.listing?.city?.toLowerCase())
      .filter(Boolean) as string[];
    if (agentCities.includes(listing.city.toLowerCase())) {
      return 1;
    }
    return agentCities.length > 0 ? 0.6 : 0.7;
  }

  private computePriceBandFit(agent: AgentWithRelations, listing?: LeadRoutingListingContext) {
    if (!listing?.price) return 0.7;
    const prices = agent.tours.map((tour) => Number(tour.listing?.price ?? 0)).filter((value) => value > 0);
    if (prices.length === 0) return 0.75;
    const avgPrice = prices.reduce((acc, price) => acc + price, 0) / prices.length;
    const delta = Math.abs(avgPrice - listing.price);
    const variance = Math.max(listing.price, avgPrice);
    const fit = Math.max(0.4, 1 - delta / (variance || 1));
    return Number(fit.toFixed(2));
  }

  private safeParse<T>(schema: { parse: (input: unknown) => T }, value: unknown): T | undefined {
    try {
      return schema.parse(value ?? {});
    } catch (error) {
      this.logger.warn(`Failed to parse routing config fragment`, error as Error);
      return undefined;
    }
  }

  private isQuietHours(now: Date, tenant: Prisma.TenantGetPayload<Record<string, never>>) {
    const timezone = tenant.timezone ?? 'America/New_York';
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: timezone
    });
    const hour = Number.parseInt(formatter.format(now), 10);
    const start = tenant.quietHoursStart;
    const end = tenant.quietHoursEnd;
    if (start <= end) {
      return hour >= start && hour < end;
    }
    return hour >= start || hour < end;
  }
}
