import { DEFAULT_LLM_MODEL_ID } from '@/shared/ai/llm.constants';

const readEnv = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const resolveModel = () => {
  return (
    readEnv(process.env.AI_MODEL) ??
    readEnv(process.env.AI_MODEL_GROK) ??
    readEnv(process.env.XAI_MODEL) ??
    readEnv(process.env.GROK_MODEL) ??
    DEFAULT_LLM_MODEL_ID
  );
};

export const AiConfig = {
  model: resolveModel(),
  temperature: Number(process.env.AI_TEMPERATURE ?? 0.2),
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000)
};
