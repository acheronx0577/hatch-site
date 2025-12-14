export type PersonaContext = {
  surface: 'dashboard' | 'lead' | 'listing' | 'transaction' | 'admin' | 'other';
  entityId?: string;
  entityType?: 'lead' | 'contact' | 'listing' | 'transaction';
  summary?: string;
  metadata?: Record<string, unknown>;
};

const CONTEXT_EVENT = 'persona:context';

export function emitPersonaContext(context: PersonaContext) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(CONTEXT_EVENT, { detail: context }));
}
