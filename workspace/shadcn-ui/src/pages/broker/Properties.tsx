import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { deleteBrokerProperty, type BrokerPropertyRow } from '@/lib/api/properties';
import { fetchOrgListings, type OrgListingRecord } from '@/lib/api/org-listings';
import { Separator } from '@/components/ui/separator';

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
    return <div className="p-8 text-sm text-gray-600">Select an organization to view listing inventory.</div>;
  }
  return (
    <div className="space-y-6 p-6">
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
    const active = listings.filter((listing) => (listing.status ?? '').toLowerCase() === 'active').length;
    const pending = listings.filter((listing) => (listing.status ?? '').toLowerCase() === 'pending').length;
    const flagged = 0;
    const expiringSoon = 0;
    return { total: listings.length, active, pending, flagged, expiringSoon };
  }, [listings]);

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      switch (filter) {
        case 'ACTIVE':
          return (listing.status ?? '').toLowerCase() === 'active';
        case 'PENDING':
          return (listing.status ?? '').toLowerCase().startsWith('pending');
        case 'FLAGGED':
          return false;
        case 'EXPIRING':
          return false;
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
      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Inventory</p>
            <h1 className="text-2xl font-semibold text-slate-900">Listing pipeline</h1>
            <p className="text-sm text-slate-500">
              Track brokerage inventory, expirations, and pending approvals.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/broker/draft-listings">Manage drafts</Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total listings" value={summary.total} />
          <KpiCard label="Active" value={summary.active} helper={`${summary.pending} pending`} />
          <KpiCard label="Expiring soon" value={summary.expiringSoon} helper="Next 30 days" />
          <KpiCard label="Needs approval" value={summary.flagged} helper="Awaiting broker review" />
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Listing table</h2>
            <p className="text-sm text-slate-500">Mission Control surfaced listings with basic stats.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleFilterChange(option.id)}
                className={`rounded-full px-4 py-1 text-sm font-medium ${
                  filter === option.id ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="py-6 text-sm text-rose-500">Unable to load listings.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Address</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-left">MLS #</th>
                  <th className="px-4 py-2 text-left">Price</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      Loading properties…
                    </td>
                  </tr>
                ) : filteredListings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      No listings match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredListings.map((listing) => (
                    <tr key={listing.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {listing.addressLine1}
                          {listing.city ? `, ${listing.city}` : ''}
                        </p>
                        <p className="text-xs text-slate-500">
                          {listing.city}, {listing.state} {listing.postalCode}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusTone(listing.status)}>{formatStatus(listing.status)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-slate-500">
                          {listing.agentProfile?.user ?
                            `${listing.agentProfile.user.firstName ?? ''} ${listing.agentProfile.user.lastName ?? ''}`.trim() ||
                            listing.agentProfile.user.email :
                            'Unassigned'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{listing.mlsNumber ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {listing.listPrice ? currencyFormatter.format(Number(listing.listPrice)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        — 
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedListing(listing);
                            setPreviewOpen(true);
                          }}
                        >
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="ml-2"
                          disabled={deleteMutation.isLoading}
                          onClick={() => {
                            const confirmDelete = window.confirm('Delete this listing?');
                            if (confirmDelete) {
                              deleteMutation.mutate(listing.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
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
                  <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
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
                    <Badge variant="outline">{formatStatus(selectedListing.status)}</Badge>
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
                        className="h-24 w-36 flex-shrink-0 rounded-lg object-cover border border-slate-100 bg-slate-50"
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
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
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

function getStatusTone(status: string) {
  if (status === 'ACTIVE') return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status.startsWith('PENDING')) return 'border border-amber-100 bg-amber-50 text-amber-700';
  if (status === 'PENDING_BROKER_APPROVAL') return 'border border-sky-100 bg-sky-50 text-sky-700';
  return 'border bg-slate-100 text-slate-700';
}

function KpiCard({ label, value, helper }: { label: string; value: number; helper?: string }) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-slate-900">{value}</p>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </Card>
  );
}

function PreviewStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900 whitespace-pre-line">{value}</p>
    </div>
  );
}
