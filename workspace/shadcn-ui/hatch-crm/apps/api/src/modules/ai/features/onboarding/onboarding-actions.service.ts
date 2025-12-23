import { BadRequestException, Injectable } from '@nestjs/common';

import type { Prisma } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';
import { OrganizationsService } from '@/modules/organizations/organizations.service';
import { CommissionPlansService } from '@/modules/commission-plans/commission-plans.service';
import type { RequestContext } from '@/modules/common/request-context';
import { commissionParserPrompt } from './commission-parser.prompt';
import type { OnboardingAction } from './onboarding-assistant.types';

export type ParsedCommissionPlans = {
  plans: Array<{
    name: string;
    brokerSplit: number;
    agentSplit: number;
    tiers?: Array<Record<string, unknown>>;
  }>;
  questionsToAsk: string[];
};

export type ActionResult = {
  ok: boolean;
  action: OnboardingAction;
  result?: Prisma.InputJsonValue | null;
  error?: string;
};

@Injectable()
export class OnboardingActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: AiPromptService,
    private readonly orgs: OrganizationsService,
    private readonly commissionPlans: CommissionPlansService
  ) {}

  async executeAction(ctx: RequestContext, action: OnboardingAction): Promise<ActionResult> {
    try {
      const resolved = await this.executeActionInternal(ctx, action);
      return { ok: true, action, result: resolved as Prisma.InputJsonValue };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
      return { ok: false, action, error: message, result: null };
    }
  }

  async executeActions(ctx: RequestContext, actions: OnboardingAction[]): Promise<ActionResult[]> {
    const out: ActionResult[] = [];
    for (const action of actions) {
      // Run sequentially to keep side-effects predictable.
      out.push(await this.executeAction(ctx, action));
    }
    return out;
  }

  async parseCommissionDescription(params: {
    organizationId: string;
    userId: string;
    description: string;
  }): Promise<ParsedCommissionPlans> {
    const organizationId = params.organizationId?.trim();
    if (!organizationId) {
      throw new BadRequestException('organizationId is required');
    }
    const userId = params.userId?.trim();
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    await this.ensureCommissionParserPrompt(organizationId, userId);

    const completion = await this.ai.complete({
      feature: AiFeature.COMMISSION_PARSER,
      promptTemplate: 'commission-parser',
      variables: { description: params.description ?? '' },
      userId,
      brokerageId: organizationId,
      options: {
        provider: 'grok',
        responseFormat: 'json_object',
        temperature: 0.1,
        maxTokens: 800
      }
    });

    const parsed = safeJsonParse(completion.content) ?? {};
    const plansRaw = Array.isArray(parsed.plans) ? parsed.plans : [];
    const plans = plansRaw
      .map((entry) => ({
        name: typeof entry?.name === 'string' ? entry.name : '',
        brokerSplit: Number(entry?.brokerSplit),
        agentSplit: Number(entry?.agentSplit),
        tiers: Array.isArray(entry?.tiers) ? entry.tiers : undefined
      }))
      .filter((plan) => plan.name.trim().length > 0 && Number.isFinite(plan.brokerSplit) && Number.isFinite(plan.agentSplit));

    const questionsToAsk = Array.isArray(parsed.questionsToAsk)
      ? parsed.questionsToAsk.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];

    return { plans, questionsToAsk };
  }

  async saveBrandColors(organizationId: string, colors: Record<string, unknown>): Promise<void> {
    const orgId = organizationId?.trim();
    if (!orgId) {
      throw new BadRequestException('organizationId is required');
    }

    await this.prisma.organizationAddon.upsert({
      where: { organizationId_key: { organizationId: orgId, key: 'branding' } },
      create: { organizationId: orgId, key: 'branding', enabled: true, metadata: { colors } as any },
      update: { metadata: { colors } as any }
    });
  }

  private async executeActionInternal(ctx: RequestContext, action: OnboardingAction): Promise<unknown> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing organization context');
    }
    const userId = ctx.userId?.trim();
    if (!userId) {
      throw new BadRequestException('Missing user context');
    }

    const actionType = (action.type ?? '').trim().toLowerCase();
    if (actionType !== 'configure') {
      throw new BadRequestException(`Unsupported action type: ${action.type}`);
    }

    const target = (action.target ?? '').trim();
    switch (target) {
      case 'set_brokerage_name': {
        const name = typeof action.value === 'string' ? action.value.trim() : '';
        if (!name) {
          throw new BadRequestException('set_brokerage_name requires a non-empty string value');
        }
        return this.prisma.organization.update({ where: { id: organizationId }, data: { name } });
      }

      case 'set_brand_colors': {
        if (!action.value || typeof action.value !== 'object') {
          throw new BadRequestException('set_brand_colors requires an object value');
        }
        await this.saveBrandColors(organizationId, action.value as Record<string, unknown>);
        return { ok: true };
      }

      case 'create_commission_plan': {
        if (!action.value || typeof action.value !== 'object') {
          throw new BadRequestException('create_commission_plan requires an object value');
        }
        const value = action.value as any;
        const name = typeof value.name === 'string' ? value.name.trim() : '';
        const brokerSplit = Number(value.brokerSplit);
        const agentSplit = Number(value.agentSplit);
        const tiers = Array.isArray(value.tiers) ? value.tiers : undefined;
        if (!name) {
          throw new BadRequestException('create_commission_plan.value.name is required');
        }
        if (!Number.isFinite(brokerSplit) || brokerSplit < 0 || brokerSplit > 1) {
          throw new BadRequestException('create_commission_plan.value.brokerSplit must be a number between 0 and 1');
        }
        if (!Number.isFinite(agentSplit) || agentSplit < 0 || agentSplit > 1) {
          throw new BadRequestException('create_commission_plan.value.agentSplit must be a number between 0 and 1');
        }

        return this.commissionPlans.create(ctx, { name, brokerSplit, agentSplit, tiers });
      }

      case 'configure_agent_portal': {
        if (!action.value || typeof action.value !== 'object') {
          throw new BadRequestException('configure_agent_portal requires an object value');
        }
        const value = action.value as any;
        const allowedPaths = Array.isArray(value.allowedPaths) ? value.allowedPaths : [];
        const landingPath = typeof value.landingPath === 'string' ? value.landingPath : undefined;
        if (allowedPaths.length === 0) {
          throw new BadRequestException('configure_agent_portal.value.allowedPaths must be a non-empty array');
        }
        return this.orgs.upsertAgentPortalConfig(organizationId, userId, { allowedPaths, ...(landingPath ? { landingPath } : {}) });
      }

      case 'invite_agents': {
        const list = Array.isArray(action.value) ? action.value : [];
        const emails = list
          .map((entry) => (typeof entry?.email === 'string' ? entry.email.trim().toLowerCase() : ''))
          .filter((email) => email.includes('@'));
        const limited = Array.from(new Set(emails)).slice(0, 100);
        const results = [];
        for (const email of limited) {
          results.push(await this.orgs.createAgentInvite(organizationId, userId, { email }));
        }
        return { invitesCreated: results.length };
      }

      case 'connect_quickbooks': {
        return { authorizeUrl: `/api/v1/integrations/quickbooks/authorize?orgId=${encodeURIComponent(organizationId)}` };
      }

      default: {
        throw new BadRequestException(`Unsupported configure target: ${target}`);
      }
    }
  }

  private async ensureCommissionParserPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.COMMISSION_PARSER, name: 'commission-parser' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.COMMISSION_PARSER, {
        organizationId,
        name: 'commission-parser',
        systemPrompt: commissionParserPrompt.systemPrompt,
        userPromptTemplate: commissionParserPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 800,
        temperature: 0.1,
        description: 'Extracts structured commission plans from plain English or document text.',
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.COMMISSION_PARSER, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.COMMISSION_PARSER, organizationId, existing.version);
    }
  }
}

function safeJsonParse(text: string): any | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
