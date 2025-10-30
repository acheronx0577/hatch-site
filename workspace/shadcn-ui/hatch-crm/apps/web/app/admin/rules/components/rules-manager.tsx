'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition
} from 'react';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import { useCursorPager } from '@/lib/pagination/useCursorPager';
import {
  createAssignmentRule,
  createValidationRule,
  deleteAssignmentRule,
  deleteValidationRule,
  listAssignmentRules,
  listValidationRules,
  RuleObject,
  RulePayload,
  RuleRecord,
  RuleUpdate,
  updateAssignmentRule,
  updateValidationRule
} from '@/lib/api/admin.rules';

interface RulesManagerProps {
  type: 'validation' | 'assignment';
  initialItems: RuleRecord[];
  initialNextCursor: string | null;
}

interface FormState {
  object: RuleObject;
  name: string;
  active: boolean;
  dslText: string;
}

type ModalMode =
  | { kind: 'create' }
  | { kind: 'edit'; rule: RuleRecord };

const OBJECT_OPTIONS: { label: string; value: RuleObject }[] = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'opportunities', label: 'Opportunities' },
  { value: 'cases', label: 'Cases' },
  { value: 're_offers', label: 'RE Offers' },
  { value: 're_transactions', label: 'RE Transactions' }
];

const FILTER_OPTIONS: { label: string; value: 'all' | RuleObject }[] = [
  { value: 'all', label: 'All objects' },
  ...OBJECT_OPTIONS
];

const DEFAULT_OBJECT: RuleObject = 'cases';
const PAGE_SIZE = 25;

const defaultDslFor = (mode: 'validation' | 'assignment') =>
  mode === 'validation'
    ? '{\n  "if": "status in [\'Resolved\', \'Closed\']",\n  "then_required": ["description"]\n}'
    : '{\n  "when": "amount >= 50000",\n  "assign": { "type": "static_owner", "ownerId": "USER_ID" }\n}';

const formEquals = (a: FormState, b: FormState) =>
  a.object === b.object &&
  a.name === b.name &&
  a.active === b.active &&
  a.dslText === b.dslText;

