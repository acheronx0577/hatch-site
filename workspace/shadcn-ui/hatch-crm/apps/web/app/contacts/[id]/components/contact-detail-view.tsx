"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch, getContact, updateContact } from '@/lib/api';
import { listContractInstances } from '@/lib/api/contracts';
import {
  attachContactOrgListing,
  detachContactOrgListing,
  listContactOrgListings,
  type ContactOrgListingRecord
} from '@/lib/api/contact-org-listings';
import type { OrgListingContactType } from '@/lib/api/org-listing-contacts';
import type { OrgListingRecord } from '@/lib/api/org-listings';

type ContactDetailViewProps = {
  tenantId: string;
  contactId: string;
};

type CustomFieldRow = {
  id: string;
  key: string;
  value: string;
};

const serializeCustomFieldValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const parseCustomFieldValue = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }

  return raw;
};

export function ContactDetailView({ tenantId, contactId }: ContactDetailViewProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const contactQuery = useQuery({
    queryKey: ['contacts', tenantId, contactId],
    queryFn: () => getContact(tenantId, contactId),
    staleTime: 30_000
  });

  const orgId = contactQuery.data?.organizationId ?? null;

  const listingsQuery = useQuery({
    queryKey: ['contacts', tenantId, contactId, 'org-listings'],
    queryFn: () => listContactOrgListings(contactId, { tenantId }),
    staleTime: 15_000
  });

  const contractsQuery = useQuery({
    queryKey: ['contacts', tenantId, contactId, 'contracts', orgId],
    queryFn: () => listContractInstances(orgId as string, { contactId }),
    enabled: Boolean(orgId),
    staleTime: 15_000
  });

  const grouped = useMemo(() => groupByType(listingsQuery.data ?? []), [listingsQuery.data]);
  const contracts = useMemo(() => contractsQuery.data ?? [], [contractsQuery.data]);

  const [attachOpen, setAttachOpen] = useState(false);
  const [attachType, setAttachType] = useState<OrgListingContactType>('BUYING');
  const [selectedListingId, setSelectedListingId] = useState('');
  const [listingSearch, setListingSearch] = useState('');

  const availableListingsQuery = useQuery({
    queryKey: ['contacts', tenantId, contactId, 'available-listings', orgId],
    queryFn: async () => {
      const listings = await apiFetch<OrgListingRecord[]>(`organizations/${orgId}/listings`);
      return listings ?? [];
    },
    enabled: Boolean(orgId),
    staleTime: 30_000
  });

  const listingOptions = useMemo(() => {
    const term = listingSearch.trim().toLowerCase();
    const rows = availableListingsQuery.data ?? [];
    if (!term) return rows;
    return rows.filter((listing) => {
      const haystack = `${listing.addressLine1} ${listing.city} ${listing.state} ${listing.postalCode} ${listing.mlsNumber ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [availableListingsQuery.data, listingSearch]);

  const attachMutation = useMutation({
    mutationFn: () => attachContactOrgListing(contactId, { tenantId, orgListingId: selectedListingId, type: attachType }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts', tenantId, contactId, 'org-listings'] });
      toast({ title: 'Attached', description: 'Property linked to this contact.' });
      setAttachOpen(false);
      setSelectedListingId('');
      setListingSearch('');
    },
    onError: (error) =>
      toast({
        variant: 'destructive',
        title: 'Attach failed',
        description: error instanceof Error ? error.message : 'Unable to attach property.'
      })
  });

  const detachMutation = useMutation({
    mutationFn: (params: { orgListingId: string; type?: OrgListingContactType }) =>
      detachContactOrgListing(contactId, params.orgListingId, { tenantId, type: params.type }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts', tenantId, contactId, 'org-listings'] });
      toast({ title: 'Detached', description: 'Property removed from this contact.' });
    },
    onError: (error) =>
      toast({
        variant: 'destructive',
        title: 'Detach failed',
        description: error instanceof Error ? error.message : 'Unable to detach property.'
      })
  });

  const contactName = contactQuery.data
    ? `${contactQuery.data.firstName ?? ''} ${contactQuery.data.lastName ?? ''}`.trim() || 'Contact'
    : 'Contact';

  const initialCustomFieldRows = useMemo<CustomFieldRow[]>(() => {
    const customFields = contactQuery.data?.customFields ?? null;
    if (!customFields) return [];
    return Object.entries(customFields).map(([key, value]) => ({
      id: key,
      key,
      value: serializeCustomFieldValue(value)
    }));
  }, [contactQuery.data?.customFields]);

  const [customFieldRows, setCustomFieldRows] = useState<CustomFieldRow[]>([]);

  useEffect(() => {
    setCustomFieldRows(initialCustomFieldRows);
  }, [contactId, initialCustomFieldRows]);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const customFields: Record<string, unknown> = {};
      for (const row of customFieldRows) {
        const key = row.key.trim();
        if (!key) continue;
        customFields[key] = parseCustomFieldValue(row.value);
      }
      return updateContact(contactId, { tenantId, customFields });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts', tenantId, contactId] });
      toast({ title: 'Saved', description: 'Client profile updated.' });
    },
    onError: (error) =>
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to update client profile.'
      })
  });

  if (contactQuery.isLoading) {
    return (
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading contact…</p>
      </Card>
    );
  }

  if (!contactQuery.data) {
    return (
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Contact not found.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Contact</p>
            <h1 className="text-2xl font-semibold text-slate-900">{contactName}</h1>
            <p className="text-sm text-slate-500">
              {contactQuery.data.primaryEmail ?? ''} {contactQuery.data.primaryPhone ? `· ${contactQuery.data.primaryPhone}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">{contactQuery.data.stage}</Badge>
              <Badge variant="outline">Org {contactQuery.data.organizationId}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAttachOpen(true)}>Attach property</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Attached properties</h2>
              <p className="text-sm text-slate-500">Sent, buying, and selling context for contract entanglement.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAttachOpen(true)}>
              Attach
            </Button>
          </div>

          <div className="mt-6 space-y-6">
            <ListingGroup
              title="Buying"
              rows={grouped.BUYING}
              onDetach={(orgListingId) => detachMutation.mutate({ orgListingId, type: 'BUYING' })}
              detaching={detachMutation.isPending}
            />
            <ListingGroup
              title="Selling"
              rows={grouped.SELLING}
              onDetach={(orgListingId) => detachMutation.mutate({ orgListingId, type: 'SELLING' })}
              detaching={detachMutation.isPending}
            />
            <ListingGroup
              title="Sent"
              rows={grouped.SENT}
              onDetach={(orgListingId) => detachMutation.mutate({ orgListingId, type: 'SENT' })}
              detaching={detachMutation.isPending}
            />
          </div>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Entangled contracts</h2>
              <p className="text-sm text-slate-500">Contracts where this contact is buyer or seller.</p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href="/dashboard/contracts">Contracts</Link>
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {contractsQuery.isLoading ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-sm text-slate-400">
                      Loading contracts…
                    </td>
                  </tr>
                ) : contracts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-sm text-slate-400">
                      No contracts linked to this contact yet.
                    </td>
                  </tr>
                ) : (
                  contracts.map((contract) => (
                    <tr key={contract.id} className="border-t border-slate-100">
                      <td className="py-3 pr-4">
                        <Link href={`/dashboard/contracts/${contract.id}`} className="font-medium text-brand-600 hover:underline">
                          {contract.title}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {contract.orgListingId ? (
                            <Link href={`/dashboard/properties/${contract.orgListingId}`} className="hover:underline">
                              Property {contract.orgListingId}
                            </Link>
                          ) : (
                            'No property'
                          )}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge className={getContractStatusBadge(contract.status)}>{contract.status}</Badge>
                      </td>
                      <td className="py-3">{new Date(contract.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Client profile</h2>
            <p className="text-sm text-slate-500">
              Optional structured fields used for routing and personalization. Values can be plain text or JSON.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCustomFieldRows(initialCustomFieldRows)}
              disabled={saveProfileMutation.isPending}
            >
              Reset
            </Button>
            <Button size="sm" onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending}>
              {saveProfileMutation.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {customFieldRows.length === 0 ? (
            <p className="text-sm text-slate-500">No profile fields yet. Add one below.</p>
          ) : (
            customFieldRows.map((row) => (
              <div key={row.id} className="grid gap-2 md:grid-cols-12 md:items-start">
                <div className="md:col-span-3">
                  <Input
                    value={row.key}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomFieldRows((current) =>
                        current.map((entry) => (entry.id === row.id ? { ...entry, key: value } : entry))
                      );
                    }}
                    placeholder="field_key"
                    disabled={saveProfileMutation.isPending}
                  />
                </div>
                <div className="md:col-span-8">
                  <Textarea
                    value={row.value}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomFieldRows((current) =>
                        current.map((entry) => (entry.id === row.id ? { ...entry, value } : entry))
                      );
                    }}
                    className="min-h-[44px] font-mono text-xs"
                    disabled={saveProfileMutation.isPending}
                  />
                </div>
                <div className="flex justify-end md:col-span-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCustomFieldRows((current) => current.filter((entry) => entry.id !== row.id))}
                    disabled={saveProfileMutation.isPending}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setCustomFieldRows((current) => [
                ...current,
                { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, key: '', value: '' }
              ])
            }
            disabled={saveProfileMutation.isPending}
          >
            Add field
          </Button>
        </div>
      </Card>

      <Sheet open={attachOpen} onOpenChange={setAttachOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Attach property</SheetTitle>
            <SheetDescription>Link an org property to this contact (sent/buying/selling).</SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={attachType}
                onChange={(event) => setAttachType(event.target.value as OrgListingContactType)}
              >
                <option value="BUYING">Buying</option>
                <option value="SELLING">Selling</option>
                <option value="SENT">Sent</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search listings</label>
              <Input
                placeholder="Search address, city, MLS…"
                value={listingSearch}
                onChange={(event) => {
                  setListingSearch(event.target.value);
                  setSelectedListingId('');
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Listing</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={selectedListingId}
                onChange={(event) => setSelectedListingId(event.target.value)}
                disabled={availableListingsQuery.isLoading || !orgId}
              >
                <option value="">Select…</option>
                {listingOptions.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.addressLine1}, {listing.city}, {listing.state}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setAttachOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => attachMutation.mutate()} disabled={!selectedListingId || attachMutation.isPending}>
              {attachMutation.isPending ? 'Attaching…' : 'Attach'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function groupByType(rows: ContactOrgListingRecord[]) {
  const grouped: Record<OrgListingContactType, ContactOrgListingRecord[]> = {
    SENT: [],
    BUYING: [],
    SELLING: []
  };

  for (const row of rows) {
    grouped[row.type]?.push(row);
  }

  return grouped;
}

function ListingGroup({
  title,
  rows,
  onDetach,
  detaching
}: {
  title: string;
  rows: ContactOrgListingRecord[];
  onDetach: (orgListingId: string) => void;
  detaching: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">None</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {row.listing ? `${row.listing.addressLine1}, ${row.listing.city}` : row.listingId}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {row.listing ? `${row.listing.state} ${row.listing.postalCode}` : ''}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={detaching} onClick={() => onDetach(row.listingId)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const getContractStatusBadge = (status: string) => {
  if (status === 'SIGNED') return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status === 'OUT_FOR_SIGNATURE') return 'border border-amber-100 bg-amber-50 text-amber-700';
  if (status === 'VOIDED') return 'border border-rose-100 bg-rose-50 text-rose-700';
  return 'border bg-slate-100 text-slate-700';
};
