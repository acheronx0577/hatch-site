import { apiFetch } from '@/lib/api';

export type FieldMeta = {
  label: string;
  description: string;
  whyRequired: string;
  legalBasis: string;
  bestPractice: string;
  consequences: string;
  format: string;
  examples: string[];
  documentationLinks: string[];
  relatedFields: string[];
};

export type ExplainFieldResponse = {
  explanation: string;
  relatedHelp: Array<{ fieldPath: string; meta: FieldMeta }>;
  learnMoreLinks: string[];
};

export type PageHelpResponse = {
  answer: string;
  suggestedActions: string[];
  relatedPages: string[];
};

export async function explainField(params: { fieldPath: string; question?: string; currentValue?: string | null }) {
  return apiFetch<ExplainFieldResponse>('help/explain-field', {
    method: 'POST',
    body: {
      fieldPath: params.fieldPath,
      question: params.question,
      currentValue: params.currentValue ?? undefined
    }
  });
}

export async function askPageHelp(params: { pagePath: string; question: string }) {
  return apiFetch<PageHelpResponse>('help/ask', {
    method: 'POST',
    body: {
      pagePath: params.pagePath,
      question: params.question
    }
  });
}

