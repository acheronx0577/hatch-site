import { BadRequestException, Injectable } from '@nestjs/common';
import pdfParse from 'pdf-parse';

import type { OnboardingState, Prisma } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';
import type { RequestContext } from '@/modules/common/request-context';
import { onboardingAssistantPrompt } from './onboarding-assistant.prompt';
import { OnboardingActionsService } from './onboarding-actions.service';
import type {
  OnboardingAction,
  OnboardingChatResponse,
  OnboardingProgress,
  OnboardingUploadRequest,
  OnboardingUploadResponse,
  ParsedAssistantResponse
} from './onboarding-assistant.types';

type ConversationEntry = { role: 'user' | 'assistant'; content: string; at?: string };

const CONFIGURE_TARGET_TO_STEP: Record<string, string> = {
  set_brokerage_name: 'profile',
  set_brand_colors: 'branding',
  create_commission_plan: 'commissions',
  configure_agent_portal: 'portal',
  invite_agents: 'invites',
  connect_quickbooks: 'compliance'
};

const ORDERED_STEPS = ['welcome', 'profile', 'branding', 'compliance', 'commissions', 'portal', 'invites', 'done'] as const;

@Injectable()
export class OnboardingAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: AiPromptService,
    private readonly actions: OnboardingActionsService
  ) {}

  async chat(ctx: RequestContext, message: string): Promise<OnboardingChatResponse> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing organization context');
    }
    const userId = ctx.userId?.trim();
    if (!userId) {
      throw new BadRequestException('Missing user context');
    }
    const trimmed = (message ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('message is required');
    }

    const state = await this.getOrCreateState(organizationId);
    await this.ensureOnboardingAssistantPrompt(organizationId, userId);

    const history = normalizeConversation(state.conversationHistory).slice(-20);
    const brokerageContext = await this.buildOnboardingContext(organizationId);

    const completion = await this.ai.complete({
      feature: AiFeature.ONBOARDING_ASSISTANT,
      promptTemplate: 'onboarding-assistant',
      variables: {
        currentStep: state.currentStep,
        completedSteps: state.completedSteps ?? [],
        skippedSteps: state.skippedSteps ?? [],
        brokerageContext,
        conversationHistory: history,
        userMessage: trimmed
      },
      userId,
      brokerageId: organizationId,
      options: {
        provider: 'grok',
        responseFormat: 'json_object',
        temperature: 0.2,
        maxTokens: 900
      }
    });

    const parsed = this.parseAssistantResponse(completion.content);

    const executable = parsed.actions.filter((action) => action.type === 'configure' && !action.requiresConfirmation);
    const needsConfirmation = parsed.actions.filter((action) => action.type === 'configure' && Boolean(action.requiresConfirmation));

    const executedResults = executable.length ? await this.actions.executeActions(ctx, executable) : [];

    const completedSteps = new Set<string>(state.completedSteps ?? []);
    for (const result of executedResults) {
      if (!result.ok) continue;
      const target = (result.action.target ?? '').trim();
      const step = CONFIGURE_TARGET_TO_STEP[target];
      if (step) {
        completedSteps.add(step);
      }
    }

    const skippedSteps = new Set<string>(state.skippedSteps ?? []);
    for (const action of parsed.actions) {
      if (action.type !== 'skip') continue;
      const step = (action.target ?? '').trim();
      if (step) {
        skippedSteps.add(step);
      }
    }

    const nextStep = this.resolveNextStep({
      currentTopic: parsed.currentTopic,
      currentStep: state.currentStep,
      completedSteps: Array.from(completedSteps),
      skippedSteps: Array.from(skippedSteps)
    });

    const pendingConfig: Prisma.InputJsonValue = needsConfirmation.length
      ? ({ actions: needsConfirmation as any, requestedAt: new Date().toISOString() } as any)
      : ({} as any);

    const updatedHistory: ConversationEntry[] = [
      ...history,
      { role: 'user', content: trimmed, at: new Date().toISOString() },
      { role: 'assistant', content: parsed.message, at: new Date().toISOString() }
    ];

    const updatedState = await this.prisma.onboardingState.update({
      where: { organizationId },
      data: {
        currentStep: nextStep,
        completedSteps: Array.from(completedSteps),
        skippedSteps: Array.from(skippedSteps),
        conversationHistory: updatedHistory as any,
        pendingConfig: pendingConfig as any,
        lastActivityAt: new Date(),
        totalMessages: (state.totalMessages ?? 0) + 2
      }
    });

    const progress = this.calculateProgress(updatedState);

    return {
      message: parsed.message,
      actions: parsed.actions,
      suggestedNextSteps: parsed.suggestedNextSteps,
      questionsToAsk: parsed.questionsToAsk,
      currentTopic: parsed.currentTopic,
      currentProgress: progress,
      requestId: completion.id
    };
  }

  async handleUpload(request: OnboardingUploadRequest): Promise<OnboardingUploadResponse> {
    const organizationId = request.organizationId?.trim();
    if (!organizationId) {
      throw new BadRequestException('organizationId is required');
    }
    const userId = request.userId?.trim();
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const state = await this.getOrCreateState(organizationId);
    const history = normalizeConversation(state.conversationHistory).slice(-20);

    switch (request.fileType) {
      case 'logo': {
        // Color extraction is intentionally lightweight; store output in pendingConfig for confirmation.
        const extracted = await extractBrandColors(request.buffer, request.mimeType);
        const message = extracted
          ? `I extracted brand colors from your logo. Want me to set Primary ${extracted.primary} and Secondary ${extracted.secondary}?`
          : `I uploaded your logo. Want to set up your branding colors next?`;

        await this.prisma.onboardingState.update({
          where: { organizationId },
          data: {
            lastActivityAt: new Date(),
            conversationHistory: [
              ...history,
              { role: 'assistant', content: message, at: new Date().toISOString() }
            ] as any,
            pendingConfig: extracted ? ({ actions: [{ type: 'configure', target: 'set_brand_colors', value: extracted, requiresConfirmation: true }] } as any) : undefined,
            totalMessages: (state.totalMessages ?? 0) + 1
          }
        });

        return {
          message,
          extractedData: extracted ?? null,
          requiresConfirmation: Boolean(extracted)
        };
      }

      case 'commission_schedule': {
        const text = await extractDocumentText(request.buffer, request.mimeType);
        const parsed = await this.actions.parseCommissionDescription({
          organizationId,
          userId,
          description: text
        });

        const message =
          parsed.plans.length > 0
            ? `I found ${parsed.plans.length} commission plan(s). Want me to create them now, or review first?`
            : `I extracted the document text, but I need a bit more detail. ${parsed.questionsToAsk[0] ?? 'Can you describe your commission structure in plain English?'}`;

        await this.prisma.onboardingState.update({
          where: { organizationId },
          data: {
            lastActivityAt: new Date(),
            conversationHistory: [
              ...history,
              { role: 'assistant', content: message, at: new Date().toISOString() }
            ] as any,
            pendingConfig:
              parsed.plans.length > 0
                ? ({ actions: parsed.plans.map((plan) => ({ type: 'configure', target: 'create_commission_plan', value: plan, requiresConfirmation: true })) } as any)
                : undefined,
            totalMessages: (state.totalMessages ?? 0) + 1
          }
        });

        return { message, extractedData: parsed, requiresConfirmation: parsed.plans.length > 0 };
      }

      case 'agent_roster': {
        const agents = parseAgentRosterCsv(request.buffer);
        const message =
          agents.length > 0
            ? `I found ${agents.length} agent(s). Want me to send invites now or review first?`
            : `I couldn’t detect any agent emails in that file. Can you upload a CSV with at least an email column?`;

        await this.prisma.onboardingState.update({
          where: { organizationId },
          data: {
            lastActivityAt: new Date(),
            conversationHistory: [
              ...history,
              { role: 'assistant', content: message, at: new Date().toISOString() }
            ] as any,
            pendingConfig:
              agents.length > 0
                ? ({ actions: [{ type: 'configure', target: 'invite_agents', value: agents, requiresConfirmation: true }] } as any)
                : undefined,
            totalMessages: (state.totalMessages ?? 0) + 1
          }
        });

        return { message, extractedData: agents, requiresConfirmation: agents.length > 0 };
      }
    }
  }

  async getState(ctx: RequestContext): Promise<{ state: OnboardingState; progress: OnboardingProgress }> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing organization context');
    }

    const state = await this.getOrCreateState(organizationId);
    return { state, progress: this.calculateProgress(state) };
  }

  async configure(ctx: RequestContext, actions: OnboardingAction[]): Promise<{ ok: boolean; results: unknown[] }> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing organization context');
    }

    const safeActions = Array.isArray(actions) ? actions : [];
    const executable = safeActions.filter((action) => action && action.type === 'configure');
    const results = await this.actions.executeActions(ctx, executable);

    const state = await this.getOrCreateState(organizationId);
    const completedSteps = new Set<string>(state.completedSteps ?? []);
    for (const result of results) {
      if (!result.ok) continue;
      const target = (result.action.target ?? '').trim();
      const step = CONFIGURE_TARGET_TO_STEP[target];
      if (step) {
        completedSteps.add(step);
      }
    }

    const nextStep = this.resolveNextStep({
      currentTopic: state.currentStep,
      currentStep: state.currentStep,
      completedSteps: Array.from(completedSteps),
      skippedSteps: state.skippedSteps ?? []
    });

    await this.prisma.onboardingState.update({
      where: { organizationId },
      data: {
        pendingConfig: {} as any,
        completedSteps: Array.from(completedSteps),
        currentStep: nextStep,
        lastActivityAt: new Date()
      }
    });

    return { ok: results.every((r) => r.ok), results };
  }

  async skipStep(ctx: RequestContext, step: string): Promise<void> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing organization context');
    }

    const normalizedStep = (step ?? '').trim();
    if (!normalizedStep) {
      throw new BadRequestException('step is required');
    }

    const state = await this.getOrCreateState(organizationId);
    const skippedSteps = new Set<string>(state.skippedSteps ?? []);
    skippedSteps.add(normalizedStep);

    const nextStep = this.resolveNextStep({
      currentTopic: state.currentStep,
      currentStep: state.currentStep,
      completedSteps: state.completedSteps ?? [],
      skippedSteps: Array.from(skippedSteps)
    });

    await this.prisma.onboardingState.update({
      where: { organizationId },
      data: {
        skippedSteps: Array.from(skippedSteps),
        currentStep: nextStep,
        lastActivityAt: new Date()
      }
    });
  }

  async complete(ctx: RequestContext): Promise<void> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing organization context');
    }

    await this.getOrCreateState(organizationId);
    await this.prisma.onboardingState.update({
      where: { organizationId },
      data: {
        status: 'completed',
        currentStep: 'done',
        completedAt: new Date(),
        lastActivityAt: new Date()
      }
    });
  }

  private async getOrCreateState(organizationId: string) {
    const orgId = organizationId?.trim();
    if (!orgId) {
      throw new BadRequestException('organizationId is required');
    }

    return this.prisma.onboardingState.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId },
      update: { lastActivityAt: new Date() }
    });
  }

  private async ensureOnboardingAssistantPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.ONBOARDING_ASSISTANT, name: 'onboarding-assistant' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.ONBOARDING_ASSISTANT, {
        organizationId,
        name: 'onboarding-assistant',
        systemPrompt: onboardingAssistantPrompt.systemPrompt,
        userPromptTemplate: onboardingAssistantPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 900,
        temperature: 0.2,
        description: 'Conversational setup assistant for new brokerages.',
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.ONBOARDING_ASSISTANT, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.ONBOARDING_ASSISTANT, organizationId, existing.version);
    }
  }

  private async buildOnboardingContext(organizationId: string) {
    const [org, agentCount, commissionPlanCount, portalConfig, qbConnection, mlsConfig, pendingInvites] =
      await Promise.all([
        this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }),
        this.prisma.agentProfile.count({ where: { organizationId } }),
        this.prisma.orgCommissionPlan.count({ where: { orgId: organizationId } }),
        this.prisma.agentPortalConfig.findUnique({ where: { organizationId }, select: { allowedPaths: true } }).catch(() => null),
        this.prisma.quickBooksConnection.findUnique({ where: { orgId: organizationId }, select: { id: true } }).catch(() => null),
        this.prisma.mlsFeedConfig.findUnique({ where: { organizationId }, select: { id: true } }).catch(() => null),
        this.prisma.agentInvite.count({ where: { organizationId, status: 'PENDING' } })
      ]);

    const configured: Array<{ key: string; value: string }> = [];
    if (org?.name) configured.push({ key: 'brokerageName', value: org.name });
    configured.push({ key: 'agentCount', value: String(agentCount) });
    configured.push({ key: 'commissionPlans', value: String(commissionPlanCount) });
    configured.push({ key: 'agentPortal', value: portalConfig?.allowedPaths?.length ? 'configured' : 'default' });
    configured.push({ key: 'quickbooks', value: qbConnection ? 'connected' : 'not_connected' });
    configured.push({ key: 'mls', value: mlsConfig ? 'configured' : 'not_configured' });

    return {
      name: org?.name ?? 'Unknown',
      agentCount,
      commissionPlanCount,
      agentPortalConfigured: Boolean(portalConfig?.allowedPaths?.length),
      quickbooksConnected: Boolean(qbConnection),
      mlsConfigured: Boolean(mlsConfig),
      pendingInvites,
      configured
    };
  }

  private parseAssistantResponse(content: string): ParsedAssistantResponse {
    const parsed = safeJsonParse(content);
    if (!parsed || typeof parsed !== 'object') {
      return {
        message: (content ?? '').trim() || 'How can I help you set up Hatch?',
        actions: [],
        suggestedNextSteps: [],
        currentTopic: 'welcome',
        questionsToAsk: []
      };
    }

    const message = typeof (parsed as any).message === 'string' ? (parsed as any).message : '';
    const suggestedNextSteps = Array.isArray((parsed as any).suggestedNextSteps)
      ? (parsed as any).suggestedNextSteps.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const questionsToAsk = Array.isArray((parsed as any).questionsToAsk)
      ? (parsed as any).questionsToAsk.filter((value: unknown): value is string => typeof value === 'string')
      : [];
    const currentTopic = typeof (parsed as any).currentTopic === 'string' ? (parsed as any).currentTopic : 'welcome';

    const actionsRaw = Array.isArray((parsed as any).actions) ? (parsed as any).actions : [];
    const actions: OnboardingAction[] = actionsRaw
      .map((action: any) => ({
        type: typeof action?.type === 'string' ? action.type : '',
        target: typeof action?.target === 'string' ? action.target : undefined,
        value: action?.value,
        requiresConfirmation: Boolean(action?.requiresConfirmation)
      }))
      .filter((action) => action.type.trim().length > 0);

    return {
      message: message.trim() || 'How can I help you set up Hatch?',
      actions,
      suggestedNextSteps,
      questionsToAsk,
      currentTopic: this.normalizeTopic(currentTopic)
    };
  }

  private normalizeTopic(topic: string): string {
    const candidate = (topic ?? '').trim().toLowerCase();
    return ORDERED_STEPS.includes(candidate as any) ? candidate : 'welcome';
  }

  private resolveNextStep(params: {
    currentTopic: string;
    currentStep: string;
    completedSteps: string[];
    skippedSteps: string[];
  }): string {
    const normalizedTopic = this.normalizeTopic(params.currentTopic);
    const completed = new Set<string>(params.completedSteps ?? []);
    const skipped = new Set<string>(params.skippedSteps ?? []);

    if (normalizedTopic === 'done') {
      return 'done';
    }

    if (normalizedTopic !== 'welcome') {
      if (!completed.has(normalizedTopic) && !skipped.has(normalizedTopic)) {
        return normalizedTopic;
      }
    }

    for (const step of ORDERED_STEPS) {
      if (step === 'welcome') continue;
      if (step === 'done') continue;
      if (completed.has(step) || skipped.has(step)) continue;
      return step;
    }

    return 'done';
  }

  private calculateProgress(state: OnboardingState): OnboardingProgress {
    const completed = new Set<string>(state.completedSteps ?? []);
    const skipped = new Set<string>(state.skippedSteps ?? []);
    const total = ORDERED_STEPS.filter((step) => step !== 'welcome' && step !== 'done').length;
    const doneCount = Array.from(new Set([...completed, ...skipped])).filter((step) =>
      ORDERED_STEPS.includes(step as any) && step !== 'welcome' && step !== 'done'
    ).length;
    const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    return {
      currentStep: state.currentStep ?? 'welcome',
      completedSteps: state.completedSteps ?? [],
      skippedSteps: state.skippedSteps ?? [],
      percent,
      totalSteps: total,
      done: state.status === 'completed' || state.currentStep === 'done'
    };
  }
}

