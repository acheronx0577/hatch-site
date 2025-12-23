import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';
import type { RequestContext } from '@/modules/common/request-context';
import { conversationSummaryPrompt } from './conversation-summary.prompt';
import type { ConversationSummaryAnalysis, ConversationSummaryResult, SummarizeConversationRequest } from './conversation-summary.types';

@Injectable()
export class ConversationSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: AiPromptService
  ) {}

  async summarizeConversation(ctx: RequestContext, request: SummarizeConversationRequest): Promise<ConversationSummaryResult> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const tenantId = ctx.tenantId?.trim();
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const leadId = request.leadId?.trim();
    if (!leadId) throw new BadRequestException('leadId is required');
    const conversationId = request.conversationId?.trim();
    if (!conversationId) throw new BadRequestException('conversationId is required');

    const [lead, leadFit, conversation, messages] = await Promise.all([
      this.prisma.person.findFirst({
        where: { id: leadId, tenantId, organizationId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true }
      }),
      this.prisma.leadFit.findFirst({
        where: { tenantId, personId: leadId },
        select: { budgetMin: true, budgetMax: true, timeframeDays: true, geo: true, preapproved: true }
      }),
      this.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        select: { id: true, type: true, personId: true, createdAt: true }
      }),
      this.prisma.message.findMany({
        where: { tenantId, conversationId },
        select: { createdAt: true, direction: true, channel: true, subject: true, body: true },
        orderBy: { createdAt: 'asc' },
        take: 120
      })
    ]);

    if (!lead) {
      throw new BadRequestException('Lead not found');
    }
    if (!conversation) {
      throw new BadRequestException('Conversation not found');
    }
    if (conversation.personId && conversation.personId !== leadId) {
      throw new BadRequestException('Conversation does not belong to this lead');
    }

    await this.ensureConversationSummaryPrompt(organizationId, userId);

    const transcript = buildTranscript(messages);
    const leadName = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Unknown lead';
    const existingPreferences = leadFit ? formatLeadFit(leadFit) : '';

    const completion = await this.ai.complete({
      feature: AiFeature.CONVERSATION_SUMMARY,
      promptTemplate: 'conversation-summary',
      variables: {
        lead: {
          name: leadName,
          existingPreferences: existingPreferences || undefined
        },
        conversation: {
          date: conversation.createdAt.toISOString(),
          channel: conversation.type?.toString?.() ?? 'unknown',
          transcript
        }
      },
      userId,
      brokerageId: organizationId,
      context: { entityType: 'lead', entityId: leadId },
      options: { provider: 'grok', responseFormat: 'json_object', temperature: 0.25, maxTokens: 950 }
    });

    const analysis = normalizeAnalysis(safeJsonParse(completion.content));

    let leadUpdated = false;
    if (request.autoUpdateLead) {
      leadUpdated = await this.updateLeadFromAnalysis({ tenantId, organizationId, leadId, analysis });
    }

    let tasksCreated = 0;
    if (request.autoCreateTasks) {
      tasksCreated = await this.createTasksFromAnalysis({ tenantId, leadId, assigneeId: userId, analysis });
    }

    return {
      ...analysis,
      requestId: completion.id,
      leadUpdated,
      tasksCreated
    };
  }

  async summarizeAllConversations(ctx: RequestContext, leadId: string): Promise<ConversationSummaryResult> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const tenantId = ctx.tenantId?.trim();
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const id = (leadId ?? '').trim();
    if (!id) throw new BadRequestException('leadId is required');

    const [lead, leadFit, messages] = await Promise.all([
      this.prisma.person.findFirst({
        where: { id, tenantId, organizationId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true }
      }),
      this.prisma.leadFit.findFirst({
        where: { tenantId, personId: id },
        select: { budgetMin: true, budgetMax: true, timeframeDays: true, geo: true, preapproved: true }
      }),
      this.prisma.message.findMany({
        where: { tenantId, personId: id },
        select: { createdAt: true, direction: true, channel: true, subject: true, body: true },
        orderBy: { createdAt: 'desc' },
        take: 180
      })
    ]);

    if (!lead) {
      throw new BadRequestException('Lead not found');
    }

    await this.ensureConversationSummaryPrompt(organizationId, userId);

    const transcript = buildTranscript([...messages].reverse());
    const leadName = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Unknown lead';
    const existingPreferences = leadFit ? formatLeadFit(leadFit) : '';

    const completion = await this.ai.complete({
      feature: AiFeature.CONVERSATION_SUMMARY,
      promptTemplate: 'conversation-summary',
      variables: {
        lead: {
          name: leadName,
          existingPreferences: existingPreferences || undefined
        },
        conversation: {
          date: 'multiple',
          channel: 'mixed',
          transcript
        }
      },
      userId,
      brokerageId: organizationId,
      context: { entityType: 'lead', entityId: id },
      options: { provider: 'grok', responseFormat: 'json_object', temperature: 0.25, maxTokens: 950 }
    });

    const analysis = normalizeAnalysis(safeJsonParse(completion.content));

    return {
      ...analysis,
      requestId: completion.id,
      leadUpdated: false,
      tasksCreated: 0
    };
  }

  async applyAnalysis(
    ctx: RequestContext,
    leadId: string,
    analysis: unknown,
    options?: { autoUpdateLead?: boolean; autoCreateTasks?: boolean }
  ): Promise<{ ok: boolean; leadUpdated: boolean; tasksCreated: number }> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const tenantId = ctx.tenantId?.trim();
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const id = (leadId ?? '').trim();
    if (!id) throw new BadRequestException('leadId is required');

    const normalized = normalizeAnalysis(analysis);

    let leadUpdated = false;
    if (options?.autoUpdateLead) {
      leadUpdated = await this.updateLeadFromAnalysis({ tenantId, organizationId, leadId: id, analysis: normalized });
    }

    let tasksCreated = 0;
    if (options?.autoCreateTasks) {
      tasksCreated = await this.createTasksFromAnalysis({ tenantId, leadId: id, assigneeId: userId, analysis: normalized });
    }

    return { ok: true, leadUpdated, tasksCreated };
  }

  private async updateLeadFromAnalysis(params: {
    tenantId: string;
    organizationId: string;
    leadId: string;
    analysis: ConversationSummaryAnalysis;
  }): Promise<boolean> {
    const budgetMin = sanitizeNumber(params.analysis.extractedData?.budget?.min);
    const budgetMax = sanitizeNumber(params.analysis.extractedData?.budget?.max);
    const preApproved =
      typeof params.analysis.extractedData?.preApproved === 'boolean' ? params.analysis.extractedData.preApproved : null;
    const preferredAreas = Array.isArray(params.analysis.extractedData?.preferredAreas)
      ? params.analysis.extractedData.preferredAreas.filter((value) => typeof value === 'string' && value.trim())
      : [];
    const timeline = typeof params.analysis.extractedData?.timeline === 'string' ? params.analysis.extractedData.timeline.trim() : '';

    const timeframeDays = timeline ? parseTimeframeDays(timeline) : null;

    const existing = await this.prisma.leadFit.findFirst({
      where: { tenantId: params.tenantId, personId: params.leadId },
      select: { id: true, budgetMin: true, budgetMax: true, timeframeDays: true, geo: true, preapproved: true }
    });

    const next: Record<string, any> = {};
    if (budgetMin !== null && (existing?.budgetMin === null || existing?.budgetMin === undefined)) {
      next.budgetMin = budgetMin;
    }
    if (budgetMax !== null && (existing?.budgetMax === null || existing?.budgetMax === undefined)) {
      next.budgetMax = budgetMax;
    }
    if (timeframeDays !== null && (existing?.timeframeDays === null || existing?.timeframeDays === undefined)) {
      next.timeframeDays = timeframeDays;
    }
    if (preferredAreas.length && !(existing?.geo ?? '').trim()) {
      next.geo = preferredAreas.join(', ');
    }
    if (preApproved !== null && existing && existing.preapproved !== preApproved) {
      next.preapproved = preApproved;
    }

    if (Object.keys(next).length === 0) {
      if (!existing && (budgetMin !== null || budgetMax !== null || timeframeDays !== null || preferredAreas.length || preApproved !== null)) {
        await this.prisma.leadFit.create({
          data: {
            tenantId: params.tenantId,
            personId: params.leadId,
            budgetMin: budgetMin ?? undefined,
            budgetMax: budgetMax ?? undefined,
            timeframeDays: timeframeDays ?? undefined,
            geo: preferredAreas.length ? preferredAreas.join(', ') : undefined,
            preapproved: preApproved ?? false
          }
        });
        return true;
      }
      return false;
    }

    if (!existing) {
      await this.prisma.leadFit.create({
        data: {
          tenantId: params.tenantId,
          personId: params.leadId,
          budgetMin: next.budgetMin ?? undefined,
          budgetMax: next.budgetMax ?? undefined,
          timeframeDays: next.timeframeDays ?? undefined,
          geo: next.geo ?? undefined,
          preapproved: typeof next.preapproved === 'boolean' ? next.preapproved : false
        }
      });
      return true;
    }

    await this.prisma.leadFit.update({
      where: { id: existing.id },
      data: next
    });

    return true;
  }

  private async createTasksFromAnalysis(params: {
    tenantId: string;
    leadId: string;
    assigneeId: string;
    analysis: ConversationSummaryAnalysis;
  }): Promise<number> {
    const steps = Array.isArray(params.analysis.suggestedNextSteps) ? params.analysis.suggestedNextSteps : [];
    const limited = steps.slice(0, 6);

    let created = 0;
    for (const step of limited) {
      const title = typeof step?.action === 'string' ? step.action.trim() : '';
      if (!title) continue;

      const dueAt = typeof step?.suggestedDate === 'string' ? parseIsoDate(step.suggestedDate) : null;

      await this.prisma.leadTask.create({
        data: {
          tenantId: params.tenantId,
          personId: params.leadId,
          assigneeId: params.assigneeId,
          title,
          dueAt: dueAt ?? undefined
        }
      });
      created += 1;
    }

    return created;
  }

  private async ensureConversationSummaryPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.CONVERSATION_SUMMARY, name: 'conversation-summary' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.CONVERSATION_SUMMARY, {
        organizationId,
        name: 'conversation-summary',
        systemPrompt: conversationSummaryPrompt.systemPrompt,
        userPromptTemplate: conversationSummaryPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 950,
        temperature: 0.25,
        description: 'Summarizes a lead conversation and extracts structured data.',
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.CONVERSATION_SUMMARY, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.CONVERSATION_SUMMARY, organizationId, existing.version);
    }
  }
}

