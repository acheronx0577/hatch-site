"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fetchOrgListings, OrgListingRecord } from '@/lib/api/org-listings';

const filters = [
  { id: 'ALL', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'EXPIRING', label: 'Expiring' },
  { id: 'FLAGGED', label: 'Needs approval' }
] as const;

type PropertiesFilterId = (typeof filters)[number]['id'];

type PropertiesViewProps = {
  orgId: string;
  initialFilter?: PropertiesFilterId;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

export function PropertiesView({ orgId, initialFilter }: PropertiesViewProps) {
  const [filter, setFilter] = useState<PropertiesFilterId>(() => initialFilter ?? 'ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'properties', orgId],
    queryFn: () => fetchOrgListings(orgId),
    staleTime: 30_000
  });

  const listings = useMemo(() => data ?? [], [data]);

  const summary = useMemo(() => {
    const active = listings.filter((listing) => listing.status === 'ACTIVE').length;
    const pending = listings.filter((listing) => listing.status.startsWith('PENDING')).length;
    const expiringSoon = listings.filter((listing) => isExpiringSoon(listing.expiresAt)).length;
    const flagged = listings.filter((listing) => listing.status === 'PENDING_BROKER_APPROVAL').length;
    return { total: listings.length, active, pending, expiringSoon, flagged };
  }, [listings]);

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      switch (filter) {
        case 'ACTIVE':
          return listing.status === 'ACTIVE';
        case 'PENDING':
          return listing.status.startsWith('PENDING');
        case 'EXPIRING':
          return isExpiringSoon(listing.expiresAt);
        case 'FLAGGED':
          return listing.status === 'PENDING_BROKER_APPROVAL';
        default:
          return true;
      }
    });
  }, [filter, listings]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Properties</p>
          <h1 className="text-2xl font-semibold text-slate-900">Listing inventory</h1>
          <p className="text-sm text-slate-500">Track approvals, expirations, and assignment across the brokerage.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`rounded-full px-4 py-1 text-sm font-medium ${
                filter === option.id ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'
              }`}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total listings" value={summary.total} />
        <KpiCard label="Active" value={summary.active} helper={`${summary.pending} pending`} />
        <KpiCard label="Expiring soon" value={summary.expiringSoon} helper="Next 30 days" />
        <KpiCard label="Needs approval" value={summary.flagged} helper="Broker action required" />
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Listing table</h2>
        <p className="text-sm text-slate-500">Snapshot of internal listings across MLS channels.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4">Address</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Agent</th>
                <th className="py-2 pr-4">MLS #</th>
                <th className="py-2 pr-4">List price</th>
                <th className="py-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                    Loading listings…
                  </td>
                </tr>
              ) : filteredListings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                    No listings match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredListings.map((listing) => (
                  <tr key={listing.id} className="border-t border-slate-100">
                    <td className="py-3 pr-4">
                      <Link href={`/dashboard/properties/${listing.id}`} className="font-medium text-brand-600 hover:underline">
                        {listing.addressLine1}, {listing.city}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {listing.state} {listing.postalCode}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge className={getStatusBadge(listing.status)}>{formatStatus(listing.status)}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      {listing.agentProfile?.user ? (
                        <div>
                          <p className="font-medium text-slate-900">
                            {listing.agentProfile.user.firstName} {listing.agentProfile.user.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{listing.agentProfile.user.email}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Unassigned</p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{listing.mlsNumber ?? '—'}</td>
                    <td className="py-3 pr-4 font-medium text-slate-900">
                      {listing.listPrice ? currencyFormatter.format(listing.listPrice) : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      {listing.expiresAt ? new Date(listing.expiresAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Need to drill deeper?</p>
            <p className="text-xs text-slate-500">Open Mission Control to view listing-level audits.</p>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link href="/dashboard/mission-control">Mission Control</Link>
          </Button>
        </div>
      </Card>
    </section>
  );
}

function KpiCard({ label, value, helper }: { label: string; value: number; helper?: string }) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-slate-900">{value.toLocaleString()}</p>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </Card>
  );
}

const isExpiringSoon = (expiresAt?: string | null) => {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt).getTime();
  const now = Date.now();
  const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
  return expires - now <= THIRTY_DAYS;
};

const formatStatus = (status: string) => status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());

const getStatusBadge = (status: string) => {
  if (status === 'ACTIVE') return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status.startsWith('PENDING')) return 'border border-amber-100 bg-amber-50 text-amber-700';
  if (status === 'PENDING_BROKER_APPROVAL') return 'border border-slate-200 bg-slate-50 text-slate-800';
  return 'border bg-slate-100 text-slate-700';
};
