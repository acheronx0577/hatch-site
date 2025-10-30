'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import {
  AUDIT_ACTIONS,
  listAuditEvents,
  type AuditAction,
  type AuditEvent
} from '@/lib/api/admin.audit';
import { useCursorPager } from '@/lib/pagination/useCursorPager';

type ActionFilter = 'all' | AuditAction;

interface AuditTableProps {
  initialItems: AuditEvent[];
  initialNextCursor: string | null;
  pageSize: number;
}

const actionLabels: Record<ActionFilter, string> = {
  all: 'Any action',
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
  SHARE: 'Share',
  LOGIN: 'Login'
};

const toIsoStartOfDay = (value: string) => `${value}T00:00:00.000Z`;
const toIsoEndOfDay = (value: string) => `${value}T23:59:59.999Z`;

const formatActor = (actor: AuditEvent['actor']) => {
  if (!actor) {
    return '—';
  }
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();
  if (name && actor.email) {
    return `${name} (${actor.email})`;
  }
  if (name) {
    return name;
  }
  return actor.email ?? actor.id;
};

const summarizeDiff = (diff: unknown) => {
  if (!diff || (typeof diff === 'object' && Object.keys(diff as Record<string, unknown>).length === 0)) {
    return '—';
  }
  try {
    const serialized = JSON.stringify(diff);
    return serialized.length > 120 ? `${serialized.slice(0, 117)}…` : serialized;
  } catch {
    return '[unserializable]';
  }
};

export function AuditTable({ initialItems, initialNextCursor, pageSize }: AuditTableProps) {
  const [actorId, setActorId] = useState('');
  const [object, setObject] = useState('');
  const [objectId, setObjectId] = useState('');
  const [action, setAction] = useState<ActionFilter>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const firstRenderRef = useRef(true);

  const fetchPage = useCallback(
    (cursor: string | null, signal?: AbortSignal) => {
      return listAuditEvents({
        cursor,
        limit: pageSize,
        actorId: actorId.trim() ? actorId.trim() : undefined,
        object: object.trim() ? object.trim() : undefined,
        objectId: objectId.trim() ? objectId.trim() : undefined,
        action,
        from: fromDate ? toIsoStartOfDay(fromDate) : undefined,
        to: toDate ? toIsoEndOfDay(toDate) : undefined,
        signal
      });
    },
    [actorId, object, objectId, action, fromDate, toDate, pageSize]
  );

  const { items, nextCursor, load, reset, loading, error } = useCursorPager(fetchPage, {
    initialItems,
    initialCursor: initialNextCursor
  });

  const { banner, showError, clearError } = useApiError();

  useEffect(() => {
    if (error) {
      showError(error);
    }
  }, [error, showError]);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    reset([], null);
    clearError();
    void load();
  }, [actorId, object, objectId, action, fromDate, toDate, reset, load, clearError]);

  const hasNext = useMemo(() => Boolean(nextCursor), [nextCursor]);

  const onLoadMore = useCallback(async () => {
    const page = await load();
    if (page) {
      clearError();
    }
  }, [load, clearError]);

  const actionOptions: ActionFilter[] = useMemo(() => ['all', ...AUDIT_ACTIONS], []);

  return (
    <div className="space-y-4">
      {banner}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Actor ID
            <input
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              placeholder="Search by actor"
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
              disabled={loading}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Object
            <input
              value={object}
              onChange={(event) => setObject(event.target.value)}
              placeholder="accounts, contacts…"
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
              disabled={loading}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Record ID
            <input
              value={objectId}
              onChange={(event) => setObjectId(event.target.value)}
              placeholder="Optional record id"
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
              disabled={loading}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Action
            <select
              value={action}
              onChange={(event) => setAction(event.target.value as ActionFilter)}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
              disabled={loading}
            >
              {actionOptions.map((option) => (
                <option key={option} value={option}>
                  {actionLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
              disabled={loading}
              max={toDate || undefined}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
              disabled={loading}
              min={fromDate || undefined}
            />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Object</th>
              <th className="px-4 py-3">Record</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Diff</th>
              <th className="px-4 py-3">Request</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  No audit entries match your filters yet.
                </td>
              </tr>
            )}
            {items.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3 text-slate-600">
                  <div className="flex flex-col">
                    <span>{new Date(event.createdAt).toLocaleString()}</span>
                    <span className="text-xs text-slate-400">
                      {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium uppercase text-slate-700">{event.action}</td>
                <td className="px-4 py-3 text-slate-600">{event.object ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{event.objectId ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{formatActor(event.actor)}</td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                  {summarizeDiff(event.diff)}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  <div className="flex flex-col gap-1">
                    <span>{event.ip ?? '—'}</span>
                    <span className="text-xs">{event.userAgent ? event.userAgent.slice(0, 64) : '—'}</span>
                  </div>
                </td>
              </tr>
            ))}
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Loading audit events…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        <LoadMoreButton hasNext={hasNext} isLoading={loading} onClick={onLoadMore} />
      </div>
    </div>
  );
}
