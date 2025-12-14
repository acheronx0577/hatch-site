export type PersonaCitation = {
  id: string;
  entityType: string;
  entityId: string;
  score?: number;
  meta?: Record<string, unknown> | null;
};

export type PersonaSnippet = {
  id?: string;
  content: string;
  score?: number;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown> | null;
};
