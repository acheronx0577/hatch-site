'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FIELD_MAP } from '@hatch/shared/layout';

import ContactsBulkActions from '@/components/contacts/bulk-actions';
import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import { resolveLayout } from '@/lib/api/admin.layouts';
import { applyLayout } from '@/lib/layouts/applyLayout';
import { listContacts, type ContactListItem } from '@/lib/api';

interface ContactsTableProps {
  tenantId: string;
  initialItems: ContactListItem[];
  initialNextCursor: string | null;
  pageSize: number;
  filters?: Record<string, unknown>;
  initialManifest?: { fields: { field: string; label?: string; order: number; width?: number }[] };
}

export function ContactsTable({
  tenantId,
  initialItems,
  initialNextCursor,
  pageSize,
  filters,
  initialManifest
}: ContactsTableProps) {
  const [items, setItems] = useState<ContactListItem[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { error, showError, clearError, map } = useApiError();
  const [layoutFields, setLayoutFields] = useState<Array<{ field: string; label?: string; order?: number; width?: number }> | null>(
    initialManifest?.fields ?? null
  );
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const baseline = useMemo(() => FIELD_MAP.contacts ?? [], []);

  useEffect(() => {
    if (initialManifest?.fields) {
      return;
    }
    const controller = new AbortController();
    resolveLayout({ object: 'contacts', kind: 'list', signal: controller.signal })
      .then((manifest) => {
        setLayoutFields(manifest.fields ?? []);
        setLayoutError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLayoutError(err instanceof Error ? err.message : 'Unable to load layout preferences. Using defaults.');
      });
    return () => controller.abort();
  }, [initialManifest]);

  const allowedFields = useMemo(() => baseline.map((field) => field.field), [baseline]);

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      items.forEach((item) => {
        if (prev.has(item.id)) {
          next.add(item.id);
        }
      });
      return next;
    });
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
    if (!nextCursor || isLoading || isRefreshing) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await listContacts(tenantId, {
        ...(filters ?? {}),
        cursor: nextCursor,
        limit: pageSize
      });
      setItems((prev) => mergeContacts(prev, response.items));
      setNextCursor(response.nextCursor ?? null);
      clearError();
    } catch (err) {
      showError(err);
    } finally {
      setIsLoading(false);
    }
  }, [nextCursor, isLoading, isRefreshing, tenantId, pageSize, filters, showError, clearError]);

  const refreshFirstPage = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const baseFilters = { ...(filters ?? {}) } as Record<string, unknown>;
      delete baseFilters.cursor;
      const response = await listContacts(tenantId, {
        ...baseFilters,
        limit: pageSize
      });
      setItems(response.items);
      setNextCursor(response.nextCursor ?? null);
      clearError();
    } catch (err) {
      showError(err);
    } finally {
      setIsRefreshing(false);
    }
  }, [filters, tenantId, pageSize, showError, clearError]);

  const pagingError = error ? map(error) : null;

  const renderCellValue = useCallback((contact: ContactListItem, field: string) => {
    switch (field) {
      case 'firstName':
        return contact.firstName ?? '—';
      case 'lastName':
        return contact.lastName ?? '—';
      case 'primaryEmail':
        return contact.primaryEmail ? (
          <a href={`mailto:${contact.primaryEmail}`} className="text-brand-600 hover:underline">
            {contact.primaryEmail}
          </a>
        ) : (
          '—'
        );
      case 'primaryPhone':
        return contact.primaryPhone ?? '—';
      case 'stage':
        return contact.stage ?? '—';
      default: {
        const value = (contact as Record<string, unknown>)[field];
        if (value === null || value === undefined || value === '') {
          return '—';
        }
        return String(value);
      }
    }
  }, []);

  const toggleRow = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allOnPageSelected = useMemo(
    () => items.length > 0 && items.every((item) => selected.has(item.id)),
    [items, selected]
  );
  const someOnPageSelected = useMemo(
    () => items.some((item) => selected.has(item.id)),
    [items, selected]
  );

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelected((prev) => {
        if (!checked) {
          return new Set();
        }
        const next = new Set(prev);
        items.forEach((item) => {
          next.add(item.id);
        });
        return next;
      });
    },
    [items]
  );

  const headerCheckboxRef = useCallback(
    (input: HTMLInputElement | null) => {
      if (input) {
        input.indeterminate = !allOnPageSelected && someOnPageSelected;
      }
    },
    [allOnPageSelected, someOnPageSelected]
  );

  const columnCount = orderedFields.length + 1;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {layoutError && <ErrorBanner title="Using default layout" detail={layoutError} className="m-3" />}
      {pagingError && <ErrorBanner {...pagingError} onDismiss={clearError} className="m-4" />}
      {selectedIds.length > 0 && (
        <div className="px-4 pt-4">
          <ContactsBulkActions
            tenantId={tenantId}
            selectedIds={selectedIds}
            onComplete={() => {
              setSelected(new Set());
              void refreshFirstPage();
            }}
          />
        </div>
      )}
      <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="w-12 px-4 py-3">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={allOnPageSelected}
                onChange={(event) => toggleAll(event.target.checked)}
                aria-label="Select all contacts in view"
              />
            </th>
            {orderedFields.map((field) => (
              <th key={field.field} className="px-4 py-3" style={field.width ? { width: field.width } : undefined}>
                {field.label ?? field.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.length === 0 && !nextCursor ? (
            <tr>
              <td colSpan={columnCount} className="px-4 py-6 text-center text-slate-500">
                No contacts found.
              </td>
            </tr>
          ) : (
            items.map((contact) => (
              <tr key={contact.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    checked={selected.has(contact.id)}
                    onChange={(event) => toggleRow(contact.id, event.target.checked)}
                    aria-label={`Select ${contact.firstName ?? ''} ${contact.lastName ?? ''}`}
                  />
                </td>
                {orderedFields.map((field) => (
                  <td key={field.field} className="px-4 py-3" style={field.width ? { width: field.width } : undefined}>
                    {field.field === 'firstName' || field.field === 'lastName' ? (
                      <Link
                        href={`/people/${contact.id}`}
                        className="text-brand-600 hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {renderCellValue(contact, field.field)}
                      </Link>
                    ) : (
                      renderCellValue(contact, field.field)
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex justify-end border-t border-slate-100 bg-slate-50 p-3">
        <LoadMoreButton
          hasNext={Boolean(nextCursor)}
          isLoading={isLoading || isRefreshing}
          onClick={loadMore}
        />
      </div>
    </div>
  );
}

function mergeContacts(current: ContactListItem[], incoming: ContactListItem[]) {
  if (incoming.length === 0) {
    return current;
  }

  const seen = new Map<string, ContactListItem>();
  current.forEach((contact) => seen.set(contact.id, contact));
  incoming.forEach((contact) => {
    if (!seen.has(contact.id)) {
      seen.set(contact.id, contact);
    }
  });
  return Array.from(seen.values());
}

export default ContactsTable;
