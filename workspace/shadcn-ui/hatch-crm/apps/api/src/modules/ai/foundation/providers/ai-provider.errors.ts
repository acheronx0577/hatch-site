import type { AiProviderId } from '../types/ai-request.types';

export type AiProviderErrorType =
  | 'rate_limit'
  | 'timeout'
  | 'auth'
  | 'invalid_request'
  | 'server'
  | 'unavailable'
  | 'unknown';

export class AiProviderError extends Error {
  readonly provider: AiProviderId;
  readonly type: AiProviderErrorType;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(params: {
    provider: AiProviderId;
    type: AiProviderErrorType;
    message: string;
    status?: number;
    retryAfterMs?: number;
  }) {
    super(params.message);
    this.provider = params.provider;
    this.type = params.type;
    this.status = params.status;
    this.retryAfterMs = params.retryAfterMs;
  }

  isRetryable() {
    return ['rate_limit', 'timeout', 'server', 'unavailable'].includes(this.type);
  }
}

