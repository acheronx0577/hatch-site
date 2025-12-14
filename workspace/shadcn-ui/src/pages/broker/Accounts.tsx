import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Pencil, Trash2, X, Plus, Save, Check, Filter, ArrowUpDown } from 'lucide-react';

import BrokerPageHeader from '@/components/layout/BrokerPageHeader';
import AttachmentsPanel from '@/components/files/AttachmentsPanel';
import { listAccounts, createAccount, updateAccount, deleteAccount, bulkDeleteAccounts, type Account } from '@/lib/api/accounts';
import { listOpportunities, type Opportunity } from '@/lib/api/opportunities';

export default function BrokerAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      setEditing(true);
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
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update account');
    } finally {
      setEditing(false);
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
  };

  const cancelEdit = () => {
    setForm({ name: '', phone: '', website: '', industry: '', annualRevenue: '' });
    setError(null);
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

  const isEditing = form.name.trim().length > 0;

  return (
    <div className="space-y-6">
      <BrokerPageHeader title="Accounts" description="Manage organization records and linked opportunities." />

      {/* Create/Edit Form */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700">
          {isEditing && selectedAccount ? `Edit ${selectedAccount.name}` : 'Create New Account'}
        </h3>
        <form className="mt-3 grid gap-3 md:grid-cols-6" onSubmit={isEditing && selectedAccount ? handleUpdate : handleCreate}>
          <input
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none md:col-span-2"
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
          <input
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="Website (https://)"
            value={form.website}
            onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
          />
          <input
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="Industry"
            value={form.industry}
            onChange={(e) => setForm((prev) => ({ ...prev, industry: e.target.value }))}
          />
          <input
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="Annual Revenue"
            type="number"
            value={form.annualRevenue}
            onChange={(e) => setForm((prev) => ({ ...prev, annualRevenue: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-1"
              disabled={creating || editing}
            >
              {creating || editing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEditing && selectedAccount ? (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create
                </>
              )}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        {/* Accounts List */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Accounts ({filteredAccounts.length})</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`rounded border p-1.5 text-sm transition-colors ${
                    showFilters ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Toggle filters"
                >
                  <Filter className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  className="rounded border border-slate-200 p-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  title={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Filter by industry..."
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                />
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as any)}
                  className="w-full rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                >
                  <option value="name">Sort by Name</option>
                  <option value="industry">Sort by Industry</option>
                  <option value="annualRevenue">Sort by Revenue</option>
                </select>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-brand-50 p-2">
                <span className="text-sm font-medium text-brand-900">{selectedIds.size} selected</span>
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                >
                  Delete Selected
                </button>
              </div>
            )}
          </div>
          <div className="max-h-[600px] overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : filteredAccounts.length === 0 ? (
              <p className="py-4 px-2 text-sm text-slate-500 text-center">
                {searchQuery ? 'No accounts match your search' : 'No accounts found'}
              </p>
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
                            active ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                          onClick={() => {
                            setSelectedId(account.id);
                            cancelEdit();
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
        </div>

        {/* Account Details */}
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-4">
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
                  <button
                    type="button"
                    onClick={startEdit}
                    className="rounded border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 transition-colors"
                    title="Edit account"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded border border-red-200 p-2 text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete account"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Delete Confirmation Dialog */}
              {showDeleteConfirm && (
                <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-900">Confirm Deletion</p>
                  <p className="mt-1 text-sm text-red-700">
                    Are you sure you want to delete "{selectedAccount.name}"? This action cannot be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Deleting…
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                      className="rounded border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
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
                      <li key={opp.id} className="rounded border border-slate-200 p-3">
                        <div className="font-medium text-sm text-slate-900">{opp.name}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                          <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 font-medium text-brand-800">
                            {opp.stage}
                          </span>
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
            <p className="text-sm text-slate-500 text-center py-12">Select an account to view details and attachments</p>
          )}
        </div>
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-900">Confirm Bulk Deletion</h3>
            <p className="mt-2 text-sm text-red-700">
              Are you sure you want to delete {selectedIds.size} account{selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                className="rounded border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {bulkDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete {selectedIds.size} Account{selectedIds.size > 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
