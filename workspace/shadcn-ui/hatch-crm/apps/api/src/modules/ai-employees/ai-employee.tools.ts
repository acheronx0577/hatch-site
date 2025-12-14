import { BadRequestException, NotFoundException, forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { addDays, subDays, differenceInCalendarDays } from 'date-fns';

import {
  ActivityType,
  ConsentScope,
  DealStage,
  LeadTaskStatus,
  ListingStatus,
  PersonStage,
  UserRole
} from '@hatch/db';

import { LeadsService } from '@/modules/leads/leads.service';
import { MessagesService } from '@/modules/messages/messages.service';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { RequestContext } from '@/modules/common';
import { AiToolContext, AiToolRegistry, type AiToolDefinition } from './ai-tool.registry';
import { AiEmployeesService } from './ai-employees.service';

const leadNoteSchema = z.object({
  leadId: z.string().min(1),
  body: z.string().min(5).max(2000)
});
type LeadNoteInput = z.infer<typeof leadNoteSchema>;

const leadTaskSchema = z.object({
  leadId: z.string().min(1),
  title: z.string().min(3).max(140),
  dueAt: z.string().datetime().optional(),
  assigneeId: z.string().optional()
});
type LeadTaskInput = z.infer<typeof leadTaskSchema>;

const leadStageSchema = z.object({
  leadId: z.string().min(1),
  stageId: z.string().optional(),
  pipelineId: z.string().optional()
});
type LeadStageInput = z.infer<typeof leadStageSchema>;

const leadContextSchema = z.object({
  leadId: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  personId: z.string().min(1).optional()
});

const emailSchema = z.object({
  leadId: z.string().min(1),
  from: z.string().email(),
  to: z.string().email().optional(),
  subject: z.string().min(3),
  body: z.string().min(5),
  scope: z.nativeEnum(ConsentScope).default(ConsentScope.PROMOTIONAL),
  includeUnsubscribe: z.boolean().optional()
});
type EmailInput = z.infer<typeof emailSchema>;

const smsSchema = z.object({
  leadId: z.string().min(1),
  from: z.string().min(3),
  to: z.string().min(3).optional(),
  body: z.string().min(2).max(1600),
  scope: z.nativeEnum(ConsentScope).default(ConsentScope.PROMOTIONAL),
  overrideQuietHours: z.boolean().optional(),
  transactional: z.boolean().optional()
});
type SmsInput = z.infer<typeof smsSchema>;

const scheduleCallSchema = z.object({
  leadId: z.string().min(1),
  summary: z.string().min(3).max(140),
  scheduledAt: z.string().datetime().optional(),
  assigneeId: z.string().optional()
});
type ScheduleCallInput = z.infer<typeof scheduleCallSchema>;

const listingIdSchema = z.object({
  listingId: z.string().min(1)
});

const listingNoteSchema = listingIdSchema.extend({
  body: z.string().min(5).max(2000)
});

const listingCopySchema = listingIdSchema.extend({
  tone: z.string().max(64).optional(),
  style: z.string().max(64).optional()
});

const marketingKitSchema = listingIdSchema.extend({
  campaignType: z.string().max(64).optional()
});

const transactionIdSchema = z.object({
  transactionId: z.string().min(1)
});

const transactionNoteSchema = transactionIdSchema.extend({
  body: z.string().min(5).max(2000)
});

const marketCompsSchema = z.object({
  listingId: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  limit: z.number().int().min(1).max(25).optional()
});

const marketReportSchema = marketCompsSchema.extend({
  focus: z.string().optional()
});

const summarySchema = z.object({
  lookbackDays: z.number().int().min(1).max(30).optional()
});

const listLimitSchema = z.object({
  limit: z.number().int().min(1).max(50).optional()
});

const idleLeadsSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  idleDays: z.number().int().min(1).max(90).optional()
});

const WORKFLOW_PERSONAS = [
  { key: 'agent_copilot', name: 'Echo' },
  { key: 'lead_nurse', name: 'Lumen' },
  { key: 'listing_concierge', name: 'Haven' },
  { key: 'market_analyst', name: 'Atlas' },
  { key: 'transaction_coordinator', name: 'Nova' }
] as const;

const resolvePersonaKey = (raw: string | null | undefined) => {
  if (!raw) return null;
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  const direct = WORKFLOW_PERSONAS.find((p) => p.key === normalized);
  if (direct) return direct.key;

  const byName = WORKFLOW_PERSONAS.find((p) => p.name.toLowerCase() === normalized);
  if (byName) return byName.key;

  return null;
};

const extractWorkflowRequestsFromMessage = (message: string) => {
  const trimmed = message.trim();
  if (!trimmed) return [];

  const names = WORKFLOW_PERSONAS.map((p) => p.name).join('|');
  const segmentRegex = new RegExp(
    `\\b(${names})\\b\\s*:\\s*([\\s\\S]*?)(?=\\b(?:${names})\\b\\s*:|$)`,
    'gi'
  );

  const requests: Array<{ personaKey: string; message: string }> = [];
  const segments = Array.from(trimmed.matchAll(segmentRegex));
  if (segments.length > 0) {
    for (const match of segments) {
      const name = match[1]?.trim();
      const task = match[2]?.trim();
      const personaKey = resolvePersonaKey(name);
      if (!personaKey || !task) continue;
      requests.push({ personaKey, message: task });
    }
    return requests;
  }

  for (const persona of WORKFLOW_PERSONAS) {
    if (new RegExp(`\\b${persona.name}\\b`, 'i').test(trimmed)) {
      requests.push({ personaKey: persona.key, message: trimmed });
    }
  }

  return requests;
};

const extractTopNFromMessage = (message: string, fallback: number) => {
  const match = message.match(/\btop\s+(\d+)\b/i);
  const n = match ? Number(match[1]) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.min(10, Math.max(1, n));
  return fallback;
};

const formatHotLeadContext = (leads: Array<Record<string, unknown>>) => {
  if (!leads.length) return '';
  const lines = leads
    .map((lead) => {
      const id = typeof lead.id === 'string' ? lead.id : null;
      const firstName = typeof lead.firstName === 'string' ? lead.firstName.trim() : '';
      const lastName = typeof lead.lastName === 'string' ? lead.lastName.trim() : '';
      const name = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown lead';
      const tier = typeof lead.scoreTier === 'string' ? lead.scoreTier : null;
      const score = typeof lead.leadScore === 'number' ? Math.round(lead.leadScore) : null;
      const stage = typeof lead.stage === 'string' ? lead.stage.replace(/[_-]+/g, ' ').toLowerCase() : null;
      const bits = [
        id ? `leadId: ${id}` : null,
        tier ? `tier: ${tier}` : null,
        typeof score === 'number' ? `score: ${score}` : null,
        stage ? `stage: ${stage}` : null
      ].filter((value): value is string => Boolean(value));
      const meta = bits.length > 0 ? ` (${bits.join(', ')})` : '';
      return `- ${name}${meta}`;
    })
    .join('\n');
  return `Here are the current highest-scoring leads from the CRM:\n${lines}`;
};

