export interface NormalisedApiError {
  message: string;
  code?: string;
  details?: unknown;
  status?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export class ApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(message: string, options: { status?: number; code?: string; details?: unknown; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

export const toApiError = (payload: unknown, status?: number, cause?: unknown): ApiError => {
  if (payload instanceof ApiError) {
    return payload;
  }

  if (isRecord(payload)) {
    const message =
      typeof payload.message === 'string' && payload.message.trim().length > 0
        ? payload.message
        : `Request failed with status ${status ?? 'unknown'}`;
    const code = typeof payload.code === 'string' ? payload.code : undefined;
    const details = payload.details ?? payload.errors ?? undefined;

    return new ApiError(message, { status, code, details, cause });
  }

  if (payload instanceof Error) {
    return new ApiError(payload.message, { status, cause: payload });
  }

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return new ApiError(payload, { status, cause });
  }

  return new ApiError(`Request failed with status ${status ?? 'unknown'}`, { status, cause });
};

export const normaliseApiError = (error: unknown): NormalisedApiError => {
  if (error instanceof ApiError) {
    return {
      message: error.message || 'Unexpected error',
      code: error.code,
      details: error.details,
      status: error.status
    };
  }

  if (isRecord(error)) {
    const message =
      typeof error.message === 'string' && error.message.trim().length > 0
        ? error.message
        : 'Unexpected error';
    const code = typeof error.code === 'string' ? error.code : undefined;
    const details = error.details ?? error.errors;
    const status =
      typeof error.status === 'number'
        ? error.status
        : typeof error.statusCode === 'number'
          ? error.statusCode
          : undefined;

    return { message, code, details, status };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: 'Unexpected error' };
};
