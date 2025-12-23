export enum AiFeature {
  LISTING_DESCRIPTION = 'listing_description',
  FOLLOW_UP_EMAIL = 'follow_up_email',
  FOLLOW_UP_TEXT = 'follow_up_text',
  AD_COPY = 'ad_copy',
  OBJECTION_REPLY = 'objection_reply',
  LEAD_SUMMARY = 'lead_summary',
  CONVERSATION_SUMMARY = 'conversation_summary',
  DOCUMENT_QA = 'document_qa',
  PROPERTY_DOSSIER = 'property_dossier',
  NATURAL_LANGUAGE_SEARCH = 'nl_search',
  COMPLIANCE_CHECK = 'compliance_check',
  ONBOARDING_ASSISTANT = 'onboarding_assistant',
  CONTEXTUAL_HELP = 'contextual_help',
  TRAINING_ASSISTANT = 'training_assistant',
  VIDEO_ASSISTANT = 'video_assistant',
  COMMISSION_PARSER = 'commission_parser',
}

export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'grok';

export interface AiCompletionRequest {
  feature: AiFeature;
  promptTemplate: string;
  variables: Record<string, any>;
  userId: string;
  brokerageId: string;
  context?: {
    entityType: 'lead' | 'listing' | 'transaction' | 'document' | 'agent';
    entityId: string;
  };
  options?: {
    provider?: AiProviderId;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    requiresHumanApproval?: boolean;
    skipPiiRedaction?: boolean;
    responseFormat?: 'text' | 'json_object';
  };
}

export interface AiCompletionResponse {
  id: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  metadata: {
    provider: string;
    model: string;
    latencyMs: number;
    guardrailsApplied: string[];
    piiRedacted: boolean;
  };
  requiresApproval: boolean;
}
