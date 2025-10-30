'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState, useTransition } from 'react';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import { useCursorPager } from '@/lib/pagination/useCursorPager';
import {
  createCommissionPlan,
  listCommissionPlans,
  updateCommissionPlan,
  type CommissionPlan
} from '@/lib/api/commission-plans';

const PAGE_SIZE = 25;

interface FormState {
  name: string;
  brokerSplit: string;
  agentSplit: string;
}

const DEFAULT_FORM: FormState = {
  name: '',
  brokerSplit: '0.30',
  agentSplit: '0.70'
};

export default function CommissionPlansPage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { banner, showError, clearError, map } = useApiError();

  const fetchPlans = useCallback(
    (cursor: string | null, signal?: AbortSignal) =>
      listCommissionPlans({
        cursor: cursor ?? undefined,
        limit: PAGE_SIZE,
        signal
      }),
    []
  );

  const {
    items: plans,
    nextCursor,
    load,
    reset,
    loading,
    error: pagingError
  } = useCursorPager<CommissionPlan>(fetchPlans);

  const loadInitial = useCallback(async () => {
    try {
      const data = await listCommissionPlans({ limit: PAGE_SIZE });
      reset(data.items, data.nextCursor ?? null);
      clearError();
    } catch (err) {
      showError(err);
      reset([], null);
    }
  }, [clearError, reset, showError]);

  useEffect(() => {
    startTransition(() => {
      void loadInitial();
    });
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null || isPending) {
      return;
    }
    await load();
  }, [isPending, load, loading, nextCursor]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        clearError();
        const payload = {
          name: form.name.trim(),
          brokerSplit: Number(form.brokerSplit),
          agentSplit: Number(form.agentSplit)
        };

        if (!payload.name) {
          throw new Error('Name is required.');
        }
        if (Number.isNaN(payload.brokerSplit) || Number.isNaN(payload.agentSplit)) {
          throw new Error('Split values must be valid numbers.');
        }

        if (editingId) {
          await updateCommissionPlan(editingId, payload);
        } else {
          await createCommissionPlan(payload);
        }

        setForm(DEFAULT_FORM);
        setEditingId(null);
        await loadInitial();
      } catch (err) {
        showError(err);
      }
    });
  };

  const startEdit = (plan: CommissionPlan) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name ?? '',
      brokerSplit: plan.brokerSplit != null ? String(plan.brokerSplit) : DEFAULT_FORM.brokerSplit,
      agentSplit: plan.agentSplit != null ? String(plan.agentSplit) : DEFAULT_FORM.agentSplit
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    clearError();
  };

  const pagingBanner = useMemo(() => (pagingError ? map(pagingError) : null), [map, pagingError]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Commission Plans</h1>
        <p className="text-sm text-slate-500">Define broker vs agent splits to drive payout generation.</p>
      </div>

      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-4 md:flex-row">
          <label className="flex flex-1 flex-col text-sm text-slate-600">
            Name
            <input
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="mt-1 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-1 flex-col text-sm text-slate-600">
            Broker Split (0 - 1)
            <input
              required
              step="0.01"
              min="0"
              max="1"
              type="number"
              value={form.brokerSplit}
              onChange={(event) => setForm((prev) => ({ ...prev, brokerSplit: event.target.value }))}
              className="mt-1 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-1 flex-col text-sm text-slate-600">
            Agent Split (0 - 1)
            <input
              required
              step="0.01"
              min="0"
              max="1"
              type="number"
              value={form.agentSplit}
              onChange={(event) => setForm((prev) => ({ ...prev, agentSplit: event.target.value }))}
              className="mt-1 rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {editingId ? 'Update Plan' : 'Create Plan'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Broker Split</th>
              <th className="px-4 py-3">Agent Split</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {plans.length === 0 && !loading && !isPending ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No commission plans defined yet.
                </td>
              </tr>
            ) : null}
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td className="px-4 py-3 font-semibold">{plan.name ?? 'Untitled plan'}</td>
                <td className="px-4 py-3">{formatPct(plan.brokerSplit)}</td>
                <td className="px-4 py-3">{formatPct(plan.agentSplit)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => startEdit(plan)}
                    className="text-sm font-semibold text-brand-600 hover:underline"
                    disabled={isPending}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {Boolean(nextCursor) || pagingBanner ? (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-right">
            {pagingBanner && (
              <ErrorBanner {...pagingBanner} className="mb-3 inline-block max-w-md text-left" />
            )}
            <LoadMoreButton
              hasNext={Boolean(nextCursor)}
              isLoading={loading || isPending}
              onClick={() => {
                void loadMore();
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const formatPct = (value?: number) =>
  typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '—';
