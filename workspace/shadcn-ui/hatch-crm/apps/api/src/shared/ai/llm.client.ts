import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import {
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_LLM_MODEL_ID,
  INTERNAL_LLM_PROVIDER_ID,
  type LlmChatMessage,
  type LlmResponseFormat
} from './llm.constants';

const readEnv = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const DEFAULT_VENDOR_COMPLETION_MODEL =
  readEnv(process.env.AI_MODEL) ??
  readEnv(process.env.AI_MODEL_GROK) ??
  readEnv(process.env.XAI_MODEL) ??
  readEnv(process.env.GROK_MODEL) ??
  'grok-4-1-fast-reasoning';

const DEFAULT_VENDOR_EMBEDDING_MODEL =
  readEnv(process.env.AI_EMBEDDINGS_MODEL) ??
  readEnv(process.env.XAI_EMBEDDINGS_MODEL) ??
  readEnv(process.env.GROK_EMBEDDINGS_MODEL) ??
  DEFAULT_EMBEDDING_MODEL_ID;

const COMPLETION_MODEL_ALIASES: Record<string, string> = {
  [DEFAULT_LLM_MODEL_ID]: DEFAULT_VENDOR_COMPLETION_MODEL,
  'internalai-default': DEFAULT_VENDOR_COMPLETION_MODEL,
  'llmclient-default': DEFAULT_VENDOR_COMPLETION_MODEL,
  // Backwards-compatible aliases for legacy model ids (Gemini/OpenAI/Anthropic).
  'gpt-4o-mini': DEFAULT_VENDOR_COMPLETION_MODEL,
  'gpt-4.1-mini': DEFAULT_VENDOR_COMPLETION_MODEL,
  'gpt-4.1': DEFAULT_VENDOR_COMPLETION_MODEL,
  'gemini-1.5-flash': DEFAULT_VENDOR_COMPLETION_MODEL,
  'gemini-1.5-pro': DEFAULT_VENDOR_COMPLETION_MODEL,
  'claude-3-haiku': DEFAULT_VENDOR_COMPLETION_MODEL,
  'claude-3-sonnet': DEFAULT_VENDOR_COMPLETION_MODEL,
  'claude-3-opus': DEFAULT_VENDOR_COMPLETION_MODEL
};

const EMBEDDING_MODEL_ALIASES: Record<string, string> = {
  [DEFAULT_EMBEDDING_MODEL_ID]: DEFAULT_VENDOR_EMBEDDING_MODEL,
  'internalai-embeddings': DEFAULT_VENDOR_EMBEDDING_MODEL,
  // Backwards-compatible aliases for legacy embedding model ids.
  'text-embedding-3-small': DEFAULT_VENDOR_EMBEDDING_MODEL,
  'text-embedding-004': DEFAULT_VENDOR_EMBEDDING_MODEL
};

export class LLMClient {
  private readonly client: OpenAI | null;
  private readonly log = new Logger(LLMClient.name);

  constructor(
    apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY,
    baseURL = process.env.XAI_BASE_URL || process.env.GROK_BASE_URL || 'https://api.x.ai/v1'
  ) {
    const key = apiKey?.trim();
    if (key) {
      this.client = new OpenAI({ apiKey: key, baseURL: normalizeBaseUrl(baseURL) });
    } else {
      this.client = null;
      this.log.warn('LLM client initialized without API key; set XAI_API_KEY to enable Grok calls.');
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  getProviderId(): string {
    return INTERNAL_LLM_PROVIDER_ID;
  }

  getStatus() {
    return {
      provider: this.getProviderId(),
      isConfigured: this.isConfigured()
    };
  }

  resolveCompletionModel(model?: string): string {
    return this.mapCompletionModel(model);
  }

  resolveEmbeddingModel(model?: string): string {
    return this.mapEmbeddingModel(model);
  }

  async createResponse(options: {
    model: string;
    input: string | unknown;
    maxOutputTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  }) {
    if (!this.client) {
      return null;
    }

    const prompt = typeof options.input === 'string' ? options.input : this.stringifyContent(options.input);
    const completion = await this.client.chat.completions.create(
      {
        model: this.mapCompletionModel(options.model),
        temperature: options.temperature,
        max_tokens: options.maxOutputTokens,
        messages: [{ role: 'user', content: prompt }]
      },
      options.timeoutMs ? { timeout: options.timeoutMs } : undefined
    );

    const text = completion.choices?.[0]?.message?.content ?? '';
    return { output_text: text.trim() };
  }

  async createChatCompletion(options: {
    model: string;
    messages: LlmChatMessage[];
    temperature?: number;
    responseFormat?: LlmResponseFormat;
    timeoutMs?: number;
  }): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    const messages = this.toOpenAiMessages(options.messages);
    const completion = await this.client.chat.completions.create(
      {
        model: this.mapCompletionModel(options.model),
        temperature: options.temperature,
        response_format: options.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
        messages
      },
      options.timeoutMs ? { timeout: options.timeoutMs } : undefined
    );

    const text = completion.choices?.[0]?.message?.content ?? '';
    return text?.trim().length ? text.trim() : null;
  }

  async createEmbeddings(options: { texts: string[]; model?: string }): Promise<number[][]> {
    if (!this.client) {
      throw new Error('LLM provider is not configured');
    }

    const texts = Array.isArray(options.texts) ? options.texts.map((text) => String(text ?? '')) : [];
    const response = await this.client.embeddings.create({
      model: this.mapEmbeddingModel(options.model),
      input: texts
    });

    const embeddings = response.data?.map((row) => row.embedding) ?? [];
    if (embeddings.length !== texts.length) {
      throw new Error(`LLM embeddings returned ${embeddings.length} vectors for ${texts.length} texts`);
    }
    return embeddings;
  }

  private mapCompletionModel(model?: string): string {
    const requestedRaw = (model || DEFAULT_LLM_MODEL_ID).trim();
    if (!requestedRaw) {
      return DEFAULT_VENDOR_COMPLETION_MODEL;
    }
    const requestedKey = requestedRaw.toLowerCase();
    return COMPLETION_MODEL_ALIASES[requestedKey] ?? requestedRaw;
  }

  private mapEmbeddingModel(model?: string): string {
    const requestedRaw = (model || DEFAULT_EMBEDDING_MODEL_ID).trim();
    if (!requestedRaw) {
      return DEFAULT_VENDOR_EMBEDDING_MODEL;
    }
    const requestedKey = requestedRaw.toLowerCase();
    return EMBEDDING_MODEL_ALIASES[requestedKey] ?? requestedRaw;
  }

  private stringifyContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    try {
      return JSON.stringify(content ?? '');
    } catch {
      return String(content ?? '');
    }
  }

  private toOpenAiMessages(messages: LlmChatMessage[]): ChatCompletionMessageParam[] {
    const out: ChatCompletionMessageParam[] = [];

    for (const message of messages) {
      const role = message.role;
      if (role !== 'system' && role !== 'user' && role !== 'assistant') {
        continue;
      }
      const text = this.stringifyContent(message.content).trim();
      if (!text) {
        continue;
      }
      out.push({ role, content: text });
    }

    if (!out.length) {
      out.push({ role: 'user', content: 'Hello' });
    }

    return out;
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 'https://api.x.ai/v1';
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}
