import { BadRequestException, Injectable } from '@nestjs/common';
import { ConsentScope } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { MessagesService } from '@/modules/messages/messages.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';
import type { RequestContext } from '@/modules/common/request-context';
import { followUpEmailPrompt } from './follow-up-email.prompt';
import { followUpTextPrompt } from './follow-up-text.prompt';
import { FollowUpType, type FollowUpEmailResult, type FollowUpTextResult } from './follow-up.types';

type ParsedEmail = { subject: string; body: string };
type ParsedText = { text: string };

@Injectable()
export class FollowUpMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly ai: AiService,
    private readonly prompts: AiPromptService
  ) {}

  async generateEmail(
    ctx: RequestContext,
    request: { leadId: string; followUpType: FollowUpType; specificGoal?: string }
  ): Promise<FollowUpEmailResult> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const tenantId = ctx.tenantId?.trim();
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const leadId = request.leadId?.trim();
    if (!leadId) throw new BadRequestException('leadId is required');

    const followUpType = request.followUpType;
    if (!followUpType) throw new BadRequestException('followUpType is required');

    const [lead, agent, org, leadFit, recentMessages, recentTours] = await Promise.all([
      this.prisma.person.findFirst({
        where: { id: leadId, tenantId, organizationId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, primaryEmail: true, primaryPhone: true, lastActivityAt: true }
      }),
      this.prisma.user.findFirst({
        where: { id: userId, tenantId, organizationId },
        select: { firstName: true, lastName: true }
      }),
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      this.prisma.leadFit.findFirst({
        where: { tenantId, personId: leadId },
        select: { budgetMin: true, budgetMax: true, timeframeDays: true, geo: true, preapproved: true }
      }),
      this.prisma.message.findMany({
        where: { tenantId, personId: leadId },
        select: { channel: true, direction: true, subject: true, body: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      this.prisma.tour.findMany({
        where: { tenantId, personId: leadId },
        select: {
          listing: {
            select: {
              addressLine1: true,
              city: true,
              state: true,
              postalCode: true,
              price: true,
              beds: true,
              baths: true
            }
          },
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 3
      })
    ]);

    if (!lead) {
      throw new BadRequestException('Lead not found');
    }

    await this.ensureFollowUpEmailPrompt(organizationId, userId);

    const leadName = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Unknown lead';
    const agentName = agent ? `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim() : 'Your agent';
    const brokerageName = org?.name?.trim() || 'Hatch';

    const previousConversation = formatRecentMessages(recentMessages);
    const propertiesDiscussed = recentTours
      .map((tour) => tour.listing)
      .filter(Boolean)
      .map((listing) => formatTourListing(listing as any))
      .filter(Boolean);

    const leadPreferences: string[] = [];
    if (leadFit?.budgetMin || leadFit?.budgetMax) {
      leadPreferences.push(
        `Budget: ${formatMoney(leadFit.budgetMin)} - ${formatMoney(leadFit.budgetMax)}`
      );
    }
    if (typeof leadFit?.timeframeDays === 'number') {
      leadPreferences.push(`Timeline: ${leadFit.timeframeDays} days`);
    }
    if (leadFit?.geo?.trim()) {
      leadPreferences.push(`Areas: ${leadFit.geo.trim()}`);
    }
    if (typeof leadFit?.preapproved === 'boolean') {
      leadPreferences.push(`Pre-approved: ${leadFit.preapproved ? 'Yes' : 'No'}`);
    }

    const daysSinceContact = lead.lastActivityAt ? daysSince(lead.lastActivityAt) : null;

    const completion = await this.ai.complete({
      feature: AiFeature.FOLLOW_UP_EMAIL,
      promptTemplate: 'follow-up-email',
      variables: {
        lead: {
          name: leadName,
          firstName: lead.firstName || leadName.split(' ')[0] || 'there'
        },
        agent: {
          name: agentName,
          phone: '',
          brokerage: brokerageName
        },
        context: {
          type: followUpType,
          daysSinceContact: daysSinceContact ?? '',
          previousConversation: previousConversation || '',
          propertiesDiscussed: propertiesDiscussed.length ? propertiesDiscussed : undefined,
          leadPreferences: leadPreferences.length ? leadPreferences : undefined,
          specificAsk: request.specificGoal?.trim() || ''
        }
      },
      userId,
      brokerageId: organizationId,
      context: { entityType: 'lead', entityId: leadId },
      options: { provider: 'grok', responseFormat: 'json_object', temperature: 0.7, maxTokens: 550, requiresHumanApproval: true }
    });

    const pendingActionId = completion.requiresApproval
      ? (await this.prisma.aiPendingAction.findFirst({
          where: {
            organizationId,
            requestedById: userId,
            feature: AiFeature.FOLLOW_UP_EMAIL,
            entityId: leadId,
            generatedContent: completion.content,
            status: 'pending'
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        }))?.id ?? null
      : null;

    const parsed = parseEmailJson(completion.content);

    return {
      subject: parsed.subject,
      body: parsed.body,
      requestId: completion.id,
      pendingActionId,
      requiresApproval: completion.requiresApproval,
      usage: completion.usage
    };
  }

  async generateText(
    ctx: RequestContext,
    request: { leadId: string; followUpType: FollowUpType; brief?: string }
  ): Promise<FollowUpTextResult> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const tenantId = ctx.tenantId?.trim();
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const leadId = request.leadId?.trim();
    if (!leadId) throw new BadRequestException('leadId is required');

    const followUpType = request.followUpType;
    if (!followUpType) throw new BadRequestException('followUpType is required');

    const [lead, agent] = await Promise.all([
      this.prisma.person.findFirst({
        where: { id: leadId, tenantId, organizationId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true }
      }),
      this.prisma.user.findFirst({
        where: { id: userId, tenantId, organizationId },
        select: { firstName: true, lastName: true }
      })
    ]);

    if (!lead) {
      throw new BadRequestException('Lead not found');
    }

    await this.ensureFollowUpTextPrompt(organizationId, userId);

    const agentFirstName = agent?.firstName?.trim() || 'Hatch';

    const completion = await this.ai.complete({
      feature: AiFeature.FOLLOW_UP_TEXT,
      promptTemplate: 'follow-up-text',
      variables: {
        lead: { firstName: lead.firstName?.trim() || 'there' },
        agent: { firstName: agentFirstName },
        context: { type: followUpType, brief: request.brief?.trim() || '' }
      },
      userId,
      brokerageId: organizationId,
      context: { entityType: 'lead', entityId: leadId },
      options: { provider: 'grok', responseFormat: 'json_object', temperature: 0.7, maxTokens: 220, requiresHumanApproval: true }
    });

    const pendingActionId = completion.requiresApproval
      ? (await this.prisma.aiPendingAction.findFirst({
          where: {
            organizationId,
            requestedById: userId,
            feature: AiFeature.FOLLOW_UP_TEXT,
            entityId: leadId,
            generatedContent: completion.content,
            status: 'pending'
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        }))?.id ?? null
      : null;

    const parsed = parseTextJson(completion.content);

    return {
      text: parsed.text,
      requestId: completion.id,
      pendingActionId,
      requiresApproval: completion.requiresApproval,
      usage: completion.usage
    };
  }

  async sendApproved(ctx: RequestContext, actionId: string): Promise<{ ok: boolean; messageId: string }> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const tenantId = ctx.tenantId?.trim();
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const id = (actionId ?? '').trim();
    if (!id) throw new BadRequestException('actionId is required');

    const pending = await this.prisma.aiPendingAction.findFirst({
      where: { id, organizationId }
    });
    if (!pending) {
      throw new BadRequestException('Pending action not found');
    }
    if (pending.status !== 'approved') {
      throw new BadRequestException(`Pending action must be approved before sending (status=${pending.status})`);
    }

    const feature = (pending.feature ?? '').toString();
    const leadId =
      (pending.entityId ?? '').trim() ||
      ((pending.originalRequest as any)?.context?.entityId as string | undefined)?.trim() ||
      '';

    if (!leadId) {
      throw new BadRequestException('Pending action is missing lead context');
    }

    const lead = await this.prisma.person.findFirst({
      where: { id: leadId, tenantId, organizationId, deletedAt: null },
      select: { id: true, primaryEmail: true, primaryPhone: true }
    });
    if (!lead) {
      throw new BadRequestException('Lead not found');
    }

    if (feature === AiFeature.FOLLOW_UP_EMAIL) {
      const parsed = parseEmailJson(pending.generatedContent);
      const to = lead.primaryEmail?.trim() || '';
      if (!to) {
        throw new BadRequestException('Lead is missing an email address');
      }

      const fromDomain = (process.env.EMAIL_SENDER_DOMAIN ?? 'example.hatchcrm.test').trim();
      const from = `noreply@${fromDomain}`;

      const message = await this.messages.sendEmail({
        tenantId,
        personId: leadId,
        userId,
        from,
        to,
        subject: parsed.subject,
        body: parsed.body,
        scope: ConsentScope.PROMOTIONAL,
        includeUnsubscribe: true
      });

      await this.prisma.aiPendingAction.update({
        where: { id: pending.id },
        data: {
          status: 'executed',
          executedAt: new Date(),
          executionResult: { ok: true, messageId: message.id, channel: 'email' } as any
        }
      });

      return { ok: true, messageId: message.id };
    }

    if (feature === AiFeature.FOLLOW_UP_TEXT) {
      const parsed = parseTextJson(pending.generatedContent);
      const to = lead.primaryPhone?.trim() || '';
      if (!to) {
        throw new BadRequestException('Lead is missing a phone number');
      }

      const from = (process.env.TWILIO_FROM_NUMBER ?? '').trim();
      if (!from) {
        throw new BadRequestException('TWILIO_FROM_NUMBER is not configured');
      }

      const message = await this.messages.sendSms({
        tenantId,
        personId: leadId,
        userId,
        from,
        to,
        body: parsed.text,
        scope: ConsentScope.PROMOTIONAL,
        overrideQuietHours: false,
        transactional: false
      });

      await this.prisma.aiPendingAction.update({
        where: { id: pending.id },
        data: {
          status: 'executed',
          executedAt: new Date(),
          executionResult: { ok: true, messageId: message.id, channel: 'sms' } as any
        }
      });

      return { ok: true, messageId: message.id };
    }

    throw new BadRequestException('Unsupported AI pending action feature for follow-up send');
  }

  private async ensureFollowUpEmailPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.FOLLOW_UP_EMAIL, name: 'follow-up-email' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.FOLLOW_UP_EMAIL, {
        organizationId,
        name: 'follow-up-email',
        systemPrompt: followUpEmailPrompt.systemPrompt,
        userPromptTemplate: followUpEmailPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 550,
        temperature: 0.7,
        description: 'Generates a follow-up email draft for a lead.',
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.FOLLOW_UP_EMAIL, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.FOLLOW_UP_EMAIL, organizationId, existing.version);
    }
  }

  private async ensureFollowUpTextPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.FOLLOW_UP_TEXT, name: 'follow-up-text' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.FOLLOW_UP_TEXT, {
        organizationId,
        name: 'follow-up-text',
        systemPrompt: followUpTextPrompt.systemPrompt,
        userPromptTemplate: followUpTextPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 220,
        temperature: 0.7,
        description: 'Generates a follow-up text message draft for a lead.',
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.FOLLOW_UP_TEXT, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.FOLLOW_UP_TEXT, organizationId, existing.version);
    }
  }
}

function safeJsonParse(text: string): any | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseEmailJson(text: string): ParsedEmail {
  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== 'object') {
    const fallbackBody = (text ?? '').trim();
    return {
      subject: fallbackBody ? fallbackBody.slice(0, 80) : 'Follow-up',
      body: fallbackBody || 'Hi there,\n\nJust checking in.\n\n— Hatch'
    };
  }

  const subject = typeof (parsed as any).subject === 'string' ? (parsed as any).subject.trim() : '';
  const body = typeof (parsed as any).body === 'string' ? (parsed as any).body.trim() : '';

  return {
    subject: subject || 'Follow-up',
    body: body || 'Hi there,\n\nJust checking in.\n\n— Hatch'
  };
}

function parseTextJson(text: string): ParsedText {
  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== 'object') {
    const fallback = (text ?? '').trim();
    return { text: fallback || 'Quick check-in — when’s a good time to connect? — Hatch' };
  }

  const value =
    typeof (parsed as any).text === 'string'
      ? (parsed as any).text.trim()
      : typeof (parsed as any).message === 'string'
        ? (parsed as any).message.trim()
        : '';

  return { text: value || 'Quick check-in — when’s a good time to connect? — Hatch' };
}

function formatRecentMessages(
  messages: Array<{ channel: string; direction: string; subject: string | null; body: string | null; createdAt: Date }>
) {
  if (!messages.length) return '';
  const ordered = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lines: string[] = [];
  for (const message of ordered) {
    const direction = (message.direction ?? '').toString().toUpperCase();
    const channel = (message.channel ?? '').toString().toUpperCase();
    const subject = message.subject?.trim();
    const body = (message.body ?? '').trim();
    const headerParts = [direction, channel].filter(Boolean).join(' ');
    const header = headerParts ? `${headerParts}:` : 'Message:';
    const line = subject ? `${header} ${subject} — ${body}` : `${header} ${body}`;
    const clipped = line.length > 500 ? `${line.slice(0, 497)}...` : line;
    if (clipped.trim()) lines.push(clipped);
  }
  return lines.join('\n');
}

function daysSince(date: Date): number {
  const ms = Date.now() - date.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function formatTourListing(listing: {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  price: any;
  beds: number | null;
  baths: number | null;
}) {
  const address = `${listing.addressLine1}, ${listing.city}, ${listing.state} ${listing.postalCode}`.trim();
  const price = listing.price ? formatMoney(Number(listing.price)) : '';
  const beds = typeof listing.beds === 'number' ? `${listing.beds}BR` : '';
  const baths = typeof listing.baths === 'number' ? `${listing.baths}BA` : '';
  const specs = [price, beds, baths].filter(Boolean).join(', ');
  return specs ? `${address} (${specs})` : address;
}

function formatMoney(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `$${value}`;
  }
}
