export type CopilotContext = {
  surface: 'dashboard' | 'lead' | 'listing' | 'transaction' | 'admin' | 'other';
  channel?: string;
  contextType?: string;
  contextId?: string;
  page?: string;
  entityId?: string;
  entityType?: 'lead' | 'contact' | 'listing' | 'transaction';
  summary?: string;
  metadata?: Record<string, unknown>;
};

const CONTEXT_EVENT = 'copilot:context';
const PREFILL_EVENT = 'copilot:prefill';

export function emitCopilotContext(context: CopilotContext) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(CONTEXT_EVENT, { detail: context }));
}

export type CopilotPrefillPayload = {
  message: string;
  personaId?: string;
  chatMode?: 'team' | 'direct';
};

export function emitCopilotPrefill(payload: CopilotPrefillPayload) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail: payload }));
}