function normalizeConversation(raw: unknown): ConversationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): ConversationEntry => {
      const role: ConversationEntry['role'] = entry?.role === 'assistant' ? 'assistant' : 'user';
      const content = typeof entry?.content === 'string' ? entry.content : '';
      const at = typeof entry?.at === 'string' ? entry.at : undefined;
      return { role, content, at };
    })
    .filter((entry) => entry.content.trim().length > 0);
}

async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<string> {
  const type = (mimeType ?? '').toLowerCase();
  if (type.includes('pdf')) {
    const result = await (pdfParse as unknown as (data: Buffer) => Promise<{ text?: string }>)(buffer);
    return (result.text ?? '').trim().slice(0, 12_000);
  }
  return buffer.toString('utf8').trim().slice(0, 12_000);
}

function parseAgentRosterCsv(buffer: Buffer): Array<{ name?: string; email: string }> {
  const text = buffer.toString('utf8');
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((cell) => cell.toLowerCase().trim());
  const emailIndex = findHeaderIndex(header, ['email', 'e-mail', 'agent email']);
  const nameIndex = findHeaderIndex(header, ['name', 'full name', 'agent', 'agent name']);
  const firstNameIndex = findHeaderIndex(header, ['first', 'first name', 'firstname']);
  const lastNameIndex = findHeaderIndex(header, ['last', 'last name', 'lastname']);

  const agents: Array<{ name?: string; email: string }> = [];
  for (const row of rows.slice(1)) {
    const email = emailIndex !== -1 ? (row[emailIndex] ?? '').trim().toLowerCase() : '';
    if (!email || !email.includes('@')) continue;

    let name: string | undefined;
    if (nameIndex !== -1) {
      name = (row[nameIndex] ?? '').trim();
    } else if (firstNameIndex !== -1 || lastNameIndex !== -1) {
      const first = firstNameIndex !== -1 ? (row[firstNameIndex] ?? '').trim() : '';
      const last = lastNameIndex !== -1 ? (row[lastNameIndex] ?? '').trim() : '';
      const joined = `${first} ${last}`.trim();
      name = joined || undefined;
    }

    agents.push({ ...(name ? { name } : {}), email });
  }

  const deduped = new Map<string, { name?: string; email: string }>();
  for (const agent of agents) {
    if (!deduped.has(agent.email)) {
      deduped.set(agent.email, agent);
    }
  }
  return Array.from(deduped.values()).slice(0, 500);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const flushCell = () => {
    row.push(cell);
    cell = '';
  };

  const flushRow = () => {
    if (row.length === 1 && row[0].trim() === '') {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (char === ',' || char === ';')) {
      flushCell();
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      flushCell();
      flushRow();
      continue;
    }

    cell += char;
  }

  flushCell();
  flushRow();

  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c.length > 0));
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header === candidate);
    if (index !== -1) return index;
  }
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header.includes(candidate));
    if (index !== -1) return index;
  }
  return -1;
}

