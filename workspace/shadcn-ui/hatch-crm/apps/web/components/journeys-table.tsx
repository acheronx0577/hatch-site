'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import {
  listJourneys,
  type JourneyListItem
} from '@/lib/api/journeys';
import { useCursorPager } from '@/lib/pagination/useCursorPager';

type JourneyStatusFilter = 'all' | 'active' | 'inactive';

interface JourneysTableProps {
  initialItems: JourneyListItem[];
  initialNextCursor: string | null;
  pageSize: number;
  initialQuery?: string;
  initialStatus?: JourneyStatusFilter;
}

export function JourneysTable({
  initialItems,
  initialNextCursor,
  pageSize,
  initialQuery = '',
  initialStatus = 'all'
}: JourneysTableProps) {
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<JourneyStatusFilter>(initialStatus);
  const firstRenderRef = useRef(true);

  const fetcher = useCallback(
    (cursor: string | null, signal?: AbortSignal) => {
      return listJourneys({
        cursor,
        limit: pageSize,
        q: query.trim() ? query.trim() : undefined,
        active: status,
        signal
      });
    },
    [query, status, pageSize]
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
  }, [query, status, reset, load, clearError]);

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

  const onStatusChange = useCallback((next: JourneyStatusFilter) => {
    setStatus(next);
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
            <span className="sr-only">Search journeys</span>
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search journeys by name"
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
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium text-slate-600 shadow-sm">
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['inactive', 'Inactive']
            ] as [JourneyStatusFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onStatusChange(value)}
              disabled={loading}
              className={clsx(
                'rounded-md px-3 py-1 transition focus:outline-none focus:ring-2 focus:ring-brand-500',
                value === status
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Journey</th>
              <th className="px-4 py-3">Trigger</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No journeys match your filters yet.
                </td>
              </tr>
            )}
            {items.map((journey) => (
              <tr key={journey.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-semibold text-slate-800">{journey.name}</div>
                  <div className="text-xs text-slate-500">#{journey.id.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{journey.trigger}</td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
                      journey.isActive
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {journey.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDistanceToNow(new Date(journey.updatedAt), { addSuffix: true })}
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
