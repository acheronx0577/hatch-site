import { Injectable, Logger } from '@nestjs/common';
import {
  AssignmentReasonType,
  Consent,
  LeadRouteEvent,
  LeadSlaType,
  MessageChannel,
  Prisma,
  RoutingMode,
  User,
  UserRole
} from '@hatch/db';
import {
  AgentScore,
  AgentSnapshot,
  evaluateLeadRoutingConditions,
  LeadRoutingConditions,
  LeadRoutingContext,
  LeadRoutingEvaluationResult,
  LeadRoutingFallback,
  LeadRoutingListingContext,
  leadRoutingConditionsSchema,
  leadRoutingFallbackSchema,
  LeadRoutingRuleConfig,
  leadRoutingRuleConfigSchema,
  LeadRoutingTarget,
  leadRoutingTargetSchema,
  routeLead,
  RoutingResult,
  routingConfigSchema,
  scoreAgent
} from '@hatch/shared';

import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';
import { RoutingRulesQueryDto } from './dto/routing-query.dto';

type AssignPayload = {
  tenantId: string;
  person: Prisma.PersonGetPayload<Record<string, never>>;
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
};

const MINUTES = 60 * 1000;

const defaultRoutingWeights = {
  geographyImportance: 0.3,
  priceBandImportance: 0.2
};

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