type BrandColors = { primary: string; secondary: string; accent?: string };

async function extractBrandColors(buffer: Buffer, mimeType: string): Promise<BrandColors | null> {
  const type = (mimeType ?? '').toLowerCase();
  if (!type.includes('png') && !type.includes('jpeg') && !type.includes('jpg')) {
    return null;
  }

  const { data, width, height } = await decodeImage(buffer, type);
  if (!data || width <= 0 || height <= 0) {
    return null;
  }

  const sampleStride = Math.max(1, Math.floor(Math.sqrt((width * height) / 10_000)));
  const histogram = new Map<number, number>();

  for (let y = 0; y < height; y += sampleStride) {
    for (let x = 0; x < width; x += sampleStride) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 220) continue;

      const key = quantizeRgb(r, g, b);
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
    }
  }

  const sorted = Array.from(histogram.entries()).sort((a, b) => b[1] - a[1]).map(([key]) => key);
  if (sorted.length === 0) return null;

  const primary = sorted[0];
  const secondary = sorted.find((key) => colorDistance(key, primary) > 40) ?? primary;
  const accent = sorted.find((key) => colorDistance(key, primary) > 60 && colorDistance(key, secondary) > 60);

  return {
    primary: rgbKeyToHex(primary),
    secondary: rgbKeyToHex(secondary),
    ...(accent ? { accent: rgbKeyToHex(accent) } : {})
  };
}

