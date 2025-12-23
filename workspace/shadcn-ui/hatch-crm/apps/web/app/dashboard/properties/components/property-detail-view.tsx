"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch, listContacts, type ContactListItem } from '@/lib/api';
import { listContractInstances, createContractInstance, searchContractTemplates, type ContractTemplateSummary } from '@/lib/api/contracts';
import {
  attachOrgListingContact,
  detachOrgListingContact,
  listOrgListingContacts,
  type OrgListingContactRecord,
  type OrgListingContactType
} from '@/lib/api/org-listing-contacts';
import type { OrgListingRecord } from '@/lib/api/org-listings';

type PropertyDetailViewProps = {
  orgId: string;
  listingId: string;
};

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const isPresent = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

export function PropertyDetailView({ orgId, listingId }: PropertyDetailViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const listingQuery = useQuery({
    queryKey: ['dashboard', 'properties', orgId, listingId],
    queryFn: async () => {
      const listings = await apiFetch<OrgListingRecord[]>(`organizations/${orgId}/listings`);
      const found = (listings ?? []).find((row) => row.id === listingId);
      if (!found) {
        throw new Error('Listing not found');
      }
      return found;
    },
    staleTime: 30_000
  });

  const contactsQuery = useQuery({
    queryKey: ['dashboard', 'properties', orgId, listingId, 'contacts'],
    queryFn: () => listOrgListingContacts(orgId, listingId),
    staleTime: 15_000
  });

  const contractsQuery = useQuery({
    queryKey: ['dashboard', 'properties', orgId, listingId, 'contracts'],
    queryFn: () => listContractInstances(orgId, { propertyId: listingId }),
    staleTime: 15_000
  });

  const listing = listingQuery.data ?? null;
  const listingContacts = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data]);
  const contractInstances = useMemo(() => contractsQuery.data ?? [], [contractsQuery.data]);

  const groupedContacts = useMemo(() => groupByType(listingContacts), [listingContacts]);

  const [attachOpen, setAttachOpen] = useState(false);
  const [attachType, setAttachType] = useState<OrgListingContactType>('SENT');
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string>('');

  const contactSearchQuery = useQuery({
    queryKey: ['dashboard', 'properties', 'contact-search', contactSearch],
    queryFn: async () => {
      const response = await listContacts(TENANT_ID, { q: contactSearch, limit: 25 });
      return response.items ?? [];
    },
    enabled: contactSearch.trim().length >= 2,
    staleTime: 10_000
  });

  const attachContactMutation = useMutation({
    mutationFn: () => attachOrgListingContact(orgId, listingId, { personId: selectedContactId, type: attachType }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'properties', orgId, listingId, 'contacts'] });
      toast({ title: 'Attached', description: 'Property attached to contact.' });
      setAttachOpen(false);
      setSelectedContactId('');
      setContactSearch('');
    },
    onError: (error) =>
      toast({
        variant: 'destructive',
        title: 'Attach failed',
        description: error instanceof Error ? error.message : 'Unable to attach contact.'
      })
  });

  const detachContactMutation = useMutation({
    mutationFn: (params: { personId: string; type?: OrgListingContactType }) =>
      detachOrgListingContact(orgId, listingId, params.personId, { type: params.type }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'properties', orgId, listingId, 'contacts'] });
      toast({ title: 'Detached', description: 'Removed contact attachment.' });
    },
    onError: (error) =>
      toast({
        variant: 'destructive',
        title: 'Detach failed',
        description: error instanceof Error ? error.message : 'Unable to detach contact.'
      })
  });

  const [createContractOpen, setCreateContractOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [contractTitle, setContractTitle] = useState('');
  const [buyerPersonId, setBuyerPersonId] = useState<string>('');
  const [sellerPersonId, setSellerPersonId] = useState<string>('');

  const templateSearchQuery = useQuery({
    queryKey: ['dashboard', 'properties', orgId, listingId, 'contract-templates', templateSearch],
    queryFn: () => searchContractTemplates(orgId, { query: templateSearch }),
    enabled: templateSearch.trim().length >= 2,
    staleTime: 15_000
  });

  const templateOptions = useMemo(() => templateSearchQuery.data ?? [], [templateSearchQuery.data]);
  const buyerOptions = groupedContacts.BUYING.map((row) => row.person).filter(isPresent);
  const sellerOptions = groupedContacts.SELLING.map((row) => row.person).filter(isPresent);

  const createContractMutation = useMutation({
    mutationFn: () =>
      createContractInstance(orgId, {
        templateId: selectedTemplateId,
        propertyId: listingId,
        title: contractTitle.trim().length ? contractTitle.trim() : undefined,
        buyerPersonId: buyerPersonId || undefined,
        sellerPersonId: sellerPersonId || undefined
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'properties', orgId, listingId, 'contracts'] });
      toast({ title: 'Contract created', description: 'Draft instance created with auto-filled fields.' });
      setCreateContractOpen(false);
      router.push(`/dashboard/contracts/${created.id}`);
    },
    onError: (error) =>
      toast({
        variant: 'destructive',
        title: 'Create failed',
        description: error instanceof Error ? error.message : 'Unable to create contract.'
      })
  });

  if (listingQuery.isLoading) {
    return (
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading property…</p>
      </Card>
    );
  }

  if (!listing) {
    return (
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Property not found.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Property</p>
            <h1 className="text-2xl font-semibold text-slate-900">
              {listing.addressLine1}, {listing.city}
            </h1>
            <p className="text-sm text-slate-500">
              {listing.state} {listing.postalCode} {listing.mlsNumber ? `· MLS ${listing.mlsNumber}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className={getListingStatusBadge(listing.status)}>{formatStatus(listing.status)}</Badge>
              {listing.listPrice ? <Badge variant="outline">{currencyFormatter.format(listing.listPrice)}</Badge> : null}
              {listing.expiresAt ? <Badge variant="outline">Expires {new Date(listing.expiresAt).toLocaleDateString()}</Badge> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setAttachOpen(true)}>
              Attach contact
            </Button>
            <Button onClick={() => setCreateContractOpen(true)}>Create contract</Button>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 text-sm text-slate-600 md:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agent</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {listing.agentProfile?.user
                ? `${listing.agentProfile.user.firstName ?? ''} ${listing.agentProfile.user.lastName ?? ''}`.trim()
                : 'Unassigned'}
            </dd>
            <dd className="text-xs text-slate-500">{listing.agentProfile?.user?.email ?? ''}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bedrooms / Bathrooms</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {listing.bedrooms ?? '—'} / {listing.bathrooms ?? '—'}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Square feet</dt>
            <dd className="mt-1 font-medium text-slate-900">{listing.squareFeet ?? '—'}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Attached contacts</h2>
              <p className="text-sm text-slate-500">Track who this property was sent to, and who is buying/selling.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAttachOpen(true)}>
              Attach
            </Button>
          </div>

          <div className="mt-6 space-y-6">
            <ContactGroup
              title="Sent"
              rows={groupedContacts.SENT}
              onDetach={(personId) => detachContactMutation.mutate({ personId, type: 'SENT' })}
              detaching={detachContactMutation.isPending}
            />
            <ContactGroup
              title="Buying"
              rows={groupedContacts.BUYING}
              onDetach={(personId) => detachContactMutation.mutate({ personId, type: 'BUYING' })}
              detaching={detachContactMutation.isPending}
            />
            <ContactGroup
              title="Selling"
              rows={groupedContacts.SELLING}
              onDetach={(personId) => detachContactMutation.mutate({ personId, type: 'SELLING' })}
              detaching={detachContactMutation.isPending}
            />
          </div>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Contracts</h2>
              <p className="text-sm text-slate-500">Contracts created from this property inherit the attached parties.</p>
            </div>
            <Button size="sm" onClick={() => setCreateContractOpen(true)}>
              New contract
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Buyer</th>
                  <th className="py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {contractsQuery.isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-slate-400">
                      Loading contracts…
                    </td>
                  </tr>
                ) : contractInstances.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-slate-400">
                      No contracts for this property yet.
                    </td>
                  </tr>
                ) : (
                  contractInstances.map((instance) => (
                    <tr key={instance.id} className="border-t border-slate-100">
                      <td className="py-3 pr-4">
                        <Link href={`/dashboard/contracts/${instance.id}`} className="font-medium text-brand-600 hover:underline">
                          {instance.title}
                        </Link>
                        <p className="text-xs text-slate-500">{instance.template?.code ?? ''}</p>
                      </td>
	                      <td className="py-3 pr-4">
	                        <Badge className={getContractStatusBadge(instance.status)}>{formatContractStatus(instance.status)}</Badge>
	                      </td>
                      <td className="py-3 pr-4">{instance.buyerPerson?.fullName ?? '—'}</td>
                      <td className="py-3">{new Date(instance.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <Button asChild size="sm" variant="secondary">
              <Link href="/dashboard/contracts">View all contracts</Link>
            </Button>
          </div>
        </Card>
      </div>

      <Sheet open={attachOpen} onOpenChange={setAttachOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Attach contact</SheetTitle>
            <SheetDescription>Link this property to a CRM contact as sent/buying/selling.</SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={attachType}
                onChange={(event) => setAttachType(event.target.value as OrgListingContactType)}
              >
                <option value="SENT">Sent</option>
                <option value="BUYING">Buying</option>
                <option value="SELLING">Selling</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search contacts</label>
              <Input
                placeholder="Type 2+ characters…"
                value={contactSearch}
                onChange={(event) => {
                  setContactSearch(event.target.value);
                  setSelectedContactId('');
                }}
              />
              <p className="text-xs text-slate-500">Search by name, email, or phone. Then select a contact below.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={selectedContactId}
                onChange={(event) => setSelectedContactId(event.target.value)}
                disabled={contactSearchQuery.isLoading || (contactSearch.trim().length >= 2 && (contactSearchQuery.data?.length ?? 0) === 0)}
              >
                <option value="">Select…</option>
                {(contactSearchQuery.data ?? []).map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {formatContact(contact)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setAttachOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => attachContactMutation.mutate()}
              disabled={!selectedContactId || attachContactMutation.isPending}
            >
              {attachContactMutation.isPending ? 'Attaching…' : 'Attach'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={createContractOpen} onOpenChange={(open) => {
        setCreateContractOpen(open);
        if (!open) {
          setTemplateSearch('');
          setSelectedTemplateId('');
          setContractTitle('');
          setBuyerPersonId('');
          setSellerPersonId('');
        } else {
          const defaultBuyer = groupedContacts.BUYING[0]?.personId ?? '';
          const defaultSeller = groupedContacts.SELLING[0]?.personId ?? '';
          setBuyerPersonId(defaultBuyer);
          setSellerPersonId(defaultSeller);
        }
      }}>
        <SheetContent side="right" className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Create contract</SheetTitle>
            <SheetDescription>Select a template; the system will auto-fill from the property and attached parties.</SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template search</label>
              <Input
                placeholder="e.g. Purchase agreement"
                value={templateSearch}
                onChange={(event) => {
                  setTemplateSearch(event.target.value);
                  setSelectedTemplateId('');
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={selectedTemplateId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setSelectedTemplateId(nextId);
                  const selected = templateOptions.find((t) => t.id === nextId);
                  if (selected && !contractTitle.trim().length) {
                    setContractTitle(selected.name);
                  }
                }}
                disabled={templateSearchQuery.isLoading || (templateSearch.trim().length >= 2 && templateOptions.length === 0)}
              >
                <option value="">Select…</option>
                {templateOptions.map((template) => (
                  <option key={template.id} value={template.id}>
                    {formatTemplate(template)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">Search for 2+ characters to load templates.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
              <Input value={contractTitle} onChange={(event) => setContractTitle(event.target.value)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buyer</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={buyerPersonId}
                  onChange={(event) => setBuyerPersonId(event.target.value)}
                >
                  <option value="">Auto</option>
                  {buyerOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.firstName} {person.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={sellerPersonId}
                  onChange={(event) => setSellerPersonId(event.target.value)}
                >
                  <option value="">Auto</option>
                  {sellerOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.firstName} {person.lastName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateContractOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createContractMutation.mutate()}
              disabled={!selectedTemplateId || createContractMutation.isPending}
            >
              {createContractMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function groupByType(rows: OrgListingContactRecord[]) {
  const grouped: Record<OrgListingContactType, OrgListingContactRecord[]> = {
    SENT: [],
    BUYING: [],
    SELLING: []
  };

  for (const row of rows) {
    grouped[row.type]?.push(row);
  }

  return grouped;
}

function formatContact(contact: Pick<ContactListItem, 'firstName' | 'lastName' | 'primaryEmail' | 'primaryPhone'>) {
  const name = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || 'Contact';
  const meta = contact.primaryEmail ?? contact.primaryPhone ?? '';
  return meta ? `${name} · ${meta}` : name;
}

function formatTemplate(template: ContractTemplateSummary) {
  const label = template.code ? `${template.code} · ${template.name}` : template.name;
  return label ?? template.id;
}

function ContactGroup({
  title,
  rows,
  onDetach,
  detaching
}: {
  title: string;
  rows: OrgListingContactRecord[];
  onDetach: (personId: string) => void;
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
                  {row.person ? `${row.person.firstName ?? ''} ${row.person.lastName ?? ''}`.trim() : row.personId}
                </p>
                <p className="truncate text-xs text-slate-500">{row.person?.primaryEmail ?? row.person?.primaryPhone ?? ''}</p>
              </div>
              <Button size="sm" variant="outline" disabled={detaching} onClick={() => onDetach(row.personId)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const formatStatus = (status: string) => status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());

const getListingStatusBadge = (status: string) => {
  if (status === 'ACTIVE') return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status.startsWith('PENDING')) return 'border border-amber-100 bg-amber-50 text-amber-700';
  if (status === 'PENDING_BROKER_APPROVAL') return 'border border-slate-200 bg-slate-50 text-slate-800';
  return 'border bg-slate-100 text-slate-700';
};

const getContractStatusBadge = (status: string) => {
  if (status === 'SIGNED') return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status === 'OUT_FOR_SIGNATURE') return 'border border-amber-100 bg-amber-50 text-amber-700';
  if (status === 'VOIDED') return 'border border-rose-100 bg-rose-50 text-rose-700';
  return 'border bg-slate-100 text-slate-700';
};

const formatContractStatus = (status: string) => {
  if (status === 'OUT_FOR_SIGNATURE') return 'Sent';
  return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
};
