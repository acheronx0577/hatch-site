import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { fetchOfferIntents, OfferIntentRecord, updateOfferIntentStatus } from '@/lib/api/lois';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';
const OFFER_INTENTS_ENABLED = (import.meta.env.VITE_OFFER_INTENTS_ENABLED ?? 'false').toLowerCase() === 'true';
const statusOptions = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'] as const;
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function BrokerOfferIntents() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  if (!orgId) return <div className="p-6 text-sm text-slate-600">Select an organization to view LOIs.</div>;
  if (!OFFER_INTENTS_ENABLED) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Offer intents are disabled in this environment.
      </div>
    );
  }
  return (
    <div className="space-y-6 p-6">
      <OfferIntentsView orgId={orgId} />
    </div>
  );
}

function OfferIntentsView({ orgId }: { orgId: string }) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | (typeof statusOptions)[number]>('ALL');
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['offer-intents', orgId, statusFilter],
    queryFn: () => fetchOfferIntents(orgId, statusFilter === 'ALL' ? undefined : { status: statusFilter }),
    staleTime: 30_000
  });

  const offers = data ?? [];

  const mutation = useMutation({
    mutationFn: ({ offerId, status }: { offerId: string; status: string }) =>
      updateOfferIntentStatus(orgId, offerId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer-intents', orgId] });
    }
  });

  const humanStatus = (status: string) => status.replace(/_/g, ' ');
  const filterOptions = useMemo(() => ['ALL', ...statusOptions], []);

  return (
    <section className="space-y-4" data-testid="offer-intents-view">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Offer intents</p>
          <h1 className="text-2xl font-semibold text-slate-900">Consumer LOIs</h1>
          <p className="text-sm text-slate-500">
            Track submissions from the consumer portal and keep statuses aligned with your workflow.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            aria-label="Filter offer intents by status"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          >
            {filterOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'ALL' ? 'All statuses' : humanStatus(option)}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isLoading}>
            Refresh
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Offer</th>
              <th className="px-4 py-3 text-left">Listing</th>
              <th className="px-4 py-3 text-left">Consumer / Lead</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading offer intents…
                </td>
              </tr>
            ) : offers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No offers submitted yet. Consumer LOIs will appear here.
                </td>
              </tr>
            ) : (
              offers.map((offer) => <OfferIntentRow key={offer.id} offer={offer} onUpdate={mutation.mutate} />)
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

type OfferIntentRowProps = {
  offer: OfferIntentRecord;
  onUpdate: (params: { offerId: string; status: string }) => void;
};

function OfferIntentRow({ offer, onUpdate }: OfferIntentRowProps) {
  const priceLabel = offer.offeredPrice ? currency.format(offer.offeredPrice) : '—';
  const name =
    offer.consumer?.firstName || offer.consumer?.lastName
      ? `${offer.consumer?.firstName ?? ''} ${offer.consumer?.lastName ?? ''}`.trim()
      : offer.lead?.name ?? 'Prospect';
  const email = offer.consumer?.email ?? offer.lead?.email ?? 'No email provided';
  const listingLabel = offer.listing
    ? `${offer.listing.addressLine1}, ${offer.listing.city}`
    : 'General inquiry';

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{offer.id.slice(0, 8)}</div>
        <p className="text-xs text-slate-500">{new Date(offer.createdAt).toLocaleDateString()}</p>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{listingLabel}</div>
        {offer.listing ? (
          <p className="text-xs text-slate-500">
            {offer.listing.state} {offer.listing.postalCode}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{name || 'Prospect'}</div>
        <div className="text-xs text-slate-500">{email}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge className="border bg-slate-50 text-slate-700">{offer.status.replace(/_/g, ' ')}</Badge>
        </div>
        <select
          aria-label={`Status for offer ${offer.id}`}
          className="mt-2 w-44 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
          value={offer.status}
          onChange={(event) => onUpdate({ offerId: offer.id, status: event.target.value })}
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{priceLabel}</p>
        {offer.financingType ? <p className="text-xs text-slate-500">Financing: {offer.financingType}</p> : null}
        {offer.closingTimeline ? (
          <p className="text-xs text-slate-500">Timeline: {offer.closingTimeline}</p>
        ) : null}
        {offer.contingencies ? <p className="text-xs text-slate-500">Contingencies: {offer.contingencies}</p> : null}
        {offer.comments ? <p className="text-xs text-slate-500">Notes: {offer.comments}</p> : null}
      </td>
    </tr>
  );
}
