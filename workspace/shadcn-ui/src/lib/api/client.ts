import { supabase } from '../supabase'

const fallbackSupabaseUrl = 'https://rdakjayhdvewbpguyuiv.supabase.co'
const fallbackAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkYWtqYXloZHZld2JwZ3V5dWl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMTAxODAsImV4cCI6MjA3NDU4NjE4MH0.Fhy_UCtPfNcIvRYTt6BdSQLos5snjW56l6HPm97HU28'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackSupabaseUrl
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackAnonKey

const defaultFunctionsUrl = import.meta.env.DEV
  ? 'http://localhost:4000'
  : `${supabaseUrl.replace(/\/$/, '')}/functions/v1`

const functionsBaseUrl = (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || defaultFunctionsUrl).replace(/\/$/, '')

if (!functionsBaseUrl) {
  console.warn('Supabase functions base URL is not configured. Set VITE_SUPABASE_URL or VITE_SUPABASE_FUNCTIONS_URL.')
}

export type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
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

  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token

  if (token) {
    headers.Authorization = `Bearer ${token}`
  } else if (supabaseAnonKey) {
    headers.Authorization = `Bearer ${supabaseAnonKey}`
  }

  return headers
}

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

  return payload?.data ?? payload
}

export { supabase, functionsBaseUrl, supabaseAnonKey }
