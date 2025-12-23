export const INTERNAL_LLM_PROVIDER_ID = 'grok';

export const DEFAULT_LLM_MODEL_ID = 'pipeline-ai-default';
export const DEFAULT_EMBEDDING_MODEL_ID = 'pipeline-embeddings-default';

export type LlmChatMessage = {
  role: 'system' | 'assistant' | 'user';
  content: unknown;
};

export type LlmResponseFormat = 'json_object' | 'text';
