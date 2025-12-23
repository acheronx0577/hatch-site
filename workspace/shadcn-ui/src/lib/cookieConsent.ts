export type CookieConsentChoice = 'all' | 'essential' | 'reject'

export const COOKIE_CONSENT_COOKIE = 'hatch_cookie_consent_v1'
export const COOKIE_CONSENT_EVENT = 'hatch:cookie-consent'

type SameSite = 'lax' | 'strict' | 'none'

type CookieOptions = {
  maxAgeSeconds?: number
  path?: string
  sameSite?: SameSite
  secure?: boolean
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie
  if (!raw) return null

  const parts = raw.split('; ')
  for (const part of parts) {
    const [key, ...rest] = part.split('=')
    if (decodeURIComponent(key) !== name) continue
    return decodeURIComponent(rest.join('='))
  }

  return null
}

function setCookie(name: string, value: string, options: CookieOptions = {}) {
  if (typeof document === 'undefined') return

  const segments = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
  segments.push(`Path=${options.path ?? '/'}`)

  if (typeof options.maxAgeSeconds === 'number') {
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`)
  }

  const sameSite = (options.sameSite ?? 'lax').toLowerCase() as SameSite
  segments.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`)

  const secure =
    typeof options.secure === 'boolean'
      ? options.secure
      : typeof location !== 'undefined' && location.protocol === 'https:'

  if (secure) {
    segments.push('Secure')
  }

  document.cookie = segments.join('; ')
}

function deleteCookie(name: string) {
  setCookie(name, '', { maxAgeSeconds: 0, path: '/' })
}

export function getCookieConsent(): CookieConsentChoice | null {
  const value = getCookie(COOKIE_CONSENT_COOKIE)
  if (value === 'all' || value === 'essential' || value === 'reject') return value
  return null
}

export function isTrackingAllowed(consent: CookieConsentChoice | null | undefined): boolean {
  return consent === 'all'
}

export function clearTrackingStorage() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem('hatch_anonymous_id')
    window.localStorage.removeItem('hatch_anonymous_id_v1')
  } catch {
    // ignore storage errors
  }
  try {
    window.sessionStorage.removeItem('hatch_session_started_at')
  } catch {
    // ignore storage errors
  }
}

export function setCookieConsent(consent: CookieConsentChoice) {
  // Store consent for 12 months.
  setCookie(COOKIE_CONSENT_COOKIE, consent, { maxAgeSeconds: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' })

  if (!isTrackingAllowed(consent)) {
    clearTrackingStorage()
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<CookieConsentChoice>(COOKIE_CONSENT_EVENT, { detail: consent }))
  }
}

export function clearCookieConsent() {
  deleteCookie(COOKIE_CONSENT_COOKIE)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<CookieConsentChoice | null>(COOKIE_CONSENT_EVENT, { detail: null }))
  }
}

