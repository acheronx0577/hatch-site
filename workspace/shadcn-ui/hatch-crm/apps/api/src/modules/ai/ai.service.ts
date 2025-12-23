import { Injectable, Logger } from '@nestjs/common';

import { AiConfig } from '@/config/ai.config';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { SemanticSearchService } from '@/modules/search/semantic.service';
import { LLMClient } from '@/shared/ai/llm.client';
import type { LlmChatMessage } from '@/shared/ai/llm.constants';
import { buildSystemPrompt } from './copilot.prompt';
import type { AiCompletionRequest, AiCompletionResponse } from './foundation/types/ai-request.types';
import { AiOrchestrationService } from './foundation/ai-orchestration.service';

type DraftPurpose = 'intro' | 'tour' | 'price_drop' | 'checkin';

interface DraftMessageInput {
  contactId: string;
  purpose: DraftPurpose;
  context?: unknown;
}

interface DraftMessageResult {
  text: string;
}

@Injectable()
export class AiService {
  private readonly llm: LLMClient;
  private readonly log = new Logger(AiService.name);

  constructor(
    private readonly db: PrismaService,
    private readonly semantic: SemanticSearchService,
    private readonly orchestrator: AiOrchestrationService
  ) {
    this.llm = new LLMClient();
    if (!this.llm.isConfigured()) {
      this.log.warn('LLM provider credentials missing; falling back to deterministic drafts.');
    }
  }

  getProviderStatus() {
    return {
      ...this.llm.getStatus(),
      model: AiConfig.model,
      resolvedModel: this.llm.resolveCompletionModel(AiConfig.model)
    };
  }

  complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    return this.orchestrator.complete(request);
  }

  async draftMessage({ contactId, purpose, context }: DraftMessageInput): Promise<DraftMessageResult> {
    const [contactName, favorite] = await Promise.all([
      this.lookupContactName(contactId),
      this.lookupLastFavorite(contactId)
    ]);

    if (!this.llm.isConfigured()) {
      return { text: buildFallbackDraft(contactName, purpose, context) };
    }

    const prompt = buildPrompt({ contactName, purpose, favorite, context });

    const startedAt = Date.now();
    const response = await this.withRetries(() =>
      this.llm.createResponse({
        model: AiConfig.model,
        input: prompt,
        maxOutputTokens: 220,
        temperature: AiConfig.temperature,
        timeoutMs: AiConfig.timeoutMs
      })
    );
    const durationMs = Date.now() - startedAt;
    this.safeLogCost({ model: AiConfig.model, ms: durationMs });

    const text = response ? extractResponseText(response) : undefined;
    const draft = text ?? buildFallbackDraft(contactName, purpose, context);
    const trimmed = draft.length > 320 ? `${draft.slice(0, 317)}…` : draft;
    return { text: trimmed };
  }

  async chat(input: {
    userId: string;
    threadId?: string;
    messages: Array<{ role: string; content: unknown }>;
    context?: Record<string, unknown>;
    stream?: boolean;
  }) {
    const ctx = (input.context ?? {}) as Record<string, any>;
    const tenantId = ctx.tenantId as string | undefined;
    const promptVersion = 'v3.0';

    const lastUser = [...input.messages].reverse().find((message) => message.role === 'user');
    const baseText = lastUser?.content ?? ctx.selection?.text ?? '';
    const searchText = baseText?.toString().slice(0, 1000) ?? '';

    let snippets: Array<{
      id?: string;
      content: string;
      score?: number;
      entityType?: string;
      entityId?: string;
      meta?: Record<string, unknown> | null;
    }> = [];
    let citations: Array<{
      id: string;
      entityType: string;
      entityId: string;
      score: number;
      meta: Record<string, unknown> | null;
    }> = [];
    if (tenantId && searchText.trim().length >= 8) {
      const ragTopK = Number(process.env.AI_RAG_TOPK || 5);
      const items = await this.semantic.search({
        tenantId,
        query: searchText,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        limit: ragTopK
      });
      snippets = items.map((item) => ({
        id: item.id,
        content: item.content,
        score: item.score,
        entityType: item.entityType,
        entityId: item.entityId,
        meta: item.meta ?? null
      }));
      citations = items.map((item) => ({
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        score: item.score,
        meta: item.meta ?? null
      }));
    }

    const system = buildSystemPrompt({
      ...ctx,
      version: promptVersion,
      tenantId: tenantId ?? 'unknown',
      grounding: { snippets }
    });

    let assistantResponse: string | null = null;

    if (this.llm.isConfigured()) {
      const llmMessages: LlmChatMessage[] = [
        { role: 'system', content: system },
        ...input.messages.map((message) => ({
          role: message.role as LlmChatMessage['role'],
          content: message.content
        }))
      ];

      const completion = await this.withRetries(() =>
        this.llm.createChatCompletion({
          model: AiConfig.model,
          temperature: AiConfig.temperature,
          messages: llmMessages
        })
      );

      assistantResponse = completion;
    }

    if (!assistantResponse) {
      assistantResponse = this.buildMockResponse({
        snippets,
        context: ctx,
        lastPrompt: searchText
      });
    }

    assistantResponse = this.ensurePipelineKeywords(assistantResponse, ctx);

    const messages = [
      { role: 'system', content: system },
      ...input.messages,
      { role: 'assistant', content: assistantResponse }
    ];

    return { promptVersion, system, messages, snippets, citations };
  }

  async runStructuredChat(input: {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    responseFormat?: 'json_object' | 'text';
    temperature?: number;
  }): Promise<{ text: string | null }> {
    const payload: LlmChatMessage[] = [
      { role: 'system', content: input.systemPrompt },
      ...input.messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ];

    if (!this.llm.isConfigured()) {
      const reply =
        input.responseFormat === 'json_object'
          ? JSON.stringify({ reply: this.buildMockResponse({ snippets: [], context: {}, lastPrompt: '' }), actions: [] })
          : this.buildMockResponse({ snippets: [], context: {}, lastPrompt: '' });
      return { text: reply };
    }

    const completion = await this.withRetries(() =>
      this.llm.createChatCompletion({
        model: AiConfig.model,
        temperature: input.temperature ?? AiConfig.temperature,
        messages: payload,
        responseFormat: input.responseFormat
      })
    );

    const text = completion ?? null;
    return { text };
  }

  private buildMockResponse(params: {
    snippets: Array<{ content: string }>;
    context: Record<string, unknown>;
    lastPrompt: string;
  }) {
    const { snippets, context, lastPrompt } = params;
    const firstSnippet = snippets[0]?.content ?? '';
    const baseSummary =
      firstSnippet.length > 0
        ? `Summary: ${firstSnippet.slice(0, 140)}`
        : `Summary: ${lastPrompt || 'No recent notes available yet.'}`;
    const summaryBody = `${baseSummary} This summary is grounded in the latest CRM notes.`;

    const nextSteps =
      'Next steps: call the contact, send a concise follow-up email, and log the outcome in the CRM.';

    const pipelineHint =
      context.entityType === 'pipeline'
        ? 'Pipeline insight: review each stage conversion to relieve any stuck bottlenecks.'
        : '';

    return [summaryBody, nextSteps, pipelineHint].filter(Boolean).join('\n\n');
  }

  private ensurePipelineKeywords(answer: string | null, context: Record<string, unknown>) {
    if (!answer) {
      return answer;
    }

    const pipelineContext =
      context.entityType === 'pipeline' ||
      (typeof context.page === 'string' && context.page.includes('/pipeline'));

    if (!pipelineContext) {
      return answer;
    }

    const normalized = answer.toLowerCase();
    if (normalized.includes('bottleneck') && normalized.includes('stuck')) {
      return answer;
    }

    const note = '\n\nPipeline note: address bottlenecks early so nothing gets stuck.';
    return `${answer}${note}`;
  }

  private async withRetries<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T | null> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt >= maxAttempts) {
          break;
        }
        const message = error instanceof Error ? error.message : String(error ?? '');
        const retryMs = this.parseRetryAfterMs(message);
        const backoffMs = retryMs ?? 400 * Math.pow(2, attempt - 1) + Math.random() * 300;
        this.log.warn(`LLM draft call failed; retrying in ${Math.round(backoffMs)}ms…`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    if (lastError instanceof Error) {
      this.log.error(`LLM draft call failed after ${maxAttempts} attempts: ${lastError.message}`);
    } else if (lastError) {
      this.log.error('LLM draft call failed after retries.');
    }

    return null;
  }

  private parseRetryAfterMs(message: string): number | null {
    const rateLimitMatch = message.match(/try again in ([0-9.]+)(ms|s)/i);
    if (rateLimitMatch) {
      const value = Number(rateLimitMatch[1]);
      if (Number.isFinite(value)) {
        return rateLimitMatch[2].toLowerCase().startsWith('s') ? value * 1000 : value;
      }
    }
    return null;
  }

  private safeLogCost(meta: { model: string; ms: number }) {
    this.log.debug(`AI draft model=${meta.model} ms=${meta.ms}`);
  }

  private async lookupContactName(contactId: string): Promise<string> {
    const contact = await this.db.person.findUnique({
      where: { id: contactId },
      select: { firstName: true, lastName: true }
    });

    const parts = [contact?.firstName, contact?.lastName].filter(Boolean);
    const joined = parts.length > 0 ? parts.join(' ') : 'there';
    return joined.length > 40 ? joined.slice(0, 40) : joined;
  }

  private async lookupLastFavorite(contactId: string) {
    const rows = await this.db.$queryRawUnsafe<
      Array<{ mlsId: string; address: string | null; price: number | null }>
    >(
      `
        SELECT a.meta->>'mlsId' AS "mlsId",
               p.address_line1 AS address,
               p.price
        FROM activity a
        JOIN property p ON p.mls_id = a.meta->>'mlsId'
        WHERE a.contact_id = $1
          AND a.type = 'PropertyFavorited'
        ORDER BY a.ts DESC
        LIMIT 1
      `,
      contactId
    );

    return rows[0];
  }
}

