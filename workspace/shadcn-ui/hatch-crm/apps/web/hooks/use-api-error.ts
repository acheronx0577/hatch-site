'use client';

import { useCallback, useMemo, useState } from 'react';

import { normaliseApiError, type NormalisedApiError } from '@/lib/api/errors';

interface BannerProps {
  title: string;
  detail?: string;
  code?: string;
  status?: number;
}

const mapNormalisedError = (error: NormalisedApiError): BannerProps => {
  const { status, code, message, details } = error;

  switch (status) {
    case 400:
    case 422:
      return { title: 'Please check the highlighted fields.', detail: message, code, status };
    case 401:
      return { title: 'Your session expired. Please sign in and try again.', detail: message, code, status };
    case 403:
      return { title: "You don't have permission to perform this action.", detail: message, code, status };
    case 404:
      return { title: 'We could not find that record. Try refreshing.', detail: message, code, status };
    case 409:
      return { title: 'This item changed. Reload and try again.', detail: message, code, status };
    default: {
      if (typeof status === 'number' && status >= 500) {
        return { title: 'Our server hit a snag. Please retry.', detail: message, code, status };
      }
      return { title: 'Something went wrong.', detail: message, code, status };
    }
  }
};

export function useApiError() {
  const [error, setError] = useState<NormalisedApiError | null>(null);

  const showError = useCallback((input: unknown) => {
    const normalised = normaliseApiError(input);
    setError(normalised);
    return normalised;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const map = useCallback((input: unknown): BannerProps => {
    return mapNormalisedError(normaliseApiError(input));
  }, []);

  const banner = useMemo(() => (error ? mapNormalisedError(error) : null), [error]);

  return { error, banner, showError, clearError, map };
}
