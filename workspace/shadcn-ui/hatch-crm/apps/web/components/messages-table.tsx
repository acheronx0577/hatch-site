'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import {
  listMessages,
  type MessageChannel,
  type MessageListItem
} from '@/lib/api/messages';
import { useCursorPager } from '@/lib/pagination/useCursorPager';

type ChannelFilter = 'all' | MessageChannel;
type DirectionFilter = 'all' | 'INBOUND' | 'OUTBOUND';

interface MessagesTableProps {
  initialItems: MessageListItem[];
  initialNextCursor: string | null;
  pageSize: number;
  initialQuery?: string;
  initialChannel?: ChannelFilter;
  initialDirection?: DirectionFilter;
}

const channelLabels: Record<ChannelFilter, string> = {
  all: 'All channels',
  SMS: 'SMS',
  EMAIL: 'Email',
  PUSH: 'Push',
  IN_APP: 'In-app',
  VOICE: 'Voice'
};

const directionLabels: Record<DirectionFilter, string> = {
  all: 'Any direction',
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound'
};

const trimBody = (body: string | null | undefined) => {
  if (!body) {
    return '—';
  }
  return body.length > 80 ? `${body.slice(0, 77)}…` : body;
};

export function MessagesTable({
  initialItems,
  initialNextCursor,
  pageSize,
  initialQuery = '',
  initialChannel = 'all',
  initialDirection = 'all'
}: MessagesTableProps) {
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [channel, setChannel] = useState<ChannelFilter>(initialChannel);
  const [direction, setDirection] = useState<DirectionFilter>(initialDirection);
  const firstRenderRef = useRef(true);

  const fetcher = useCallback(
    (cursor: string | null, signal?: AbortSignal) => {
      return listMessages({
        cursor,
        limit: pageSize,
        q: query.trim() ? query.trim() : undefined,
        channel,
        direction,
        signal
      });
    },
    [query, channel, direction, pageSize]
  );

  const { items, nextCursor, load, reset, loading, error } = useCursorPager(fetcher, {
    initialItems,
    initialCursor: initialNextCursor
  });

  const { banner, showError, clearError } = useApiError();

  useEffect(() => {
    if (!error) {
      return;
    }
    showError(error);
  }, [error, showError]);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    reset([], null);
    clearError();
    void load();
  }, [query, channel, direction, reset, load, clearError]);

  const hasNext = useMemo(() => Boolean(nextCursor), [nextCursor]);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = searchValue.trim();
      if (trimmed === query.trim()) {
        return;
      }
      setQuery(trimmed);
    },
    [searchValue, query]
  );

  const onLoadMore = useCallback(async () => {
    const page = await load();
    if (page) {
      clearError();
    }
  }, [load, clearError]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-2 md:flex-row md:items-center">
          <label className="flex-1 text-sm font-medium text-slate-600">
            <span className="sr-only">Search messages</span>
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by recipient, sender, or subject"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none"
              disabled={loading}
            />
          </label>
          <button
            type="submit"
            className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            Search
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <label className="flex items-center gap-2">
            Channel
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value as ChannelFilter)}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none"
              disabled={loading}
            >
              {(Object.keys(channelLabels) as ChannelFilter[]).map((value) => (
                <option key={value} value={value}>
                  {channelLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Direction
            <select
              value={direction}
              onChange={(event) => setDirection(event.target.value as DirectionFilter)}
              className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none"
              disabled={loading}
            >
              {(Object.keys(directionLabels) as DirectionFilter[]).map((value) => (
                <option key={value} value={value}>
                  {directionLabels[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Direction</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Subject / Body</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No messages match your filters yet.
                </td>
              </tr>
            )}
            {items.map((message) => (
              <tr key={message.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{channelLabels[message.channel]}</td>
                <td className="px-4 py-3">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
                      message.direction === 'OUTBOUND'
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {directionLabels[message.direction]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {message.toAddress ?? message.personId ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {message.subject ? (
                    <div className="space-y-1">
                      <div className="font-medium text-slate-700">{message.subject}</div>
                      <div className="text-slate-500">{trimBody(message.body)}</div>
                    </div>
                  ) : (
                    trimBody(message.body)
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {message.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col items-end gap-3 border-t border-slate-100 bg-slate-50 p-3">
          {banner && <ErrorBanner {...banner} onDismiss={clearError} />}
          <LoadMoreButton hasNext={hasNext} isLoading={loading} onClick={onLoadMore} />
        </div>
      </div>
    </div>
  );
}
