'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import {
  listCases,
  type CaseListParams,
  type CaseSummary
} from '@/lib/api/cases';

interface CasesTableProps {
  initialItems: CaseSummary[];
  initialNextCursor: string | null;
  filters: CaseListParams;
  pageSize: number;
}

export default function CasesTable({
  initialItems,
  initialNextCursor,
  filters,
  pageSize
}: CasesTableProps) {
  const [items, setItems] = useState<CaseSummary[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const { error, showError, clearError, map } = useApiError();

  const hasNext = useMemo(() => Boolean(nextCursor), [nextCursor]);

  const mergeCases = useCallback((current: CaseSummary[], incoming: CaseSummary[]) => {
    if (!incoming.length) {
      return current;
    }
    const map = new Map<string, CaseSummary>();
    current.forEach((item) => {
      map.set(item.id, item);
    });
    incoming.forEach((item) => {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
    });
    return Array.from(map.values());
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await listCases({
        ...filters,
        cursor: nextCursor,
        limit: pageSize
      });
      setItems((prev) => mergeCases(prev, response.items));
      setNextCursor(response.nextCursor ?? null);
      clearError();
    } catch (err) {
      showError(err);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading, filters, pageSize, mergeCases, showError, clearError]);

  const pagingError = error ? map(error) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {pagingError && <ErrorBanner {...pagingError} onDismiss={clearError} className="m-4" />}
      <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.length === 0 && !hasNext ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                No cases match your filters.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-brand-700">
                  <Link href={`/cases/${item.id}`}>{item.subject ?? 'Untitled case'}</Link>
                </td>
                <td className="px-4 py-3">{item.status ?? '—'}</td>
                <td className="px-4 py-3">{item.priority ?? '—'}</td>
                <td className="px-4 py-3">
                  {item.account ? (
                    <Link href={`/accounts/${item.account.id}`} className="text-brand-600 hover:underline">
                      {item.account.name ?? item.account.id}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex justify-end border-t border-slate-100 bg-slate-50 p-3">
        <LoadMoreButton hasNext={hasNext} isLoading={isLoading} onClick={loadMore} />
      </div>
    </div>
  );
}