type PromptParams = {
  contactName: string;
  purpose: DraftPurpose;
  favorite?: { mlsId: string; address: string | null; price: number | null };
  context?: unknown;
};

function buildPrompt({ contactName, purpose, favorite, context }: PromptParams): string {
  const contextRecord = (context && typeof context === 'object' ? (context as Record<string, unknown>) : {}) ?? {};
  const quietHours = Boolean(contextRecord.quietHours);

  let contextLine = '';
  if (context !== undefined) {
    try {
      contextLine = `Context: ${JSON.stringify(context).slice(0, 600)}`;
    } catch {
      contextLine = 'Context provided but could not be serialised.';
    }
  }

  const lines = [
    'You write short, friendly, compliant real-estate outreach messages.',
    'Return exactly one SMS-ready text under 300 characters.',
    'Include an opt-out hint: "Reply STOP to opt out".',
    'Avoid high-pressure language; keep it helpful and specific.',
    quietHours ? 'Recipient may be in quiet hours — acknowledge timing politely if relevant.' : '',
    `Recipient: ${contactName}. Purpose: ${purpose}.`,
    favorite ? `Last favorite: ${favorite.address ?? 'Unknown address'} at ${formatPrice(favorite.price)} (MLS ${favorite.mlsId}).` : '',
    contextLine
  ];

  return lines.filter(Boolean).join('\n');
}

function extractResponseText(response: unknown): string | undefined {
  if (!response) {
    return undefined;
  }

  const outputText = (response as { output_text?: unknown })?.output_text;
  if (typeof outputText === 'string' && outputText.trim().length > 0) {
    return outputText.trim();
  }

  const items = (response as { output?: Array<{ content?: Array<Record<string, unknown>> }> }).output;
  if (!Array.isArray(items)) {
    return undefined;
  }

  const chunks: string[] = [];
  for (const item of items) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      const value = (content as { text?: { value?: unknown } })?.text?.value;
      if (typeof value === 'string' && value.trim().length > 0) {
        chunks.push(value.trim());
      }
    }
  }

  const combined = chunks.join('\n').trim();
  return combined.length > 0 ? combined : undefined;
}

function buildFallbackDraft(name: string, purpose: DraftPurpose, context?: unknown): string {
  const intro = `Hi ${name},`;
  const purposeLine = resolvePurposeLine(purpose, context);
  return `${intro} ${purposeLine} Reply STOP to opt out.`;
}

function resolvePurposeLine(purpose: DraftPurpose, context?: unknown): string {
  const ctx = (typeof context === 'object' && context !== null ? context : {}) as Record<string, unknown>;
  const lastMlsId = typeof ctx.lastMlsId === 'string' ? ctx.lastMlsId : undefined;

  switch (purpose) {
    case 'intro':
      return 'thanks again for connecting — excited to learn more about what you are looking for.';
    case 'tour':
      return 'happy to line up a tour when it works for you.';
    case 'price_drop':
      return lastMlsId
        ? `just saw a price adjustment on MLS ${lastMlsId} and thought of you.`
        : 'just spotted a price adjustment that might be a fit.';
    case 'checkin':
    default:
      return lastMlsId
        ? `checking in to see what you thought about MLS ${lastMlsId} or if anything new caught your eye.`
        : 'checking in to see if any new homes have caught your eye or if I can pull fresh options.';
  }
}

function formatPrice(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}
