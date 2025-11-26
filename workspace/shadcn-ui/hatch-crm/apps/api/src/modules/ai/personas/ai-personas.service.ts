import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { SemanticSearchService } from '@/modules/search/semantic.service';
import { S3Service } from '@/modules/storage/s3.service';

import { AiService } from '../ai.service';
import { PERSONAS, HANDOFF_TEMPLATE } from './ai-personas.config';
import { buildSystemPromptForPersona } from './ai-personas.prompts';
import { AiPersonaRouterService } from './ai-personas.router';
import { buildEchoCrmContext } from './ai-personas.crm-context';
import { loadAiMemories, recordAiMemory } from './ai-personas.memory';
import type { PersonaChatMessage, PersonaChatResponse, PersonaId } from './ai-personas.types';

type ChatHistory = PersonaChatMessage[];

const SHARED_MEMORY_PERSONA_ID: PersonaId = 'agent_copilot';

type MemoryPolicy = {
  label: string;
  keywords: string[];
};

type FormEntry = {
  title: string;
  jurisdiction?: string;
  s3Key?: string;
};

type FormSearchHints = {
  preferFlorida: boolean;
  wantsNabor: boolean;
  wantsNaples: boolean;
};

const MEMORY_POLICIES: Record<PersonaId, MemoryPolicy> = {
  hatch_assistant: {
    label: 'Hatch broker summary',
    keywords: ['handoff', 'delegate', 'summary', 'overview', 'plan', 'prioritize']
  },
  agent_copilot: {
    label: 'Echo prioritized work',
    keywords: ['lead', 'prioritize', 'plan']
  },
  lead_nurse: {
    label: 'Lumen outreach draft',
    keywords: ['follow up', 'follow-up', 'followup', 'nurture', 'drip', 'rewrite', 'draft']
  },
  listing_concierge: {
    label: 'Haven listing copy',
    keywords: ['listing', 'description', 'marketing', 'copy', 'social', 'bullet']
  },
  market_analyst: {
    label: 'Atlas market insight',
    keywords: ['pricing', 'price', 'market', 'trend', 'comps', 'valuation']
  },
  transaction_coordinator: {
    label: 'Nova checklist update',
    keywords: ['checklist', 'timeline', 'dates', 'deadline', 'contingency', 'contingencies', 'closing']
  }
};

@Injectable()
export class AiPersonasService {
  private readonly log = new Logger(AiPersonasService.name);
  private formsCache: FormEntry[] | null = null;

  constructor(
    private readonly ai: AiService,
    private readonly router: AiPersonaRouterService,
    private readonly prisma: PrismaService,
    private readonly semantic: SemanticSearchService,
    private readonly s3: S3Service
  ) {}

  async handleChatMessage(input: {
    tenantId: string;
    text: string;
    currentPersonaId: PersonaId;
    history: ChatHistory;
    forceCurrentPersona?: boolean;
  }): Promise<PersonaChatResponse> {
    const { text, currentPersonaId, history, tenantId, forceCurrentPersona } = input;
    const routing = forceCurrentPersona
      ? { targetPersonaId: currentPersonaId, reason: 'persona override' }
      : await this.router.routeMessage(currentPersonaId, text);
    const persona = PERSONAS.find((candidate) => candidate.id === routing.targetPersonaId) ?? PERSONAS[0];
    const lowerText = text.toLowerCase();
    const wantsForms =
      persona.id === 'hatch_assistant' &&
      ['nabor', 'far-bar', 'far bar', 'contract', 'form'].some((keyword) => lowerText.includes(keyword));

    const [crmContext, memoryContext] = await Promise.all([
      this.safeBuildCrmContext(persona.id === 'agent_copilot', tenantId),
      this.safeLoadMemories(tenantId)
    ]);

    const prompt = buildSystemPromptForPersona(persona, { crmContext, memoryContext });
    const messages = history.slice(-10);

    const replyText =
      forceCurrentPersona || wantsForms
        ? await this.answerWithGroundedDocs({ tenantId, query: text })
        : (
            await this.ai.runStructuredChat({
              systemPrompt: prompt,
              messages: [...messages, { role: 'user', content: text }]
            })
          ).text;

    const assistantContent = replyText ?? 'I need a moment to think about that.';
    const responseMessages: PersonaChatMessage[] = [];

    if (currentPersonaId !== persona.id) {
      const fromPersona = PERSONAS.find((p) => p.id === currentPersonaId);
      const handoff = HANDOFF_TEMPLATE(fromPersona?.name ?? 'Agent Copilot', persona.name);
      responseMessages.push({ role: 'assistant', content: handoff, personaId: currentPersonaId });
    }

    responseMessages.push({ role: 'assistant', content: assistantContent, personaId: persona.id });

    let memoryLog: PersonaChatResponse['memoryLog'] = null;
    const memoryLabel = shouldRecordMemory(persona.id, text, assistantContent);
    if (memoryLabel) {
      await recordAiMemory(this.prisma, {
        tenantId,
        personaId: SHARED_MEMORY_PERSONA_ID,
        authorPersonaId: persona.id,
        label: memoryLabel,
        prompt: text,
        reply: assistantContent
      });
      memoryLog = { personaId: persona.id, label: memoryLabel };
    }

    return {
      activePersonaId: persona.id,
      reason: routing.reason,
      messages: responseMessages,
      memoryLog
    };
  }

