'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useClearOnEdit(clear: () => void, deps: ReadonlyArray<unknown> = []) {
  const clearedRef = useRef(false);

  useEffect(() => {
    clearedRef.current = false;
  }, deps);

  return useCallback(() => {
    if (!clearedRef.current) {
      clearedRef.current = true;
      clear();
    }
  }, [clear]);
}