function safeJsonParse(text: string): unknown | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizeAnalysis(value: unknown): ConversationSummaryAnalysis {
  const fallback: ConversationSummaryAnalysis = {
    summary: '',
    keyPoints: [],
    extractedData: {
      budget: { min: null, max: null },
      timeline: null,
      preferredAreas: [],
      propertyType: null,
      bedrooms: { min: null, max: null },
      mustHaves: [],
      dealBreakers: [],
      preApproved: null,
      hasAgent: null,
      motivation: null,
      concerns: []
    },
    commitments: [],
    sentiment: 'neutral',
    suggestedNextSteps: [],
    questionsToAnswer: [],
    followUpTopics: []
  };

  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const obj = value as any;
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const keyPoints = Array.isArray(obj.keyPoints) ? obj.keyPoints.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean) : [];

  const extracted = obj.extractedData ?? {};
  const budgetMin = sanitizeNumber(extracted?.budget?.min);
  const budgetMax = sanitizeNumber(extracted?.budget?.max);
  const timeline = typeof extracted?.timeline === 'string' ? extracted.timeline.trim() : null;
  const preferredAreas = Array.isArray(extracted?.preferredAreas) ? extracted.preferredAreas.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean) : [];
  const propertyType = typeof extracted?.propertyType === 'string' ? extracted.propertyType.trim() : null;
  const bedsMin = sanitizeNumber(extracted?.bedrooms?.min);
  const bedsMax = sanitizeNumber(extracted?.bedrooms?.max);
  const mustHaves = Array.isArray(extracted?.mustHaves) ? extracted.mustHaves.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean) : [];
  const dealBreakers = Array.isArray(extracted?.dealBreakers) ? extracted.dealBreakers.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean) : [];
  const preApproved = typeof extracted?.preApproved === 'boolean' ? extracted.preApproved : null;
  const hasAgent = typeof extracted?.hasAgent === 'boolean' ? extracted.hasAgent : null;
  const motivation = typeof extracted?.motivation === 'string' ? extracted.motivation.trim() : null;
  const concerns = Array.isArray(extracted?.concerns) ? extracted.concerns.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean) : [];

  const commitments = Array.isArray(obj.commitments)
    ? obj.commitments
        .map((c: any) => ({
          by: c?.by === 'agent' ? 'agent' : 'client',
          commitment: typeof c?.commitment === 'string' ? c.commitment.trim() : '',
          deadline: typeof c?.deadline === 'string' ? c.deadline : null
        }))
        .filter((c: any) => c.commitment)
    : [];

  const sentimentRaw = typeof obj.sentiment === 'string' ? obj.sentiment.toLowerCase().trim() : '';
  const sentiment =
    sentimentRaw === 'positive' || sentimentRaw === 'neutral' || sentimentRaw === 'negative' || sentimentRaw === 'urgent'
      ? (sentimentRaw as ConversationSummaryAnalysis['sentiment'])
      : 'neutral';

  const suggestedNextSteps = Array.isArray(obj.suggestedNextSteps)
    ? obj.suggestedNextSteps
        .map((s: any) => ({
          action: typeof s?.action === 'string' ? s.action.trim() : '',
          priority: s?.priority === 'high' || s?.priority === 'medium' || s?.priority === 'low' ? s.priority : 'medium',
          suggestedDate: typeof s?.suggestedDate === 'string' ? s.suggestedDate : null
        }))
        .filter((s: any) => s.action)
    : [];

  const questionsToAnswer = Array.isArray(obj.questionsToAnswer)
    ? obj.questionsToAnswer.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean)
    : [];
  const followUpTopics = Array.isArray(obj.followUpTopics)
    ? obj.followUpTopics.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean)
    : [];

  return {
    summary: summary || fallback.summary,
    keyPoints,
    extractedData: {
      budget: { min: budgetMin, max: budgetMax },
      timeline,
      preferredAreas,
      propertyType,
      bedrooms: { min: bedsMin, max: bedsMax },
      mustHaves,
      dealBreakers,
      preApproved,
      hasAgent,
      motivation,
      concerns
    },
    commitments,
    sentiment,
    suggestedNextSteps,
    questionsToAnswer,
    followUpTopics
  };
}

