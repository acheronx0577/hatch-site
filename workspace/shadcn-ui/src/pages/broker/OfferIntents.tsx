import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';

import AttachmentsPanel from '@/components/files/AttachmentsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { fetchOrgListings } from '@/lib/api/org-listings';
import {
  createAuthenticatedOfferIntent,
  fetchOfferIntents,
  type OfferIntentRecord,
  type OfferIntentStatus,
  updateOfferIntentStatus
} from '@/lib/api/lois';
import { cn } from '@/lib/utils';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';
const OFFER_INTENTS_ENABLED = (import.meta.env.VITE_OFFER_INTENTS_ENABLED ?? 'true').toLowerCase() === 'true';
const statusOptions = ['DRAFT', 'SENT', 'RECEIVED', 'COUNTERED', 'ACCEPTED', 'REJECTED'] as const;
type StatusFilter = 'ALL' | (typeof statusOptions)[number];
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const normalizeStatusFilter = (value: string | null): StatusFilter | null => {
  if (!value) return null;
  const normalized = value.toUpperCase().trim();
  if (normalized === 'ALL') return 'ALL';
  if ((statusOptions as readonly string[]).includes(normalized)) {
    return normalized as StatusFilter;
  }
  return null;
};

export default function BrokerOfferIntents() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  if (!orgId) return <div className="text-sm text-slate-600">Select an organization to view LOIs.</div>;
  if (!OFFER_INTENTS_ENABLED) {
    return (
      <div className="text-sm text-slate-600">
        Offer intents are disabled in this environment.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <OfferIntentsView orgId={orgId} />
    </div>
  );
}

