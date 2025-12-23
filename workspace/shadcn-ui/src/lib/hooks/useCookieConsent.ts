import { useEffect, useState } from 'react'

import { COOKIE_CONSENT_EVENT, getCookieConsent, type CookieConsentChoice } from '@/lib/cookieConsent'

type CookieConsentEvent = CustomEvent<CookieConsentChoice | null>

export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsentChoice | null>(() => getCookieConsent())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler: EventListener = (event) => {
      const detail = (event as CookieConsentEvent).detail
      if (detail === null || detail === 'all' || detail === 'essential' || detail === 'reject') {
        setConsent(detail)
        return
      }
      setConsent(getCookieConsent())
    }

    window.addEventListener(COOKIE_CONSENT_EVENT, handler)
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, handler)
  }, [])

  return consent
}

