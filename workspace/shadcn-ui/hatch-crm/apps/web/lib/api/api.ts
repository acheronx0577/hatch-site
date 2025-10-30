import { ApiError, toApiError } from './errors';

type BodyLike = BodyInit | null | undefined;

export interface ApiFetchOptions {
  method?: string;
  body?: BodyLike;
  headers?: HeadersInit;
  signal?: AbortSignal;
  cache?: RequestCache;
  credentials?: RequestCredentials;
}

const resolveBaseUrl = (): string => {
  const explicit =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.API_BASE_URL ??
    process.env.INTERNAL_API_BASE_URL ??
    '';

  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    return '/api';
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.trim().length > 0) {
    return `https://${vercelUrl.replace(/\/$/, '')}/api`;
  }

  const localPort = process.env.PORT ?? '3000';
  const localUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    `http://127.0.0.1:${localPort}`;

  return `${localUrl.replace(/\/$/, '')}/api`;
};

const buildUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const base = resolveBaseUrl();
  return `${base}/${normalizedPath}`;
};

const shouldEncodeBody = (body: BodyLike): boolean => {
  if (!body) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return false;
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return false;
  return typeof body === 'object';
};

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const url = buildUrl(path);
  const init: RequestInit = {
    method: options.method ?? 'GET',
    signal: options.signal,
    cache: options.cache,
    credentials: options.credentials ?? 'include',
    headers: new Headers(options.headers ?? {})
  };

  if (options.body !== undefined) {
    if (shouldEncodeBody(options.body)) {
      (init.headers as Headers).set('Content-Type', 'application/json');
      init.body = JSON.stringify(options.body);
    } else {
      init.body = options.body;
    }
  }

  if (!(init.headers as Headers).has('Accept')) {
    (init.headers as Headers).set('Accept', 'application/json');
  }

  const response = await fetch(url, init);

  const contentType = response.headers.get('Content-Type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw toApiError(payload, response.status, payload instanceof Error ? payload : undefined);
  }

  return payload as T;
}

export const ensureApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }
  if (error && typeof (error as ApiError).message === 'string') {
    return error as ApiError;
  }
  return toApiError('Unexpected error', 500);
};