async function decodeImage(buffer: Buffer, type: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  if (type.includes('png')) {
    const { PNG } = await import('pngjs');
    const png = PNG.sync.read(buffer);
    return { data: png.data, width: png.width, height: png.height };
  }

  const jpeg = await import('jpeg-js');
  const decoded = jpeg.decode(buffer, { useTArray: true });
  return { data: decoded.data, width: decoded.width, height: decoded.height };
}

function quantizeRgb(r: number, g: number, b: number): number {
  const qr = (r >> 4) & 0x0f;
  const qg = (g >> 4) & 0x0f;
  const qb = (b >> 4) & 0x0f;
  return (qr << 8) | (qg << 4) | qb;
}

function rgbKeyToHex(key: number): string {
  const qr = (key >> 8) & 0x0f;
  const qg = (key >> 4) & 0x0f;
  const qb = key & 0x0f;
  const r = (qr << 4) | qr;
  const g = (qg << 4) | qg;
  const b = (qb << 4) | qb;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function colorDistance(a: number, b: number): number {
  const ar = (a >> 8) & 0x0f;
  const ag = (a >> 4) & 0x0f;
  const ab = a & 0x0f;
  const br = (b >> 8) & 0x0f;
  const bg = (b >> 4) & 0x0f;
  const bb = b & 0x0f;
  const dr = ar - br;
  const dg = ag - bg;
  const db = ab - bb;
  return Math.sqrt(dr * dr + dg * dg + db * db) * 16;
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
