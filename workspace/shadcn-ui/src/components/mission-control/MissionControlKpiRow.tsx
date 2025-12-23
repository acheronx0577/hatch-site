import React from 'react';
import { Link } from 'react-router-dom';
import { Home, LineChart, ShieldCheck, Sparkles, Users } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface KpiItem {
  id: string;
  label: string;
  value: string | number;
  helperText?: string;
  href?: string;
}

interface MissionControlKpiRowProps {
  items: KpiItem[];
  loading?: boolean;
  error?: string | null;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'active-agents': Users,
  'active-listings': Home,
  'deals-needing-review': LineChart,
  'new-leads': Sparkles,
  'compliance-flags': ShieldCheck
};

export const MissionControlKpiRow: React.FC<MissionControlKpiRowProps> = ({ items, loading, error }) => {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-card-alpha)] p-5 backdrop-blur-[var(--hatch-card-blur)]"
          >
            <div className="hatch-shimmer mb-3 h-3 w-16 rounded" />
            <div className="hatch-shimmer mb-2 h-8 w-16 rounded" />
            <div className="hatch-shimmer h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-800">
        We couldn't load your overview. Please refresh or try again.
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => {
        const Icon = iconMap[item.id] ?? Sparkles;
        const cardClassName = cn(
          'group relative flex min-h-[116px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-card-alpha)] p-5 shadow-brand backdrop-blur-[var(--hatch-card-blur)]',
          'transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-brand-md',
          item.href
            ? 'cursor-pointer hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            : null
        );

        const content = (
          <>
            <div className="pointer-events-none absolute -right-10 -bottom-12 h-28 w-28 rounded-full bg-sky-200/60 blur-2xl transition-opacity duration-200 group-hover:opacity-80 dark:bg-sky-400/15" />
            <Icon className="pointer-events-none absolute -right-5 -top-5 h-20 w-20 text-slate-200/60 dark:text-white/10" />

            <div className="relative flex flex-1 flex-col gap-2">
              <span className="min-h-[26px] text-[11px] font-semibold uppercase tracking-[0.14em] leading-[1.1] text-slate-500">
                {item.label}
              </span>

              <div className="text-3xl font-semibold leading-none tabular-nums text-slate-900">{item.value}</div>

              {item.helperText ? <p className="mt-auto text-[11px] text-slate-500">{item.helperText}</p> : null}
            </div>
          </>
        );

        if (item.href) {
          return (
            <Link key={item.id} to={item.href} aria-label={item.label} className={cardClassName}>
              {content}
            </Link>
          );
        }

        return (
          <article key={item.id} className={cardClassName}>
            {content}
          </article>
        );
      })}
    </div>
  );
};
