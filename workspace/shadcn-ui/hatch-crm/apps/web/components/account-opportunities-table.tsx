'use client';

import { useCallback, useState } from 'react';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import {
  listOpportunities,
  type Opportunity
} from '@/lib/api/opportunities';

interface AccountOpportunitiesTableProps {
  accountId: string;
  initialItems: Opportunity[];
  initialNextCursor: string | null;
  pageSize: number;
}

export default function AccountOpportunitiesTable({
  accountId,
  initialItems,
  initialNextCursor,
  pageSize
}: AccountOpportunitiesTableProps) {
  const [items, setItems] = useState<Opportunity[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const { error, showError, clearError, map } = useApiError();

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await listOpportunities({
        accountId,
        cursor: nextCursor,
        limit: pageSize
      });
      setItems((prev) => mergeOpportunities(prev, response.items));
      setNextCursor(response.nextCursor ?? null);
      clearError();
    } catch (err) {
      showError(err);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading, accountId, pageSize, showError, clearError]);

  const pagingError = error ? map(error) : null;

  return (
    <div className="overflow-hidden rounded border border-slate-100">
      {pagingError && <ErrorBanner {...pagingError} onDismiss={clearError} className="m-4" />}
      <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Close Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.length === 0 && !nextCursor && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                No linked opportunities yet.
              </td>
            </tr>
          )}
          {items.map((opportunity) => (
            <tr key={opportunity.id}>
              <td className="px-4 py-3 font-semibold text-brand-600">
                {opportunity.name ?? 'Untitled opportunity'}
              </td>
              <td className="px-4 py-3">{opportunity.stage ?? '—'}</td>
              <td className="px-4 py-3">
                {typeof opportunity.amount === 'number'
                  ? new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: opportunity.currency ?? 'USD'
                    }).format(opportunity.amount)
                  : '—'}
              </td>
              <td className="px-4 py-3">
                {opportunity.closeDate ? new Date(opportunity.closeDate).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end border-t border-slate-100 bg-slate-50 p-3">
        <LoadMoreButton hasNext={Boolean(nextCursor)} isLoading={isLoading} onClick={loadMore} />
      </div>
    </div>
  );
}

const mergeOpportunities = (current: Opportunity[], incoming: Opportunity[]) => {
  if (!incoming.length) {
    return current;
  }
  const map = new Map<string, Opportunity>();
  current.forEach((item) => {
    map.set(item.id, item);
  });
  incoming.forEach((item) => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
};