@Injectable()
export class AiEmployeeToolRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: AiToolRegistry,
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    @Inject(forwardRef(() => LeadsService))
    private readonly leads: LeadsService,
    private readonly employees: AiEmployeesService
  ) {}

  onModuleInit() {
    this.registerLeadNoteTool();
    this.registerLeadTaskTools();
    this.registerLeadStageTool();
    this.registerLeadContextTool();
    this.registerEmailTool();
    this.registerSmsTool();
    this.registerScheduleCallTool();
    this.registerListingTools();
    this.registerTransactionTools();
    this.registerMarketTools();
    this.registerSummaryTools();
    this.registerWorkflowTools();
  }

  private registerLeadNoteTool() {
    const run = async (input: LeadNoteInput, context: AiToolContext) => {
      const serviceCtx = buildRequestContext(context);
      const note = await this.leads.addNote(
        input.leadId,
        { body: input.body },
        serviceCtx
      );
      return { noteId: note.id };
    };

    this.registerWithAliases(
      {
        description: 'Add a note to the specified lead record',
        schema: leadNoteSchema,
        allowAutoRun: true,
        defaultRequiresApproval: false,
        run
      },
      ['lead_add_note', 'lead.add_note']
    );
  }

  private registerLeadTaskTools() {
    const run = async (input: LeadTaskInput, context: AiToolContext) => {
      const serviceCtx = buildRequestContext(context);
      const task = await this.leads.addTask(
        input.leadId,
        {
          title: input.title,
          dueAt: input.dueAt ?? null,
          assigneeId: input.assigneeId
        },
        serviceCtx
      );
      return { taskId: task.id };
    };

    this.registerWithAliases(
      {
        description: 'Create a follow-up task for a lead',
        schema: leadTaskSchema,
        allowAutoRun: false,
        defaultRequiresApproval: true,
        run
      },
      ['lead_create_follow_up_task', 'lead.create_task', 'create_task']
    );
  }

  private registerScheduleCallTool() {
    this.registry.register<ScheduleCallInput, { taskId: string }>({
      key: 'schedule_call',
      description: 'Create a scheduled call task for a lead',
      schema: scheduleCallSchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        const serviceCtx = buildRequestContext(context);
        const task = await this.leads.addTask(
          input.leadId,
          {
            title: `Call: ${input.summary}`,
            dueAt: input.scheduledAt ?? null,
            assigneeId: input.assigneeId
          },
          serviceCtx
        );
        return { taskId: task.id };
      }
    });
  }

  private registerLeadStageTool() {
    this.registry.register<LeadStageInput, { leadId: string; stageId?: string | null }>({
      key: 'lead_update_stage',
      description: 'Update a lead pipeline stage',
      schema: leadStageSchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        const serviceCtx = buildRequestContext(context);
        const result = await this.leads.update(
          input.leadId,
          {
            pipelineId: input.pipelineId,
            stageId: input.stageId
          },
          serviceCtx
        );
        return { leadId: result.id, stageId: result.stage?.id ?? null };
      }
    });
  }

  private registerLeadContextTool() {
    this.registry.register<{ leadId: string }, unknown>({
      key: 'get_lead_context',
      description: 'Fetch the latest CRM context for a lead',
      schema: leadContextSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const serviceCtx = buildRequestContext(context);
        const record = input as unknown as Record<string, unknown>;
        const leadId =
          (typeof record.leadId === 'string' && record.leadId) ||
          (typeof record.id === 'string' && record.id) ||
          (typeof record.personId === 'string' && record.personId) ||
          null;
        if (!leadId) {
          throw new Error('leadId is required');
        }
        return this.leads.getById(leadId, serviceCtx.tenantId!);
      }
    });
  }

  private registerEmailTool() {
    this.registry.register<EmailInput, { messageId: string }>({
      key: 'send_email',
      description: 'Send an email to a lead via the messaging service',
      schema: emailSchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        if (!context.tenantId) {
          throw new Error('tenantId is required');
        }
        const lead = await this.requireLead(context.tenantId, input.leadId);
        const toAddress = input.to ?? lead.primaryEmail;
        if (!toAddress) {
          throw new Error('Lead does not have an email address and no `to` value was provided.');
        }
        const cleanSubject = sanitizeEmailSubject(input.subject);
        const cleanBody = sanitizeEmailBody(input.body, cleanSubject);

        const message = await this.messages.sendEmail({
          tenantId: context.tenantId,
          personId: input.leadId,
          userId: context.actorId,
          from: input.from,
          to: toAddress,
          subject: cleanSubject,
          body: cleanBody,
          scope: input.scope,
          includeUnsubscribe: input.includeUnsubscribe ?? input.scope === ConsentScope.PROMOTIONAL
        });

        return { messageId: message.id };
      }
    });
  }

  private registerSmsTool() {
    this.registry.register<SmsInput, { messageId: string }>({
      key: 'send_sms',
      description: 'Send an SMS message to a lead',
      schema: smsSchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        if (!context.tenantId) {
          throw new Error('tenantId is required');
        }
        const lead = await this.requireLead(context.tenantId, input.leadId);
        const toNumber = input.to ?? lead.primaryPhone;
        if (!toNumber) {
          throw new Error('Lead does not have a phone number and no `to` value was provided.');
        }

        const message = await this.messages.sendSms({
          tenantId: context.tenantId,
          personId: input.leadId,
          userId: context.actorId,
          from: input.from,
          to: toNumber,
          body: input.body,
          scope: input.scope,
          overrideQuietHours: input.overrideQuietHours ?? false,
          transactional: input.transactional
        });

        return { messageId: message.id };
      }
    });
  }

  private registerListingTools() {
    this.registry.register<{ listingId: string }, ListingDetails>({
      key: 'listing_get_details',
      description: 'Fetch listing details, owner info, and recent offer stats',
      schema: listingIdSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        return this.getListingDetails(tenantId, input.listingId);
      }
    });

    this.registry.register<z.infer<typeof listingCopySchema>, ListingCopyPayload>({
      key: 'listing_generate_copy',
      description: 'Generate refreshed MLS-ready copy for a listing',
      schema: listingCopySchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const details = await this.getListingDetails(tenantId, input.listingId);
        return this.buildListingCopy(details, { tone: input.tone, style: input.style });
      }
    });

    this.registry.register<z.infer<typeof marketingKitSchema>, ListingMarketingKit>({
      key: 'listing_generate_marketing_kit',
      description: 'Generate a lightweight marketing kit outline for a listing',
      schema: marketingKitSchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const details = await this.getListingDetails(tenantId, input.listingId);
        const kit = this.buildMarketingKit(details, input.campaignType ?? null);
        const occurredAt = new Date();
        await this.prisma.marketingEvent.create({
          data: {
            tenantId,
            listingId: details.id,
            eventType: 'marketing_kit_generated',
            metadata: {
              campaignType: kit.campaignType,
              actorId: context.actorId,
              socialPosts: kit.socialPosts,
              emailSubject: kit.emailSubject
            },
            occurredAt
          }
        });
        await this.prisma.activity.create({
          data: {
            tenantId,
            listingId: details.id,
            personId: details.owner?.id ?? undefined,
            userId: context.actorId ?? undefined,
            type: ActivityType.NOTE_ADDED,
            payload: {
              listingId: details.id,
              campaignType: kit.campaignType,
              emailSubject: kit.emailSubject,
              emailBody: kit.emailBody,
              socialPosts: kit.socialPosts
            },
            occurredAt
          }
        });
        return kit;
      }
    });

    this.registry.register<{ listingId: string }, { post: string }>({
      key: 'create_social_post_draft',
      description: 'Create a short social caption for a listing update',
      schema: listingIdSchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const details = await this.getListingDetails(tenantId, input.listingId);
        const post = this.buildSocialPosts(details)[0];
        return { post };
      }
    });

    this.registry.register<{ listingId: string; body: string }, { noteId: string }>({
      key: 'add_listing_note',
      description: 'Attach an internal marketing note to a listing',
      schema: listingNoteSchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const listing = await this.fetchListing(tenantId, input.listingId);
        const event = await this.prisma.marketingEvent.create({
          data: {
            tenantId,
            listingId: listing.id,
            eventType: 'note',
            metadata: {
              body: input.body,
              actorId: context.actorId
            }
          }
        });
        await this.prisma.activity.create({
          data: {
            tenantId,
            listingId: listing.id,
            personId: listing.person?.id ?? undefined,
            userId: context.actorId ?? undefined,
            type: ActivityType.NOTE_ADDED,
            payload: {
              listingId: listing.id,
              noteId: event.id,
              body: input.body
            },
            occurredAt: new Date()
          }
        });
        return { noteId: event.id };
      }
    });
  }

  private registerTransactionTools() {
    this.registry.register<{ transactionId: string }, TransactionTimelinePayload>({
      key: 'transaction_get_timeline',
      description: 'Fetch the milestone timeline for a transaction',
      schema: transactionIdSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const deal = await this.fetchTransaction(tenantId, input.transactionId);
        return this.buildTransactionTimeline(deal);
      }
    });

    this.registry.register<{ transactionId: string }, TransactionMissingPayload>({
      key: 'transaction_get_missing_items',
      description: 'List incomplete milestones for a transaction',
      schema: transactionIdSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const deal = await this.fetchTransaction(tenantId, input.transactionId);
        return this.buildTransactionMissing(deal);
      }
    });

    this.registry.register<{ transactionId: string; body: string }, { activityId: string }>({
      key: 'transaction_add_note',
      description: 'Attach a note to the transaction timeline',
      schema: transactionNoteSchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const deal = await this.fetchTransaction(tenantId, input.transactionId);
        const activity = await this.prisma.activity.create({
          data: {
            tenantId,
            dealId: deal.id,
            listingId: deal.listingId ?? undefined,
            personId: deal.personId ?? undefined,
            userId: context.actorId ?? undefined,
            type: ActivityType.NOTE_ADDED,
            payload: {
              body: input.body,
              transactionId: deal.id
            },
            occurredAt: new Date()
          }
        });
        return { activityId: activity.id };
      }
    });
  }

  private registerMarketTools() {
    this.registry.register<z.infer<typeof marketCompsSchema>, MarketCompResponse>({
      key: 'market_get_comps',
      description: 'Retrieve recent closed comps for a postal code or listing',
      schema: marketCompsSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const comps = await this.fetchComps(tenantId, input);
        const warnings: string[] = [];
        if (comps.length === 0) {
          warnings.push('No comparable sales found for the provided filters.');
        }
        return { comps, warnings };
      }
    });

    this.registry.register<z.infer<typeof marketCompsSchema>, MarketStatsResult>({
      key: 'market_get_stats',
      description: 'Summarize market stats for a segment',
      schema: marketCompsSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        return this.computeMarketStats(tenantId, input);
      }
    });

    this.registry.register<z.infer<typeof marketReportSchema>, MarketReport>({
      key: 'generate_market_report',
      description: 'Generate a narrative market snapshot',
      schema: marketReportSchema,
      allowAutoRun: false,
      defaultRequiresApproval: true,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const comps = await this.fetchComps(tenantId, input);
        const { stats, warnings: statWarnings } = await this.computeMarketStats(tenantId, input, comps);
        const warnings = [...statWarnings];
        if (!comps.length) {
          warnings.push('No comparable sales included in this report.');
        }
        return {
          generatedAt: new Date().toISOString(),
          stats,
          comps,
          warnings,
          focus: input.focus ?? null
        };
      }
    });

    this.registerWithAliases(
      {
        description: 'Add a note to a lead record',
        schema: leadNoteSchema,
        allowAutoRun: false,
        defaultRequiresApproval: true,
        run: async (input: LeadNoteInput, context: AiToolContext) => {
          const serviceCtx = buildRequestContext(context);
          const note = await this.leads.addNote(
            input.leadId,
            { body: input.body },
            serviceCtx
          );
          return { noteId: note.id };
        }
      },
      ['add_note']
    );
  }

  private registerSummaryTools() {
    this.registry.register<z.infer<typeof summarySchema>, DailySummary>({
      key: 'get_daily_summary',
      description: 'Summarize daily CRM metrics for the tenant',
      schema: summarySchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        return this.computeDailySummary(tenantId, input.lookbackDays ?? 1);
      }
    });

    this.registry.register<
      z.infer<typeof listLimitSchema>,
      { leads: Array<Record<string, unknown>>; requestedLimit: number; availableCount: number }
    >({
      key: 'get_hot_leads',
      description: 'Fetch the hottest leads by score/activity',
      schema: listLimitSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const where = {
          tenantId,
          deletedAt: null,
          stage: { in: [PersonStage.NEW, PersonStage.NURTURE, PersonStage.ACTIVE] },
          doNotContact: false
        };
        const requestedLimit = input.limit ?? 10;
        const [availableCount, leads] = await Promise.all([
          this.prisma.person.count({ where }),
          this.prisma.person.findMany({
            where,
            orderBy: [
              { scoreTier: 'asc' },
              { leadScore: 'desc' },
              { lastActivityAt: 'desc' },
              { createdAt: 'desc' }
            ],
            take: requestedLimit,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              stage: true,
              scoreTier: true,
              leadScore: true,
              lastActivityAt: true,
              createdAt: true,
              ownerId: true
            }
          })
        ]);

        return { leads, requestedLimit, availableCount };
      }
    });

    this.registry.register<z.infer<typeof idleLeadsSchema>, { leads: Array<Record<string, unknown>> }>({
      key: 'get_idle_leads',
      description: 'List idle leads (no recent activity)',
      schema: idleLeadsSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const now = new Date();
        const idleSince = subDays(now, input.idleDays ?? 3);
        const leads = await this.prisma.person.findMany({
          where: {
            tenantId,
            deletedAt: null,
            stage: { in: [PersonStage.NEW, PersonStage.NURTURE, PersonStage.ACTIVE] },
            doNotContact: false,
            OR: [
              { lastActivityAt: { lt: idleSince } },
              { lastActivityAt: null, createdAt: { lt: idleSince } }
            ]
          },
          orderBy: [
            { lastActivityAt: 'asc' },
            { scoreTier: 'asc' },
            { leadScore: 'desc' },
            { createdAt: 'asc' }
          ],
          take: input.limit ?? 10,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            stage: true,
            scoreTier: true,
            leadScore: true,
            lastActivityAt: true,
            createdAt: true,
            ownerId: true
          }
        });
        return { leads };
      }
    });

    this.registry.register<
      z.infer<typeof idleLeadsSchema>,
      { drafts: Array<{ leadId: string; name: string; text: string }> }
    >({
      key: 'draft_idle_lead_followups',
      description: 'Draft 1–2 sentence SMS follow-up texts for the top idle leads.',
      schema: idleLeadsSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const now = new Date();
        const idleSince = subDays(now, input.idleDays ?? 3);
        const leads = await this.prisma.person.findMany({
          where: {
            tenantId,
            deletedAt: null,
            stage: { in: [PersonStage.NEW, PersonStage.NURTURE, PersonStage.ACTIVE] },
            doNotContact: false,
            OR: [
              { lastActivityAt: { lt: idleSince } },
              { lastActivityAt: null, createdAt: { lt: idleSince } }
            ]
          },
          orderBy: [
            { lastActivityAt: 'asc' },
            { scoreTier: 'asc' },
            { leadScore: 'desc' },
            { createdAt: 'asc' }
          ],
          take: input.limit ?? 3,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            stage: true,
            scoreTier: true,
            leadScore: true,
            lastActivityAt: true,
            createdAt: true
          }
        });

        const drafts = leads.map((lead) => {
          const firstName = (lead.firstName ?? '').trim();
          const lastName = (lead.lastName ?? '').trim();
          const name = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown lead';
          const activityAt = lead.lastActivityAt ?? lead.createdAt;
          const daysIdle = differenceInCalendarDays(now, activityAt);
          const opener = firstName ? `Hi ${firstName},` : 'Hi there,';
          const idlePhrase = Number.isFinite(daysIdle) && daysIdle > 0 ? `it’s been ${daysIdle} days since we last connected` : 'quick check-in';
          const text = `${opener} quick check-in — ${idlePhrase}. Are you still looking, and would you like me to send 2–3 options that fit what you want?`;
          return { leadId: lead.id, name, text };
        });

        return { drafts };
      }
    });

    this.registry.register<z.infer<typeof listLimitSchema>, { tasks: Array<Record<string, unknown>> }>({
      key: 'get_overdue_tasks',
      description: 'List overdue lead tasks',
      schema: listLimitSchema,
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input, context) => {
        const tenantId = ensureTenant(context);
        const tasks = await this.prisma.leadTask.findMany({
          where: {
            tenantId,
            status: LeadTaskStatus.OPEN,
            dueAt: { lt: new Date() }
          },
          orderBy: { dueAt: 'asc' },
          take: input.limit ?? 15,
          select: {
            id: true,
            title: true,
            dueAt: true,
            personId: true,
            assigneeId: true
          }
        });
        return { tasks };
      }
    });
  }

  private registerWorkflowTools() {
    const loadLatestUserMessage = async (sessionId: string, employeeInstanceId: string) => {
      const row = await this.prisma.aiExecutionLog.findFirst({
        where: {
          sessionId,
          employeeInstanceId,
          toolKey: 'conversation:user'
        },
        orderBy: { createdAt: 'desc' },
        select: { input: true }
      });
      const input = row?.input as unknown;
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        const message = (input as Record<string, unknown>)['message'];
        return typeof message === 'string' ? message : null;
      }
      return null;
    };

    const runDelegate = async (
      personaRef: string,
      message: string,
      context: AiToolContext
    ): Promise<{
      personaKey: string;
      personaName: string;
      employeeInstanceId: string;
      reply: string;
      toolReplies?: string[];
    } | null> => {
      const personaKey = resolvePersonaKey(personaRef);
      if (!personaKey) {
        throw new BadRequestException(`Unknown persona: ${personaRef}`);
      }
      const target = await this.prisma.aiEmployeeInstance.findFirst({
        where: {
          tenantId: context.tenantId,
          status: 'active',
          template: { key: personaKey }
        },
        include: { template: true },
        orderBy: { createdAt: 'asc' }
      });
      if (!target) {
        throw new NotFoundException(`No active AI employee instance found for ${personaKey}`);
      }
      if (target.id === context.employeeInstanceId) {
        return null;
      }

      const response = await this.employees.sendMessage({
        tenantId: context.tenantId,
        orgId: context.orgId,
        employeeInstanceId: target.id,
        userId: context.actorId,
        actorRole: context.actorRole,
        channel: 'workflow',
        contextType: 'workflow',
        contextId: context.sessionId,
        message
      });

      const toolReplies = (response.actions ?? [])
        .filter((action) => String(action.status ?? '').toLowerCase() === 'executed')
        .map((action) => (typeof action.replyText === 'string' ? action.replyText.trim() : ''))
        .filter((text) => text.length > 0);

      return {
        personaKey: target.template.key,
        personaName: target.template.displayName,
        employeeInstanceId: target.id,
        reply: response.reply,
        toolReplies: toolReplies.length > 0 ? toolReplies : undefined
      };
    };

    this.registry.register({
      key: 'delegate_to_employee',
      description: 'Ask another AI employee (persona) for a response and return it.',
      schema: z.any(),
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input: unknown, context: AiToolContext) => {
        const payload = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
        const persona =
          (typeof payload.persona === 'string' && payload.persona) ||
          (typeof payload.personaKey === 'string' && payload.personaKey) ||
          (typeof payload.employee === 'string' && payload.employee) ||
          null;
        const message =
          (typeof payload.message === 'string' && payload.message) ||
          (typeof payload.instruction === 'string' && payload.instruction) ||
          (typeof payload.task === 'string' && payload.task) ||
          null;

        const resolvedMessage = message ?? (await loadLatestUserMessage(context.sessionId, context.employeeInstanceId));
        if (!resolvedMessage) {
          throw new BadRequestException('Missing message for delegation');
        }
        if (!persona) {
          const extracted = extractWorkflowRequestsFromMessage(resolvedMessage);
          if (extracted.length === 0) {
            throw new BadRequestException('Missing persona for delegation');
          }
          return runDelegate(extracted[0].personaKey, extracted[0].message, context);
        }
        return runDelegate(persona, resolvedMessage, context);
      }
    } satisfies AiToolDefinition);

    this.registry.register({
      key: 'coordinate_workflow',
      description: 'Coordinate multiple AI employees: ask each for input and return combined responses.',
      schema: z.any(),
      allowAutoRun: true,
      defaultRequiresApproval: false,
      run: async (input: unknown, context: AiToolContext) => {
        const payload = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
        const explicitMessage = typeof payload.message === 'string' ? payload.message : null;
        const rawMessage = explicitMessage ?? (await loadLatestUserMessage(context.sessionId, context.employeeInstanceId)) ?? '';

        const requestsField = payload.requests ?? payload.tasks;
        const requestsArray = Array.isArray(requestsField) ? requestsField : null;
        const requests =
          requestsArray?.flatMap((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
            const record = item as Record<string, unknown>;
            const persona =
              (typeof record.persona === 'string' && record.persona) ||
              (typeof record.personaKey === 'string' && record.personaKey) ||
              (typeof record.employee === 'string' && record.employee) ||
              null;
            const message =
              (typeof record.message === 'string' && record.message) ||
              (typeof record.instruction === 'string' && record.instruction) ||
              (typeof record.task === 'string' && record.task) ||
              null;
            if (!persona) return [];
            const personaKey = resolvePersonaKey(persona);
            if (!personaKey) return [];
            return [{ personaKey, message: message ?? rawMessage }];
          }) ?? [];

        const derived = requests.length > 0 ? requests : extractWorkflowRequestsFromMessage(rawMessage);
        const limited = derived.slice(0, 5);
        const topN = extractTopNFromMessage(rawMessage, 3);

        // If this looks like a "prioritize calls by lead score" request and Lumen needs
        // texts "for each", prefetch the top leads and attach them as context.
        let hotLeadContext: string | null = null;
        let hotLeads: Array<Record<string, unknown>> = [];
        const wantsLeadScoredCalls =
          /\b(lead\s*score|leadscore|score\s*tier|call\s+targets|who\s+should\s+i\s+call|prioritiz(e|ing)|top\s+\d+)\b/i.test(
            rawMessage
          ) && limited.some((req) => req.personaKey === 'agent_copilot' || req.personaKey === 'lead_nurse');

        if (wantsLeadScoredCalls) {
          try {
            const output = await this.registry.execute('get_hot_leads', { limit: Math.max(5, topN) }, context);
            const record =
              output && typeof output === 'object' && !Array.isArray(output)
                ? (output as Record<string, unknown>)
                : null;
            const leadsField = record && Array.isArray(record.leads) ? record.leads : [];
            hotLeads = leadsField
              .filter((lead): lead is Record<string, unknown> => Boolean(lead) && typeof lead === 'object' && !Array.isArray(lead))
              .slice(0, topN);
            if (hotLeads.length > 0) {
              hotLeadContext = formatHotLeadContext(hotLeads);
            }
          } catch {
            hotLeadContext = null;
            hotLeads = [];
          }
        }
        const results: Array<{
          personaKey: string;
          personaName: string;
          employeeInstanceId: string;
          reply: string;
          toolReplies?: string[];
        }> = [];

        for (const request of limited) {
          const messageWithContext = (() => {
            if (!hotLeadContext) return request.message;
            if (request.personaKey === 'agent_copilot') {
              return `${request.message}\n\n${hotLeadContext}\n\nReturn the top ${topN} call targets (name + leadId) and 1 reason each.`;
            }
            if (request.personaKey === 'lead_nurse') {
              if (hotLeads.length === 0) return request.message;
              return `${request.message}\n\nWrite 1–2 sentence outreach texts for each lead below. Label each text with the lead's name.\n${formatHotLeadContext(hotLeads)}`;
            }
            return request.message;
          })();

          try {
            const output = await runDelegate(request.personaKey, messageWithContext, context);
            if (!output) continue;

            if (request.personaKey === 'lead_nurse' && hotLeads.length > 0) {
              const reply = output.reply ?? '';
              const replyLower = reply.toLowerCase();
              const names = hotLeads
                .map((lead) => {
                  const first = typeof lead.firstName === 'string' ? lead.firstName.trim() : '';
                  const last = typeof lead.lastName === 'string' ? lead.lastName.trim() : '';
                  return [first, last].filter(Boolean).join(' ').trim();
                })
                .filter((value) => value.length > 0);

              const matched = names.filter((name) => replyLower.includes(name.toLowerCase())).length;

              if (matched < Math.min(topN, names.length)) {
                const lines = hotLeads.slice(0, topN).map((lead) => {
                  const firstName = typeof lead.firstName === 'string' ? lead.firstName.trim() : '';
                  const lastName = typeof lead.lastName === 'string' ? lead.lastName.trim() : '';
                  const name = [firstName, lastName].filter(Boolean).join(' ') || 'Lead';
                  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
                  const text = `${greeting} quick check-in — any updates on your home search? I can send a couple fresh options or set up a quick 5‑minute call.`;
                  return `- ${name}: ${text}`;
                });
                results.push({
                  ...output,
                  reply: `Here are the outreach texts:\n\n${lines.join('\n')}`
                });
                continue;
              }
            }

            results.push(output);
          } catch (error) {
            results.push({
              personaKey: request.personaKey,
              personaName: WORKFLOW_PERSONAS.find((p) => p.key === request.personaKey)?.name ?? request.personaKey,
              employeeInstanceId: 'unknown',
              reply: error instanceof Error ? `Error: ${error.message}` : 'Error delegating request'
            });
          }
        }

        return { results };
      }
    } satisfies AiToolDefinition);
  }

  private async fetchListing(tenantId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, tenantId },
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryEmail: true,
            primaryPhone: true
          }
        },
        offers: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            terms: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });
    if (!listing) {
      throw new Error('Listing not found');
    }
    return listing;
  }

  private async getListingDetails(tenantId: string, listingId: string): Promise<ListingDetails> {
    const listing = await this.fetchListing(tenantId, listingId);
    const missingFields: string[] = [];
    const warnings: string[] = [];

    if (!listing.price) missingFields.push('price');
    if (!listing.beds) missingFields.push('beds');
    if (!listing.baths) missingFields.push('baths');

    warnings.push('No MLS photo library is stored for this listing.');
    if (!listing.person) {
      warnings.push('This listing is not linked to an owner contact.');
    }

    const summary = {
      price: listing.price ? Number(listing.price) : null,
      beds: listing.beds ?? null,
      baths: listing.baths ?? null,
      propertyType: listing.propertyType ?? null
    };

    return {
      id: listing.id,
      status: listing.status,
      address: {
        line1: listing.addressLine1,
        line2: listing.addressLine2 ?? null,
        city: listing.city,
        state: listing.state,
        postalCode: listing.postalCode,
        country: listing.country
      },
      coordinates:
        listing.latitude && listing.longitude
          ? { latitude: listing.latitude, longitude: listing.longitude }
          : null,
      summary,
      owner: listing.person
        ? {
            id: listing.person.id,
            name: `${listing.person.firstName ?? ''} ${listing.person.lastName ?? ''}`.trim(),
            email: listing.person.primaryEmail ?? null,
            phone: listing.person.primaryPhone ?? null
          }
        : null,
      agent: null,
      offers: listing.offers.map((offer) => ({
        id: offer.id,
        status: offer.status,
        createdAt: offer.createdAt.toISOString()
      })),
      media: {
        photos: [],
        hasPhotos: false
      },
      metrics: {
        createdAt: listing.createdAt.toISOString(),
        updatedAt: listing.updatedAt.toISOString()
      },
      missingFields,
      warnings
    };
  }

  private buildListingCopy(
    details: ListingDetails,
    options?: { tone?: string | null; style?: string | null }
  ): ListingCopyPayload {
    const tone = options?.tone ?? 'balanced';
    const style = options?.style ?? 'concise';
    const priceText = details.summary.price ? formatCurrency(details.summary.price) : 'Call for price';
    const addressLine = `${details.address.line1}, ${details.address.city} ${details.address.state}`;
    const specParts = [
      details.summary.beds ? `${details.summary.beds} beds` : null,
      details.summary.baths ? `${details.summary.baths} baths` : null,
      details.summary.propertyType
    ].filter(Boolean);
    const highlights = [
      ...specParts,
      details.owner?.name ? `Owner contact: ${details.owner.name}` : null
    ].filter((value): value is string => Boolean(value));

    const mlsDescription = `${addressLine} offers ${specParts.join(' • ') || 'a flexible layout'}. Listed at ${priceText}. Crafted in a ${tone} tone with ${style} styling.`;
    const shortBlurb = `${details.address.line1} · ${priceText} – ${specParts.join(', ') || 'Fresh on the market.'}`;

    return {
      mlsDescription,
      shortBlurb,
      bulletHighlights: highlights.slice(0, 5),
      missingFields: details.missingFields,
      warnings: details.warnings
    };
  }

  private buildMarketingKit(details: ListingDetails, campaignType?: string | null): ListingMarketingKit {
    const copy = this.buildListingCopy(details);
    const resolvedCampaign = campaignType?.toUpperCase() ?? 'JUST LISTED';
    const emailSubject = `${resolvedCampaign}: ${details.address.line1}`;
    const emailBody = `${copy.shortBlurb}\n\nHighlights:\n${copy.bulletHighlights.map((line) => `• ${line}`).join('\n')}\n\nSchedule a tour today.`;
    const socialPosts = this.buildSocialPosts(details);

    return {
      campaignType: resolvedCampaign,
      mlsDescription: copy.mlsDescription,
      shortBlurb: copy.shortBlurb,
      bulletHighlights: copy.bulletHighlights,
      emailSubject,
      emailBody,
      socialPosts,
      missingFields: copy.missingFields,
      warnings: copy.warnings
    };
  }

  private buildSocialPosts(details: ListingDetails): string[] {
    const priceText = details.summary.price ? formatCurrency(details.summary.price) : 'Call for price';
    const specParts = [
      details.summary.beds ? `${details.summary.beds} beds` : null,
      details.summary.baths ? `${details.summary.baths} baths` : null,
      details.summary.propertyType
    ].filter(Boolean);
    const base = `${details.address.line1}, ${details.address.city} ${details.address.state}`;
    return [
      `${base} • ${priceText}\n${specParts.join(' • ') || 'Ready for showings.'}`,
      `${specParts.join(', ') || 'Spacious layout'} in ${details.address.city}. DM to tour ${details.address.line1}.`,
      `Fresh listing: ${details.address.line1}. ${priceText}. Reply to reserve a walkthrough.`
    ];
  }

  private async fetchTransaction(tenantId: string, transactionId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: transactionId, tenantId },
      select: {
        id: true,
        tenantId: true,
        stage: true,
        milestoneChecklist: true,
        listingId: true,
        personId: true
      }
    });
    if (!deal) {
      throw new Error('Transaction not found');
    }
    return deal;
  }

  private buildTransactionTimeline(deal: {
    id: string;
    stage: DealStage;
    listingId: string | null;
    milestoneChecklist: unknown;
  }): TransactionTimelinePayload {
    const checklist = normalizeChecklist(deal.milestoneChecklist);
    const now = new Date();
    const timelineEntries: TransactionTimelineItem[] = checklist.items.map((item) => {
      const dueDate = item.dueDate ?? extractDueDateFromNotes(item.notes);
      const status: TransactionTimelineItem['status'] = item.completedAt
        ? 'complete'
        : dueDate && new Date(dueDate) < now
          ? 'overdue'
          : 'pending';
      return {
        label: item.name,
        dueDate,
        completedAt: item.completedAt,
        status,
        notes: item.notes
      };
    });

    const timeline = [...timelineEntries].sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    const warnings: string[] = [];
    if (!timeline.length) {
      warnings.push('No milestone checklist entries are available for this transaction.');
    } else if (timeline.every((entry) => !entry.dueDate)) {
      warnings.push('Milestones are missing due dates; ordering is based on creation order.');
    }

    return {
      transactionId: deal.id,
      listingId: deal.listingId ?? null,
      stage: deal.stage,
      timeline,
      warnings
    };
  }

  private buildTransactionMissing(deal: {
    id: string;
    stage: DealStage;
    listingId: string | null;
    milestoneChecklist: unknown;
  }): TransactionMissingPayload {
    const checklist = normalizeChecklist(deal.milestoneChecklist);
    const warnings: string[] = [];
    if (!checklist.items.length) {
      warnings.push('No transaction milestones have been captured yet; missing items are inferred.');
    }

    const missingDocs = checklist.items
      .filter((item) => !item.completedAt && hasKeyword(item.name, ['doc', 'document', 'disclosure', 'form', 'addendum']))
      .map((item) => item.name);

    const missingDocNames = new Set(missingDocs);
    const outstandingTasks = checklist.items
      .filter((item) => !item.completedAt && !missingDocNames.has(item.name))
      .map((item) => item.name);

    const nowTs = Date.now();
    const overdueNames = checklist.items
      .filter((item) => {
        if (!item.dueDate || item.completedAt) {
          return false;
        }
        const due = new Date(item.dueDate);
        return due.getTime() < nowTs;
      })
      .map((item) => item.name);

    const blockingIssues: string[] = [];
    if (missingDocs.length && deal.stage !== DealStage.CLOSED) {
      blockingIssues.push('Critical documents are missing and must be collected before closing.');
    }
    if (overdueNames.length) {
      blockingIssues.push(`Overdue milestones: ${overdueNames.join(', ')}`);
    }

    return {
      transactionId: deal.id,
      listingId: deal.listingId ?? null,
      stage: deal.stage,
      missingDocs,
      outstandingTasks,
      blockingIssues,
      warnings
    };
  }

  private async fetchComps(
    tenantId: string,
    params: z.infer<typeof marketCompsSchema>
  ): Promise<MarketComp[]> {
    let postalCode = params.postalCode;
    let city = params.city;

    if (params.listingId && (!postalCode || !city)) {
      const listing = await this.prisma.listing.findFirst({
        where: { id: params.listingId, tenantId },
        select: { postalCode: true, city: true }
      });
      postalCode = postalCode ?? listing?.postalCode ?? undefined;
      city = city ?? listing?.city ?? undefined;
    }

    const comps = await this.prisma.listing.findMany({
      where: {
        tenantId,
        status: ListingStatus.CLOSED,
        ...(postalCode ? { postalCode } : {}),
        ...(city ? { city } : {})
      },
      orderBy: { updatedAt: 'desc' },
      take: params.limit ?? 10,
      select: {
        id: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        price: true,
        beds: true,
        baths: true,
        propertyType: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return comps.map((comp) => ({
      id: comp.id,
      address: comp.addressLine1,
      city: comp.city,
      state: comp.state,
      postalCode: comp.postalCode,
      price: comp.price ? Number(comp.price) : null,
      beds: comp.beds ?? null,
      baths: comp.baths ?? null,
      propertyType: comp.propertyType ?? null,
      soldDate: comp.updatedAt.toISOString(),
      domDays:
        comp.updatedAt && comp.createdAt
          ? Math.max(differenceInCalendarDays(comp.updatedAt, comp.createdAt), 0)
          : null,
      status: comp.status
    }));
  }

  private async computeMarketStats(
    tenantId: string,
    params: z.infer<typeof marketCompsSchema>,
    compsArg?: MarketComp[]
  ): Promise<MarketStatsResult> {
    const comps = compsArg ?? (await this.fetchComps(tenantId, params));
    const warnings: string[] = [];
    if (!comps.length) {
      warnings.push('No comparable sales found for the provided filters.');
    }

    const prices = comps
      .map((comp) => comp.price)
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => a - b);

    const domValues = comps
      .map((comp) => comp.domDays)
      .filter((value): value is number => typeof value === 'number');

    const averagePrice =
      prices.length > 0 ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null;
    const medianPrice = median(prices);
    const highestPrice = prices.length ? Math.max(...prices) : null;
    const lowestPrice = prices.length ? Math.min(...prices) : null;
    const medianDom = median(domValues);
    const averageDom =
      domValues.length > 0
        ? Math.round(domValues.reduce((sum, value) => sum + value, 0) / domValues.length)
        : null;

    if (!domValues.length) {
      warnings.push('Days-on-market metrics are unavailable for the supplied filters.');
    }

    const activeCount = await this.prisma.listing.count({
      where: {
        tenantId,
        status: ListingStatus.ACTIVE,
        ...(params.postalCode ? { postalCode: params.postalCode } : {}),
        ...(params.city ? { city: params.city } : {})
      }
    });

    const stats: MarketStats = {
      sample: comps.length,
      medianPrice,
      averagePrice,
      highestPrice,
      lowestPrice,
      medianDom,
      averageDom,
      averagePricePerSqft: null,
      activeCount,
      soldCount: comps.length,
      postalCode: params.postalCode ?? null,
      city: params.city ?? null
    };

    warnings.push('Square footage is not tracked; price per sqft cannot be computed.');

    return { stats, warnings };
  }

  private async computeDailySummary(tenantId: string, lookbackDays: number): Promise<DailySummary> {
    const now = new Date();
    const since = subDays(now, lookbackDays);
    const idleSince = subDays(now, 3);

    const [activeLeads, newLeads, idleLeads, openTasks, dueSoonTasks] = await Promise.all([
      this.prisma.person.count({
        where: {
          tenantId,
          deletedAt: null,
          stage: { not: PersonStage.CLOSED }
        }
      }),
      this.prisma.person.count({
        where: { tenantId, deletedAt: null, createdAt: { gt: since } }
      }),
      this.prisma.person.count({
        where: {
          tenantId,
          deletedAt: null,
          lastActivityAt: { lt: idleSince }
        }
      }),
      this.prisma.leadTask.count({
        where: { tenantId, status: LeadTaskStatus.OPEN }
      }),
      this.prisma.leadTask.count({
        where: {
          tenantId,
          status: LeadTaskStatus.OPEN,
          dueAt: { gt: now, lt: addDays(now, 2) }
        }
      })
    ]);

    return {
      generatedAt: now.toISOString(),
      totals: {
        activeLeads,
        newLeads,
        idleLeads
      },
      tasks: {
        open: openTasks,
        dueSoon: dueSoonTasks
      }
    };
  }

  private registerWithAliases<TInput, TResult>(
    definition: Omit<AiToolDefinition<TInput, TResult>, 'key'>,
    keys: string[]
  ) {
    keys.forEach((key) =>
      this.registry.register({
        key,
        ...definition
      })
    );
  }

  private async requireLead(tenantId: string, leadId: string) {
    const lead = await this.prisma.person.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true, primaryEmail: true, primaryPhone: true }
    });
    if (!lead) {
      throw new Error('Lead not found');
    }
    return lead;
  }
}

