'use client';

import Image from 'next/image';
import { useEffect, type ReactNode } from 'react';
import { Heart, SendHorizonal } from 'lucide-react';

import { useContactListings } from '@/hooks/useContactListings';

interface ListingsPanelsProps {
  contactId: string;
}

export function ListingsPanels({ contactId }: ListingsPanelsProps) {
  const {
    sent,
    favorites,
    loadSent,
    loadFavorites,
    reset,
    loadingSent,
    loadingFav,
    canLoadMoreSent,
    canLoadMoreFavorites
  } = useContactListings(contactId);

  useEffect(() => {
    reset();
  }, [contactId, reset]);

  useEffect(() => {
    if (sent.length === 0 && !loadingSent) {
      void loadSent();
    }
  }, [loadSent, loadingSent, sent.length]);

  useEffect(() => {
    if (favorites.length === 0 && !loadingFav) {
      void loadFavorites();
    }
  }, [favorites.length, loadFavorites, loadingFav]);

  return (
    <div className="space-y-6">
      <PropertyRail
        title="Homes sent"
        icon={<SendHorizonal className="h-4 w-4 text-brand-600" />}
        helper="Curated listings the lead has received recently."
        items={sent.map((item) => ({
          id: item.id,
          address: item.address ?? 'Address unavailable',
          price: formatPrice(item.price),
          status: item.status ?? null,
          timestamp: item.sent_at ? new Date(item.sent_at).toLocaleDateString() : null,
          image: item.photoUrl ?? null
        }))}
        emptyMessage="No homes sent yet — share curated options to spark momentum."
        onLoadMore={canLoadMoreSent ? () => void loadSent() : undefined}
        loading={loadingSent}
      />

      <PropertyRail
        title="Favorites"
        icon={<Heart className="h-4 w-4 text-rose-500" />}
        helper="Saved homes that signal buyer intent."
        items={favorites.map((item) => ({
          id: item.id,
          address: item.address ?? 'Address unavailable',
          price: formatPrice(item.price),
          status: item.status ?? null,
          timestamp: item.favorited_at ? new Date(item.favorited_at).toLocaleDateString() : null,
          image: item.photoUrl ?? null
        }))}
        emptyMessage="No requests captured yet — you’ll see inbound signals here once a buyer engages."
        onLoadMore={canLoadMoreFavorites ? () => void loadFavorites() : undefined}
        loading={loadingFav}
      />
    </div>
  );
}

interface PropertyRailProps {
  title: string;
  helper: string;
  icon: ReactNode;
  items: Array<{
    id: string;
    address: string;
    price: string;
    status: string | null;
    timestamp: string | null;
    image: string | null;
  }>;
  emptyMessage: string;
  onLoadMore?: () => void;
  loading: boolean;
}

function PropertyRail({
  title,
  helper,
  icon,
  items,
  emptyMessage,
  onLoadMore,
  loading
}: PropertyRailProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              {icon}
            </span>
            {title}
          </p>
          <p className="text-xs text-slate-500">{helper}</p>
        </div>
        {items.length > 0 ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
            {items.length}
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {items.map((item) => (
            <article
              key={item.id}
              className="min-w-[200px] flex-1 cursor-pointer rounded-xl border border-slate-200/60 bg-white/70 transition hover:bg-slate-50"
            >
            {item.image ? (
              <Image
                src={item.image}
                alt=""
                width={224}
                height={120}
                unoptimized
                className="h-28 w-full rounded-t-xl object-cover"
              />
            ) : (
              <div className="flex h-28 w-full items-center justify-center rounded-t-xl bg-slate-100 text-xs font-medium text-slate-500">
                No image available
              </div>
            )}
            <div className="space-y-1.5 p-3">
              <p className="line-clamp-2 text-sm font-medium text-slate-800">{item.address}</p>
              <p className="text-sm font-semibold text-slate-900">{item.price}</p>
              <p className="text-xs text-slate-500">
                {item.status ? item.status : 'Status unknown'}
                {item.timestamp ? ` · ${item.timestamp}` : ''}
              </p>
            </div>
          </article>
        ))}
      </div>
      )}

      {onLoadMore ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Load more homes'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatPrice(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}
