export type AskHatchLaunchContext = {
  title?: string;
  contextType?: 'GENERAL' | 'LEAD' | 'LISTING' | 'TRANSACTION';
  contextId?: string;
  contextSnapshot?: Record<string, unknown>;
};

const OPEN_EVENT = 'ask-hatch:open';
const CLOSE_EVENT = 'ask-hatch:close';

export function emitAskHatchOpen(context?: AskHatchLaunchContext | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: context ?? null }));
}

export function emitAskHatchClose() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLOSE_EVENT));
}