function sanitizeEmailSubject(subject: string): string {
  try {
    return subject.replace(/^\s*subject\s*:\s*/i, '').trim();
  } catch {
    return subject?.toString?.().trim?.() ?? '';
  }
}

function sanitizeEmailBody(body: string, subject?: string): string {
  let text = body ?? '';
  try {
    // Remove any standalone line that declares a Subject: ...
    text = text.replace(/^\s*subject\s*:[^\n]*\n?/gim, '');
    // Remove "HTML:" or "Text:" labels if present
    text = text.replace(/^\s*html\s*:\s*/i, '');
    text = text.replace(/^\s*text\s*:\s*/i, '');
    // If body begins with the subject itself, drop that first line
    const trimmed = text.trimStart();
    if (subject && trimmed.toLowerCase().startsWith(subject.toLowerCase())) {
      const firstNewline = trimmed.indexOf('\n');
      text = firstNewline >= 0 ? trimmed.slice(firstNewline + 1) : '';
    }
    // Collapse extra blank lines
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
  } catch {
    return text?.toString?.().trim?.() ?? '';
  }
}

function buildRequestContext(context: AiToolContext): RequestContext {
  return {
    userId: context.actorId,
    tenantId: context.tenantId,
    orgId: context.orgId,
    role: context.actorRole ?? UserRole.AGENT,
    teamIds: [],
    allowTeamContactActions: true,
    assignmentOverride: null
  };
}

