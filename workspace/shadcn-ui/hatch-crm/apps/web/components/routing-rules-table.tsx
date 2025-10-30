'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import {
  listRoutingRules,
  type RoutingRule
} from '@/lib/api/routing';
import { useCursorPager } from '@/lib/pagination/useCursorPager';

type RoutingModeFilter = 'all' | 'FIRST_MATCH' | 'SCORE_AND_ASSIGN';

interface RoutingRulesTableProps {
  initialItems: RoutingRule[];
  initialNextCursor: string | null;
  pageSize: number;
  initialQuery?: string;
  initialMode?: RoutingModeFilter;
}

const modeToLabel: Record<RoutingModeFilter, string> = {
  all: 'All modes',
  FIRST_MATCH: 'First match',
  SCORE_AND_ASSIGN: 'Score & assign'
};

export function RoutingRulesTable({
  initialItems,
  initialNextCursor,
  pageSize,
  initialQuery = '',
  initialMode = 'all'
}: RoutingRulesTableProps) {
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<RoutingModeFilter>(initialMode);
  const firstRenderRef = useRef(true);

  const fetcher = useCallback(
    (cursor: string | null, signal?: AbortSignal) => {
      return listRoutingRules({
        cursor,
        limit: pageSize,
        q: query.trim() ? query.trim() : undefined,
        mode: mode === 'all' ? undefined : mode,
        signal
      });
    },
    [query, mode, pageSize]
  );

  const { items, nextCursor, load, reset, loading, error } = useCursorPager(fetcher, {
    initialItems,
    initialCursor: initialNextCursor
  });

  const { banner, showError, clearError } = useApiError();

  useEffect(() => {
    if (!error) {
      return;
    }
    showError(error);
  }, [error, showError]);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    reset([], null);
    clearError();
    void load();
  }, [query, mode, reset, load, clearError]);

  const hasNext = useMemo(() => Boolean(nextCursor), [nextCursor]);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = searchValue.trim();
      if (trimmed === query.trim()) {
        return;
      }
      setQuery(trimmed);
    },
    [searchValue, query]
  );

  const onModeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(event.target.value as RoutingModeFilter);
  }, []);

  const onLoadMore = useCallback(async () => {
    const page = await load();
    if (page) {
      clearError();
    }
  }, [load, clearError]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-2 md:flex-row md:items-center">
          <label className="flex-1 text-sm font-medium text-slate-600">
            <span className="sr-only">Search routing rules</span>
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search rules by name"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none"
              disabled={loading}
            />
          </label>
          <button
            type="submit"
            className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            Search
          </button>
        </form>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Mode
          <select
            value={mode}
            onChange={onModeChange}
            className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none"
            disabled={loading}
          >
            {(['all', 'FIRST_MATCH', 'SCORE_AND_ASSIGN'] as RoutingModeFilter[]).map((value) => (
              <option key={value} value={value}>
                {modeToLabel[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Rule</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No routing rules match your filters yet.
                </td>
              </tr>
            )}
            {items.map((rule) => (
              <tr key={rule.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-semibold text-slate-800">{rule.name}</div>
                  <div className="text-xs text-slate-500">#{rule.id.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3 text-xs font-medium text-slate-600">
                  {modeToLabel[(rule.mode as RoutingModeFilter) ?? 'all'] ?? rule.mode}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{rule.priority}</td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
                      rule.enabled
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDistanceToNow(new Date(rule.updatedAt), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col items-end gap-3 border-t border-slate-100 bg-slate-50 p-3">
          {banner && <ErrorBanner {...banner} onDismiss={clearError} />}
          <LoadMoreButton hasNext={hasNext} isLoading={loading} onClick={onLoadMore} />
        </div>
      </div>
    </div>
  );
}
