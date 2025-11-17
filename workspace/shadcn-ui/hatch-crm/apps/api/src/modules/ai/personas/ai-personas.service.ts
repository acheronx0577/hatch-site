import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@/modules/prisma/prisma.service';

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

const MEMORY_POLICIES: Record<PersonaId, MemoryPolicy> = {
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

  constructor(
    private readonly ai: AiService,
    private readonly router: AiPersonaRouterService,
    private readonly prisma: PrismaService
  ) {}

  async handleChatMessage(input: {
    tenantId: string;
    text: string;
    currentPersonaId: PersonaId;
    history: ChatHistory;
  }): Promise<PersonaChatResponse> {
    const { text, currentPersonaId, history, tenantId } = input;
    const routing = await this.router.routeMessage(currentPersonaId, text);
    const persona = PERSONAS.find((candidate) => candidate.id === routing.targetPersonaId) ?? PERSONAS[0];

    const [crmContext, memoryContext] = await Promise.all([
      this.safeBuildCrmContext(persona.id === 'agent_copilot', tenantId),
      this.safeLoadMemories(tenantId)
    ]);

    const prompt = buildSystemPromptForPersona(persona, { crmContext, memoryContext });
    const messages = history.slice(-10);
    const reply = await this.ai.runStructuredChat({
      systemPrompt: prompt,
      messages: [...messages, { role: 'user', content: text }]
    });

    const assistantContent = reply.text ?? 'I need a moment to think about that.';
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
