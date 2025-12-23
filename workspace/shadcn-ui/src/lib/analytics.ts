import { apiFetch } from '@/lib/api/hatch';
import { getCookieConsent, isTrackingAllowed } from '@/lib/cookieConsent';

type AnalyticsEventPayload = {
  name: string;
  category?: string;
  tenantId?: string;
  userId?: string;
  properties?: Record<string, unknown>;
};

export async function trackEvent(payload: AnalyticsEventPayload) {
  if (!isTrackingAllowed(getCookieConsent())) {
    return;
  }
  const body = JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString()
  });

  try {
    await apiFetch('analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Analytics trackEvent failed', error);
    }
  }
}
