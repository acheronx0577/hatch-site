import type { AiProviderId } from './types/ai-request.types';

const toBool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value === null || value === '') return fallback;
  return value.toLowerCase() === 'true';
};

const parseProvider = (value: string | undefined): AiProviderId => {
  const lowered = (value ?? '').toLowerCase().trim();
  if (lowered === 'xai') return 'grok';
  if (lowered === 'openai' || lowered === 'anthropic' || lowered === 'gemini' || lowered === 'grok') {
    return lowered as AiProviderId;
  }
  return 'gemini';
};

const readEnv = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const resolveDefaultModelByProvider = (provider: AiProviderId): string => {
  const global = readEnv(process.env.AI_MODEL);

  const byProvider =
    provider === 'gemini'
      ? readEnv(process.env.AI_MODEL_GEMINI)
      : provider === 'openai'
        ? readEnv(process.env.AI_MODEL_OPENAI)
        : provider === 'anthropic'
          ? readEnv(process.env.AI_MODEL_ANTHROPIC)
          : readEnv(process.env.AI_MODEL_GROK) || readEnv(process.env.XAI_MODEL) || readEnv(process.env.GROK_MODEL);

  if (byProvider) {
    return byProvider;
  }

  if (global) {
    return global;
  }

  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-haiku';
    case 'grok':
      return 'grok-4-1-fast-reasoning';
    default:
      return 'gemini-1.5-flash';
  }
};

const defaultProvider = parseProvider(process.env.AI_DEFAULT_PROVIDER);

export const AiFoundationConfig = {
  enabled: toBool(process.env.AI_ENABLED, true),
  defaultProvider,
  modelByProvider: {
    gemini: resolveDefaultModelByProvider('gemini'),
    openai: resolveDefaultModelByProvider('openai'),
    anthropic: resolveDefaultModelByProvider('anthropic'),
    grok: resolveDefaultModelByProvider('grok')
  },
  defaultModel: resolveDefaultModelByProvider(defaultProvider),
  defaultTemperature: Number(process.env.AI_TEMPERATURE ?? 0.2),
  defaultMaxTokens: Number(process.env.AI_MAX_TOKENS ?? 800),
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
  retries: Math.max(0, Math.min(6, Number(process.env.AI_RETRIES ?? 3))),
  retryBaseDelayMs: Math.max(50, Number(process.env.AI_RETRY_BASE_DELAY_MS ?? 400)),
  circuit: {
    failsToOpen: Math.max(1, Number(process.env.AI_CIRCUIT_FAILS_TO_OPEN ?? 5)),
    resetMs: Math.max(1_000, Number(process.env.AI_CIRCUIT_RESET_MS ?? 60_000))
  }
};
