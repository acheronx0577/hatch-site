'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FIELD_MAP } from '@hatch/shared/layout';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import { resolveLayout } from '@/lib/api/admin.layouts';
import { applyLayout } from '@/lib/layouts/applyLayout';
import { listAccounts, type Account } from '@/lib/api/accounts';

interface AccountsTableProps {
  initialItems: Account[];
  initialNextCursor: string | null;
  query: string;
  pageSize: number;
}

export default function AccountsTable({
  initialItems,
  initialNextCursor,
  query,
  pageSize
}: AccountsTableProps) {
  const [items, setItems] = useState<Account[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const { error, showError, clearError, map } = useApiError();
  const [layoutFields, setLayoutFields] = useState<Array<{ field: string; label?: string; order?: number; width?: number }> | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const hasNext = useMemo(() => Boolean(nextCursor), [nextCursor]);

  useEffect(() => {
    const controller = new AbortController();
    resolveLayout({ object: 'accounts', kind: 'list', signal: controller.signal })
      .then((manifest) => {
        setLayoutFields(manifest.fields ?? []);
        setLayoutError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLayoutError(err instanceof Error ? err.message : 'Unable to load layout preferences. Using defaults.');
      });
    return () => controller.abort();
  }, []);

  const baseline = useMemo(() => FIELD_MAP['accounts'] ?? [], []);

  const allowedFields = useMemo(() => {
    const keys = new Set<string>();
    items.forEach((item) => {
      Object.keys(item ?? {}).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [items]);

  const manifestFields = useMemo(
    () =>
      layoutFields ??
      baseline.map((field, index) => ({ field: field.field, label: field.label, order: index, width: field.width })),
    [layoutFields, baseline]
  );

  const orderedFields = useMemo(
    () => applyLayout({ fields: manifestFields }, allowedFields, baseline),
    [manifestFields, allowedFields, baseline]
  );

  const mergeAccounts = useCallback((current: Account[], incoming: Account[]) => {
    if (!incoming.length) {
      return current;
    }
    const map = new Map<string, Account>();
    current.forEach((account) => {
      map.set(account.id, account);
    });
    incoming.forEach((account) => {
      if (!map.has(account.id)) {
        map.set(account.id, account);
      }
    });
    return Array.from(map.values());
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await listAccounts({
        ...(query ? { q: query } : {}),
        cursor: nextCursor,
        limit: pageSize
      });
      setItems((prev) => mergeAccounts(prev, response.items));
      setNextCursor(response.nextCursor ?? null);
      clearError();
    } catch (err) {
      showError(err);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading, query, pageSize, mergeAccounts, showError, clearError]);

  const pagingError = error ? map(error) : null;

  const renderCellValue = useCallback((account: Account, field: string) => {
    switch (field) {
      case 'name':
        return (
          <Link href={`/accounts/${account.id}`} className="font-semibold text-brand-600 hover:underline">
            {account.name ?? 'Untitled account'}
          </Link>
        );
      case 'website':
        return account.website ? (
          <a href={account.website} className="text-brand-600 hover:underline" rel="noreferrer" target="_blank">
            {account.website}
          </a>
        ) : (
          '—'
        );
      case 'industry':
        return account.industry ?? '—';
      case 'phone':
        return account.phone ?? '—';
      case 'owner':
        return account.owner?.name ?? account.ownerId ?? 'Unassigned';
      case 'annualRevenue':
        return typeof account.annualRevenue === 'number' ? `$${account.annualRevenue.toLocaleString()}` : '—';
      case 'createdAt':
      case 'updatedAt': {
        const value = (account as Record<string, unknown>)[field];
        return typeof value === 'string' ? new Date(value).toLocaleString() : '—';
      }
      default: {
        const value = (account as Record<string, unknown>)[field];
        if (value === null || value === undefined || value === '') {
          return '—';
        }
        if (typeof value === 'object') {
          try {
            return JSON.stringify(value);
          } catch {
            return '—';
          }
        }
        return String(value);
      }
    }
  }, []);

  const columnCount = orderedFields.length || 1;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {layoutError && (
        <ErrorBanner title="Using default layout" detail={layoutError} className="m-3" />
      )}
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            {orderedFields.map((field) => (
              <th key={field.field} className="px-4 py-3" style={field.width ? { width: field.width } : undefined}>
                {field.label ?? field.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
          {items.length === 0 && !hasNext && (
            <tr>
              <td colSpan={columnCount} className="px-4 py-6 text-center text-slate-500">
                No accounts match your filters yet.
              </td>
            </tr>
          )}
          {items.map((account) => (
            <tr key={account.id} className="hover:bg-slate-50">
              {orderedFields.map((field) => (
                <td key={field.field} className="px-4 py-3" style={field.width ? { width: field.width } : undefined}>
                  {renderCellValue(account, field.field)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col items-end gap-3 border-t border-slate-100 bg-slate-50 p-3">
        {pagingError && <ErrorBanner {...pagingError} onDismiss={clearError} />}
        <LoadMoreButton hasNext={hasNext} isLoading={isLoading} onClick={loadMore} />
      </div>
    </div>
  );
}
