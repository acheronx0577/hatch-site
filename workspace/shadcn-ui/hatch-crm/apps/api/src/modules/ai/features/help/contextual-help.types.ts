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

export type ExplainFieldRequest = {
  fieldPath: string;
  question?: string;
  currentValue?: string | null;
};

export type ExplainFieldResponse = {
  explanation: string;
  relatedHelp: Array<{ fieldPath: string; meta: FieldMeta }>;
  learnMoreLinks: string[];
};

export type PageHelpRequest = {
  pagePath: string;
  question: string;
};

export type PageHelpResponse = {
  answer: string;
  suggestedActions: string[];
  relatedPages: string[];
};

export type UserHelpContext = {
  role: string;
};

export type PageContext = {
  title: string;
  summary: string;
  keyAreas: string[];
  relatedPages: string[];
};

