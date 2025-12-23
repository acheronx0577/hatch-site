const ANONYMOUS_ID_KEY = 'hatch_anonymous_id_v1';
const LEGACY_ANONYMOUS_ID_KEY = 'hatch_anonymous_id';

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // RFC 4122 v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getAnonymousId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  try {
    const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    if (existing && existing.trim().length > 0) {
      return existing.trim();
    }

    const legacy = window.localStorage.getItem(LEGACY_ANONYMOUS_ID_KEY);
    if (legacy && legacy.trim().length > 0) {
      const normalized = legacy.trim();
      window.localStorage.setItem(ANONYMOUS_ID_KEY, normalized);
      return normalized;
    }
  } catch {
    // ignore storage errors
  }

  const next = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : fallbackUuid();

  try {
    window.localStorage.setItem(ANONYMOUS_ID_KEY, next);
    window.localStorage.setItem(LEGACY_ANONYMOUS_ID_KEY, next);
  } catch {
    // ignore storage errors
  }

  return next;
}
