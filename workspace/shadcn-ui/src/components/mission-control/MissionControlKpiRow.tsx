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

const iconMap: Record<string, React.ReactNode> = {
  'active-agents': <Users className="h-4 w-4" />,
  'active-listings': <Home className="h-4 w-4" />,
  'deals-needing-review': <LineChart className="h-4 w-4" />,
  'new-leads': <Sparkles className="h-4 w-4" />,
  'compliance-flags': <ShieldCheck className="h-4 w-4" />
};

export const MissionControlKpiRow: React.FC<MissionControlKpiRowProps> = ({ items, loading, error }) => {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-[24px] border border-[color:var(--hatch-card-border)] bg-card/60 p-4 animate-pulse backdrop-blur-[var(--hatch-card-blur)]"
          >
            <div className="h-3 w-16 rounded bg-slate-200 mb-3" />
            <div className="h-8 w-16 rounded bg-slate-300 mb-2" />
            <div className="h-3 w-24 rounded bg-slate-200" />
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
        const cardClassName = cn(
          'group relative overflow-hidden rounded-[24px] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-card-alpha)] p-4 shadow-brand backdrop-blur-[var(--hatch-card-blur)] transition-all',
          'hover:-translate-y-0.5 hover:shadow-brand-md',
          item.href
            ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
            : null
        );

        const content = (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#1F5FFF] via-[#38BDF8] to-[#1F5FFF]" />
            <div className="pointer-events-none absolute -right-8 -bottom-10 h-24 w-24 rounded-full bg-sky-100/70 blur-2xl group-hover:opacity-80" />

            <div className="relative flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {item.label}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-[2px] text-[10px] text-slate-600">
                  <span className="text-slate-500">{iconMap[item.id] ?? <Sparkles className="h-3 w-3" />}</span>
                </span>
              </div>

              <div className="text-2xl md:text-3xl font-semibold leading-tight text-slate-900">{item.value}</div>

              {item.helperText ? <p className="text-[11px] text-slate-500">{item.helperText}</p> : null}
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