export function RulesManager({ type, initialItems, initialNextCursor }: RulesManagerProps) {
  const [objectFilter, setObjectFilter] = useState<'all' | RuleObject>('all');
  const [mode, setMode] = useState<ModalMode | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    object: DEFAULT_OBJECT,
    name: '',
    active: true,
    dslText: defaultDslFor(type)
  }));
  const [toast, setToast] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pageErrors = useApiError();
  const modalErrors = useApiError();

  const initialFormRef = useRef<FormState | null>(null);

  const api = useMemo(() => {
    if (type === 'validation') {
      return {
        list: listValidationRules,
        create: createValidationRule,
        update: updateValidationRule,
        remove: deleteValidationRule
      };
    }
    return {
      list: listAssignmentRules,
      create: createAssignmentRule,
      update: updateAssignmentRule,
      remove: deleteAssignmentRule
    };
  }, [type]);

  const fetchRules = useCallback(
    (cursor: string | null, signal?: AbortSignal) =>
      api.list({
        object: objectFilter === 'all' ? undefined : objectFilter,
        cursor: cursor ?? undefined,
        limit: PAGE_SIZE,
        signal
      }),
    [api, objectFilter]
  );

  const {
    items: rules,
    nextCursor,
    load,
    reset,
    loading,
    error: pagingError
  } = useCursorPager<RuleRecord>(fetchRules, {
    initialItems,
    initialCursor: initialNextCursor
  });

  const loadInitial = useCallback(
    async (filter: 'all' | RuleObject) => {
      try {
        const data = await api.list({
          object: filter === 'all' ? undefined : filter,
          limit: PAGE_SIZE
        });
        reset(data.items, data.nextCursor ?? null);
        pageErrors.clearError();
      } catch (err) {
        pageErrors.showError(err);
        reset([], null);
      }
    },
    [api, pageErrors, reset]
  );

  useEffect(() => {
    startTransition(() => {
      void loadInitial(objectFilter);
    });
  }, [objectFilter, loadInitial]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const isModalDirty = useMemo(() => {
    if (!mode) return false;
    const baseline = initialFormRef.current;
    if (!baseline) return false;
    return !formEquals(form, baseline);
  }, [form, mode]);

  useEffect(() => {
    if (!mode || !isModalDirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isModalDirty, mode]);

  const pagingBanner = pagingError ? pageErrors.map(pagingError) : null;

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null || isPending) {
      return;
    }
    await load();
  }, [isPending, load, loading, nextCursor]);

  const openCreate = () => {
    const initial: FormState = {
      object: DEFAULT_OBJECT,
      name: '',
      active: true,
      dslText: defaultDslFor(type)
    };
    initialFormRef.current = initial;
    setForm(initial);
    modalErrors.clearError();
    setMode({ kind: 'create' });
  };

  const openEdit = (rule: RuleRecord) => {
    const initial: FormState = {
      object: rule.object,
      name: rule.name,
      active: rule.active,
      dslText: JSON.stringify(rule.dsl ?? {}, null, 2)
    };
    initialFormRef.current = initial;
    setForm(initial);
    modalErrors.clearError();
    setMode({ kind: 'edit', rule });
  };

  const closeModal = () => {
    if (isModalDirty && !window.confirm('Discard unsaved changes?')) {
      return;
    }
    setMode(null);
    modalErrors.clearError();
    initialFormRef.current = null;
  };

  const handleSubmit = async () => {
    if (!mode) return;

    modalErrors.clearError();
    pageErrors.clearError();

    let parsedDsl: Record<string, unknown>;
    try {
      parsedDsl = JSON.parse(form.dslText);
    } catch {
      modalErrors.showError(new Error('DSL must be valid JSON.'));
      return;
    }

    if (!form.name.trim()) {
      modalErrors.showError(new Error('Name is required.'));
      return;
    }

    const payload: RulePayload = {
      object: form.object,
      name: form.name.trim(),
      active: form.active,
      dsl: parsedDsl
    };

    setToast(null);
    startTransition(async () => {
      try {
        if (mode.kind === 'create') {
          await api.create(payload);
          setToast('Rule saved');
        } else {
          const update: RuleUpdate = {
            name: payload.name,
            active: payload.active,
            object: payload.object,
            dsl: payload.dsl
          };
          await api.update(mode.rule.id, update);
          setToast('Rule updated');
        }
        closeModal();
        await loadInitial(objectFilter);
      } catch (err) {
        modalErrors.showError(err);
      }
    });
  };

  const handleDelete = (rule: RuleRecord) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) {
      return;
    }
    pageErrors.clearError();
    startTransition(async () => {
      try {
        await api.remove(rule.id);
        setToast('Rule deleted');
        await loadInitial(objectFilter);
      } catch (err) {
        pageErrors.showError(err);
      }
    });
  };

  return (
    <div className="space-y-5">
      {toast ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {type === 'validation' ? 'Validation rules' : 'Assignment rules'}
          </h2>
          <p className="text-sm text-slate-500">
            {type === 'validation'
              ? 'Ensure field requirements and guard state transitions.'
              : 'Route records to the right owner or queue based on criteria.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={objectFilter}
            onChange={(event) => setObjectFilter(event.target.value as 'all' | RuleObject)}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            disabled={isPending}
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openCreate}
            className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-60"
            disabled={isPending}
          >
            New rule
          </button>
        </div>
      </div>

      {pageErrors.banner && <ErrorBanner {...pageErrors.banner} onDismiss={pageErrors.clearError} />}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Rule</th>
              <th className="px-4 py-3">Object</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Preview</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {rules.length === 0 && !loading && !isPending ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No rules match this filter yet.
                </td>
              </tr>
            ) : null}
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td className="px-4 py-3 font-semibold text-slate-800">{rule.name}</td>
                <td className="px-4 py-3">
                  {OBJECT_OPTIONS.find((option) => option.value === rule.object)?.label ?? rule.object}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                      rule.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {rule.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {rule.updatedAt ? new Date(rule.updatedAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  <code className="line-clamp-2 break-all">{JSON.stringify(rule.dsl ?? {}, null, 0)}</code>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(rule)}
                      className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule)}
                      className="rounded border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
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

      {mode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-lg font-semibold text-slate-900">
                {mode.kind === 'create' ? 'Create rule' : `Edit ${mode.rule.name}`}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded border border-transparent p-2 text-slate-500 hover:bg-slate-100"
                disabled={isPending}
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-4 py-4">
              {modalErrors.banner && (
                <ErrorBanner {...modalErrors.banner} onDismiss={modalErrors.clearError} />
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>Object</span>
                  <select
                    value={form.object}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, object: event.target.value as RuleObject }))
                    }
                    className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  >
                    {OBJECT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-slate-700">
                  <span>Name</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    placeholder="Describe what this rule enforces"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Active</span>
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span>Rule DSL (JSON)</span>
                <textarea
                  value={form.dslText}
                  onChange={(event) => setForm((prev) => ({ ...prev, dslText: event.target.value }))}
                  className="h-64 rounded border border-slate-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none"
                  spellCheck={false}
                />
                <span className="text-xs text-slate-500">
                  Provide lightweight JSON describing conditions. Basic validation runs client-side; the server enforces schema.
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-60"
                disabled={isPending}
              >
                {isPending ? 'Saving…' : 'Save rule'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
