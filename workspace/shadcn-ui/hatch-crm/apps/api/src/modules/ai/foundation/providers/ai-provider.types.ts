import type { AiProviderId } from '../types/ai-request.types';

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiProviderCompleteParams = {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  responseFormat?: 'text' | 'json_object';
};

export type AiProviderCompleteResult = {
  content: string;
  model: string;
  usage: TokenUsage;
  raw?: unknown;
};

export interface AiProviderAdapter {
  readonly id: AiProviderId;
  isConfigured(): boolean;
  complete(params: AiProviderCompleteParams): Promise<AiProviderCompleteResult>;
}

