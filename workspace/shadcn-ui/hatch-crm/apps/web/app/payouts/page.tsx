'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import { useCursorPager } from '@/lib/pagination/useCursorPager';
import { listPayouts, markPayoutPaid, type Payout } from '@/lib/api/payouts';

export default function PayoutsPage() {
  const [status, setStatus] = useState<string>('PENDING');
  const [isPending, startTransition] = useTransition();
  const { banner, showError, clearError, map } = useApiError();

  const fetchPayouts = useCallback(
    (cursor: string | null, signal?: AbortSignal) =>
      listPayouts({
        status,
        cursor: cursor ?? undefined,
        signal
      }),
    [status]
  );

  const { items, nextCursor, load, reset, loading, error: pagingError } = useCursorPager<Payout>(
    fetchPayouts
  );

  const loadInitial = useCallback(
    async (nextStatus: string) => {
      try {
        const data = await listPayouts({ status: nextStatus });
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

  const handleMarkPaid = (id: string) =>
    startTransition(async () => {
      try {
        clearError();
        await markPayoutPaid(id);
        await loadInitial(status);
      } catch (err) {
        showError(err);
      }
    });

  const pagingBanner = pagingError ? map(pagingError) : null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Payouts</h1>
          <p className="text-sm text-slate-500">
            Track broker and agent disbursements generated from opportunity closures.
          </p>
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="w-40 rounded border border-slate-300 px-3 py-2 text-sm"
          disabled={isPending}
        >
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
        </select>
      </div>

      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Opportunity</th>
              <th className="px-4 py-3">Payee</th>
              <th className="px-4 py-3">Gross</th>
              <th className="px-4 py-3">Broker Share</th>
              <th className="px-4 py-3">Agent Share</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {items.length === 0 && !loading && !isPending && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  No payouts found for the selected filter.
                </td>
              </tr>
            )}
            {items.map((payout) => (
              <tr key={payout.id}>
                <td className="px-4 py-3">{payout.opportunityId ?? '—'}</td>
                <td className="px-4 py-3">{payout.payeeId ?? '—'}</td>
                <td className="px-4 py-3">{formatCurrency(payout.grossAmount)}</td>
                <td className="px-4 py-3">{formatCurrency(payout.brokerAmount)}</td>
                <td className="px-4 py-3">{formatCurrency(payout.agentAmount)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">
                    {payout.status ?? 'UNKNOWN'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {payout.status === 'PENDING' ? (
                    <button
                      type="button"
                      onClick={() => handleMarkPaid(payout.id)}
                      disabled={isPending}
                      className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Mark Paid
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">
                      Paid {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : ''}
                    </span>
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

const formatCurrency = (value?: number) =>
  typeof value === 'number'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
    : '—';
