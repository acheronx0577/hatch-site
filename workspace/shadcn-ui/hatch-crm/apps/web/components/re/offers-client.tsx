"use client";

import { useCallback, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import { useCursorPager } from '@/lib/pagination/useCursorPager';
import { sendEvent } from '@/lib/telemetry/sendEvent';
import OfferForm from './offer-form';
import { decideReOffer, listReOffers, type ReOffer } from '@/lib/api/re.offers';

interface OffersClientProps {
  listingId: string;
  listingStatus: string;
  transactionId: string | null;
  initialOffers: ReOffer[];
  initialNextCursor: string | null;
  pageSize: number;
}

export default function OffersClient({
  listingId,
  listingStatus,
  transactionId,
  initialOffers,
  initialNextCursor,
  pageSize
}: OffersClientProps) {
  const router = useRouter();
  const { banner, showError, clearError, map } = useApiError();

  const pager = useCursorPager<ReOffer>(
    useCallback(
      async (cursor: string | null, signal?: AbortSignal) =>
        listReOffers(listingId, {
          cursor: cursor ?? undefined,
          limit: pageSize,
          signal
        }),
      [listingId, pageSize]
    ),
    {
      initialItems: initialOffers,
      initialCursor: initialNextCursor
    }
  );

  const pagingBanner = useMemo(() => (pager.error ? map(pager.error) : null), [pager.error, map]);

  const loadMore = useCallback(async () => {
    if (pager.loading || pager.nextCursor === null) {
      return;
    }
    const requestedCursor = pager.nextCursor;
    const startedAt = performance.now();
    const page = await pager.load();
    const duration = Math.round(performance.now() - startedAt);
    sendEvent('offers_load_page', {
      cursor: requestedCursor ?? 'null',
      count: page?.items.length ?? 0,
      ms: duration,
      ok: Boolean(page)
    });
  }, [pager]);

  const handleDecision = useCallback(
    async (offerId: string, status: 'ACCEPTED' | 'REJECTED') => {
      const eventName = status === 'ACCEPTED' ? 'offers_accept' : 'offers_reject';
      const startedAt = performance.now();
      try {
        await decideReOffer(offerId, { status });
        pager.setItems((prev) =>
          prev.map((offer) => (offer.id === offerId ? { ...offer, status } : offer))
        );
        clearError();
        router.refresh();
        sendEvent(eventName, {
          offerId,
          ms: Math.round(performance.now() - startedAt),
          ok: true
        });
      } catch (err) {
        const normalised = showError(err);
        sendEvent(eventName, {
          offerId,
          ms: Math.round(performance.now() - startedAt),
          ok: false,
          code: normalised?.code ?? undefined
        });
        throw err;
      }
    },
    [clearError, pager, router, showError]
  );

  const hasNext = Boolean(pager.nextCursor);

  return (
    <div className="space-y-6">
      <OfferForm listingId={listingId} />

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Listing Status</h2>
        <p className="mt-2 text-sm text-slate-600">
          Current status: <span className="font-medium text-slate-800">{listingStatus}</span>
        </p>
        {transactionId ? (
          <p className="mt-1 text-sm text-slate-600">
            Escrow Transaction:{' '}
            <a href={`/re/transactions/${transactionId}`} className="text-brand-600 hover:underline">
              View transaction
            </a>
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No transaction created yet.</p>
        )}
      </section>

      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}

      <OffersTable offers={pager.items} onDecision={handleDecision} />

      {pagingBanner && <ErrorBanner {...pagingBanner} className="ml-auto w-full max-w-sm" />}
      <LoadMoreButton hasNext={hasNext} isLoading={pager.loading} onClick={loadMore} className="ml-auto" />
    </div>
  );
}

function OffersTable({
  offers,
  onDecision
}: {
  offers: ReOffer[];
  onDecision: (offerId: string, status: 'ACCEPTED' | 'REJECTED') => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
        Offers ({offers.length})
      </div>
      {offers.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">No offers submitted yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Offer ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {offers.map((offer) => (
                <OfferRow key={offer.id} offer={offer} onDecision={onDecision} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OfferRow({
  offer,
  onDecision
}: {
  offer: ReOffer;
  onDecision: (offerId: string, status: 'ACCEPTED' | 'REJECTED') => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  const runDecision = (status: 'ACCEPTED' | 'REJECTED') =>
    startTransition(async () => {
      try {
        await onDecision(offer.id, status);
      } catch {
        // error already surfaced via shared banner
      }
    });

  const canDecide = offer.status === 'SUBMITTED' || offer.status === 'COUNTERED';

  return (
    <tr>
      <td className="px-4 py-3 font-medium text-slate-800">{offer.id}</td>
      <td className="px-4 py-3">
        <OfferStatusBadge status={offer.status} />
      </td>
      <td className="px-4 py-3">
        {typeof offer.amount === 'number'
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(offer.amount)
          : '—'}
      </td>
      <td className="px-4 py-3">
        {canDecide ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => runDecision('ACCEPTED')}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => runDecision('REJECTED')}
              className="rounded bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-500">Decision recorded</span>
        )}
      </td>
    </tr>
  );
}

function OfferStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'ACCEPTED'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'REJECTED'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}
