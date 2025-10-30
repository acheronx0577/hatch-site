'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FIELD_MAP } from '@hatch/shared/layout';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import { resolveLayout } from '@/lib/api/admin.layouts';
import { applyLayout } from '@/lib/layouts/applyLayout';
import {
  listOpportunities,
  type Opportunity
} from '@/lib/api/opportunities';

interface OpportunitiesTableProps {
  initialItems: Opportunity[];
  initialNextCursor: string | null;
  filters: {
    q?: string;
    stage?: string;
  };
  pageSize: number;
}

export default function OpportunitiesTable({
  initialItems,
  initialNextCursor,
  filters,
  pageSize
}: OpportunitiesTableProps) {
  const [items, setItems] = useState<Opportunity[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const { error, showError, clearError, map } = useApiError();
  const [layoutFields, setLayoutFields] = useState<Array<{ field: string; label?: string; order?: number; width?: number }> | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const hasNext = useMemo(() => Boolean(nextCursor), [nextCursor]);

  useEffect(() => {
    const controller = new AbortController();
    resolveLayout({ object: 'opportunities', kind: 'list', signal: controller.signal })
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

  const baseline = useMemo(() => FIELD_MAP['opportunities'] ?? [], []);

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

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await listOpportunities({
        ...filters,
        cursor: nextCursor,
        limit: pageSize
      });
      setItems((prev) => mergeOpportunities(prev, response.items));
      setNextCursor(response.nextCursor ?? null);
      clearError();
    } catch (err) {
      showError(err);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading, filters, pageSize, showError, clearError]);

  const pagingError = error ? map(error) : null;

  const renderCellValue = useCallback((opportunity: Opportunity, field: string) => {
    switch (field) {
      case 'name':
        return (
          <Link href={`/opportunities/${opportunity.id}`} className="font-semibold text-brand-600 hover:underline">
            {opportunity.name ?? 'Untitled opportunity'}
          </Link>
        );
      case 'stage':
        return opportunity.stage ?? '—';
      case 'amount':
        return typeof opportunity.amount === 'number'
          ? new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: opportunity.currency ?? 'USD'
            }).format(opportunity.amount)
          : '—';
      case 'closeDate':
        return opportunity.closeDate ? new Date(opportunity.closeDate).toLocaleDateString() : '—';
      case 'account':
        return opportunity.account ? (
          <Link href={`/accounts/${opportunity.account.id}`} className="text-brand-600 hover:underline">
            {opportunity.account.name ?? 'View account'}
          </Link>
        ) : (
          'Unassigned'
        );
      case 'owner':
        return opportunity.owner?.name ?? opportunity.ownerId ?? 'Unassigned';
      case 'transaction':
        return opportunity.transaction ? (
          <Link href={`/re/transactions/${opportunity.transaction.id}`} className="text-brand-600 hover:underline">
            View transaction ({opportunity.transaction.stage ?? 'In progress'})
          </Link>
        ) : (
          'No transaction linked yet'
        );
      default: {
        const value = (opportunity as Record<string, unknown>)[field];
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
      {layoutError && <ErrorBanner title="Using default layout" detail={layoutError} className="m-3" />}
      {pagingError && <ErrorBanner {...pagingError} onDismiss={clearError} className="m-4" />}
      <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            {orderedFields.map((field) => (
              <th key={field.field} className="px-4 py-3" style={field.width ? { width: field.width } : undefined}>
                {field.label ?? field.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.length === 0 && !hasNext ? (
            <tr>
              <td colSpan={columnCount} className="px-4 py-6 text-center text-slate-500">
                No opportunities found.
              </td>
            </tr>
          ) : (
            items.map((opportunity) => (
              <tr key={opportunity.id} className="hover:bg-slate-50">
                {orderedFields.map((field) => (
                  <td key={field.field} className="px-4 py-3" style={field.width ? { width: field.width } : undefined}>
                    {renderCellValue(opportunity, field.field)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex justify-end border-t border-slate-100 bg-slate-50 p-3">
        <LoadMoreButton hasNext={hasNext} isLoading={isLoading} onClick={loadMore} />
      </div>
    </div>
  );
}

const mergeOpportunities = (current: Opportunity[], incoming: Opportunity[]) => {
  if (!incoming.length) {
    return current;
  }
  const map = new Map<string, Opportunity>();
  current.forEach((item) => {
    map.set(item.id, item);
  });
  incoming.forEach((item) => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
};
