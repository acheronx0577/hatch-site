'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import {
  listWebhookSubscriptions,
  type WebhookSubscription
} from '@/lib/api/webhooks';
import { useCursorPager } from '@/lib/pagination/useCursorPager';

type SubscriptionFilter = 'all' | 'active' | 'inactive';

interface WebhookSubscriptionsTableProps {
  initialItems: WebhookSubscription[];
  initialNextCursor: string | null;
  pageSize: number;
  initialFilter?: SubscriptionFilter;
}

export function WebhookSubscriptionsTable({
  initialItems,
  initialNextCursor,
  pageSize,
  initialFilter = 'all'
}: WebhookSubscriptionsTableProps) {
  const [filter, setFilter] = useState<SubscriptionFilter>(initialFilter);
  const firstRenderRef = useRef(true);

  const fetcher = useCallback(
    (cursor: string | null, signal?: AbortSignal) => {
      return listWebhookSubscriptions({
        cursor,
        limit: pageSize,
        status: filter,
        signal
      });
    },
    [filter, pageSize]
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
  }, [filter, reset, load, clearError]);

  const hasNext = useMemo(() => Boolean(nextCursor), [nextCursor]);

  const onLoadMore = useCallback(async () => {
    const page = await load();
    if (page) {
      clearError();
    }
  }, [load, clearError]);

  const onFilterChange = useCallback((next: SubscriptionFilter) => {
    setFilter(next);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm font-medium text-slate-600 shadow-sm">
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['inactive', 'Inactive']
            ] as [SubscriptionFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onFilterChange(value)}
              disabled={loading}
              className={clsx(
                'rounded-md px-3 py-1 transition focus:outline-none focus:ring-2 focus:ring-brand-500',
                value === filter
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Showing {items.length} subscription{items.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Event Type</th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No webhook subscriptions match your filters yet.
                </td>
              </tr>
            )}
            {items.map((subscription) => (
              <tr key={subscription.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{subscription.eventType}</td>
                <td className="px-4 py-3">
                  <a href={subscription.url} className="text-brand-600 hover:underline">
                    {subscription.url}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
                      subscription.active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {subscription.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDistanceToNow(new Date(subscription.updatedAt), { addSuffix: true })}
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
