const ATTRIBUTION_KEY = 'hatch_attribution_v1';

export type AttributionSnapshot = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  landingPage: string | null;
  referrer: string | null;
  capturedAt: string | null;
};

const emptySnapshot = (): AttributionSnapshot => ({
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  gclid: null,
  fbclid: null,
  landingPage: null,
  referrer: null,
  capturedAt: null
});

const normalizeParam = (value: string | null): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const pickParam = (params: URLSearchParams, keys: string[]): string | null => {
  for (const key of keys) {
    const value = normalizeParam(params.get(key));
    if (value) return value;
  }
  return null;
};

export function getAttribution(): AttributionSnapshot {
  if (typeof window === 'undefined') {
    return emptySnapshot();
  }

  const url = new URL(window.location.href);
  const params = url.searchParams;

  const utmSource = pickParam(params, ['utm_source', 'utmSource']);
  const utmMedium = pickParam(params, ['utm_medium', 'utmMedium']);
  const utmCampaign = pickParam(params, ['utm_campaign', 'utmCampaign']);
  const gclid = normalizeParam(params.get('gclid'));
  const fbclid = normalizeParam(params.get('fbclid'));

  const hasAny = Boolean(utmSource || utmMedium || utmCampaign || gclid || fbclid);

  if (hasAny) {
    const snapshot: AttributionSnapshot = {
      utmSource,
      utmMedium,
      utmCampaign,
      gclid,
      fbclid,
      landingPage: window.location.href,
      referrer: document.referrer || null,
      capturedAt: new Date().toISOString()
    };

    try {
      window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore storage errors
    }

    return snapshot;
  }

  try {
    const stored = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (!stored) return emptySnapshot();
    const parsed = JSON.parse(stored) as Partial<AttributionSnapshot>;
    return {
      utmSource: normalizeParam(parsed.utmSource ?? null),
      utmMedium: normalizeParam(parsed.utmMedium ?? null),
      utmCampaign: normalizeParam(parsed.utmCampaign ?? null),
      gclid: normalizeParam(parsed.gclid ?? null),
      fbclid: normalizeParam(parsed.fbclid ?? null),
      landingPage: normalizeParam(parsed.landingPage ?? null),
      referrer: normalizeParam(parsed.referrer ?? null),
      capturedAt: normalizeParam(parsed.capturedAt ?? null)
    };
  } catch {
    return emptySnapshot();
  }
}
