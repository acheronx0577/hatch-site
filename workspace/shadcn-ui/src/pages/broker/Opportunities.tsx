import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Pencil, Trash2, X, Plus, Save, Filter, ArrowUpDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import BrokerPageHeader from '@/components/layout/BrokerPageHeader';
import AttachmentsPanel from '@/components/files/AttachmentsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { listOpportunities, createOpportunity, updateOpportunity, deleteOpportunity, bulkDeleteOpportunities, type Opportunity } from '@/lib/api/opportunities';
import { listAccounts, type Account } from '@/lib/api/accounts';
import {
  convertSellerOpportunityToLead,
  listSellerOpportunities,
  runSellerOpportunityScan,
  type SellerOpportunityStatus
} from '@/lib/api/seller-opportunities';

export default function BrokerOpportunitiesPage() {
  const { activeOrgId } = useAuth();
  const fallbackOrgId = import.meta.env.VITE_ORG_ID ?? 'org-hatch';
  const orgId = activeOrgId ?? fallbackOrgId;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'seller' | 'deals'>('seller');

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    stage: 'prospecting',
    amount: '',
    currency: 'USD',
    accountId: ''
  });

  // Bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Filtering
  const [stageFilter, setStageFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<'name' | 'stage' | 'amount'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [sellerQuery, setSellerQuery] = useState('');
  const [sellerStatus, setSellerStatus] = useState<SellerOpportunityStatus | 'ALL'>('NEW');
  const [sellerMinScore, setSellerMinScore] = useState<number>(0);
  const [sellerLimit, setSellerLimit] = useState<number>(10);
  const [sellerCursorStack, setSellerCursorStack] = useState<Array<string | null>>([null]);
  const sellerCursor = sellerCursorStack[sellerCursorStack.length - 1] ?? null;

  useEffect(() => {
    setSellerCursorStack([null]);
  }, [orgId, sellerQuery, sellerStatus, sellerMinScore, sellerLimit]);

  const sellerOpportunities = useQuery({
    queryKey: ['seller-opportunities', orgId, sellerQuery, sellerStatus, sellerMinScore, sellerLimit, sellerCursor],
    enabled: Boolean(orgId) && activeTab === 'seller',
    staleTime: 30_000,
    queryFn: () =>
      listSellerOpportunities(orgId, {
        q: sellerQuery.trim() ? sellerQuery.trim() : undefined,
        status: sellerStatus === 'ALL' ? undefined : sellerStatus,
        minScore: sellerMinScore,
        limit: sellerLimit,
        cursor: sellerCursor
      })
  });

  const runSellerScan = useMutation({
    mutationFn: () => runSellerOpportunityScan(orgId),
    onSuccess: async (result) => {
      toast({
        title: 'Seller scan complete',
        description: `Candidates: ${result.candidates} · Created: ${result.created} · Updated: ${result.updated}`
      });
      setSellerCursorStack([null]);
      await queryClient.invalidateQueries({ queryKey: ['seller-opportunities', orgId] });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Failed to run scan',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  });

  const convertSellerOpportunity = useMutation({
    mutationFn: async (sellerOpportunityId: string) => convertSellerOpportunityToLead(orgId, sellerOpportunityId),
    onSuccess: async ({ leadId }) => {
      toast({ title: 'Converted to lead', description: 'Seller opportunity moved into your CRM pipeline.' });
      await queryClient.invalidateQueries({ queryKey: ['seller-opportunities', orgId] });
      navigate(`/broker/crm/leads/${encodeURIComponent(leadId)}`);
    },
    onError: (err: unknown) => {
      toast({
        title: 'Convert failed',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  });

  const loadOpportunities = async () => {
    try {
      setLoading(true);
      const res = await listOpportunities({ limit: 100 });
      const acctRes = await listAccounts({ limit: 100 });
      setOpportunities(res.items);
      setAccounts(acctRes.items);
      if (res.items.length > 0 && !selectedId) {
        setSelectedId(res.items[0].id);
      }
      if (acctRes.items.length > 0 && !form.accountId) {
        setForm((prev) => ({ ...prev, accountId: acctRes.items[0].id }));
      }
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'deals') return;
    loadOpportunities();
  }, [activeTab]);

  const selectedOpportunity = useMemo(
    () => opportunities.find((opp) => opp.id === selectedId) ?? null,
    [opportunities, selectedId]
  );

  const filteredOpportunities = useMemo(() => {
    let filtered = [...opportunities];

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (opp) =>
          opp.name?.toLowerCase().includes(q) ||
          opp.stage?.toLowerCase().includes(q) ||
          opp.account?.name?.toLowerCase().includes(q)
      );
    }

    // Apply stage filter
    if (stageFilter.trim()) {
      filtered = filtered.filter((opp) => opp.stage?.toLowerCase().includes(stageFilter.toLowerCase()));
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'name') {
        aVal = aVal?.toLowerCase() || '';
        bVal = bVal?.toLowerCase() || '';
      } else if (sortField === 'amount') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      } else {
        aVal = aVal?.toLowerCase() || '';
        bVal = bVal?.toLowerCase() || '';
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [opportunities, searchQuery, stageFilter, sortField, sortDirection]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Opportunity name is required');
      return;
    }
    if (accounts.length === 0) {
      setError('Please create an account first');
      return;
    }
    try {
      setError(null);
      setCreating(true);
      const amount = form.amount ? Number(form.amount) : undefined;
      if (form.amount && !Number.isFinite(amount)) {
        setError('Amount must be a valid number');
        return;
      }
      const newOpp = await createOpportunity({
        name: form.name.trim(),
        stage: form.stage.trim() || 'prospecting',
        accountId: form.accountId || undefined,
        amount,
        currency: form.currency.trim() || undefined
      });
      setOpportunities((prev) => [newOpp, ...prev]);
      setSelectedId(newOpp.id);
      setForm((prev) => ({
        ...prev,
        name: '',
        amount: '',
        stage: 'prospecting'
      }));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create opportunity');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOpportunity) return;
    if (!form.name.trim()) {
      setError('Opportunity name is required');
      return;
    }
    try {
      setError(null);
      setUpdating(true);
      const amount = form.amount ? Number(form.amount) : undefined;
      if (form.amount && !Number.isFinite(amount)) {
        setError('Amount must be a valid number');
        return;
      }
      const updated = await updateOpportunity(selectedOpportunity.id, {
        name: form.name.trim(),
        stage: form.stage.trim() || undefined,
        accountId: form.accountId || undefined,
        amount,
        currency: form.currency.trim() || undefined
      });
      setOpportunities((prev) => prev.map((opp) => (opp.id === updated.id ? updated : opp)));
      setForm({ name: '', stage: 'prospecting', amount: '', currency: 'USD', accountId: accounts[0]?.id ?? '' });
      setFormMode('create');
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update opportunity');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOpportunity) return;
    try {
      setError(null);
      setDeleting(true);
      await deleteOpportunity(selectedOpportunity.id);
      setOpportunities((prev) => prev.filter((opp) => opp.id !== selectedOpportunity.id));
      const remaining = opportunities.filter((opp) => opp.id !== selectedOpportunity.id);
      setSelectedId(remaining[0]?.id ?? null);
      setShowDeleteConfirm(false);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete opportunity');
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = () => {
    if (!selectedOpportunity) return;
    setForm({
      name: selectedOpportunity.name ?? '',
      stage: selectedOpportunity.stage ?? 'prospecting',
      amount: selectedOpportunity.amount?.toString() ?? '',
      currency: selectedOpportunity.currency ?? 'USD',
      accountId: selectedOpportunity.accountId ?? accounts[0]?.id ?? ''
    });
    setFormMode('edit');
  };

  const cancelEdit = () => {
    setForm({ name: '', stage: 'prospecting', amount: '', currency: 'USD', accountId: accounts[0]?.id ?? '' });
    setError(null);
    setFormMode('create');
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredOpportunities.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOpportunities.map((opp) => opp.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkDelete = async () => {
    try {
      setBulkDeleting(true);
      setError(null);
      const result = await bulkDeleteOpportunities(Array.from(selectedIds));
      setOpportunities((prev) => prev.filter((opp) => !selectedIds.has(opp.id)));
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      if (selectedId && selectedIds.has(selectedId)) {
        const remaining = opportunities.filter((opp) => !selectedIds.has(opp.id));
        setSelectedId(remaining[0]?.id ?? null);
      }
      if (result.deleted < selectedIds.size) {
        setError(`Deleted ${result.deleted} of ${selectedIds.size} opportunities. Some deletions failed.`);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete opportunities');
    } finally {
      setBulkDeleting(false);
    }
  };

  const isEditMode = formMode === 'edit';
  const stageOptions = useMemo(
    () => [
      { value: 'prospecting', label: 'Prospecting' },
      { value: 'qualification', label: 'Qualification' },
      { value: 'proposal', label: 'Proposal' },
      { value: 'negotiation', label: 'Negotiation' },
      { value: 'closed-won', label: 'Closed Won' },
      { value: 'closed-lost', label: 'Closed Lost' }
    ],
    []
  );

  return (
    <div className="space-y-6">
      <BrokerPageHeader title="Opportunities" description="Seller likelihood + deal pipeline in one place." />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'seller' | 'deals')} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="rounded-full bg-white/20 backdrop-blur-sm">
            <TabsTrigger value="seller" className="rounded-full px-4">
              Seller likelihood
            </TabsTrigger>
            <TabsTrigger value="deals" className="rounded-full px-4">
              Deals
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="seller" className="space-y-6">
          <Card className="p-6 space-y-4 hover:translate-y-0 hover:shadow-brand">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-700">Seller opportunity engine</h3>
                <p className="text-sm text-slate-600">
                  Hatch scores likely sellers and shows the strongest signals behind each recommendation.
                </p>
                {sellerOpportunities.data?.engine ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge variant="secondary" className="rounded-full">
                      Last run:{' '}
                      {sellerOpportunities.data.engine.lastRunAt
                        ? new Date(sellerOpportunities.data.engine.lastRunAt).toLocaleString()
                        : 'Never'}
                    </Badge>
                    {sellerOpportunities.data.engine.summary ? (
                      <Badge variant="secondary" className="rounded-full">
                        {sellerOpportunities.data.engine.summary.candidates} candidates ·{' '}
                        {sellerOpportunities.data.engine.summary.created} created ·{' '}
                        {sellerOpportunities.data.engine.summary.updated} updated
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <Button type="button" onClick={() => runSellerScan.mutate()} disabled={runSellerScan.isPending}>
                {runSellerScan.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Running…
                  </>
                ) : (
                  'Run scan'
                )}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[240px] flex-1">
                <Input
                  placeholder="Search address, owner, or note…"
                  value={sellerQuery}
                  onChange={(e) => setSellerQuery(e.target.value)}
                />
              </div>

              <Select value={sellerStatus} onValueChange={(value) => setSellerStatus(value as any)}>
                <SelectTrigger className="h-10 w-[180px] rounded-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="CONVERTED">Converted</SelectItem>
                  <SelectItem value="DISMISSED">Dismissed</SelectItem>
                </SelectContent>
              </Select>

              <Input
                className="h-10 w-[140px]"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={String(sellerMinScore)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSellerMinScore(Number.isFinite(next) ? Math.min(100, Math.max(0, next)) : 0);
                }}
                placeholder="Min score"
              />

              <Select
                value={String(sellerLimit)}
                onValueChange={(value) => setSellerLimit(Number(value))}
              >
                <SelectTrigger className="h-10 w-[150px] rounded-full">
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="5">5 / page</SelectItem>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="25">25 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          <Card className="overflow-hidden hover:translate-y-0 hover:shadow-brand">
            <div className="border-b border-[color:var(--hatch-card-border)] p-6 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">
                    Seller opportunities ({sellerOpportunities.data?.items?.length ?? 0})
                  </h3>
                  <p className="text-xs text-slate-500">Page {sellerCursorStack.length}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setSellerCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
                    }
                    disabled={sellerCursorStack.length <= 1 || sellerOpportunities.isFetching}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const next = sellerOpportunities.data?.nextCursor ?? null;
                      if (!next) return;
                      setSellerCursorStack((prev) => [...prev, next]);
                    }}
                    disabled={!sellerOpportunities.data?.nextCursor || sellerOpportunities.isFetching}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-200/60">
              {sellerOpportunities.isLoading || sellerOpportunities.isFetching ? (
                <div className="flex items-center gap-2 px-6 py-10 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading seller opportunities…
                </div>
              ) : sellerOpportunities.error ? (
                <div className="px-6 py-10 text-sm text-rose-700">Unable to load seller opportunities.</div>
              ) : (sellerOpportunities.data?.items?.length ?? 0) === 0 ? (
                <div className="px-6 py-10 text-sm text-slate-600">
                  <p>No seller opportunities match the current filters.</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Try lowering Min score (currently {sellerMinScore}) or switching Status to “All statuses”.
                  </p>
                </div>
              ) : (
                (sellerOpportunities.data?.items ?? []).map((item) => {
                  const status = String(item.status ?? '').toUpperCase();
                  const statusVariant =
                    status === 'CONVERTED' ? 'success' : status === 'DISMISSED' ? 'neutral' : 'info';
                  const scoreVariant = item.score >= 85 ? 'success' : item.score >= 70 ? 'warning' : 'neutral';
                  const topSignals = (item.signals ?? [])
                    .slice()
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 3);
                  const ownerName = item.owner?.name?.trim() ?? '';
                  const ownerMailing = item.owner?.mailingAddress ?? null;
                  const ownerMailingLine = ownerMailing
                    ? [
                        [ownerMailing.line1, ownerMailing.line2].filter(Boolean).join(' ').trim(),
                        [ownerMailing.city, ownerMailing.state, ownerMailing.postalCode].filter(Boolean).join(' ').trim()
                      ]
                        .filter(Boolean)
                        .join(', ')
                        .trim()
                    : '';

                  return (
                    <div key={item.id} className="p-6 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="max-w-[36rem] truncate font-semibold text-slate-900">
                              {item.address?.line1 ?? 'Unknown address'}
                            </p>
                            <Badge variant={scoreVariant}>Score {item.score}</Badge>
                            <Badge variant={statusVariant}>{status.toLowerCase()}</Badge>
                          </div>
                          <p className="text-sm text-slate-600">
                            {[item.address?.city, item.address?.state, item.address?.postalCode]
                              .filter(Boolean)
                              .join(' ')}
                          </p>
                          {ownerName ? <p className="text-sm text-slate-600">Owner: {ownerName}</p> : null}
                          {ownerMailingLine ? (
                            <p className="text-xs text-slate-500">Mailing: {ownerMailingLine}</p>
                          ) : null}
                          <p className="text-xs text-slate-500">Source: {item.source}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {status === 'NEW' ? (
                            <Button
                              type="button"
                              onClick={() => convertSellerOpportunity.mutate(item.id)}
                              disabled={convertSellerOpportunity.isPending}
                            >
                              Convert to lead
                            </Button>
                          ) : item.convertedLeadId ? (
                            <Button asChild variant="outline">
                              <Link to={`/broker/crm/leads/${encodeURIComponent(item.convertedLeadId)}`}>
                                View lead
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {topSignals.length > 0 ? (
                        <div className="rounded-xl border border-[var(--glass-border)] bg-white/10 p-4 backdrop-blur">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Top signals
                          </p>
                          <ul className="mt-3 space-y-2 text-sm text-slate-700">
                            {topSignals.map((signal) => (
                              <li key={`${item.id}:${signal.key}`} className="space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-900">{signal.label}</span>
                                  <Badge variant="secondary">Weight {signal.weight.toFixed(2)}</Badge>
                                  {signal.value ? <span className="text-xs text-slate-500">{signal.value}</span> : null}
                                </div>
                                <p className="text-sm text-slate-600">{signal.reason}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">No signals available yet.</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="deals" className="space-y-6">
          {/* Create/Edit Form */}
          <Card className="p-6 space-y-4 hover:translate-y-0 hover:shadow-brand">
        <h3 className="text-sm font-semibold text-slate-700">
          {isEditMode && selectedOpportunity ? `Edit ${selectedOpportunity.name}` : 'Create New Opportunity'}
        </h3>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={isEditMode && selectedOpportunity ? handleUpdate : handleCreate}
        >
          <Input
            className="md:col-span-2"
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Select value={form.stage} onValueChange={(value) => setForm((prev) => ({ ...prev, stage: value }))}>
            <SelectTrigger className="h-11 rounded-full">
              <SelectValue placeholder="Select stage" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {stageOptions.map((stage) => (
                <SelectItem key={stage.value} value={stage.value}>
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={form.accountId}
            onValueChange={(value) => setForm((prev) => ({ ...prev, accountId: value }))}
            disabled={accounts.length === 0}
          >
            <SelectTrigger className="h-11 rounded-full">
              <SelectValue placeholder={accounts.length === 0 ? 'No accounts available' : 'Select account'} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {accounts.map((acct) => (
                <SelectItem key={acct.id} value={acct.id}>
                  {acct.name ?? acct.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Amount"
            type="number"
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
          />
          <Input
            placeholder="Currency"
            value={form.currency}
            onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
          />
          <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
            <Button type="submit" disabled={creating || updating || accounts.length === 0}>
              {creating || updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEditMode && selectedOpportunity ? (
                <>
                  <Save className="h-4 w-4" /> Save
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Create
                </>
              )}
            </Button>
            {isEditMode ? (
              <Button type="button" variant="outline" size="icon" onClick={cancelEdit} aria-label="Cancel edit">
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </form>

        {accounts.length === 0 ? (
          <div className="rounded-xl border border-[var(--glass-border)] bg-sky-500/10 p-4 text-sm text-slate-700">
            Create an account first to link opportunities.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-rose-200/70 bg-rose-500/10 p-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        {/* Opportunities List */}
        <Card className="overflow-hidden hover:translate-y-0 hover:shadow-brand">
          <div className="border-b border-[color:var(--hatch-card-border)] p-6 pb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Opportunities ({filteredOpportunities.length})</h3>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={showFilters ? 'secondary' : 'outline'}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4" />
                  <span className="sr-only">Toggle filters</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                >
                  <ArrowUpDown className="h-4 w-4" />
                  <span className="sr-only">Toggle sort direction</span>
                </Button>
              </div>
            </div>

            {showFilters && (
              <div className="space-y-2">
                <Input
                  placeholder="Filter by stage..."
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                />
                <div className="flex gap-2">
                  <Select value={sortField} onValueChange={(value) => setSortField(value as typeof sortField)}>
                    <SelectTrigger className="h-10 flex-1 rounded-full">
                      <SelectValue placeholder="Sort by…" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="name">Sort by Name</SelectItem>
                      <SelectItem value="stage">Sort by Stage</SelectItem>
                      <SelectItem value="amount">Sort by Amount</SelectItem>
                    </SelectContent>
                  </Select>
                  {stageFilter && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setStageFilter('')}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search opportunities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] bg-white/25 px-3 py-2 text-sm backdrop-blur">
                <span className="font-medium text-slate-900">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="destructive" size="sm" onClick={() => setShowBulkDeleteConfirm(true)} disabled={bulkDeleting}>
                    {bulkDeleting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Deleting…
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3 w-3" /> Delete
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="max-h-[600px] overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : filteredOpportunities.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-blue-600/10">
                  <Search className="h-5 w-5 text-brand-blue-600" />
                </div>
                <p className="text-sm font-medium text-slate-900">
                  {searchQuery ? 'No opportunities match your search' : 'No opportunities found'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {searchQuery ? 'Try a different keyword or clear filters.' : 'Create your first opportunity to start tracking pipeline stages.'}
                </p>
              </div>
            ) : (
              <>
                {filteredOpportunities.length > 0 && (
                  <div className="px-2 pb-2">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredOpportunities.length && filteredOpportunities.length > 0}
                        onChange={() => {}}
                        className="rounded border-slate-300"
                      />
                      Select all
                    </button>
                  </div>
                )}
                <ul className="space-y-1">
                  {filteredOpportunities.map((opp) => {
                    const active = opp.id === selectedId;
                    const isSelected = selectedIds.has(opp.id);
                    return (
                      <li key={opp.id} className="flex items-center gap-2 px-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelect(opp.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-slate-300 flex-shrink-0"
                        />
                        <button
                          type="button"
                          className={`flex-1 rounded px-3 py-2 text-left text-sm transition-colors ${
                            active
                              ? 'border border-white/20 bg-white/35 text-slate-900 shadow-brand'
                              : 'hover:bg-white/25 text-slate-700'
                          }`}
                          onClick={() => {
                            setSelectedId(opp.id);
                            cancelEdit();
                            setShowDeleteConfirm(false);
                          }}
                        >
                          <div className="font-semibold">{opp.name ?? 'Untitled opportunity'}</div>
                          <div className="text-xs text-slate-500">
                            {opp.stage ?? '—'} {opp.account?.name ? `• ${opp.account.name}` : ''}
                            {opp.amount ? ` • $${Number(opp.amount).toLocaleString()}` : ''}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </Card>

        {/* Opportunity Details */}
        <Card className="p-6 space-y-4 hover:translate-y-0 hover:shadow-brand">
          {selectedOpportunity ? (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">{selectedOpportunity.name ?? 'Untitled opportunity'}</h3>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {selectedOpportunity.stage && (
                      <p>
                        <span className="font-medium">Stage:</span>{' '}
                        <Badge variant="info">{selectedOpportunity.stage}</Badge>
                      </p>
                    )}
                    {selectedOpportunity.account?.name && (
                      <p>
                        <span className="font-medium">Account:</span> {selectedOpportunity.account.name}
                      </p>
                    )}
                    {selectedOpportunity.amount && (
                      <p>
                        <span className="font-medium">Amount:</span> $
                        {Number(selectedOpportunity.amount).toLocaleString()} {selectedOpportunity.currency ?? 'USD'}
                      </p>
                    )}
                    {selectedOpportunity.closeDate && (
                      <p>
                        <span className="font-medium">Close Date:</span>{' '}
                        {new Date(selectedOpportunity.closeDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={startEdit}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit opportunity</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete opportunity</span>
                  </Button>
                </div>
              </div>

              {/* Delete Confirmation Dialog */}
              {showDeleteConfirm && (
                <div className="rounded-xl border border-rose-200/70 bg-rose-500/10 p-4">
                  <p className="text-sm font-semibold text-rose-900">Confirm deletion</p>
                  <p className="mt-1 text-sm text-rose-800">
                    Are you sure you want to delete "{selectedOpportunity.name}"? This action cannot be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
                      {deleting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" /> Delete
                        </>
                      )}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Attachments</h4>
                <AttachmentsPanel object="opportunities" recordId={selectedOpportunity.id} />
              </div>
            </>
          ) : loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-blue-600/10">
                <Pencil className="h-5 w-5 text-brand-blue-600" />
              </div>
              <p className="text-sm font-medium text-slate-900">Select an opportunity</p>
              <p className="mt-1 text-sm text-slate-600">Details and attachments will appear here.</p>
            </div>
          )}
        </Card>
      </div>

      {/* Bulk Delete Confirmation Modal */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm bulk deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.size} opportunit{selectedIds.size > 1 ? 'ies' : 'y'}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" /> Delete {selectedIds.size}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
