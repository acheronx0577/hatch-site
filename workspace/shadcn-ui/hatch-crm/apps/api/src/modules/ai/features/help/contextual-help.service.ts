import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';
import type { RequestContext } from '@/modules/common/request-context';
import { contextualHelpPrompt } from './contextual-help.prompt';
import { fieldMetadata, matchFieldMetadata } from './field-metadata';
import type {
  ExplainFieldRequest,
  ExplainFieldResponse,
  FieldMeta,
  PageContext,
  PageHelpRequest,
  PageHelpResponse,
  UserHelpContext
} from './contextual-help.types';

@Injectable()
export class ContextualHelpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: AiPromptService
  ) {}

  async explainField(ctx: RequestContext, request: ExplainFieldRequest): Promise<ExplainFieldResponse> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing organization context');
    }
    const userId = ctx.userId?.trim();
    if (!userId) {
      throw new BadRequestException('Missing user context');
    }

    const fieldPath = (request.fieldPath ?? '').trim();
    if (!fieldPath) {
      throw new BadRequestException('fieldPath is required');
    }

    await this.ensureContextualHelpPrompt(organizationId, userId);

    const fieldMeta = this.getFieldMetadata(fieldPath);
    const userContext = await this.getUserContext(ctx);

    const completion = await this.ai.complete({
      feature: AiFeature.CONTEXTUAL_HELP,
      promptTemplate: 'contextual-help',
      variables: {
        helpType: 'field',
        isFieldHelp: true,
        isPageHelp: false,
        fieldPath,
        fieldMeta,
        userContext,
        specificQuestion: (request.question ?? '').trim(),
        currentValue: (request.currentValue ?? '')?.toString?.() ?? '',
        pagePath: '',
        pageContext: emptyPageContext(),
        question: ''
      },
      userId,
      brokerageId: organizationId,
      options: {
        provider: 'grok',
        temperature: 0.2,
        maxTokens: 350
      }
    });

    return {
      explanation: completion.content,
      relatedHelp: this.findRelatedHelp(fieldMeta),
      learnMoreLinks: fieldMeta.documentationLinks ?? []
    };
  }

  async askAboutPage(ctx: RequestContext, request: PageHelpRequest): Promise<PageHelpResponse> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing organization context');
    }
    const userId = ctx.userId?.trim();
    if (!userId) {
      throw new BadRequestException('Missing user context');
    }

    const pagePath = (request.pagePath ?? '').trim();
    if (!pagePath) {
      throw new BadRequestException('pagePath is required');
    }
    const question = (request.question ?? '').trim();
    if (!question) {
      throw new BadRequestException('question is required');
    }

    await this.ensureContextualHelpPrompt(organizationId, userId);

    const pageContext = this.getPageContext(pagePath);
    const userContext = await this.getUserContext(ctx);

    const completion = await this.ai.complete({
      feature: AiFeature.CONTEXTUAL_HELP,
      promptTemplate: 'contextual-help',
      variables: {
        helpType: 'page',
        isFieldHelp: false,
        isPageHelp: true,
        pagePath,
        pageContext,
        question,
        userContext,
        fieldPath: '',
        fieldMeta: this.getFieldMetadata(''),
        specificQuestion: '',
        currentValue: ''
      },
      userId,
      brokerageId: organizationId,
      options: {
        provider: 'grok',
        temperature: 0.2,
        maxTokens: 350
      }
    });

    return {
      answer: completion.content,
      suggestedActions: this.extractSuggestedActions(completion.content),
      relatedPages: pageContext.relatedPages ?? []
    };
  }

  getFieldMeta(fieldPath: string): FieldMeta {
    return this.getFieldMetadata(fieldPath);
  }

  getPageHelp(pagePath: string): PageContext {
    return this.getPageContext(pagePath);
  }

  private getFieldMetadata(fieldPath: string): FieldMeta {
    const normalized = (fieldPath ?? '').trim();
    const match = normalized ? matchFieldMetadata(normalized) : null;
    if (match?.meta) {
      return normalizeMeta(match.meta);
    }

    const label = normalized
      ? humanizeIdentifier(normalized.split('.').filter(Boolean).slice(-1)[0] ?? normalized)
      : 'Field';
    const fallback: FieldMeta = {
      label,
      description: normalized
        ? 'This field is used by Hatch as part of your brokerage workflow.'
        : 'No field metadata provided.',
      whyRequired: normalized ? 'This depends on your brokerage workflow and compliance needs.' : '',
      legalBasis: '',
      bestPractice: normalized ? 'If you are unsure what to enter, ask your managing broker or compliance admin.' : '',
      consequences: '',
      format: '',
      examples: [],
      documentationLinks: [],
      relatedFields: []
    };

    return normalizeMeta(fallback);
  }

  private findRelatedHelp(fieldMeta: FieldMeta): Array<{ fieldPath: string; meta: FieldMeta }> {
    const related = Array.isArray(fieldMeta.relatedFields) ? fieldMeta.relatedFields : [];
    const unique = Array.from(new Set(related.map((value) => (value ?? '').trim()).filter(Boolean)));
    return unique
      .map((path) => ({
        fieldPath: path,
        meta: normalizeMeta(matchFieldMetadata(path)?.meta ?? fieldMetadata[path] ?? this.getFieldMetadata(path))
      }))
      .slice(0, 6);
  }

  private getPageContext(pagePath: string): PageContext {
    const normalized = normalizePagePath(pagePath);

    const parts = normalized.split('/').filter(Boolean);
    const dashboardIndex = parts.indexOf('dashboard');
    const pageRoot = dashboardIndex !== -1 ? parts[dashboardIndex + 1] ?? 'dashboard' : parts[0] ?? 'dashboard';

    const title = humanizeIdentifier(pageRoot);

    const keyAreas: string[] = [];
    if (normalized.startsWith('/dashboard/settings')) {
      keyAreas.push('Brokerage profile', 'Team settings', 'Integrations', 'Branding');
    } else if (normalized.startsWith('/dashboard/marketing')) {
      keyAreas.push('Campaigns', 'Ads', 'Content', 'Lead gen');
    } else if (normalized.startsWith('/dashboard/transactions')) {
      keyAreas.push('Timelines', 'Deadlines', 'Documents', 'Compliance');
    } else if (normalized.startsWith('/dashboard/leads')) {
      keyAreas.push('Lead stages', 'Assignments', 'Follow-ups', 'Notes');
    } else if (normalized.startsWith('/dashboard/mission-control')) {
      keyAreas.push('Alerts', 'Approvals', 'Queue', 'Health checks');
    }

    const relatedPages: string[] = [];
    if (normalized.startsWith('/dashboard/settings')) {
      relatedPages.push('/dashboard/onboarding', '/dashboard/mission-control');
    }
    if (normalized.startsWith('/dashboard/onboarding')) {
      relatedPages.push('/dashboard/settings');
    }

    return {
      title,
      summary: `Help for ${title} in Hatch.`,
      keyAreas,
      relatedPages
    };
  }

  private async getUserContext(ctx: RequestContext): Promise<UserHelpContext> {
    const role = ctx.role?.toString?.() ?? 'AGENT';
    return { role };
  }

  private extractSuggestedActions(answer: string): string[] {
    const text = (answer ?? '').trim();
    if (!text) return [];

    const lines = text.split('\n').map((line) => line.trim());
    const start = lines.findIndex((line) => /^suggested actions[:]?$/i.test(line) || /^recommendations[:]?$/i.test(line));
    if (start === -1) return [];

    const actions: string[] = [];
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      if (/^[A-Z][A-Za-z ]+[:]\s*$/.test(line)) break;
      const bullet = line.replace(/^[-*]\s+/, '').trim();
      if (bullet) actions.push(bullet);
    }

    return actions.slice(0, 6);
  }

  private async ensureContextualHelpPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.CONTEXTUAL_HELP, name: 'contextual-help' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.CONTEXTUAL_HELP, {
        organizationId,
        name: 'contextual-help',
        systemPrompt: contextualHelpPrompt.systemPrompt,
        userPromptTemplate: contextualHelpPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 350,
        temperature: 0.2,
        description: 'Explain why fields/settings exist, with legal context and best practices.',
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.CONTEXTUAL_HELP, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.CONTEXTUAL_HELP, organizationId, existing.version);
    }
  }
}

function normalizeMeta(meta: FieldMeta): FieldMeta {
  return {
    label: meta.label ?? '',
    description: meta.description ?? '',
    whyRequired: meta.whyRequired ?? '',
    legalBasis: meta.legalBasis ?? '',
    bestPractice: meta.bestPractice ?? '',
    consequences: meta.consequences ?? '',
    format: meta.format ?? '',
    examples: Array.isArray(meta.examples) ? meta.examples.filter((value): value is string => typeof value === 'string') : [],
    documentationLinks: Array.isArray(meta.documentationLinks)
      ? meta.documentationLinks.filter((value): value is string => typeof value === 'string')
      : [],
    relatedFields: Array.isArray(meta.relatedFields) ? meta.relatedFields.filter((value): value is string => typeof value === 'string') : []
  };
}

function humanizeIdentifier(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';

  const withSpaces = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  return withSpaces.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizePagePath(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '/';
  if (!trimmed.startsWith('/')) return `/${trimmed}`;
  return trimmed;
}

function emptyPageContext(): PageContext {
  return { title: '', summary: '', keyAreas: [], relatedPages: [] };
}

