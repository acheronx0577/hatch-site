import axios from 'axios'
import { supabase, supabaseAnonKey } from '../supabase'

const AUTH_STORAGE_KEY = 'hatch_auth_tokens'

const ensurePrefix = (prefix: string) => (prefix.startsWith('/') ? prefix : `/${prefix}`)
const withApiPrefix = (base: string, prefix: string) => {
  const normalizedBase = base.replace(/\/+$/, '')
  const normalizedPrefix = ensurePrefix(prefix)
  return normalizedBase.endsWith(normalizedPrefix)
    ? normalizedBase
    : `${normalizedBase}${normalizedPrefix}`
}

const apiPrefix = ensurePrefix(import.meta.env.VITE_API_PREFIX || '/api/v1')

const baseApiUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : 'http://localhost:4000')

const defaultFunctionsUrl = withApiPrefix(baseApiUrl, apiPrefix)

// Used by legacy fetch-based request helper
const functionsBaseUrl = (
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ||
  import.meta.env.VITE_FUNCTIONS_URL ||
  defaultFunctionsUrl
).replace(/\/$/, '')

export type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

const readAuthFromStorage = () => {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as { accessToken?: string; refreshToken?: string; user?: { id?: string; role?: string } }
  } catch {
    return null
  }
}

export const buildHeaders = async (options?: RequestOptions) => {
  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    ...(options?.headers ?? {}),
  }

  const hasFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData
  const hasJsonPayload = options?.body !== undefined && !hasFormData

  if (hasJsonPayload && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const stored = readAuthFromStorage()
  const storedToken = stored?.accessToken

  if (stored?.user?.id && !headers['x-user-id']) {
    headers['x-user-id'] = stored.user.id
  }
  if (!headers['x-user-role']) {
    headers['x-user-role'] = (stored?.user?.role ?? 'BROKER').toUpperCase()
  }
  if (!headers['x-tenant-id']) {
    headers['x-tenant-id'] = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'
  }
  if (!headers['x-org-id']) {
    headers['x-org-id'] = import.meta.env.VITE_ORG_ID || 'org-hatch'
  }

  if (storedToken) {
    headers.Authorization = `Bearer ${storedToken}`
  } else {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token

    if (token) {
      headers.Authorization = `Bearer ${token}`
    } else if (supabaseAnonKey) {
      headers.Authorization = `Bearer ${supabaseAnonKey}`
    }
  }

  return headers
}

// Legacy supabase-functions request helper
export const request = async <T>(path: string, options?: RequestOptions): Promise<T> => {
  if (!functionsBaseUrl) {
    throw new Error('functions_base_url_missing')
  }

  const method = options?.method ?? 'GET'
  const hasFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData
  const headers = await buildHeaders(options)
  const body = hasFormData
    ? (options?.body as BodyInit | null | undefined)
    : options?.body !== undefined
      ? JSON.stringify(options.body)
      : undefined

  const response = await fetch(`${functionsBaseUrl}${path}`, {
    method,
    headers,
    body,
    credentials: 'include',
  })

  const contentType = response.headers.get('Content-Type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : undefined

  if (!response.ok) {
    const errorCode = payload?.error ?? response.statusText
    const error = new Error(typeof errorCode === 'string' ? errorCode : 'request_failed')
    ;(error as Error & { status?: number }).status = response.status
    if (payload) {
      ;(error as Error & { payload?: unknown }).payload = payload
    }
    throw error
  }

  return (payload?.data ?? payload) as T
}

// Axios client for direct API calls
const defaultApiBase = withApiPrefix(
  import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:4000`
      : 'http://localhost:4000'),
  apiPrefix
)

export const apiClient = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || defaultApiBase).replace(/\/$/, ''),
  withCredentials: true,
})

// NOTE: All authentication headers must come from real user sessions
// No default headers are injected to prevent unauthorized access

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {}
  // Headers must be provided by the application's auth system
  return config
})

export { supabase, functionsBaseUrl, supabaseAnonKey }