const toJson = (value: unknown): Prisma.JsonValue => value as Prisma.JsonValue;

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

    const [rules, agents, consents] = await Promise.all([
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
          memberships: true
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
      })
    ]);

    const consentState = consentStateFromConsents(consents);
    const listingContext = toListingContext(payload);
    const quietHours = this.isQuietHours(now, tenant);

    const context: LeadRoutingContext = {
      now,
      tenantTimezone: tenant.timezone ?? 'America/New_York',
      person: {
        source: payload.person.source,
        buyerRepStatus: payload.person.buyerRepStatus,
        consent: consentState
      },
      listing: listingContext
    };

    const agentSnapshots = await this.buildCandidateSnapshots({
      tenantId: payload.tenantId,
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
    const rule = await this.prisma.routingRule.create({
      data: {
        tenantId,
        name: input.name,
        priority: input.priority,
        mode: input.mode,
        enabled: input.enabled ?? true,
        conditions: parsed.conditions as Prisma.JsonObject,
        targets: parsed.targets as Prisma.JsonArray,
        fallback: parsed.fallback as Prisma.JsonObject | null,
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

    const updated = await this.prisma.routingRule.update({
      where: { id },
      data: {
        name: input.name ?? rule.name,
        priority: input.priority ?? rule.priority,
        mode: input.mode ?? rule.mode,
        enabled: input.enabled ?? rule.enabled,
        conditions: parsed.conditions as Prisma.JsonObject,
        targets: parsed.targets as Prisma.JsonArray,
        fallback: parsed.fallback as Prisma.JsonObject | null,
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
        memberships: true
      }
    });

    const snapshots = await this.buildCandidateSnapshots({
      tenantId,
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
    const assignmentReasons = outcome.selectedAgent
      ? outcome.selectedAgent.reasons
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
      assignedAgentId: outcome.assignedAgentId,
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

    const slaDueAt = timersToCreate.firstTouch?.dueAt ?? null;

    const event = await this.prisma.$transaction(async (tx) => {
      if (outcome.assignedAgentId) {
        await tx.assignment.create({
          data: {
            tenantId: payload.tenantId,
            personId: payload.person.id,
            agentId: outcome.assignedAgentId,
            teamId: outcome.candidateSnapshots
              .find((candidate) => candidate.snapshot.userId === outcome.assignedAgentId)
              ?.teamIds?.[0],
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
      } else if (outcome.fallbackTeamId) {
        await tx.assignment.create({
          data: {
            tenantId: payload.tenantId,
            personId: payload.person.id,
            teamId: outcome.fallbackTeamId,
            score: 0,
            reasons: {
              create: [
                {
                  type: 'TEAM_POND',
                  weight: 1,
                  notes: 'Fallback pond assignment'
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
          payload: toJson(eventPayload),
          candidates: toJson(eventCandidates),
          assignedAgentId: outcome.assignedAgentId ?? null,
          fallbackUsed: outcome.usedFallback,
          reasonCodes: toJson(outcome.reasonCodes),
          slaDueAt,
          actorUserId: payload.actorUserId ?? null
        }
      });
    });

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
        assignedAgentId: outcome.assignedAgentId,
        fallbackTeamId: outcome.fallbackTeamId,
        reasonCodes: outcome.reasonCodes
      }
    });

    const selectedAgents = outcome.selectedAgent ? [outcome.selectedAgent] : [];

    return {
      leadId: payload.person.id,
      tenantId: payload.tenantId,
      selectedAgents,
      fallbackTeamId: outcome.fallbackTeamId,
      usedFallback: outcome.usedFallback,
      quietHours,
      ruleId: rule.id,
      ruleName: rule.name,
      eventId: event.id,
      candidates: outcome.candidates,
      evaluation,
      reasonCodes: outcome.reasonCodes
    };
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
    const event = await this.prisma.leadRouteEvent.create({
      data: {
        tenantId: params.payload.tenantId,
        leadId: params.payload.person.id,
        personId: params.payload.person.id,
        matchedRuleId: null,
        mode: RoutingMode.FIRST_MATCH,
        payload: toJson({
          context: {
            source: params.context.person.source,
            buyerRepStatus: params.context.person.buyerRepStatus,
            listing: params.context.listing,
            quietHours: params.quietHours
          },
          evaluation: null
        }),
        candidates: toJson([]),
        assignedAgentId: null,
        fallbackUsed: true,
        reasonCodes: toJson(params.reasonCodes),
        actorUserId: params.payload.actorUserId ?? null
      }
    });

    return {
      leadId: params.payload.person.id,
      tenantId: params.payload.tenantId,
      selectedAgents: [],
      fallbackTeamId: null,
      usedFallback: true,
      quietHours: params.quietHours,
      ruleId: null,
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
        fallback: rule.fallback ?? null
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
      fallback: fallback ?? null
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
    const defaultWeights = defaultRoutingWeights;
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

  private applyFirstMatchRule(params: {
    rule: Prisma.RoutingRuleGetPayload<Record<string, never>>;
    agentSnapshots: Map<string, CandidateSnapshot>;
    teamMembers: Map<string, CandidateSnapshot[]>;
    fallback?: LeadRoutingFallback;
    listing?: LeadRoutingListingContext;
    quietHours: boolean;
  }) {
    const reasonCodes = ['RULE_MATCHED'];
    const targets = this.safeParse(leadRoutingTargetSchema.array(), params.rule.targets) ?? [];

    let assigned: CandidateSnapshot | undefined;
    let selectedScore: AgentScore | null = null;
    let fallbackTeamId = params.fallback?.teamId ?? null;
    let usedFallback = false;

    for (const target of targets) {
      if (target.type === 'AGENT') {
        const candidate = params.agentSnapshots.get(target.id);
        if (!candidate) {
          continue;
        }
        if (candidate.gatingReasons.length > 0) {
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
        const members = params.teamMembers.get(target.id) ?? [];
        const available = members.filter((candidate) => candidate.gatingReasons.length === 0);
        if (available.length === 0) {
          continue;
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
        selectedScore = scored[0].score;
        reasonCodes.push(target.strategy === 'ROUND_ROBIN' ? 'ROUND_ROBIN' : 'BEST_FIT');
        break;
      }

      if (target.type === 'POND') {
        fallbackTeamId = target.id;
        usedFallback = true;
        reasonCodes.push('TEAM_POND');
        break;
      }
    }

    const candidates = Array.from(params.agentSnapshots.values()).map((candidate) =>
      this.toDecisionCandidate(candidate, assigned, selectedScore)
    );

    return {
      selectedAgent: selectedScore ?? undefined,
      assignedAgentId: assigned?.snapshot.userId,
      fallbackTeamId,
      usedFallback: usedFallback || !assigned,
      candidates,
      candidateSnapshots: Array.from(params.agentSnapshots.values()),
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
    const considered = new Map<string, CandidateSnapshot>();

    for (const target of targets) {
      if (target.type === 'AGENT') {
        const candidate = params.agentSnapshots.get(target.id);
        if (candidate) considered.set(candidate.snapshot.userId, candidate);
      } else if (target.type === 'TEAM') {
        const members = params.teamMembers.get(target.id) ?? [];
        for (const member of members) {
          considered.set(member.snapshot.userId, member);
        }
      }
    }

    if (considered.size === 0) {
      reasonCodes.push('NO_CANDIDATES');
      return null;
    }

    const scoreConfig = defaultScoreConfig;
    const snapshots = Array.from(considered.values()).map((candidate) => candidate.snapshot);
    const scoreMap = new Map(
      snapshots.map((snapshot) => [snapshot.userId, scoreAgent(snapshot, scoreConfig)] as const)
    );

    const result = routeLead({
      leadId: params.rule.id,
      tenantId: params.rule.tenantId,
      geographyImportance: params.listing?.city ? 0.3 : 0.15,
      priceBandImportance: params.listing?.price ? 0.2 : 0.1,
      agents: snapshots,
      config: scoreConfig,
      fallbackTeamId: params.fallback?.teamId,
      quietHours: params.quietHours
    });

    const selectedAgent = result.selectedAgents[0];
    const assignedCandidate = selectedAgent ? considered.get(selectedAgent.userId) : undefined;
    const usedFallback = result.usedFallback || !selectedAgent;

    const candidates = Array.from(considered.values()).map((candidate) =>
      this.toDecisionCandidate(candidate, assignedCandidate, scoreMap.get(candidate.snapshot.userId) ?? null)
    );

    return {
      selectedAgent: selectedAgent ?? undefined,
      assignedAgentId: selectedAgent?.userId,
      fallbackTeamId: result.fallbackTeamId ?? params.fallback?.teamId ?? null,
      usedFallback,
      candidates,
      candidateSnapshots: Array.from(considered.values()),
      reasonCodes
    };
  }

  private toDecisionCandidate(
    candidate: CandidateSnapshot,
    assigned?: CandidateSnapshot,
    score?: AgentScore | null
  ): RoutingDecisionCandidate {
    const status = assigned && assigned.snapshot.userId === candidate.snapshot.userId ? 'SELECTED' : score ? 'REJECTED' : 'DISQUALIFIED';
    const reasons =
      status === 'DISQUALIFIED'
        ? candidate.gatingReasons
        : score?.reasons.map((reason) => reason.description) ?? [];

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

  private async buildCandidateSnapshots(params: {
    tenantId: string;
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

    const snapshots = new Map<string, CandidateSnapshot>();
    for (const agent of params.agents) {
      const performance = performanceByAgent.get(agent.id) ?? { kept: 0, total: 0 };
      const keptRate = performance.total === 0 ? 0.5 : performance.kept / performance.total;
      const geographyFit = this.computeGeographyFit(agent, params.listing);
      const priceBandFit = this.computePriceBandFit(agent, params.listing);
      const capacityTarget = 8;
      const activePipeline = agent.tours.length;

      const snapshot: AgentSnapshot = {
        userId: agent.id,
        fullName: `${agent.firstName} ${agent.lastName}`.trim(),
        capacityTarget,
        activePipeline,
        geographyFit,
        priceBandFit,
        keptApptRate: keptRate,
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
        teamIds: agent.memberships?.map((membership) => membership.teamId) ?? []
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