function OfferIntentsView({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [listingFilter, setListingFilter] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOfferId, setDetailOfferId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const status = normalizeStatusFilter(searchParams.get('status'));
    const listingId = searchParams.get('listingId') ?? '';
    setStatusFilter(status ?? 'ALL');
    setListingFilter(listingId);
  }, [searchParams]);

  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId) return;
    if (focusId === detailOfferId) return;
    setDetailOfferId(focusId);
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [detailOfferId, searchParams, setSearchParams]);

  const updateFilters = (next: { status?: StatusFilter; listingId?: string }) => {
    const params = new URLSearchParams(searchParams);
    const nextStatus = next.status ?? statusFilter;
    const nextListing = next.listingId ?? listingFilter;

    if (nextStatus && nextStatus !== 'ALL') {
      params.set('status', nextStatus);
    } else {
      params.delete('status');
    }

    if (nextListing) {
      params.set('listingId', nextListing);
    } else {
      params.delete('listingId');
    }

    setSearchParams(params, { replace: true });
  };

  const listingsQuery = useQuery({
    queryKey: ['org-listings', orgId],
    queryFn: () => fetchOrgListings(orgId),
    enabled: Boolean(orgId),
    staleTime: 60_000
  });

  const listings = listingsQuery.data ?? [];
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['offer-intents', orgId, statusFilter, listingFilter],
    queryFn: () =>
      fetchOfferIntents(orgId, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        listingId: listingFilter || undefined
      }),
    staleTime: 30_000
  });

  const offers = data ?? [];
  const selectedOffer = useMemo(
    () => (detailOfferId ? offers.find((offer) => offer.id === detailOfferId) ?? null : null),
    [detailOfferId, offers]
  );

  const mutation = useMutation({
    mutationFn: ({ offerId, status }: { offerId: string; status: string }) =>
      updateOfferIntentStatus(orgId, offerId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer-intents', orgId] });
    }
  });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createAuthenticatedOfferIntent>[1]) =>
      createAuthenticatedOfferIntent(orgId, payload),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['offer-intents', orgId] });
      setCreateOpen(false);
      setCreateError(null);
      setDetailOfferId(created.id);
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : 'Failed to create LOI');
    }
  });

  const humanStatus = (status: string) => status.replace(/_/g, ' ');
  const filterOptions = useMemo(() => ['ALL', ...statusOptions], []);

  const [form, setForm] = useState<{
    listingId: string;
    status: OfferIntentStatus;
    buyerName: string;
    sellerName: string;
    offeredPrice: string;
    financingType: string;
    closingTimeline: string;
    expiresAt: string;
    contingencies: string;
    comments: string;
  }>({
    listingId: '',
    status: 'DRAFT',
    buyerName: '',
    sellerName: '',
    offeredPrice: '',
    financingType: '',
    closingTimeline: '',
    expiresAt: '',
    contingencies: '',
    comments: ''
  });

  useEffect(() => {
    if (!createOpen) return;
    if (form.listingId) return;
    if (listingFilter) {
      setForm((prev) => ({ ...prev, listingId: listingFilter }));
      return;
    }
    if (listings.length > 0) {
      setForm((prev) => ({ ...prev, listingId: listings[0]?.id ?? '' }));
    }
  }, [createOpen, form.listingId, listingFilter, listings]);

  const handleCreate = () => {
    if (!form.listingId) {
      setCreateError('Select a listing');
      return;
    }

    const offeredPriceNumber = form.offeredPrice.trim() ? Number(form.offeredPrice.trim()) : undefined;
    if (form.offeredPrice.trim() && !Number.isFinite(offeredPriceNumber)) {
      setCreateError('Offer amount must be a valid number');
      return;
    }

    setCreateError(null);
    createMutation.mutate({
      listingId: form.listingId,
      status: form.status,
      buyerName: form.buyerName.trim() || undefined,
      sellerName: form.sellerName.trim() || undefined,
      offeredPrice: offeredPriceNumber,
      financingType: form.financingType.trim() || undefined,
      closingTimeline: form.closingTimeline.trim() || undefined,
      expiresAt: form.expiresAt || undefined,
      contingencies: form.contingencies.trim() || undefined,
      comments: form.comments.trim() || undefined
    });
  };

  return (
    <section className="space-y-4" data-testid="offer-intents-view">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Offer intents</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Offer LOIs</h1>
          <p className="text-sm text-slate-600">
            Create LOIs manually today (with PDF uploads). Email ingestion can be layered in later.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={listingFilter || '__all'}
            onValueChange={(value) => updateFilters({ listingId: value === '__all' ? '' : value })}
          >
            <SelectTrigger className="h-9 w-[260px] rounded-full">
              <SelectValue placeholder={listingsQuery.isLoading ? 'Loading…' : 'All listings'} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="__all">All listings</SelectItem>
              {listings.map((listing) => (
                <SelectItem key={listing.id} value={listing.id}>
                  {listing.addressLine1}, {listing.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--glass-border)] bg-white/10 p-1 backdrop-blur-md dark:bg-white/5">
            {filterOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => updateFilters({ status: option as StatusFilter })}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-200',
                  statusFilter === option
                    ? 'border border-white/20 bg-white/35 text-slate-900 shadow-brand'
                    : 'text-slate-600 hover:bg-white/20 hover:text-slate-900 dark:text-ink-100/70 dark:hover:bg-white/10 dark:hover:text-ink-100'
                )}
              >
                {option === 'ALL' ? 'All' : humanStatus(option)}
              </button>
            ))}
          </div>

          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create LOI
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Offer</TableHead>
              <TableHead>Listing</TableHead>
              <TableHead>Buyer / Seller</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  Loading offer intents…
                </TableCell>
              </TableRow>
            ) : offers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  No LOIs yet. Create one to start tracking status + attachments.
                </TableCell>
              </TableRow>
            ) : (
              offers.map((offer) => (
                <OfferIntentRow
                  key={offer.id}
                  offer={offer}
                  onUpdate={mutation.mutate}
                  onOpen={() => setDetailOfferId(offer.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Create LOI</DialogTitle>
            <DialogDescription>
              Manual LOI entry (MVP). After creation you can upload PDFs and supporting docs.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Listing</Label>
                <Select
                  value={form.listingId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, listingId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={listingsQuery.isLoading ? 'Loading…' : 'Select listing'} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {listings.map((listing) => (
                      <SelectItem key={listing.id} value={listing.id}>
                        {listing.addressLine1}, {listing.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as OfferIntentStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {statusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="loi-buyer">Buyer</Label>
                <Input
                  id="loi-buyer"
                  value={form.buyerName}
                  onChange={(e) => setForm((prev) => ({ ...prev, buyerName: e.target.value }))}
                  placeholder="Buyer name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="loi-seller">Seller</Label>
                <Input
                  id="loi-seller"
                  value={form.sellerName}
                  onChange={(e) => setForm((prev) => ({ ...prev, sellerName: e.target.value }))}
                  placeholder="Seller name"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="loi-price">Offer amount</Label>
                <Input
                  id="loi-price"
                  type="number"
                  inputMode="numeric"
                  value={form.offeredPrice}
                  onChange={(e) => setForm((prev) => ({ ...prev, offeredPrice: e.target.value }))}
                  placeholder="e.g. 750000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="loi-expiry">Expires</Label>
                <Input
                  id="loi-expiry"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="loi-financing">Financing</Label>
                <Input
                  id="loi-financing"
                  value={form.financingType}
                  onChange={(e) => setForm((prev) => ({ ...prev, financingType: e.target.value }))}
                  placeholder="e.g. Cash, Conventional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="loi-timeline">Closing timeline</Label>
                <Input
                  id="loi-timeline"
                  value={form.closingTimeline}
                  onChange={(e) => setForm((prev) => ({ ...prev, closingTimeline: e.target.value }))}
                  placeholder="e.g. 30 days"
                />
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="loi-contingencies">Contingencies</Label>
                <Textarea
                  id="loi-contingencies"
                  value={form.contingencies}
                  onChange={(e) => setForm((prev) => ({ ...prev, contingencies: e.target.value }))}
                  placeholder="Inspection, appraisal, financing…"
                />
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="loi-comments">Notes</Label>
                <Textarea
                  id="loi-comments"
                  value={form.comments}
                  onChange={(e) => setForm((prev) => ({ ...prev, comments: e.target.value }))}
                  placeholder="Add context for your team…"
                />
              </div>
            </div>

            {createError ? (
              <div className="rounded-xl border border-rose-200/70 bg-rose-500/10 p-3 text-sm text-rose-800">
                {createError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create LOI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailOfferId)}
        onOpenChange={(open) => {
          if (!open) setDetailOfferId(null);
        }}
      >
        <DialogContent className="sm:max-w-[860px]">
          <DialogHeader>
            <DialogTitle>LOI details</DialogTitle>
            <DialogDescription>Status, parties, and attachments for this LOI.</DialogDescription>
          </DialogHeader>

          {!selectedOffer ? (
            <div className="text-sm text-slate-600">Loading LOI…</div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--glass-border)] bg-white/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Listing</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {selectedOffer.listing
                          ? `${selectedOffer.listing.addressLine1}, ${selectedOffer.listing.city}`
                          : selectedOffer.listingId}
                      </p>
                      {selectedOffer.listing ? (
                        <p className="text-xs text-slate-500">
                          {selectedOffer.listing.state} {selectedOffer.listing.postalCode}
                        </p>
                      ) : null}
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/broker/properties/${selectedOffer.listingId}`} target="_blank" rel="noreferrer">
                        Open
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 rounded-xl border border-[var(--glass-border)] bg-white/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
                    <Badge variant={statusBadgeVariant(selectedOffer.status)}>
                      {selectedOffer.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <Select
                    value={selectedOffer.status}
                    onValueChange={(value) => mutation.mutate({ offerId: selectedOffer.id, status: value })}
                  >
                    <SelectTrigger className="h-9 rounded-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 rounded-xl border border-[var(--glass-border)] bg-white/20 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Buyer</span>
                    <span className="font-medium text-slate-900">{selectedOffer.buyerName ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Seller</span>
                    <span className="font-medium text-slate-900">{selectedOffer.sellerName ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Offer</span>
                    <span className="font-medium text-slate-900">
                      {selectedOffer.offeredPrice ? currency.format(selectedOffer.offeredPrice) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Expires</span>
                    <span className="font-medium text-slate-900">
                      {selectedOffer.expiresAt ? new Date(selectedOffer.expiresAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <AttachmentsPanel object="offer-intents" recordId={selectedOffer.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

type OfferIntentRowProps = {
  offer: OfferIntentRecord;
  onUpdate: (params: { offerId: string; status: string }) => void;
  onOpen: () => void;
};

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case 'ACCEPTED':
      return 'success' as const;
    case 'SENT':
      return 'info' as const;
    case 'RECEIVED':
    case 'COUNTERED':
      return 'warning' as const;
    case 'REJECTED':
      return 'danger' as const;
    case 'DRAFT':
    default:
      return 'neutral' as const;
  }
};

function OfferIntentRow({ offer, onUpdate, onOpen }: OfferIntentRowProps) {
  const priceLabel = offer.offeredPrice ? currency.format(offer.offeredPrice) : '—';
  const name =
    offer.consumer?.firstName || offer.consumer?.lastName
      ? `${offer.consumer?.firstName ?? ''} ${offer.consumer?.lastName ?? ''}`.trim()
      : offer.lead?.name ?? 'Prospect';
  const listingLabel = offer.listing
    ? `${offer.listing.addressLine1}, ${offer.listing.city}`
    : 'General inquiry';
  const buyerLabel = offer.buyerName ?? name ?? '—';
  const sellerLabel = offer.sellerName ?? '—';

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium text-slate-900">{offer.id.slice(0, 8)}</div>
        <p className="text-xs text-slate-500">{new Date(offer.createdAt).toLocaleDateString()}</p>
      </TableCell>
      <TableCell>
        <div className="font-medium text-slate-900">{listingLabel}</div>
        {offer.listing ? (
          <p className="text-xs text-slate-500">
            {offer.listing.state} {offer.listing.postalCode}
          </p>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="font-medium text-slate-900">{buyerLabel}</div>
        <div className="text-xs text-slate-500">{sellerLabel}</div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge variant={statusBadgeVariant(offer.status)}>{offer.status.replace(/_/g, ' ')}</Badge>
        </div>
        <div className="mt-2">
          <Select value={offer.status} onValueChange={(value) => onUpdate({ offerId: offer.id, status: value })}>
            <SelectTrigger className="h-9 w-44 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TableCell>
      <TableCell>
        <p className="font-medium text-slate-900">{priceLabel}</p>
        {offer.expiresAt ? (
          <p className="text-xs text-slate-500">Expires: {new Date(offer.expiresAt).toLocaleDateString()}</p>
        ) : null}
        {offer.closingTimeline ? <p className="text-xs text-slate-500">Timeline: {offer.closingTimeline}</p> : null}
        <Button variant="outline" size="sm" className="mt-2" onClick={onOpen}>
          View details
        </Button>
      </TableCell>
    </TableRow>
  );
}
