import OpenAI from 'openai';

import { AiProviderError } from './ai-provider.errors';
import type { AiProviderAdapter, AiProviderCompleteParams, AiProviderCompleteResult } from './ai-provider.types';

export class GrokAdapter implements AiProviderAdapter {
  readonly id = 'grok' as const;
  private readonly apiKey: string | null;
  private readonly baseURL: string;
  private client: OpenAI | null = null;

  constructor(
    apiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY,
    baseURL = process.env.XAI_BASE_URL || process.env.GROK_BASE_URL || 'https://api.x.ai/v1'
  ) {
    this.apiKey = apiKey?.trim() ? apiKey.trim() : null;
    this.baseURL = normalizeBaseUrl(baseURL);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(params: AiProviderCompleteParams): Promise<AiProviderCompleteResult> {
    if (!this.apiKey) {
      throw new AiProviderError({ provider: this.id, type: 'auth', message: 'Missing XAI_API_KEY (or GROK_API_KEY)' });
    }

    try {
      if (!this.client) {
        this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });
      }

      const completion = await this.client.chat.completions.create(
        {
          model: params.model,
          temperature: params.temperature,
          max_tokens: params.maxTokens,
          response_format: params.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
          messages: [
            ...(params.systemPrompt?.trim()
              ? [{ role: 'system' as const, content: params.systemPrompt.trim() }]
              : []),
            { role: 'user' as const, content: params.userPrompt }
          ]
        },
        params.timeoutMs ? { timeout: params.timeoutMs } : undefined
      );

      const content = completion.choices?.[0]?.message?.content ?? '';
      const usage = completion.usage;

      return {
        content: content.trim(),
        model: params.model,
        usage: {
          promptTokens: usage?.prompt_tokens ?? 0,
          completionTokens: usage?.completion_tokens ?? 0,
          totalTokens: usage?.total_tokens ?? 0
        },
        raw: completion
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): AiProviderError {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
    const anyErr = error as any;
    const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined;

    if (message.toLowerCase().includes('timeout') || anyErr?.name === 'AbortError') {
      return new AiProviderError({ provider: this.id, type: 'timeout', message, status });
    }

    if (status === 401 || status === 403) {
      return new AiProviderError({ provider: this.id, type: 'auth', message, status });
    }

    if (status === 429) {
      const retryAfter = constRetryAfterMs(message);
      return new AiProviderError({ provider: this.id, type: 'rate_limit', message, status, retryAfterMs: retryAfter });
    }

    if (status && status >= 500) {
      return new AiProviderError({ provider: this.id, type: 'server', message, status });
    }

    if (status && status >= 400) {
      return new AiProviderError({ provider: this.id, type: 'invalid_request', message, status });
    }

    return new AiProviderError({ provider: this.id, type: 'unknown', message, status });
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return 'https://api.x.ai/v1';
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function constRetryAfterMs(message: string): number | undefined {
  const match = message.match(/try again in ([0-9.]+)(ms|s)/i);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return match[2].toLowerCase().startsWith('s') ? value * 1000 : value;
}

