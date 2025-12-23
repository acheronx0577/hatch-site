import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { PdfDraftEditor, normalizePdfOverlay, type PdfOverlay } from '@/components/contracts/PdfDraftEditor';
import { cn } from '@/lib/utils';
import { fetchOrgListings } from '@/lib/api/org-listings';
import { brokerPropertiesQueryKey } from '@/lib/queryKeys';
import {
  listContractInstances,
  recommendContractTemplates,
  searchContractTemplates,
  createContractInstance,
  getContractInstance,
  updateContractInstance,
  sendContractForSignature,
  deleteContractInstance,
  deleteContractInstances,
  API_BASE_URL,
  type ContractInstance,
  type ContractTemplate
} from '@/lib/api/hatch';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

export default function ContractsPage() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  const [search, setSearch] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [listingPickerOpen, setListingPickerOpen] = useState(false);
  const [templatePage, setTemplatePage] = useState(1);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const PAGE_SIZE = 16;

  const listingsQuery = useQuery({
    queryKey: brokerPropertiesQueryKey(orgId),
    queryFn: () => fetchOrgListings(orgId),
    enabled: Boolean(orgId),
    staleTime: 30_000
  });

  const listings = listingsQuery.data ?? [];
  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === propertyId) ?? null,
    [listings, propertyId]
  );
  const templateFilters = useMemo(
    () => ({
      propertyType: selectedListing?.propertyType ?? undefined,
      jurisdiction: selectedListing?.state ?? undefined
    }),
    [selectedListing?.propertyType, selectedListing?.state]
  );

  const templatesQuery = useQuery({
    queryKey: ['contracts', 'templates', orgId, search, templateFilters.propertyType, templateFilters.jurisdiction],
    queryFn: () =>
      searchContractTemplates(orgId, {
        query: search.trim(),
        includeUrl: true,
        propertyType: templateFilters.propertyType,
        jurisdiction: templateFilters.jurisdiction
      }),
    enabled: Boolean(orgId)
  });

  const recommendationsQuery = useQuery({
    queryKey: ['contracts', 'recommendations', orgId, templateFilters.propertyType, templateFilters.jurisdiction],
    queryFn: () =>
      recommendContractTemplates(orgId, {
        propertyType: templateFilters.propertyType,
        jurisdiction: templateFilters.jurisdiction
      }),
    enabled: Boolean(orgId)
  });

  const instancesQuery = useQuery({
    queryKey: ['contracts', 'instances', orgId, propertyId],
    queryFn: () => listContractInstances(orgId, propertyId ? { propertyId } : {}),
    enabled: Boolean(orgId)
  });

  const createDraft = useMutation({
    mutationFn: (templateId: string) =>
      createContractInstance(orgId, { templateId, propertyId: propertyId || undefined }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId, propertyId] });
      setSelectedInstanceId(created.id);
    }
  });

  const instanceDetail = useQuery({
    queryKey: ['contracts', 'instance', selectedInstanceId],
    queryFn: () => getContractInstance(orgId, selectedInstanceId ?? ''),
    enabled: Boolean(selectedInstanceId)
  });

  const templatesAll = templatesQuery.data ?? [];
  const templates = templatesAll.filter((t) => {
    const key = (t.s3Key || '').toLowerCase();
    const url = (t.templateUrl || '').toLowerCase();
    return key.endsWith('.pdf') || url.includes('.pdf');
  });
  const templateUrlMap = useMemo(() => {
    const map: Record<string, string> = {};
    const addIfPdf = (t: any) => {
      const key = (t?.s3Key || '').toLowerCase();
      const url = (t?.templateUrl || '').toLowerCase();
      if (key.endsWith('.pdf') || url.includes('.pdf')) {
        if (t?.templateUrl) map[t.id] = t.templateUrl;
      }
    };
    templatesAll.forEach(addIfPdf);
    (recommendationsQuery.data ?? []).forEach(addIfPdf);
    return map;
  }, [templatesAll, recommendationsQuery.data]);
  const totalPages = Math.max(1, Math.ceil((templates.length || 1) / PAGE_SIZE));
  const pagedTemplates = templates.slice((templatePage - 1) * PAGE_SIZE, templatePage * PAGE_SIZE);

  useEffect(() => {
    setTemplatePage(1);
  }, [search, orgId, templates.length]);
  const recommendations = recommendationsQuery.data ?? [];
  const instances = instancesQuery.data ?? [];

  const selectedListingLabel = useMemo(() => {
    if (!selectedListing) return 'All listings';
    const line1 = (selectedListing.addressLine1 ?? '').trim();
    const locality = [selectedListing.city, selectedListing.state, selectedListing.postalCode].filter(Boolean).join(' ');
    return [line1, locality].filter(Boolean).join(', ') || selectedListing.id;
  }, [selectedListing]);

  const sortedListings = useMemo(() => {
    return (listings ?? [])
      .slice()
      .sort((a, b) => {
        const aLine = (a.addressLine1 ?? '').toLowerCase();
        const bLine = (b.addressLine1 ?? '').toLowerCase();
        return aLine.localeCompare(bLine);
      });
  }, [listings]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(instances.map((i) => i.id)) : new Set());
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteOneMutation = useMutation({
    mutationFn: async (id: string) => deleteContractInstance(orgId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId, propertyId] });
      setSelectedIds(new Set());
    }
  });

  const deleteManyMutation = useMutation({
    mutationFn: async (ids: string[]) => deleteContractInstances(orgId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId, propertyId] });
      setSelectedIds(new Set());
    }
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Contracts</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Contract Center</h1>
          <p className="text-sm text-slate-600">Pick templates from your library and create drafts instantly.</p>
        </div>
      </header>

      <Card className="p-4 hover:translate-y-0 hover:shadow-brand">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Listing context</p>
            <div className="mt-1 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setListingPickerOpen(true)}
                className="w-full justify-between"
                disabled={listingsQuery.isLoading}
              >
                <span className="truncate">{selectedListingLabel}</span>
                <span className="text-xs text-slate-500">{listingsQuery.isLoading ? 'Loading…' : `${listings.length}`}</span>
              </Button>
              {propertyId ? (
                <Button type="button" variant="outline" onClick={() => setPropertyId('')}>
                  Clear
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">Optional — used for template recommendations and linking drafts to a listing.</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Search templates</p>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your library" className="mt-1" />
          </div>
        </div>
      </Card>

      <CommandDialog open={listingPickerOpen} onOpenChange={setListingPickerOpen}>
        <CommandInput placeholder="Search listings..." />
        <CommandList>
          <CommandEmpty>No listings found.</CommandEmpty>
          <CommandGroup heading="Listings">
            <CommandItem
              value="all listings"
              onSelect={() => {
                setPropertyId('');
                setListingPickerOpen(false);
              }}
            >
              <div className="flex flex-col">
                <span className="font-medium">All listings</span>
                <span className="text-xs text-slate-500">Show instances across the organization</span>
              </div>
            </CommandItem>
            {sortedListings.map((listing) => {
              const labelLine1 = (listing.addressLine1 ?? '').trim();
              const locality = [listing.city, listing.state, listing.postalCode].filter(Boolean).join(' ');
              const label = [labelLine1, locality].filter(Boolean).join(', ') || listing.id;
              return (
                <CommandItem
                  key={listing.id}
                  value={`${label} ${listing.mlsNumber ?? ''} ${listing.id}`}
                  onSelect={() => {
                    setPropertyId(listing.id);
                    setListingPickerOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{labelLine1 || 'Listing'}</span>
                    <span className="text-xs text-slate-500">
                      {locality || listing.id} {listing.mlsNumber ? `· MLS ${listing.mlsNumber}` : ''}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="col-span-2 space-y-4 p-6 hover:translate-y-0 hover:shadow-brand">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Templates</h2>
              <p className="text-sm text-slate-600">
                Browse your library. Click “Create draft” to start from a template.
              </p>
            </div>
            <span className="text-xs text-slate-500">{templates.length} items</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {pagedTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onCreate={() => createDraft.mutate(template.id)}
              />
            ))}
            {templates.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--glass-border)] bg-white/20 p-6 text-center text-sm text-slate-600 backdrop-blur">
                {templatesQuery.isLoading ? 'Loading templates…' : 'No templates found.'}
              </div>
            )}
          </div>
          {templates.length > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] bg-white/20 px-3 py-2 text-xs text-slate-600 backdrop-blur">
              <span>
                Showing {(templatePage - 1) * PAGE_SIZE + 1}-
                {Math.min(templatePage * PAGE_SIZE, templates.length)} of {templates.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTemplatePage((p) => Math.max(1, p - 1))}
                  disabled={templatePage === 1}
                >
                  Prev
                </Button>
                <span className="text-xs text-slate-500">
                  Page {templatePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTemplatePage((p) => Math.min(totalPages, p + 1))}
                  disabled={templatePage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-6 hover:translate-y-0 hover:shadow-brand [--hatch-card-alpha:var(--hatch-glass-alpha-elevated)]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recommended</h2>
            <span className="text-xs text-slate-500">{recommendations.length} picks</span>
          </div>
          <div className="space-y-2">
            {recommendations.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => createDraft.mutate(template.id)}
                className="flex w-full items-center justify-between rounded-xl border border-[var(--glass-border)] bg-white/20 px-3 py-2 text-left transition hover:bg-white/30"
              >
                <div>
                  <p className="font-medium text-slate-900">{template.name}</p>
                  <p className="text-xs text-slate-500">{template.recommendationReason ?? 'Suggested'}</p>
                </div>
                <Badge variant="neutral">{template.side ?? 'ANY'}</Badge>
              </button>
            ))}
            {recommendations.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--glass-border)] bg-white/20 px-3 py-6 text-center text-xs text-slate-600 backdrop-blur">
                No recommendations yet.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="space-y-3 p-6 hover:translate-y-0 hover:shadow-brand">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Instances</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{instances.length} items</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0 || deleteManyMutation.isLoading}
              onClick={() => deleteManyMutation.mutate(Array.from(selectedIds))}
            >
              {deleteManyMutation.isLoading ? 'Deleting…' : `Delete (${selectedIds.size})`}
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === instances.length && instances.length > 0}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instancesQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                  Loading instances…
                </TableCell>
              </TableRow>
            ) : instances.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                  No contract drafts yet.
                </TableCell>
              </TableRow>
            ) : (
              instances.map((instance) => (
                <TableRow key={instance.id}>
                  <TableCell>
                    <input type="checkbox" checked={selectedIds.has(instance.id)} onChange={() => toggleOne(instance.id)} />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-slate-900">{instance.title}</p>
                    {instance.recommendationReason ? (
                      <p className="text-xs text-slate-500">{instance.recommendationReason}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-slate-600">{instance.template?.name ?? 'Ad-hoc'}</TableCell>
                  <TableCell>
                    <StatusBadge status={instance.status} />
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">{new Date(instance.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedInstanceId(instance.id)}>
                        Open
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                        onClick={() => deleteOneMutation.mutate(instance.id)}
                        disabled={deleteOneMutation.isLoading}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {selectedInstanceId && instanceDetail.data ? (
        <InstanceDetail
          instance={instanceDetail.data}
          orgId={orgId}
          templateUrlMap={templateUrlMap}
          onClose={() => setSelectedInstanceId(null)}
        />
      ) : null}
    </div>
  );
}

function TemplateCard({ template, onCreate }: { template: ContractTemplate & { templateUrl?: string | null }; onCreate: () => void }) {
  const accentClass =
    template.side === 'BUYER'
      ? 'from-sky-400 via-sky-200 to-sky-400'
      : template.side === 'SELLER'
        ? 'from-emerald-400 via-emerald-200 to-emerald-400'
        : 'from-slate-300 via-slate-200 to-slate-300';

  return (
    <Card className="flex h-full flex-col justify-between p-4">
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r', accentClass)} />
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{template.code}</p>
        <h3 className="text-base font-semibold text-slate-900">{template.name}</h3>
        <p className="text-sm text-slate-500 line-clamp-2">{template.description ?? 'Contract template'}</p>
        {template.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {template.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px]">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Badge variant="neutral">{template.side ?? 'ANY'}</Badge>
        <div className="flex gap-2">
          {template.templateUrl ? (
            <Button variant="ghost" size="sm" asChild>
              <a href={template.templateUrl} target="_blank" rel="noreferrer">
                View
              </a>
            </Button>
          ) : null}
          <Button size="sm" onClick={onCreate}>
            Create draft
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'SIGNED'
      ? ('success' as const)
      : status === 'OUT_FOR_SIGNATURE'
        ? ('info' as const)
        : status === 'VOIDED'
          ? ('danger' as const)
          : ('neutral' as const);
  return <Badge variant={variant}>{status}</Badge>;
}

function InstanceDetail({
  instance,
  orgId,
  templateUrlMap,
  onClose
}: {
  instance: ContractInstance;
  orgId: string;
  templateUrlMap: Record<string, string>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const editableKeys = useMemo(() => instance.editableKeys ?? [], [instance.editableKeys]);
  const [title, setTitle] = useState(instance.title);
  const [pdfOverlay, setPdfOverlay] = useState<PdfOverlay>(() =>
    normalizePdfOverlay((instance.fieldValues as any)?.__overlay)
  );
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerRole, setSignerRole] = useState('buyer');

  useEffect(() => {
    setTitle(instance.title);
    setPdfOverlay(normalizePdfOverlay((instance.fieldValues as any)?.__overlay));
  }, [instance.id, instance.title, instance.fieldValues, editableKeys]);

  const overlaySaveMutation = useMutation({
    mutationFn: async () =>
      updateContractInstance(orgId, instance.id, {
        title: title.trim().length ? title.trim() : undefined,
        fieldValues: {
          __overlay: pdfOverlay
        }
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId] });
      await queryClient.invalidateQueries({ queryKey: ['contracts', 'instance', instance.id] });
      toast({ title: 'PDF updated', description: 'Draft PDF regenerated with your edits.' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'PDF save failed',
        description: error instanceof Error ? error.message : 'Unable to regenerate the draft PDF right now.'
      });
    }
  });

  const sendMutation = useMutation({
    mutationFn: async () =>
      sendContractForSignature(orgId, instance.id, {
        signers:
          signerName && signerEmail
            ? [
                {
                  name: signerName,
                  email: signerEmail,
                  role: signerRole
                }
              ]
            : [],
        returnUrl: window.location.origin
      }),
    onSuccess: (data) => {
      // Open embedded sender view in the same tab so the user returns to Hatch.
      if (data?.senderViewUrl) {
        window.location.href = data.senderViewUrl;
      }
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instances', orgId] });
      queryClient.invalidateQueries({ queryKey: ['contracts', 'instance', instance.id] });
    }
  });

  const fallbackTemplateUrl = templateUrlMap[instance.templateId];
  const draftIsPdf = Boolean(instance.draftUrl && instance.draftUrl.toLowerCase().includes('.pdf'));
  const viewSrc = instance.signedUrl ?? (draftIsPdf ? instance.draftUrl : undefined) ?? fallbackTemplateUrl;
  const hasPdf = Boolean(viewSrc);
  const templatePdfUrl = `${API_BASE_URL}organizations/${orgId}/contracts/instances/${instance.id}/pdf?kind=template`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="flex w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full max-h-[90vh] space-y-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{instance.template?.code ?? 'CONTRACT'}</p>
              {instance.status === 'DRAFT' ? (
                <div className="mt-1 max-w-xl">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-10 text-lg font-semibold"
                    disabled={overlaySaveMutation.isLoading}
                  />
                </div>
              ) : (
                <h3 className="text-xl font-semibold text-slate-900">{instance.title}</h3>
              )}
              <p className="text-sm text-slate-500">{instance.template?.name ?? 'Ad-hoc contract'}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={instance.status} />
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">PDF</p>
                <h4 className="text-base font-semibold text-slate-900">Edit on the document</h4>
                <p className="text-xs text-slate-500">Add boxes and type directly on the PDF, then save to regenerate the draft.</p>
              </div>
              <div className="flex items-center gap-2">
                {hasPdf ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={viewSrc} target="_blank" rel="noreferrer">
                      Open PDF
                    </a>
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPdfOverlay(normalizePdfOverlay((instance.fieldValues as any)?.__overlay))}
                  disabled={overlaySaveMutation.isLoading || instance.status !== 'DRAFT'}
                >
                  Reset boxes
                </Button>
                <Button
                  size="sm"
                  onClick={() => overlaySaveMutation.mutate()}
                  disabled={overlaySaveMutation.isLoading || instance.status !== 'DRAFT'}
                >
                  {overlaySaveMutation.isLoading ? 'Saving…' : 'Save PDF'}
                </Button>
              </div>
            </div>

            <PdfDraftEditor
              pdfUrl={templatePdfUrl}
              overlay={pdfOverlay}
              onChange={setPdfOverlay}
              fieldValues={instance.fieldValues}
              availableKeys={editableKeys}
              disabled={instance.status !== 'DRAFT'}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow label="Template" value={instance.template?.name ?? 'Ad-hoc'} />
            <InfoRow label="Last updated" value={new Date(instance.updatedAt).toLocaleString()} />
            <InfoRow label="Listing" value={instance.orgListingId ?? 'Not linked'} />
            <InfoRow label="Transaction" value={instance.orgTransactionId ?? 'Not linked'} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Draft</p>
            <p className="mt-2 text-sm text-slate-600">
              Use the PDF editor to place fields, override autofill, and edit text. Select a box to see autofill source/confidence, then click “Save PDF”.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Signature</p>
                <h4 className="text-base font-semibold text-slate-900">Send for signature</h4>
                <p className="text-xs text-slate-500">Enter a signer to start routing.</p>
              </div>
              <StatusBadge status={instance.status} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Signer name"
              />
              <Input
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="Signer email"
                type="email"
              />
              <Input
                value={signerRole}
                onChange={(e) => setSignerRole(e.target.value)}
                placeholder="Role (buyer/seller)"
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => sendMutation.mutate()}
                disabled={
                  instance.status !== 'DRAFT' || !signerName || !signerEmail || sendMutation.isLoading
                }
              >
                {sendMutation.isLoading ? 'Sending…' : 'Send for signature'}
              </Button>
              {instance.status !== 'DRAFT' ? (
                <p className="text-xs text-slate-500">Only draft contracts can be sent.</p>
              ) : null}
              {sendMutation.error ? (
                <p className="text-xs text-rose-600">Failed to send. Try again.</p>
              ) : null}
              {sendMutation.isSuccess ? (
                <p className="text-xs text-emerald-600">Sent. Watch for DocuSign email.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
