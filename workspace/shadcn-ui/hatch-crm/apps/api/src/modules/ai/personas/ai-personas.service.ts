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
import {
  buildEchoCrmContext,
  buildEnhancedEchoContext,
  buildLumenContext,
  buildNovaContext,
  buildHavenContext,
  buildAtlasContext,
  buildMissionControlMetrics
} from './ai-personas.crm-context';
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
  wantsFannie?: boolean;
};

type FormScenario = {
  residentialImproved: boolean;
  residentialAsIs: boolean;
  vacantLand: boolean;
  commercial: boolean;
  backup: boolean;
  saleContingent: boolean;
  condo: boolean;
  hoa: boolean;
  cash: boolean;
  exchange1031: boolean;
  firpta: boolean;
  newConstruction: boolean;
  rental: boolean;
  preTouring: boolean;
  environmental: boolean;
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
    orgId: string;
    text: string;
    currentPersonaId: PersonaId;
    history: ChatHistory;
    forceCurrentPersona?: boolean;
  }): Promise<PersonaChatResponse> {
    const { text, currentPersonaId, history, tenantId, orgId, forceCurrentPersona } = input;
    const lowerText = text.toLowerCase();
    const hasContractKeyword = ['form', 'forms', 'contract', 'contracts', 'document', 'documents', 'paperwork'].some((kw) =>
      lowerText.includes(kw)
    );
    const hasGeography = lowerText.includes('naples') || lowerText.includes('florida') || /\bfl\b/.test(lowerText);

    this.log.debug(`[SERVICE] Query: "${text}"`);
    this.log.debug(`[SERVICE] hasContractKeyword: ${hasContractKeyword}, hasGeography: ${hasGeography}`);

    // Only force Hatch if query is actually about contracts/forms
    // Don't force just because geography is mentioned (e.g., "analyze naples market" should go to Atlas)
    const forceHatch = hasContractKeyword;

    this.log.debug(`[SERVICE] forceHatch: ${forceHatch}, forceCurrentPersona: ${forceCurrentPersona}`);

    const routing = forceCurrentPersona
      ? { targetPersonaId: currentPersonaId, reason: 'persona override' }
      : forceHatch
        ? { targetPersonaId: 'hatch_assistant', reason: 'forms/contracts override' }
        : await this.router.routeMessage(currentPersonaId, text);

    this.log.debug(`[SERVICE] Routing result: ${routing.targetPersonaId} - ${routing.reason}`);

    const persona = PERSONAS.find((candidate) => candidate.id === routing.targetPersonaId) ?? PERSONAS[0];
    const wantsForms =
      persona.id === 'hatch_assistant' &&
      ['nabor', 'far-bar', 'far bar', 'contract', 'form'].some((keyword) => lowerText.includes(keyword));

    // Check if user is asking about metrics/performance
    const wantsMetrics = this.isMetricsQuery(text);

    const [baseCrmContext, metricsContext, memoryContext] = await Promise.all([
      this.safeBuildCrmContext(persona.id, orgId, text),
      wantsMetrics ? this.safeBuildMetrics(tenantId) : Promise.resolve(undefined),
      this.safeLoadMemories(tenantId)
    ]);

    // Combine CRM context with metrics if available
    let crmContext = baseCrmContext;
    if (metricsContext && baseCrmContext) {
      crmContext = `${baseCrmContext}\n\n## Business Metrics\n${metricsContext}`;
    } else if (metricsContext) {
      crmContext = `## Business Metrics\n${metricsContext}`;
    }

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

  private async safeBuildCrmContext(
    personaId: PersonaId,
    orgId: string,
    messageText: string
  ): Promise<string | undefined> {
    try {
      switch (personaId) {
        case 'agent_copilot': // Echo - Enhanced context with opportunities, transactions, metrics
          return await buildEnhancedEchoContext(this.prisma, orgId);

        case 'lead_nurse': // Lumen - Contact details for email drafting
          // Extract contact name/email from message if mentioned
          const contactQuery = this.extractContactQuery(messageText);
          return await buildLumenContext(this.prisma, orgId, contactQuery);

        case 'transaction_coordinator': // Nova - Transaction coordination
          return await buildNovaContext(this.prisma, orgId);

        case 'listing_concierge': // Haven - Listing copywriting
          const listingQuery = this.extractListingQuery(messageText);
          return await buildHavenContext(this.prisma, orgId, listingQuery);

        case 'market_analyst': // Atlas - Market analysis
          this.log.debug('[SERVICE] Building Atlas context...');
          const atlasContext = await buildAtlasContext(this.prisma, orgId);
          this.log.debug(`[SERVICE] Atlas context length: ${atlasContext?.length ?? 0} chars`);
          return atlasContext;

        case 'hatch_assistant': // Hatch - Use basic CRM context for orchestration
          return await buildEchoCrmContext(this.prisma, orgId);

        default:
          // Other personas don't need CRM context yet
          return undefined;
      }
    } catch (error) {
      this.log.warn(`Failed to build CRM context for ${personaId}: ${this.formatError(error)}`);
      return undefined;
    }
  }

  private extractContactQuery(messageText: string): string | undefined {
    // Look for patterns like "draft email to John", "email Sarah", "contact about Mike"
    const patterns = [
      /(?:email|write|draft|send|contact|reach out to|message)\s+(?:to\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:about|regarding|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
    ];

    for (const pattern of patterns) {
      const match = messageText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  private extractListingQuery(messageText: string): string | undefined {
    // Look for patterns like "listing at 123 Main St", "property on Oak Ave", MLS numbers, etc.
    const patterns = [
      /(?:listing|property)\s+(?:at|on|for)\s+([0-9]+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard))/i,
      /(?:mls|mls#|mls\s+#)\s*:?\s*([A-Z0-9-]+)/i,
      /([0-9]+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|boulevard))/i
    ];

    for (const pattern of patterns) {
      const match = messageText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  private isMetricsQuery(messageText: string): boolean {
    const lowerText = messageText.toLowerCase();
    const metricsKeywords = [
      'how many',
      'count',
      'total',
      'revenue',
      'performance',
      'metrics',
      'dashboard',
      'stats',
      'statistics',
      'deals',
      'opportunities',
      'listings',
      'transactions',
      'closings',
      'pending',
      'active leads',
      'pipeline',
      'business'
    ];

    return metricsKeywords.some(keyword => lowerText.includes(keyword));
  }

  private async safeBuildMetrics(tenantId: string): Promise<string | undefined> {
    try {
      return await buildMissionControlMetrics(this.prisma, tenantId);
    } catch (error) {
      this.log.warn(`Failed to build Mission Control metrics: ${this.formatError(error)}`);
      return undefined;
    }
  }

  private async answerWithGroundedDocs(params: { tenantId: string; query: string }): Promise<string> {
    const { tenantId, query } = params;
    const lowerQuery = query.toLowerCase();
    const hints = this.computeFormSearchHints(lowerQuery);
    const scenario = this.detectFormScenario(lowerQuery);
    const guardrail = this.buildContractGuardrail({ hints, scenario, lowerQuery });
    const terms = this.extractSearchTerms(lowerQuery);
    const wantsBoth = hints.preferFlorida && hints.wantsNabor;
    try {
      const results = await this.semantic.search({
        tenantId,
        query,
        entityType: 'knowledge_doc',
        limit: 5
      });

      if (results.length) {
        const bullets = results.map((result, idx) => {
          const meta = result.meta ?? {};
          const title =
            (meta as Record<string, unknown>).title ??
            (meta as Record<string, unknown>).fileName ??
            (meta as Record<string, unknown>).formName ??
            (meta as Record<string, unknown>).s3Key ??
            result.entityId;
          return `${idx + 1}. **${title}**`;
        });

        const parts = ['**Recommended Contracts:**\n', ...bullets];

        if (guardrail) {
          const primaryMatch = guardrail.match(/Primary: ([^\n]+)/);
          if (primaryMatch) {
            parts.push('\n\n**Primary Contract:**');
            parts.push(primaryMatch[1]);
          }
        }

        parts.push('\n\n⚠️ *Please consult your broker or attorney before using these forms.*');

        return parts.join('\n');
      }
    } catch (error) {
      this.log.warn(`Failed semantic lookup: ${this.formatError(error)}`);
    }

    if (wantsBoth) {
      const [flResults, naborResults] = await Promise.all([
        this.searchFormsS3(lowerQuery, { forcePrefix: 'forms/florida/', hints, scenario }),
        this.searchFormsS3(lowerQuery, { forcePrefix: 'forms/nabor/', hints: { ...hints, wantsNabor: true }, scenario })
      ]);
      const combined = [...flResults, ...naborResults];
      const ranked = this.rerankForms(combined, terms, hints, scenario).slice(0, 8);
      if (ranked.length) {
        return this.formatFormResults(ranked, guardrail);
      }
    }

    const s3Results = await this.searchFormsS3(lowerQuery, { hints, scenario });
    if (s3Results.length) {
      const ranked = this.rerankForms(s3Results, terms, hints, scenario).slice(0, 8);
      if (ranked.length) {
        return this.formatFormResults(ranked, guardrail);
      }
    }

    if (wantsBoth) {
      const [flFallback, naborFallback] = await Promise.all([
        this.searchFormsManifest(lowerQuery, {
          hints: { preferFlorida: true, wantsNaples: false, wantsNabor: false },
          extraTerms: ['florida'],
          scenario
        }),
        this.searchFormsManifest(lowerQuery, {
          hints: { preferFlorida: false, wantsNaples: true, wantsNabor: true },
          extraTerms: ['nabor'],
          scenario
        })
      ]);
      const combined = [...flFallback, ...naborFallback];
      const ranked = this.rerankForms(combined, terms, hints, scenario).slice(0, 8);
      if (ranked.length) {
        return this.formatFormResults(ranked, guardrail);
      }
    }

    const fallback = await this.searchFormsManifest(lowerQuery, { hints, scenario });
    if (fallback.length) {
      const ranked = this.rerankForms(fallback, terms, hints, scenario).slice(0, 8);
      if (ranked.length) {
        return this.formatFormResults(ranked, guardrail);
      }
    }

    if (guardrail) {
      return [
        'I could not find contracts in the knowledge base. Try a more specific contract name.',
        '',
        guardrail
      ].join('\n');
    }

    return 'I could not find contracts in the knowledge base. Try a more specific contract name.';
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

  private async searchFormsManifest(
    lowerQuery: string,
    opts?: { hints?: FormSearchHints; extraTerms?: string[]; scenario?: FormScenario }
  ): Promise<FormEntry[]> {
    const manifest = await this.loadFormsManifest();
    if (!manifest.length) return [];
    const baseTerms = this.extractSearchTerms(lowerQuery);
    const terms = opts?.extraTerms ? Array.from(new Set([...baseTerms, ...opts.extraTerms])) : baseTerms;
    if (!terms.length) return [];
    const hints = opts?.hints ?? this.computeFormSearchHints(lowerQuery);

    const filtered = manifest.filter((entry) => {
      if (hints.preferFlorida && !hints.wantsNabor && !hints.wantsNaples) {
        const haystack = `${entry.title} ${entry.jurisdiction ?? ''} ${entry.s3Key ?? ''}`.toLowerCase();
        if (haystack.includes('nabor')) return false;
      }
      return true;
    });

    const matches = filtered
      .map((entry) => {
        const haystack = `${entry.title} ${entry.jurisdiction ?? ''} ${entry.s3Key ?? ''}`.toLowerCase();
        return { entry, score: this.scoreFormMatch(haystack, terms, hints, opts?.scenario ?? this.detectFormScenario(lowerQuery)) };
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

  private formatFormResults(entries: FormEntry[], guardrail?: string): string {
    const lines = entries.map((entry, idx) => {
      const jurisdiction = entry.jurisdiction ? ` [${entry.jurisdiction}]` : '';
      return `${idx + 1}. **${entry.title}**${jurisdiction}`;
    });

    const parts = ['**Recommended Contracts:**\n', ...lines];

    if (guardrail) {
      const primaryMatch = guardrail.match(/Primary: ([^\n]+)/);
      if (primaryMatch) {
        parts.push('\n\n**Primary Contract:**');
        parts.push(primaryMatch[1]);
      }
    }

    parts.push('\n\n⚠️ *Please consult your broker or attorney before using these forms.*');

    return parts.join('\n');
  }

  private async searchFormsS3(
    lowerQuery: string,
    opts?: { forcePrefix?: string; extraTerms?: string[]; hints?: FormSearchHints; scenario?: FormScenario }
  ): Promise<FormEntry[]> {
    const baseTerms = this.extractSearchTerms(lowerQuery);
    const terms = opts?.extraTerms ? Array.from(new Set([...baseTerms, ...opts.extraTerms])) : baseTerms;
    if (!terms.length) return [];
    const hints = opts?.hints ?? this.computeFormSearchHints(lowerQuery);
    const prefix = opts?.forcePrefix ?? (hints.preferFlorida && !hints.wantsNabor ? 'forms/florida/' : 'forms/');
    const expanded = new Set<string>(terms);
    terms.forEach((term) => {
      if (term.endsWith('s')) expanded.add(term.slice(0, -1));
    });
    expanded.add('contract');
    if (hints.wantsNaples || hints.wantsNabor) {
      expanded.add('nabor');
    }
    if (hints.preferFlorida) {
      expanded.add('florida');
    }
    try {
      const keys = await this.s3.searchKeys({ prefix, contains: Array.from(expanded), maxKeys: 400 });
      const scored = keys
        .filter((key) => !key.endsWith('/'))
        .map((key) => {
          const lower = key.toLowerCase();
          return { key, score: this.scoreFormMatch(lower, terms, hints, opts?.scenario ?? this.detectFormScenario(lowerQuery)) };
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

  private scoreFormMatch(haystack: string, terms: string[], hints: FormSearchHints, scenario: FormScenario): number {
    const banned =
      haystack.includes('property management') ||
      haystack.includes('exclusive property management') ||
      haystack.includes('extension to property management') ||
      haystack.includes('ppta') ||
      haystack.includes('pre-touring') ||
      haystack.includes('pre touring') ||
      haystack.includes('buyer access') ||
      haystack.includes('notice of right to reclaim') ||
      (!scenario.rental && haystack.includes('rental')) ||
      (!scenario.rental && haystack.includes('lease'));
    if (banned) return 0;

    const base = terms.reduce((acc, term) => {
      const singular = term.endsWith('s') ? term.slice(0, -1) : null;
      return haystack.includes(term) || (singular && haystack.includes(singular)) ? acc + 1 : acc;
    }, 0);
    const bonuses =
      (haystack.includes('sales contract residential improved property') ? 8 : 0) +
      (haystack.includes('sales contract-as is residential improved property') ? 7 : 0) +
      (haystack.includes('sales contract residential vacant land') ? 4 : 0) +
      (haystack.includes('sales contract') ? 3 : 0) +
      (haystack.includes('nabor') ? 2 : 0) +
      (haystack.endsWith('.pdf') ? 1 : 0);
    const scenarioBonuses =
      (scenario.residentialAsIs && (haystack.includes('as is') || haystack.includes('asis-7') || haystack.includes('nab089')) ? 6 : 0) +
      (scenario.residentialImproved && (haystack.includes('crsp') || haystack.includes('residential sale and purchase') || haystack.includes('nab087')) ? 6 : 0) +
      (scenario.vacantLand && (haystack.includes('vacant land') || haystack.includes('nab088')) ? 8 : 0) +
      (scenario.commercial && haystack.includes('commercial contract') ? 8 : 0) +
      (scenario.backup && haystack.includes('backup') ? 5 : 0) +
      (scenario.saleContingent && haystack.includes('cr-7v') ? 5 : 0) +
      (scenario.condo && haystack.includes('condo') ? 4 : 0) +
      (scenario.hoa && haystack.includes('hoa') ? 4 : 0) +
      (scenario.cash && haystack.includes('cash') ? 2 : 0) +
      (scenario.exchange1031 && haystack.includes('1031') ? 3 : 0) +
      (scenario.firpta && haystack.includes('firpta') ? 3 : 0) +
      (scenario.environmental &&
        (haystack.includes('flood') ||
          haystack.includes('coastal') ||
          haystack.includes('environment') ||
          haystack.includes('cccl') ||
          haystack.includes('wetland'))
        ? 3
        : 0);

    const penalties =
      (haystack.includes('addendum') ? 2 : 0) +
      (haystack.includes('amendment') ? 2 : 0) +
      (haystack.includes('disclosure') ? 1 : 0) +
      (haystack.includes('worksheet') ? 1 : 0) +
      (haystack.includes('profile') ? 1 : 0) +
      (haystack.includes('sign') && haystack.includes('requirement') ? 8 : 0);
    const locationBonus =
      (hints.preferFlorida && (haystack.includes('florida') || haystack.includes('forms/florida'))) ? 5 : 0;
    const naplesBonus = hints.wantsNaples && haystack.includes('sales contract') ? 6 : 0;
    const naborPenalty =
      (!hints.wantsNabor && !hints.wantsNaples && haystack.includes('nabor') ? 2 : 0) +
      (hints.preferFlorida && !hints.wantsNabor && haystack.includes('nabor') ? 3 : 0);
    const naborBonus = hints.wantsNabor && haystack.includes('nabor') ? 3 : 0;
    return base + bonuses + scenarioBonuses + locationBonus + naplesBonus + naborBonus - penalties - naborPenalty;
  }

  private computeFormSearchHints(lowerQuery: string): FormSearchHints {
    const flAbbrev = /\bfl\b/.test(lowerQuery);
    const preferFlorida = lowerQuery.includes('florida') || lowerQuery.includes('naples') || flAbbrev;
    const wantsNaples = lowerQuery.includes('naples');
    const wantsNabor = lowerQuery.includes('nabor') || wantsNaples;
    const wantsFannie = lowerQuery.includes('fannie');
    return { preferFlorida, wantsNabor, wantsNaples, wantsFannie };
  }

  private buildContractGuardrail(params: { hints: FormSearchHints; scenario: FormScenario; lowerQuery: string }): string | null {
    const { hints, scenario, lowerQuery } = params;
    const normalizedQuery = lowerQuery.replace(/[\u2010-\u2015]/g, '-'); // normalize hyphen-like chars
    const hasAsIsCue = /\bas[\s-]?is\b/.test(normalizedQuery);
    const hasNoHoaCue = /\b(no hoa|without hoa|not in an hoa|no hoa fees|non-hoa|non hoa|zero hoa)\b/.test(
      normalizedQuery
    );
    const preferNabor = hints.wantsNabor;
    const preferFlorida = hints.preferFlorida || !preferNabor;

    const normalized: FormScenario = { ...scenario };
    const assumptions: string[] = [];

    // Extra safety: treat explicit cues as overrides.
    if (hasAsIsCue) {
      normalized.residentialAsIs = true;
      normalized.residentialImproved = false;
    }
    if (hasNoHoaCue) {
      normalized.hoa = false;
    }

    const hasPrimary =
      normalized.residentialImproved ||
      normalized.residentialAsIs ||
      normalized.vacantLand ||
      normalized.commercial ||
      normalized.rental;

    if (!hasPrimary) {
      normalized.residentialImproved = true;
      assumptions.push('Defaulted to residential improved.');
    }

    if (normalized.residentialAsIs) {
      normalized.residentialImproved = false;
    }

    if (normalized.vacantLand || normalized.commercial || normalized.rental) {
      normalized.residentialAsIs = false;
      normalized.residentialImproved = false;
    }

    let primary = preferNabor
      ? 'NABOR Sales Contract – Residential Improved Property (NAB087)'
      : 'Florida Residential Contract for Sale and Purchase (CSP-15)';

    if (normalized.vacantLand) {
      primary = preferNabor
        ? 'NABOR Sales Contract – Residential Vacant Land (NAB088)'
        : 'Florida Residential Vacant Land Contract';
    } else if (normalized.commercial) {
      primary = 'Florida Commercial Contract';
    } else if (normalized.rental) {
      primary = 'Florida Residential Lease (long-form)';
    } else if (normalized.residentialAsIs) {
      primary = preferNabor
        ? 'NABOR Sales Contract – As Is Residential Improved (NAB089)'
        : 'Florida AS IS Residential Contract (ASIS-7)';
    } else if (hints.wantsFannie) {
      primary = 'Fannie Mae Purchase and Sale Contract';
    }

    const addenda: string[] = [];
    if (normalized.backup) addenda.push('Back-Up Contract Addendum (CR-7 / NAB013)');
    if (normalized.saleContingent) addenda.push("Sale of Buyer's Property Contingency (CR-7V / NAB010)");
    if (normalized.condo) addenda.push('Condominium Rider / Disclosure');
    if (normalized.hoa) addenda.push('HOA / Community Disclosure');
    if (normalized.cash) addenda.push('Cash proof-of-funds / appraisal waiver note');
    if (normalized.exchange1031) addenda.push('1031 Exchange Addendum');
    if (normalized.firpta) addenda.push('FIRPTA Certification / Withholding Addendum');
    if (normalized.environmental) addenda.push('Environmental / Flood / Coastal Rider');
    if (normalized.newConstruction) addenda.push('New Construction / Builder Addendum');
    if (normalized.preTouring) addenda.push('Pre-Touring / Access Agreement');

    if (preferNabor) {
      assumptions.push('Detected Naples / NABOR cues; recommending NABOR forms.');
    } else if (hints.wantsFannie) {
      assumptions.push('Detected Fannie cues; recommending Fannie Mae contract.');
    } else if (preferFlorida) {
      assumptions.push('Defaulting to Florida FAR/BAR contracts.');
    } else {
      assumptions.push('Jurisdiction not specified; defaulting to Florida contracts.');
    }

    const lines = ['Contract guardrails:'];
    lines.push(`- Primary: ${primary}`);
    lines.push(
      addenda.length
        ? `- Addenda: ${addenda.join('; ')}`
        : '- Addenda: none recommended based on detected scenario.'
    );
    if (assumptions.length) {
      lines.push(`- Assumptions: ${assumptions.join(' ')}`);
    }

    return lines.join('\n');
  }

  private detectFormScenario(lowerQuery: string): FormScenario {
    const normalized = lowerQuery.replace(/[\u2012-\u2015]/g, '-'); // normalize em/en dashes to hyphen
    const hasAny = (needles: string[]) => needles.some((w) => normalized.includes(w));
    const residentialAsIs = hasAny(['as is', 'as-is', 'asis']);
    const residentialImproved = hasAny(['standard', 'improved', 'regular']) || (!residentialAsIs && hasAny(['home', 'house', 'residential']));
    const vacantLand = hasAny(['vacant land', 'vacant', 'lot', 'parcel', 'raw land']);
    const commercial = hasAny(['commercial', 'retail', 'industrial', 'office', 'income', 'multi-unit']);
    const backup = hasAny(['backup', 'back-up']);
    const saleContingent = hasAny(['contingent on sale', 'home sale contingency', 'must sell', 'sell my home']);
    const condo = hasAny(['condo', 'condominium']);
    let hoa = hasAny(['hoa', 'homeowners association', 'community']);
    const cash = hasAny(['cash offer', 'cash purchase', 'cash buyer', 'cash deal', 'all cash', 'cash-only', 'cash only']);
    const exchange1031 = hasAny(['1031']);
    const firpta = hasAny(['firpta', 'foreign seller']);
    const newConstruction = hasAny(['new construction', 'pre-construction', 'builder']);
    const rental = hasAny(['rental', 'lease', 'property management']);
    const preTouring = hasAny(['pre touring', 'pre-touring', 'buyer access', 'access agreement']);
    const environmental = hasAny(['flood', 'coastal', 'environment', 'cccl', 'wetland']);

    return {
      residentialImproved,
      residentialAsIs,
      vacantLand,
      commercial,
      backup,
      saleContingent,
      condo: condo && !/\bno condo\b/.test(normalized),
      hoa: hoa && !/\b(no hoa|without hoa|not in an hoa|non-hoa|non hoa)\b/.test(normalized),
      cash,
      exchange1031,
      firpta,
      newConstruction,
      rental,
      preTouring,
      environmental
    };
  }

  private rerankForms(
    entries: FormEntry[],
    terms: string[],
    hints: FormSearchHints,
    scenario: FormScenario
  ): FormEntry[] {
    return entries
      .map((entry) => {
        const haystack = `${entry.title} ${entry.jurisdiction ?? ''} ${entry.s3Key ?? ''}`.toLowerCase();
        return { entry, score: this.scoreFormMatch(haystack, terms, hints, scenario) };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ entry }) => entry);
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
