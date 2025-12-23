import Anthropic from '@anthropic-ai/sdk';

import { AiProviderError } from './ai-provider.errors';
import type { AiProviderAdapter, AiProviderCompleteParams, AiProviderCompleteResult } from './ai-provider.types';

export class AnthropicAdapter implements AiProviderAdapter {
  readonly id = 'anthropic' as const;
  private readonly apiKey: string | null;
  private client: Anthropic | null = null;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    this.apiKey = apiKey?.trim() ? apiKey.trim() : null;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(params: AiProviderCompleteParams): Promise<AiProviderCompleteResult> {
    if (!this.apiKey) {
      throw new AiProviderError({ provider: this.id, type: 'auth', message: 'Missing ANTHROPIC_API_KEY' });
    }

    try {
      if (!this.client) {
        this.client = new Anthropic({ apiKey: this.apiKey });
      }

      const response = await this.client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens ?? 800,
        temperature: params.temperature,
        system: params.systemPrompt?.trim() ? params.systemPrompt.trim() : undefined,
        messages: [{ role: 'user', content: params.userPrompt }]
      });

      const content = Array.isArray(response.content)
        ? response.content
            .map((block) => (block && typeof block === 'object' && 'text' in block ? String((block as any).text ?? '') : ''))
            .join('')
        : '';

      return {
        content: content.trim(),
        model: params.model,
        usage: {
          promptTokens: (response as any).usage?.input_tokens ?? 0,
          completionTokens: (response as any).usage?.output_tokens ?? 0,
          totalTokens:
            ((response as any).usage?.input_tokens ?? 0) + ((response as any).usage?.output_tokens ?? 0)
        },
        raw: response
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): AiProviderError {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
    const anyErr = error as any;
    const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined;

    const lowered = message.toLowerCase();
    if (lowered.includes('timeout') || anyErr?.name === 'AbortError') {
      return new AiProviderError({ provider: this.id, type: 'timeout', message, status });
    }
    if (status === 401 || status === 403) {
      return new AiProviderError({ provider: this.id, type: 'auth', message, status });
    }
    if (status === 429 || lowered.includes('rate limit')) {
      const retryAfterMs = parseRetryAfterMs(message);
      return new AiProviderError({ provider: this.id, type: 'rate_limit', message, status, retryAfterMs });
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

function parseRetryAfterMs(message: string): number | undefined {
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