function buildTranscript(messages: Array<{ createdAt: Date; direction: string; channel: string; subject: string | null; body: string | null }>) {
  if (!messages.length) return '';

  const lines: string[] = [];
  for (const message of messages) {
    const role = (message.direction ?? '').toString().toUpperCase() === 'OUTBOUND' ? 'AGENT' : 'CLIENT';
    const channel = (message.channel ?? '').toString().toUpperCase();
    const subject = message.subject?.trim();
    const body = (message.body ?? '').trim();
    const parts = [
      `[${role} | ${channel}${subject ? ` | ${subject}` : ''} | ${message.createdAt.toISOString()}]`,
      body
    ].filter(Boolean);
    const combined = parts.join('\n');
    lines.push(combined.length > 1400 ? `${combined.slice(0, 1397)}...` : combined);
  }
  return lines.join('\n\n');
}

function formatLeadFit(fit: { budgetMin: number | null; budgetMax: number | null; timeframeDays: number | null; geo: string | null; preapproved: boolean }) {
  const lines: string[] = [];
  if (fit.budgetMin || fit.budgetMax) {
    lines.push(`Budget: ${fit.budgetMin ?? ''}-${fit.budgetMax ?? ''}`);
  }
  if (typeof fit.timeframeDays === 'number') {
    lines.push(`TimeframeDays: ${fit.timeframeDays}`);
  }
  if (fit.geo?.trim()) {
    lines.push(`Areas: ${fit.geo.trim()}`);
  }
  lines.push(`Preapproved: ${fit.preapproved ? 'true' : 'false'}`);
  return lines.join('\n');
}

function sanitizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function parseIsoDate(value: string): Date | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseTimeframeDays(value: string): number | null {
  const lowered = (value ?? '').toLowerCase();
  const match = lowered.match(/([0-9]+)(?:\s*-\s*([0-9]+))?\s*(day|days|week|weeks|month|months)/);
  if (!match) return null;

  const a = Number(match[1]);
  const b = match[2] ? Number(match[2]) : a;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  const avg = (a + b) / 2;
  const unit = match[3];
  if (unit.startsWith('day')) return Math.round(avg);
  if (unit.startsWith('week')) return Math.round(avg * 7);
  if (unit.startsWith('month')) return Math.round(avg * 30);
  return null;
}

