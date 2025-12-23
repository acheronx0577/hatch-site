import { GoogleGenerativeAI } from '@google/generative-ai';

import { AiProviderError } from './ai-provider.errors';
import type { AiProviderAdapter, AiProviderCompleteParams, AiProviderCompleteResult } from './ai-provider.types';

export class GeminiAdapter implements AiProviderAdapter {
  readonly id = 'gemini' as const;
  private readonly apiKey: string | null;
  private client: GoogleGenerativeAI | null = null;

  constructor(apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    this.apiKey = apiKey?.trim() ? apiKey.trim() : null;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(params: AiProviderCompleteParams): Promise<AiProviderCompleteResult> {
    if (!this.apiKey) {
      throw new AiProviderError({
        provider: this.id,
        type: 'auth',
        message: 'Missing GEMINI_API_KEY (or GOOGLE_API_KEY)'
      });
    }

    try {
      if (!this.client) {
        this.client = new GoogleGenerativeAI(this.apiKey);
      }

      const model = this.client.getGenerativeModel({ model: params.model });

      const result = await model.generateContent(
        {
          contents: [{ role: 'user', parts: [{ text: params.userPrompt }] }],
          systemInstruction: params.systemPrompt?.trim() ? params.systemPrompt.trim() : undefined,
          generationConfig: {
            temperature: params.temperature,
            maxOutputTokens: params.maxTokens,
            responseMimeType: params.responseFormat === 'json_object' ? 'application/json' : undefined
          }
        },
        params.timeoutMs ? { timeout: params.timeoutMs } : undefined
      );

      const text = result.response.text();
      const usage = result.response.usageMetadata;

      return {
        content: (text ?? '').trim(),
        model: params.model,
        usage: {
          promptTokens: usage?.promptTokenCount ?? 0,
          completionTokens: usage?.candidatesTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0
        },
        raw: result.response
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): AiProviderError {
    const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
    const lowered = message.toLowerCase();

    if (lowered.includes('timeout') || lowered.includes('timed out')) {
      return new AiProviderError({ provider: this.id, type: 'timeout', message });
    }
    if (lowered.includes('429') || lowered.includes('resource_exhausted') || lowered.includes('rate')) {
      return new AiProviderError({ provider: this.id, type: 'rate_limit', message });
    }
    if (lowered.includes('401') || lowered.includes('403') || lowered.includes('api key') || lowered.includes('permission')) {
      return new AiProviderError({ provider: this.id, type: 'auth', message });
    }
    if (lowered.includes('500') || lowered.includes('502') || lowered.includes('503')) {
      return new AiProviderError({ provider: this.id, type: 'server', message });
    }

    return new AiProviderError({ provider: this.id, type: 'unknown', message });
  }
}

