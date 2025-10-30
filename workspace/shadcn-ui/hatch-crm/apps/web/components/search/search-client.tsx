'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { LoadMoreButton } from '@/components/load-more-button';
import { ErrorBanner } from '@/components/error-banner';
import { useApiError } from '@/hooks/use-api-error';
import { useCursorPager } from '@/lib/pagination/useCursorPager';
import { searchApi, type SearchHit } from '@/lib/api/search';

type FilterState = {
  q: string;
  types?: string[];
  ownerId?: string;
  stage?: string;
  status?: string;
};

const TYPE_OPTIONS = [
  'contacts',
  'leads',
  'accounts',
  'opportunities',
  'cases',
  're_listings',
  're_offers',
  're_transactions'
] as const;

const DEFAULT_LIMIT = 25;

export default function SearchClient({ initialFilters }: { initialFilters: FilterState }) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<FilterState>({
    q: initialFilters.q ?? '',
    types: initialFilters.types,
    ownerId: initialFilters.ownerId,
    stage: initialFilters.stage,
    status: initialFilters.status
  });
  const [inputValue, setInputValue] = useState(initialFilters.q ?? '');
  const [facets, setFacets] = useState<Record<string, number>>({});
  const { banner, showError, clearError } = useApiError();
  const typesKey = useMemo(() => (filters.types ?? []).join(','), [filters.types]);

  const fetchPage = useMemo(
    () => async (cursor: string | null, signal?: AbortSignal) => {
      const trimmedQuery = filters.q.trim();
      if (!trimmedQuery) {
        setFacets({});
        return { items: [] as SearchHit[], nextCursor: null };
      }

      const response = await searchApi({
        q: trimmedQuery,
        types: filters.types,
        ownerId: filters.ownerId,
        stage: filters.stage,
        status: filters.status,
        cursor: cursor ?? undefined,
        limit: DEFAULT_LIMIT,
        signal
      });

      setFacets(response.facets?.byType ?? {});

      return {
        items: response.items,
        nextCursor: response.nextCursor ?? null
      };
    },
    [filters]
  );

  const pager = useCursorPager<SearchHit>(fetchPage);
  const {
    items,
    nextCursor,
    loading,
    error: pagerError,
    load,
    reset
  } = pager;

  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.types?.length) params.set('types', filters.types.join(','));
    if (filters.ownerId) params.set('ownerId', filters.ownerId);
    if (filters.stage) params.set('stage', filters.stage);
    if (filters.status) params.set('status', filters.status);

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [filters.q, filters.ownerId, filters.stage, filters.status, typesKey, router, pathname]);

  useEffect(() => {
    reset([], null);
    clearError();

    if (!filters.q.trim()) {
      setFacets({});
      return;
    }

    void load();
  }, [fetchPage, reset, load, clearError, filters.q]);

  useEffect(() => {
    if (pagerError) {
      showError(pagerError);
    }
  }, [pagerError, showError]);

  const updateFilter = useCallback(
    (partial: Partial<FilterState>) => {
      setFilters((previous) => {
        const next: FilterState = { ...previous, ...partial };
        if (!next.types?.length) {
          delete next.types;
        }
        if (next.ownerId !== undefined && next.ownerId.trim() === '') {
          delete next.ownerId;
        }
        if (next.stage !== undefined && next.stage.trim() === '') {
          delete next.stage;
        }
        if (next.status !== undefined && next.status.trim() === '') {
          delete next.status;
        }
        return next;
      });
    },
    []
  );

  const toggleType = useCallback(
    (type: string) => {
      const current = new Set(filters.types ?? TYPE_OPTIONS);
      if (filters.types?.length) {
        if (current.has(type)) {
          current.delete(type);
        } else {
          current.add(type);
        }
      } else {
        current.clear();
        current.add(type);
      }

      const nextTypes = current.size === 0 ? undefined : Array.from(current);
      updateFilter({ types: nextTypes });
    },
    [filters.types, updateFilter]
  );

  const clearTypes = useCallback(() => {
    updateFilter({ types: undefined });
  }, [updateFilter]);

  const submitSearch = useCallback(
    (event?: React.FormEvent) => {
      if (event) {
        event.preventDefault();
      }
      updateFilter({ q: inputValue.trim() });
    },
    [inputValue, updateFilter]
  );

  const facetEntries = useMemo(
    () =>
      Object.entries(facets)
        .sort((a, b) => b[1] - a[1])
        .filter(([key]) => TYPE_OPTIONS.includes(key as typeof TYPE_OPTIONS[number])),
    [facets]
  );

  return (
    <div className="space-y-6">
      <form
        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center"
        onSubmit={submitSearch}
      >
        <div className="flex-1">
          <label htmlFor="global-search-input" className="sr-only">
            Search
          </label>
          <input
            id="global-search-input"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="Search people, deals, cases, listings..."
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none md:w-36"
            placeholder="Owner ID"
            value={filters.ownerId ?? ''}
            onChange={(event) => updateFilter({ ownerId: event.target.value })}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none md:w-36"
            placeholder="Stage"
            value={filters.stage ?? ''}
            onChange={(event) => updateFilter({ stage: event.target.value })}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none md:w-36"
            placeholder="Status"
            value={filters.status ?? ''}
            onChange={(event) => updateFilter({ status: event.target.value })}
          />
        </div>
        <div className="flex gap-2 md:w-auto">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            Search
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            onClick={() => {
              setInputValue('');
              setFacets({});
              updateFilter({ q: '', ownerId: undefined, stage: undefined, status: undefined, types: undefined });
            }}
          >
            Clear
          </button>
        </div>
      </form>

      <div className="grid gap-6 md:grid-cols-[220px,1fr]">
        <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Types</h2>
            <button
              type="button"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
              onClick={clearTypes}
            >
              All
            </button>
          </div>
          <ul className="space-y-2 text-sm">
            {TYPE_OPTIONS.map((type) => {
              const count = facets[type] ?? 0;
              const isActive = !filters.types || filters.types.includes(type);
              return (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => toggleType(type)}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-brand-500',
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    <span className="truncate">{type.replace('re_', 'RE ')}</span>
                    <span className="ml-2 inline-flex min-w-[1.5rem] justify-end text-xs font-semibold text-slate-500">
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="space-y-4">
          {banner && <ErrorBanner {...banner} onDismiss={clearError} />}

          <ul
            data-testid="search-results"
            className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
          >
            {items.map((hit) => (
              <li key={`${hit.object}:${hit.id}`} className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">{hit.title}</h3>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {hit.object}
                  </span>
                </div>
                {hit.subtitle && (
                  <div className="text-xs text-slate-500">{hit.subtitle}</div>
                )}
                {hit.snippet && (
                  <div
                    className="prose prose-sm max-w-none text-slate-600"
                    dangerouslySetInnerHTML={{ __html: hit.snippet }}
                  />
                )}
                <div className="text-xs text-slate-400">
                  Updated {new Date(hit.updatedAt).toLocaleString()}
                </div>
              </li>
            ))}

            {items.length === 0 && !loading && (
              <li className="p-6 text-center text-sm text-slate-500">
                {filters.q.trim()
                  ? 'No results match your filters yet.'
                  : 'Enter a search term to get started.'}
              </li>
            )}
          </ul>

          {nextCursor && (
            <div className="flex justify-center">
              <LoadMoreButton
                hasNext={Boolean(nextCursor)}
                isLoading={loading}
                onClick={() => {
                  void load();
                }}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
