import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, Trash2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { deleteBrokerProperty } from '@/lib/api/properties';
import { fetchOrgListings, type OrgListingRecord } from '@/lib/api/org-listings';
import {
  isActiveListingStatus,
  isExpiringSoon,
  isFlaggedListingStatus,
  isPendingListingStatus,
  summarizeListings
} from '@/lib/listings/summary';
import { cn } from '@/lib/utils';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

const filters = [
  { id: 'ALL', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'EXPIRING', label: 'Expiring' },
  { id: 'FLAGGED', label: 'Needs approval' }
] as const;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

type PropertiesFilter = (typeof filters)[number]['id'];

export default function BrokerProperties() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  if (!orgId) {
    return <div className="text-sm text-slate-600">Select an organization to view listing inventory.</div>;
  }
  return (
    <div className="space-y-6">
      <PropertiesView orgId={orgId} />
    </div>
  );
}

function PropertiesView({ orgId }: { orgId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const placeholderImg =
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 120%22%3E%3Crect width=%22200%22 height=%22120%22 rx=%2212%22 fill=%22%23eef2f7%22/%3E%3Cpath d=%22M20 90h160L128 46 98 74 74 56z%22 fill=%22%23cbd5e1%22/%3E%3Ccircle cx=%2270%22 cy=%2246%22 r=%228%22 fill=%22%23cbd5e1%22/%3E%3C/svg%3E';
  const parseFilter = (value: string | null): PropertiesFilter => {
    if (!value) return 'ALL';
    const match = filters.find((filter) => filter.id === value.toUpperCase());
    return (match?.id ?? 'ALL') as PropertiesFilter;
  };

  const [filter, setFilter] = useState<PropertiesFilter>(() => parseFilter(searchParams.get('filter')));
  const { data, isLoading, error } = useQuery({
    queryKey: ['broker', 'properties', orgId],
    queryFn: () => fetchOrgListings(orgId),
    staleTime: 30_000
  });
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBrokerProperty(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['broker', 'properties', orgId] });
      setSelectedListing(null);
    }
  });

  const listings = data ?? [];
  const [selectedListing, setSelectedListing] = useState<OrgListingRecord | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const summary = useMemo(() => {
    return summarizeListings(listings);
  }, [listings]);

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      switch (filter) {
        case 'ACTIVE':
          return isActiveListingStatus(listing.status);
        case 'PENDING':
          return isPendingListingStatus(listing.status);
        case 'FLAGGED':
          return isFlaggedListingStatus(listing.status);
        case 'EXPIRING':
          return isExpiringSoon(listing.expiresAt);
        default:
          return true;
      }
    });
  }, [listings, filter]);

  useEffect(() => {
    const next = parseFilter(searchParams.get('filter'));
    if (next !== filter) {
      setFilter(next);
    }
  }, [searchParams, filter]);

  const handleFilterChange = (value: PropertiesFilter) => {
    setFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'ALL') {
      next.delete('filter');
    } else {
      next.set('filter', value);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Inventory</p>
            <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Listing pipeline</h1>
            <p className="text-sm text-slate-600">Track brokerage inventory, expirations, and pending approvals.</p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/broker/draft-listings">Manage drafts</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total listings" value={summary.total} />
          <StatCard label="Active" value={summary.active} helper={`${summary.pending} pending`} />
          <StatCard label="Expiring soon" value={summary.expiringSoon} helper="Next 30 days" />
          <StatCard label="Needs approval" value={summary.flagged} helper="Awaiting review" tone="warning" />
        </div>
      </section>

      <Card className="overflow-hidden hover:translate-y-0 hover:shadow-brand">
        <div className="flex flex-col gap-4 border-b border-[color:var(--hatch-card-border)] px-6 pb-4 pt-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-medium text-slate-900">Listings</h2>
            <p className="text-sm text-slate-600">Mission Control surfaced listings with basic stats.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--glass-border)] bg-white/25 p-1 backdrop-blur-md dark:bg-white/10">
              {filters.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleFilterChange(option.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-200',
                    filter === option.id
                      ? 'border border-white/20 bg-white/50 text-slate-900 shadow-brand'
                      : 'text-slate-600 hover:bg-white/25 hover:text-slate-900 dark:text-ink-100/70 dark:hover:bg-white/10 dark:hover:text-ink-100'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>MLS #</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-rose-600">
                  Unable to load listings.
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  Loading listings…
                </TableCell>
              </TableRow>
            ) : filteredListings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No listings match the selected filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredListings.map((listing) => {
                const photos = (listing.photos ?? []).filter(Boolean);
                const cover = listing.coverPhotoUrl || photos[0] || placeholderImg;
                const agent = listing.agentProfile?.user;
                const agentLabel = agent
                  ? `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim() || agent.email || 'Agent'
                  : 'Unassigned';

                return (
                  <TableRow key={listing.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-14 overflow-hidden rounded-lg border border-white/25 bg-white/30">
                          <img
                            src={cover}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (target.src !== placeholderImg) target.src = placeholderImg;
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">
                            {listing.addressLine1}
                            {listing.city ? `, ${listing.city}` : ''}
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            {listing.city}, {listing.state} {listing.postalCode}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(listing.status)}>{formatStatus(listing.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-slate-600">{agentLabel}</p>
                    </TableCell>
                    <TableCell className="text-slate-600">{listing.mlsNumber ?? '—'}</TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {listing.listPrice ? currencyFormatter.format(Number(listing.listPrice)) : '—'}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {listing.expiresAt ? new Date(listing.expiresAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/broker/properties/${listing.id}`}>Open</Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedListing(listing);
                            setPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" /> Preview
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-slate-600 hover:bg-rose-500/10 hover:text-rose-600"
                          disabled={deleteMutation.isLoading}
                          onClick={() => {
                            const confirmDelete = window.confirm('Delete this listing?');
                            if (confirmDelete) {
                              deleteMutation.mutate(listing.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete listing</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setSelectedListing(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Property preview</DialogTitle>
            <DialogDescription>Inline snapshot of the listing details.</DialogDescription>
          </DialogHeader>

          {selectedListing ? (
            <div className="space-y-4">
              {(() => {
                const photos = (selectedListing.photos ?? []).filter(Boolean);
                const cover = selectedListing.coverPhotoUrl || photos[0] || placeholderImg;
                return (
                  <div className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-white/10">
                    <img
                      src={cover}
                      alt={selectedListing.addressLine1}
                      className="h-56 w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src !== placeholderImg) target.src = placeholderImg;
                      }}
                    />
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold text-slate-900">
                    {selectedListing.listPrice ? currencyFormatter.format(Number(selectedListing.listPrice)) : 'Price TBD'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {[selectedListing.addressLine1, selectedListing.city, selectedListing.state, selectedListing.postalCode]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                    <Badge variant={statusBadgeVariant(selectedListing.status)}>{formatStatus(selectedListing.status)}</Badge>
                    {selectedListing.mlsNumber && <span>MLS #{selectedListing.mlsNumber}</span>}
                  </div>
                </div>
                <div className="text-right text-sm text-slate-500">
                  <p>Expires: {selectedListing.expiresAt ? new Date(selectedListing.expiresAt).toLocaleDateString() : '—'}</p>
                  <p>
                    Type:{' '}
                    {[selectedListing.propertyType, selectedListing.propertySubType]
                      .filter(Boolean)
                      .join(' • ') || '—'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-slate-700">
                <PreviewStat label="Bedrooms" value={selectedListing.bedrooms ?? '—'} />
                <PreviewStat
                  label="Bathrooms"
                  value={selectedListing.bathrooms ?? '—'}
                />
                <PreviewStat
                  label="Square Feet"
                  value={selectedListing.squareFeet ? selectedListing.squareFeet.toLocaleString() : '—'}
                />
                <PreviewStat
                  label="Price / SqFt"
                  value={
                    selectedListing.listPrice && selectedListing.squareFeet
                      ? currencyFormatter.format(
                          Number(selectedListing.listPrice) / Math.max(Number(selectedListing.squareFeet), 1)
                        )
                      : '—'
                  }
                />
                <PreviewStat
                  label="Lot"
                  value={
                    selectedListing.lotSizeAcres
                      ? `${selectedListing.lotSizeAcres} ac`
                      : selectedListing.lotSizeSqFt
                        ? `${selectedListing.lotSizeSqFt.toLocaleString()} sqft`
                        : '—'
                  }
                />
                <PreviewStat label="Year built" value={selectedListing.yearBuilt ?? '—'} />
                <PreviewStat label="County" value={selectedListing.county ?? '—'} />
                <PreviewStat label="Parcel ID" value={selectedListing.parcelId ?? '—'} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
                <PreviewStat label="Garage" value={selectedListing.garageSpaces ?? '—'} />
                <PreviewStat label="View" value={selectedListing.propertyView ?? '—'} />
                <PreviewStat label="Water" value={selectedListing.waterSource ?? '—'} />
                <PreviewStat label="Sewer" value={selectedListing.sewerSystem ?? '—'} />
                <PreviewStat label="Cooling" value={selectedListing.cooling ?? '—'} />
                <PreviewStat label="Heating" value={selectedListing.heating ?? '—'} />
                <PreviewStat label="Parking" value={selectedListing.parkingFeatures ?? '—'} />
                <PreviewStat label="Exterior" value={selectedListing.exteriorFeatures ?? '—'} />
                <PreviewStat label="Interior" value={selectedListing.interiorFeatures ?? '—'} />
                <PreviewStat label="Appliances" value={selectedListing.appliances ?? '—'} />
                <PreviewStat
                  label="Taxes"
                  value={
                    selectedListing.taxes !== null && selectedListing.taxes !== undefined
                      ? currencyFormatter.format(Number(selectedListing.taxes))
                      : '—'
                  }
                />
              </div>

              {(selectedListing.publicRemarks || selectedListing.privateRemarks || selectedListing.showingInstructions) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedListing.publicRemarks && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Remarks</p>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {selectedListing.publicRemarks}
                      </p>
                    </div>
                  )}
                  {selectedListing.privateRemarks && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Private remarks</p>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {selectedListing.privateRemarks}
                      </p>
                    </div>
                  )}
                  {selectedListing.showingInstructions && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Showing instructions</p>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {selectedListing.showingInstructions}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selectedListing.photos && selectedListing.photos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Photos</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selectedListing.photos.filter(Boolean).slice(0, 8).map((photo, idx) => (
                      <img
                        key={photo + idx}
                        src={photo}
                        alt={`Photo ${idx + 1}`}
                        className="h-24 w-36 flex-shrink-0 rounded-lg object-cover border border-[var(--glass-border)] bg-white/10"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src !== placeholderImg) target.src = placeholderImg;
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {selectedListing.agentProfile?.user && (
                <div className="rounded-xl border border-[var(--glass-border)] bg-white/25 p-4 text-sm backdrop-blur">
                  <p className="font-medium text-slate-900">Agent</p>
                  <p className="text-slate-700">
                    {selectedListing.agentProfile.user.firstName} {selectedListing.agentProfile.user.lastName}
                  </p>
                  {selectedListing.agentProfile.user.email && (
                    <p className="text-slate-500">{selectedListing.agentProfile.user.email}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No listing selected.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatStatus(status?: string | null) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

const statusBadgeVariant = (status: string) => {
  const normalized = (status ?? '').toLowerCase();
  if (normalized.includes('active')) return 'success' as const;
  if (normalized.includes('pending') || normalized.includes('approval')) return 'warning' as const;
  if (normalized.includes('expir')) return 'warning' as const;
  return 'neutral' as const;
};

function StatCard({
  label,
  value,
  helper,
  tone
}: {
  label: string;
  value: number;
  helper?: string;
  tone?: 'warning';
}) {
  return (
    <Card className={cn('relative overflow-hidden p-6', tone === 'warning' && 'hatch-glass--warning')}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </Card>
  );
}

function PreviewStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-white/25 p-3 backdrop-blur">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900 whitespace-pre-line">{value}</p>
    </div>
  );
}