function ensureTenant(context: AiToolContext): string {
  if (!context.tenantId) {
    throw new Error('tenantId is required');
  }
  return context.tenantId;
}

function normalizeChecklist(payload: unknown): { items: NormalizedChecklistItem[] } {
  if (!payload || typeof payload !== 'object') {
    return { items: [] };
  }
  const rawItems = (payload as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) {
    return { items: [] };
  }
  return {
    items: rawItems
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const notes = typeof record.notes === 'string' ? record.notes : null;
        const dueDate =
          typeof record.dueDate === 'string'
            ? record.dueDate
            : typeof record.targetDate === 'string'
              ? record.targetDate
              : typeof record.expectedAt === 'string'
                ? record.expectedAt
                : null;
        return {
          name: typeof record.name === 'string' ? record.name : 'Milestone',
          completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
          notes,
          updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
          updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : null,
          dueDate: dueDate ?? extractDueDateFromNotes(notes)
        };
      })
      .filter((item): item is NormalizedChecklistItem => item !== null)
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    return (values[mid - 1] + values[mid]) / 2;
  }
  return values[mid];
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function extractDueDateFromNotes(notes?: string | null): string | null {
  if (!notes) {
    return null;
  }
  const isoMatch = notes.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    const parsed = Date.parse(isoMatch[0]);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  const parsed = Date.parse(notes);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return null;
}

