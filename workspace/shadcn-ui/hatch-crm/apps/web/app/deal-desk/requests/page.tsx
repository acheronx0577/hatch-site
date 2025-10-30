'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';

import {
  approveDealDeskRequest,
  listDealDeskRequests,
  rejectDealDeskRequest,
  type DealDeskRequest
} from '@/lib/api/deal-desk';
import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import { useCursorPager } from '@/lib/pagination/useCursorPager';

export default function DealDeskRequestsPage() {
  const [status, setStatus] = useState<string>('PENDING');
  const [isPending, startTransition] = useTransition();
  const { banner, showError, clearError, map } = useApiError();

  const fetchRequests = useCallback(
    (cursor: string | null, signal?: AbortSignal) =>
      listDealDeskRequests({
        status,
        cursor: cursor ?? undefined,
        signal
      }),
    [status]
  );

  const { items, nextCursor, load, reset, loading, error: pagingError } = useCursorPager<DealDeskRequest>(
    fetchRequests
  );

  const loadInitial = useCallback(
    async (nextStatus: string) => {
      try {
        const data = await listDealDeskRequests({ status: nextStatus });
        reset(data.items, data.nextCursor ?? null);
        clearError();
      } catch (err) {
        showError(err);
        reset([], null);
      }
    },
    [clearError, reset, showError]
  );

  useEffect(() => {
    startTransition(() => {
      void loadInitial(status);
    });
  }, [status, loadInitial]);

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null || isPending) {
      return;
    }
    await load();
  }, [isPending, load, loading, nextCursor]);

  const handleDecision = (id: string, action: 'approve' | 'reject') =>
    startTransition(async () => {
      try {
        clearError();
        if (action === 'approve') {
          await approveDealDeskRequest(id);
        } else {
          await rejectDealDeskRequest(id);
        }
        await loadInitial(status);
      } catch (err) {
        showError(err);
      }
    });

  const pagingBanner = pagingError ? map(pagingError) : null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Deal Desk Requests</h1>
          <p className="text-sm text-slate-500">
            Review high-discount approvals before confirming opportunity terms.
          </p>
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-40 rounded border border-slate-300 px-3 py-2 text-sm"
          disabled={isPending}
        >
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Opportunity</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Discount %</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {items.length === 0 && !loading && !isPending && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No requests for the selected status.
                </td>
              </tr>
            )}
            {items.map((request) => (
              <tr key={request.id}>
                <td className="px-4 py-3">
                  {request.opportunityId ? (
                    <Link href={`/opportunities/${request.opportunityId}`} className="text-brand-600 hover:underline">
                      {request.opportunityId}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  {typeof request.amount === 'number'
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(request.amount)
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {typeof request.discountPct === 'number' ? `${request.discountPct.toFixed(2)}%` : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">
                    {request.status ?? 'UNKNOWN'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {request.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision(request.id, 'approve')}
                        disabled={isPending}
                        className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision(request.id, 'reject')}
                        disabled={isPending}
                        className="rounded bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Decision recorded</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {Boolean(nextCursor) || pagingBanner ? (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-right">
            {pagingBanner && (
              <ErrorBanner {...pagingBanner} className="mb-3 inline-block max-w-md text-left" />
            )}
            <LoadMoreButton
              hasNext={Boolean(nextCursor)}
              isLoading={loading || isPending}
              onClick={() => {
                void loadMore();
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
