import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Pencil, Trash2, X, Plus, Save, Check, Filter, ArrowUpDown } from 'lucide-react';

import BrokerPageHeader from '@/components/layout/BrokerPageHeader';
import AttachmentsPanel from '@/components/files/AttachmentsPanel';
import { listOpportunities, createOpportunity, updateOpportunity, deleteOpportunity, bulkDeleteOpportunities, type Opportunity } from '@/lib/api/opportunities';
import { listAccounts, type Account } from '@/lib/api/accounts';

export default function BrokerOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    loadOpportunities();
  }, []);

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
      setEditing(true);
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
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update opportunity');
    } finally {
      setEditing(false);
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
  };

  const cancelEdit = () => {
    setForm({ name: '', stage: 'prospecting', amount: '', currency: 'USD', accountId: accounts[0]?.id ?? '' });
    setError(null);
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

  const isEditing = form.name.trim().length > 0;

  return (
    <div className="space-y-6">
      <BrokerPageHeader title="Opportunities" description="Track deals and linked documents." />

      {/* Create/Edit Form */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">
          {isEditing && selectedOpportunity ? `Edit ${selectedOpportunity.name}` : 'Create New Opportunity'}
        </h3>
        <form className="grid gap-3 md:grid-cols-6" onSubmit={isEditing && selectedOpportunity ? handleUpdate : handleCreate}>
          <input
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none md:col-span-2"
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <select
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            value={form.stage}
            onChange={(e) => setForm((prev) => ({ ...prev, stage: e.target.value }))}
          >
            <option value="prospecting">Prospecting</option>
            <option value="qualification">Qualification</option>
            <option value="proposal">Proposal</option>
            <option value="negotiation">Negotiation</option>
            <option value="closed-won">Closed Won</option>
            <option value="closed-lost">Closed Lost</option>
          </select>
          <select
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            value={form.accountId}
            onChange={(e) => setForm((prev) => ({ ...prev, accountId: e.target.value }))}
            disabled={accounts.length === 0}
          >
            {accounts.length === 0 ? (
              <option value="">No accounts</option>
            ) : (
              accounts.map((acct) => (
                <option key={acct.id} value={acct.id}>
                  {acct.name ?? acct.id}
                </option>
              ))
            )}
          </select>
          <input
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="Amount"
            type="number"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
          />
          <input
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="Currency"
            value={form.currency}
            onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-1"
              disabled={creating || editing || accounts.length === 0}
            >
              {creating || editing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEditing && selectedOpportunity ? (
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
        {accounts.length === 0 ? (
          <p className="text-sm text-amber-600">Create an account first to link opportunities.</p>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        {/* Opportunities List */}
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Opportunities ({filteredOpportunities.length})</h3>
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
                  placeholder="Filter by stage..."
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as 'name' | 'stage' | 'amount')}
                    className="flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                  >
                    <option value="name">Sort by Name</option>
                    <option value="stage">Sort by Stage</option>
                    <option value="amount">Sort by Amount</option>
                  </select>
                  {stageFilter && (
                    <button
                      type="button"
                      onClick={() => setStageFilter('')}
                      className="rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search opportunities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 rounded bg-brand-50 px-3 py-2 text-sm">
                <span className="font-medium text-brand-900">{selectedIds.size} selected</span>
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  disabled={bulkDeleting}
                  className="ml-auto rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                >
                  {bulkDeleting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-white"
                >
                  Clear
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
            ) : filteredOpportunities.length === 0 ? (
              <p className="py-4 px-2 text-sm text-slate-500 text-center">
                {searchQuery ? 'No opportunities match your search' : 'No opportunities found'}
              </p>
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
                            active ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                          onClick={() => {
                            setSelectedId(opp.id);
                            cancelEdit();
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
        </div>

        {/* Opportunity Details */}
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          {selectedOpportunity ? (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">{selectedOpportunity.name ?? 'Untitled opportunity'}</h3>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {selectedOpportunity.stage && (
                      <p>
                        <span className="font-medium">Stage:</span>{' '}
                        <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800">
                          {selectedOpportunity.stage}
                        </span>
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
                  <button
                    type="button"
                    onClick={startEdit}
                    className="rounded border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 transition-colors"
                    title="Edit opportunity"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded border border-red-200 p-2 text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete opportunity"
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
                    Are you sure you want to delete "{selectedOpportunity.name}"? This action cannot be undone.
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
            <p className="text-sm text-slate-500 text-center py-12">Select an opportunity to view details and attachments</p>
          )}
        </div>
      </div>

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-900">Confirm Bulk Deletion</h3>
            <p className="mt-2 text-sm text-red-700">
              Are you sure you want to delete {selectedIds.size} opportunit{selectedIds.size > 1 ? 'ies' : 'y'}? This action cannot be undone.
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
                    Delete {selectedIds.size} Opportunit{selectedIds.size > 1 ? 'ies' : 'y'}
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
