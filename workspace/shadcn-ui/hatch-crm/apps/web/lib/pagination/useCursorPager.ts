import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';

import { mergePage } from './mergePage';

export type PageEnvelope<T> = {
  items: T[];
  nextCursor: string | null;
};

export type CursorFetcher<T> = (
  cursor: string | null,
  signal?: AbortSignal
) => Promise<PageEnvelope<T>>;

interface Options<T> {
  initialItems?: T[];
  initialCursor?: string | null;
}

export function useCursorPager<T>(
  fetcher: CursorFetcher<T>,
  options: Options<T> = {}
) {
  const [items, setItems] = useState<T[]>(options.initialItems ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(
    options.initialCursor ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const currentCursorRef = useRef<string | null>(options.initialCursor ?? null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const load = useCallback(async () => {
    if (loadingRef.current) {
      return null;
    }

    const cursor = currentCursorRef.current;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const page = await fetcher(cursor, controller.signal);

      if (requestId !== requestIdRef.current) {
        return null;
      }

      setItems((prev) => mergePage(prev, page.items));
      setNextCursor(page.nextCursor);
      currentCursorRef.current = page.nextCursor;

      return page;
    } catch (err) {
      // Ignore AbortError
      if (
        // @ts-ignore - narrow AbortError
        err?.name !== 'AbortError' &&
        requestId === requestIdRef.current
      ) {
        setError(err);
      }
      return null;
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [fetcher]);

  const reset = useCallback(
    (nextItems: T[] = [], cursor: string | null = null) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = null;
      requestIdRef.current = 0;
      currentCursorRef.current = cursor;
      loadingRef.current = false;
      setItems(nextItems);
      setNextCursor(cursor);
      setError(null);
      setLoading(false);
    },
    []
  );

  const updateItems = useCallback(
    (updater: SetStateAction<T[]>) => {
      setItems((prev) =>
        typeof updater === 'function' ? (updater as any)(prev) : updater
      );
    },
    []
  );

  return {
    items,
    nextCursor,
    loading,
    error,
    load,
    reset,
    setItems: updateItems,
    setNextCursor: (cursor: string | null) => {
      currentCursorRef.current = cursor;
      setNextCursor(cursor);
    }
  };
}