  private async safeLoadMemories(tenantId: string): Promise<string> {
    try {
      return await loadAiMemories(this.prisma, {
        tenantId,
        personaId: SHARED_MEMORY_PERSONA_ID
      });
    } catch (error) {
      this.log.warn(`Failed to load AI memories: ${this.formatError(error)}`);
      return 'NO_PAST_NOTES';
    }
  }

  private async safeBuildCrmContext(isEcho: boolean, tenantId: string): Promise<string | undefined> {
    if (!isEcho) {
      return undefined;
    }

    try {
      return await buildEchoCrmContext(this.prisma, tenantId);
    } catch (error) {
      this.log.warn(`Failed to build CRM context: ${this.formatError(error)}`);
      return undefined;
    }
  }

  private async answerWithGroundedDocs(params: { tenantId: string; query: string }): Promise<string> {
    const { tenantId, query } = params;
    const lowerQuery = query.toLowerCase();
    try {
      const results = await this.semantic.search({
        tenantId,
        query,
        entityType: 'knowledge_doc',
        limit: 5
      });

      if (results.length) {
        const bullets = results.map((result) => {
          const meta = result.meta ?? {};
          const title =
            (meta as Record<string, unknown>).title ??
            (meta as Record<string, unknown>).fileName ??
            (meta as Record<string, unknown>).formName ??
            (meta as Record<string, unknown>).s3Key ??
            result.entityId;
          const s3Key = (meta as Record<string, unknown>).s3Key ?? '';
          return `- ${title}${s3Key ? ` (${s3Key})` : ''}`;
        });

        return ['Here are the NABOR form contracts I found:', ...bullets].join('\n');
      }
    } catch (error) {
      this.log.warn(`Failed semantic lookup: ${this.formatError(error)}`);
    }

    const s3Results = await this.searchFormsS3(lowerQuery);
    if (s3Results.length) {
      return this.formatFormResults(s3Results);
    }

    const fallback = await this.searchFormsManifest(lowerQuery);
    if (fallback.length) {
      return this.formatFormResults(fallback);
    }

    return 'I could not find NABOR contracts in the knowledge base. Try a more specific contract name.';
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private async searchFormsManifest(lowerQuery: string): Promise<FormEntry[]> {
    const manifest = await this.loadFormsManifest();
    if (!manifest.length) return [];
    const terms = this.extractSearchTerms(lowerQuery);
    if (!terms.length) return [];
    const hints = this.computeFormSearchHints(lowerQuery);

    const matches = manifest
      .map((entry) => {
        const haystack = `${entry.title} ${entry.jurisdiction ?? ''} ${entry.s3Key ?? ''}`.toLowerCase();
        return { entry, score: this.scoreFormMatch(haystack, terms, hints) };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.entry);

    return matches;
  }

  private async loadFormsManifest(): Promise<FormEntry[]> {
    if (this.formsCache) return this.formsCache;
    try {
      const manifestPath = path.join(process.cwd(), 'apps/api/scripts/forms-manifest.json');
      const content = await fs.readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(content) as FormEntry[];
      this.formsCache = parsed;
      return parsed;
    } catch (error) {
      this.log.warn(`Failed to load forms manifest fallback: ${this.formatError(error)}`);
      this.formsCache = [];
      return [];
    }
  }

  private formatFormResults(entries: FormEntry[]): string {
    const lines = entries.map((entry) => {
      const jurisdiction = entry.jurisdiction ? ` [${entry.jurisdiction}]` : '';
      return `- ${entry.title}${jurisdiction}`;
    });
    return ['Here are the NABOR form contracts I found:', ...lines].join('\n');
  }

  private async searchFormsS3(lowerQuery: string): Promise<FormEntry[]> {
    const terms = this.extractSearchTerms(lowerQuery);
    if (!terms.length) return [];
    const hints = this.computeFormSearchHints(lowerQuery);
    const prefix = hints.preferFlorida && !hints.wantsNabor ? 'forms/florida/' : 'forms/';
    try {
      const keys = await this.s3.searchKeys({ prefix, contains: terms, maxKeys: 400 });
      const scored = keys
        .filter((key) => !key.endsWith('/'))
        .map((key) => {
          const lower = key.toLowerCase();
          return { key, score: this.scoreFormMatch(lower, terms, hints) };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return scored.map(({ key }) => ({
        title: this.titleFromKey(key),
        jurisdiction: this.jurisdictionFromKey(key),
        s3Key: key
      }));
    } catch (error) {
      this.log.warn(`Failed S3 forms search: ${this.formatError(error)}`);
      return [];
    }
  }

  private extractSearchTerms(lowerQuery: string): string[] {
    const stopWords = new Set(['the', 'and', 'for', 'with', 'need', 'give', 'that', 'this', 'please', 'what']);
    return lowerQuery
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
      .filter((term) => term.length > 2 && !stopWords.has(term));
  }

  private scoreFormMatch(haystack: string, terms: string[], hints: FormSearchHints): number {
    const base = terms.reduce((acc, term) => (haystack.includes(term) ? acc + 1 : acc), 0);
    const bonuses =
      (haystack.includes('sales contract residential improved property') ? 8 : 0) +
      (haystack.includes('sales contract-as is residential improved property') ? 7 : 0) +
      (haystack.includes('sales contract residential vacant land') ? 4 : 0) +
      (haystack.includes('sales contract') ? 3 : 0) +
      (haystack.includes('nabor') ? 2 : 0) +
      (haystack.endsWith('.pdf') ? 1 : 0);
    const penalties =
      (haystack.includes('addendum') ? 2 : 0) +
      (haystack.includes('amendment') ? 2 : 0) +
      (haystack.includes('disclosure') ? 1 : 0) +
      (haystack.includes('worksheet') ? 1 : 0) +
      (haystack.includes('profile') ? 1 : 0);
    const locationBonus =
      (hints.preferFlorida && (haystack.includes('florida') || haystack.includes('forms/florida'))) ? 5 : 0;
    const naborPenalty = hints.preferFlorida && !hints.wantsNabor && haystack.includes('nabor') ? 4 : 0;
    const naborBonus = hints.wantsNabor && haystack.includes('nabor') ? 3 : 0;
    return base + bonuses + locationBonus + naborBonus - penalties - naborPenalty;
  }

  private computeFormSearchHints(lowerQuery: string): FormSearchHints {
    const preferFlorida =
      lowerQuery.includes('florida') ||
      lowerQuery.includes('naples') ||
      lowerQuery.includes(' fl ');
    const wantsNabor = lowerQuery.includes('nabor');
    const wantsNaples = lowerQuery.includes('naples');
    return { preferFlorida, wantsNabor, wantsNaples };
  }

  private titleFromKey(key: string): string {
    const base = path.basename(key).replace(/\.[^.]+$/, '');
    const cleaned = base.replace(/[_-]+/g, ' ').trim();
    return cleaned || base;
  }

  private jurisdictionFromKey(key: string): string | undefined {
    const parts = key.split('/');
    if (parts.length >= 2 && parts[0] === 'forms') {
      return parts[1]?.toUpperCase();
    }
    return undefined;
  }
}

function shouldRecordMemory(personaId: PersonaId, prompt: string, reply: string): string | null {
  const policy = MEMORY_POLICIES[personaId];
  if (!policy) return null;
  const normalizedPrompt = prompt.toLowerCase();
  const normalizedReply = reply.toLowerCase();
  const hit = policy.keywords.some(
    (keyword) => normalizedPrompt.includes(keyword) || normalizedReply.includes(keyword)
  );
  return hit ? policy.label : null;
}