function hasKeyword(source: string, keywords: string[]): boolean {
  const lower = source.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

type ListingContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type ListingDetails = {
  id: string;
  status: ListingStatus;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  coordinates: { latitude: number; longitude: number } | null;
  summary: {
    price: number | null;
    beds: number | null;
    baths: number | null;
    propertyType: string | null;
  };
  owner: ListingContact | null;
  agent: ListingContact | null;
  offers: Array<{
    id: string;
    status: string;
    createdAt: string;
  }>;
  media: {
    photos: string[];
    hasPhotos: boolean;
  };
  metrics: {
    createdAt: string;
    updatedAt: string;
  };
  missingFields: string[];
  warnings: string[];
};

type ListingCopyPayload = {
  mlsDescription: string;
  shortBlurb: string;
  bulletHighlights: string[];
  missingFields: string[];
  warnings: string[];
};

type ListingMarketingKit = ListingCopyPayload & {
  campaignType: string;
  emailSubject: string;
  emailBody: string;
  socialPosts: string[];
};

type MarketComp = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
  soldDate: string;
  domDays: number | null;
  status: ListingStatus;
};

type MarketCompResponse = {
  comps: MarketComp[];
  warnings: string[];
};

type MarketStats = {
  sample: number;
  medianPrice: number | null;
  averagePrice: number | null;
  highestPrice: number | null;
  lowestPrice: number | null;
  medianDom: number | null;
  averageDom: number | null;
  averagePricePerSqft: number | null;
  activeCount: number;
  soldCount: number;
  postalCode: string | null;
  city: string | null;
};

type MarketStatsResult = {
  stats: MarketStats;
  warnings: string[];
};

type MarketReport = {
  generatedAt: string;
  stats: MarketStats;
  comps: MarketComp[];
  warnings: string[];
  focus?: string | null;
};

type TransactionTimelineItem = {
  label: string;
  dueDate: string | null;
  completedAt: string | null;
  status: 'pending' | 'complete' | 'overdue';
  notes: string | null;
};

type TransactionTimelinePayload = {
  transactionId: string;
  listingId: string | null;
  stage: DealStage;
  timeline: TransactionTimelineItem[];
  warnings: string[];
};

type TransactionMissingPayload = {
  transactionId: string;
  listingId: string | null;
  stage: DealStage;
  missingDocs: string[];
  outstandingTasks: string[];
  blockingIssues: string[];
  warnings: string[];
};

type NormalizedChecklistItem = {
  name: string;
  completedAt: string | null;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  dueDate: string | null;
};

type DailySummary = {
  generatedAt: string;
  totals: {
    activeLeads: number;
    newLeads: number;
    idleLeads: number;
  };
  tasks: {
    open: number;
    dueSoon: number;
  };
};
