import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Pencil, Trash2, X, Plus, Save, Filter, ArrowUpDown } from 'lucide-react';

import BrokerPageHeader from '@/components/layout/BrokerPageHeader';
import AttachmentsPanel from '@/components/files/AttachmentsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listAccounts, createAccount, updateAccount, deleteAccount, bulkDeleteAccounts, type Account } from '@/lib/api/accounts';
import { listOpportunities, type Opportunity } from '@/lib/api/opportunities';

export default function BrokerAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    website: '',
    industry: '',
    annualRevenue: ''
  });

  // Bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Filtering
  const [industryFilter, setIndustryFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<'name' | 'industry' | 'annualRevenue'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Linked opportunities
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);

  const loadAccounts = async (search?: string) => {
    try {
      setLoading(true);
      const res = await listAccounts({ limit: 100, q: search });
      setAccounts(res.items);
      if (res.items.length > 0 && !selectedId) {
        setSelectedId(res.items[0].id);
      }
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const selectedAccount = useMemo(
    () => accounts.find((acc) => acc.id === selectedId) ?? null,
    [accounts, selectedId]
  );

  const filteredAccounts = useMemo(() => {
    let filtered = [...accounts];

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (acc) =>
          acc.name?.toLowerCase().includes(q) ||
          acc.phone?.toLowerCase().includes(q) ||
          acc.email?.toLowerCase().includes(q)
      );
    }

    // Apply industry filter
    if (industryFilter.trim()) {
      filtered = filtered.filter((acc) => acc.industry?.toLowerCase().includes(industryFilter.toLowerCase()));
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'name') {
        aVal = aVal?.toLowerCase() || '';
        bVal = bVal?.toLowerCase() || '';
      } else if (sortField === 'annualRevenue') {
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
  }, [accounts, searchQuery, industryFilter, sortField, sortDirection]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Account name is required');
      return;
    }
    if (form.website && !form.website.match(/^https?:\/\//)) {
      setError('Website must start with http:// or https://');
      return;
    }
    try {
      setError(null);
      setCreating(true);
      const annualRevenue = form.annualRevenue ? Number(form.annualRevenue) : undefined;
      if (form.annualRevenue && !Number.isFinite(annualRevenue)) {
        setError('Annual revenue must be a valid number');
        return;
      }
      const newAccount = await createAccount({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        website: form.website.trim() || undefined,
        industry: form.industry.trim() || undefined,
        annualRevenue
      });
      setAccounts((prev) => [newAccount, ...prev]);
      setSelectedId(newAccount.id);
      setForm({ name: '', phone: '', website: '', industry: '', annualRevenue: '' });
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create account');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedAccount) return;
    if (!form.name.trim()) {
      setError('Account name is required');
      return;
    }
    if (form.website && !form.website.match(/^https?:\/\//)) {
      setError('Website must start with http:// or https://');
      return;
    }
    try {
      setError(null);
      setUpdating(true);
      const annualRevenue = form.annualRevenue ? Number(form.annualRevenue) : undefined;
      if (form.annualRevenue && !Number.isFinite(annualRevenue)) {
        setError('Annual revenue must be a valid number');
        return;
      }
      const updated = await updateAccount(selectedAccount.id, {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        website: form.website.trim() || undefined,
        industry: form.industry.trim() || undefined,
        annualRevenue
      });
      setAccounts((prev) => prev.map((acc) => (acc.id === updated.id ? updated : acc)));
      setForm({ name: '', phone: '', website: '', industry: '', annualRevenue: '' });
      setFormMode('create');
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update account');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;
    try {
      setError(null);
      setDeleting(true);
      await deleteAccount(selectedAccount.id);
      setAccounts((prev) => prev.filter((acc) => acc.id !== selectedAccount.id));
      const remaining = accounts.filter((acc) => acc.id !== selectedAccount.id);
      setSelectedId(remaining[0]?.id ?? null);
      setShowDeleteConfirm(false);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = () => {
    if (!selectedAccount) return;
    setForm({
      name: selectedAccount.name ?? '',
      phone: selectedAccount.phone ?? '',
      website: selectedAccount.website ?? '',
      industry: selectedAccount.industry ?? '',
      annualRevenue: selectedAccount.annualRevenue?.toString() ?? ''
    });
    setFormMode('edit');
  };

  const cancelEdit = () => {
    setForm({ name: '', phone: '', website: '', industry: '', annualRevenue: '' });
    setError(null);
    setFormMode('create');
  };

  // Load opportunities for selected account
  const loadOpportunities = async (accountId: string) => {
    try {
      setOpportunitiesLoading(true);
      const res = await listOpportunities({ accountId, limit: 100 });
      setOpportunities(res.items);
    } catch (err: any) {
      console.error('Failed to load opportunities:', err);
    } finally {
      setOpportunitiesLoading(false);
    }
  };

  useEffect(() => {
    if (selectedId) {
      loadOpportunities(selectedId);
    } else {
      setOpportunities([]);
    }
  }, [selectedId]);

  // Bulk operations
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAccounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAccounts.map(a => a.id)));
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
      const result = await bulkDeleteAccounts(Array.from(selectedIds));
      setAccounts(prev => prev.filter(a => !selectedIds.has(a.id)));
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      if (selectedId && selectedIds.has(selectedId)) {
        const remaining = accounts.filter(a => !selectedIds.has(a.id));
        setSelectedId(remaining[0]?.id ?? null);
      }
      if (result.deleted < selectedIds.size) {
        setError(`Deleted ${result.deleted} of ${selectedIds.size} accounts. Some deletions failed.`);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to delete accounts');
    } finally {
      setBulkDeleting(false);
    }
  };

  const isEditMode = formMode === 'edit';

  return (
    <div className="space-y-6">
      <BrokerPageHeader title="Accounts" description="Manage organization records and linked opportunities." />

      {/* Create/Edit Form */}
      <Card className="p-6 hover:translate-y-0 hover:shadow-brand">
        <h3 className="text-sm font-semibold text-slate-700">
          {isEditMode && selectedAccount ? `Edit ${selectedAccount.name}` : 'Create New Account'}
        </h3>
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={isEditMode && selectedAccount ? handleUpdate : handleCreate}
        >
          <Input
            className="md:col-span-2"
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
          <Input
            placeholder="Website (https://)"
            value={form.website}
            onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
          />
          <Input
            placeholder="Industry"
            value={form.industry}
            onChange={(e) => setForm((prev) => ({ ...prev, industry: e.target.value }))}
          />
          <Input
            placeholder="Annual Revenue"
            type="number"
            inputMode="numeric"
            value={form.annualRevenue}
            onChange={(e) => setForm((prev) => ({ ...prev, annualRevenue: e.target.value }))}
          />
          <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
            <Button type="submit" disabled={creating || updating}>
              {creating || updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEditMode && selectedAccount ? (
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
        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200/70 bg-rose-500/10 p-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        {/* Accounts List */}
        <Card className="overflow-hidden hover:translate-y-0 hover:shadow-brand">
          <div className="border-b border-[color:var(--hatch-card-border)] p-6 pb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Accounts ({filteredAccounts.length})</h3>
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
                  placeholder="Filter by industry..."
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                />
                <Select value={sortField} onValueChange={(value) => setSortField(value as any)}>
                  <SelectTrigger className="h-10 rounded-full">
                    <SelectValue placeholder="Sort by…" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="name">Sort by Name</SelectItem>
                    <SelectItem value="industry">Sort by Industry</SelectItem>
                    <SelectItem value="annualRevenue">Sort by Revenue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] bg-white/25 p-2 backdrop-blur">
                <span className="text-sm font-medium text-slate-900">{selectedIds.size} selected</span>
                <Button type="button" variant="destructive" size="sm" onClick={() => setShowBulkDeleteConfirm(true)}>
                  Delete selected
                </Button>
              </div>
            )}
          </div>
          <div className="max-h-[600px] overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-blue-600/10">
                  <Search className="h-5 w-5 text-brand-blue-600" />
                </div>
                <p className="text-sm font-medium text-slate-900">
                  {searchQuery ? 'No accounts match your search' : 'No accounts found'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {searchQuery ? 'Try a different keyword or clear filters.' : 'Create an account to start linking opportunities.'}
                </p>
              </div>
            ) : (
              <>
                {filteredAccounts.length > 0 && (
                  <div className="px-2 py-1">
                    <label className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredAccounts.length && filteredAccounts.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300"
                      />
                      Select All
                    </label>
                  </div>
                )}
                <ul className="space-y-1">
                  {filteredAccounts.map((account) => {
                    const active = account.id === selectedId;
                    const isSelected = selectedIds.has(account.id);
                    return (
                      <li key={account.id} className="flex items-center gap-2 px-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelect(account.id);
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
                            setSelectedId(account.id);
                            cancelEdit();
                            setShowDeleteConfirm(false);
                          }}
                        >
                          <div className="font-semibold">{account.name ?? 'Untitled account'}</div>
                          <div className="text-xs text-slate-500">{account.phone ?? account.email ?? '—'}</div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </Card>

        {/* Account Details */}
        <Card className="p-6 space-y-4 hover:translate-y-0 hover:shadow-brand">
          {selectedAccount ? (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">{selectedAccount.name ?? 'Untitled account'}</h3>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {selectedAccount.phone && (
                      <p>
                        <span className="font-medium">Phone:</span> {selectedAccount.phone}
                      </p>
                    )}
                    {selectedAccount.email && (
                      <p>
                        <span className="font-medium">Email:</span> {selectedAccount.email}
                      </p>
                    )}
                    {selectedAccount.website && (
                      <p>
                        <span className="font-medium">Website:</span>{' '}
                        <a href={selectedAccount.website} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                          {selectedAccount.website}
                        </a>
                      </p>
                    )}
                    {selectedAccount.industry && (
                      <p>
                        <span className="font-medium">Industry:</span> {selectedAccount.industry}
                      </p>
                    )}
                    {selectedAccount.annualRevenue && (
                      <p>
                        <span className="font-medium">Annual Revenue:</span> $
                        {Number(selectedAccount.annualRevenue).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={startEdit}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit account</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete account</span>
                  </Button>
                </div>
              </div>

              {/* Delete Confirmation Dialog */}
              {showDeleteConfirm && (
                <div className="rounded-xl border border-rose-200/70 bg-rose-500/10 p-4">
                  <p className="text-sm font-semibold text-rose-900">Confirm deletion</p>
                  <p className="mt-1 text-sm text-rose-800">
                    Are you sure you want to delete "{selectedAccount.name}"? This action cannot be undone.
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
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Linked Opportunities ({opportunities.length})</h4>
                {opportunitiesLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-slate-500 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading opportunities…
                  </div>
                ) : opportunities.length === 0 ? (
                  <p className="text-sm text-slate-500 py-3">No opportunities linked to this account</p>
                ) : (
                  <ul className="space-y-2">
                    {opportunities.map((opp) => (
                      <li key={opp.id} className="rounded-xl border border-[var(--glass-border)] bg-white/25 p-3 backdrop-blur">
                        <div className="font-medium text-sm text-slate-900">{opp.name}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                          <Badge variant="info">{opp.stage}</Badge>
                          {opp.amount && (
                            <span>${Number(opp.amount).toLocaleString()}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Attachments</h4>
                <AttachmentsPanel object="accounts" recordId={selectedAccount.id} />
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
              <p className="text-sm font-medium text-slate-900">Select an account</p>
              <p className="mt-1 text-sm text-slate-600">Details, linked opportunities, and attachments will appear here.</p>
            </div>
          )}
        </Card>
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm bulk deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.size} account{selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.
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
    </div>
  );
}
