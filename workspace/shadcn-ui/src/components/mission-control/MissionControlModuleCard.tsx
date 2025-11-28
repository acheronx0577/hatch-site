import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { MetricPill, MetricTone } from './MetricPill';

type ModuleMetric = {
  id: string;
  label: string;
  value: string | number;
  variant?: 'neutral' | 'success' | 'warning' | 'danger' | 'muted';
};

interface MissionControlModuleCardProps {
  id: string;
  title: string;
  subtitle?: string;
  metrics: ModuleMetric[];
  defaultOpen?: boolean;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
}

const toneMap: Record<NonNullable<ModuleMetric['variant']>, MetricTone> = {
  neutral: 'default',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  muted: 'muted'
};

export const MissionControlModuleCard: React.FC<MissionControlModuleCardProps> = ({
  id,
  title,
  subtitle,
  metrics,
  defaultOpen = true,
  loading,
  error,
  emptyMessage = 'Nothing to show yet.'
}) => {
  const [open, setOpen] = React.useState(defaultOpen);
  const hasMetrics = metrics && metrics.length > 0;

  return (
    <section
      aria-labelledby={id}
      className="rounded-[24px] border border-slate-200/70 bg-white/90 p-4 md:p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <h2 id={id} className="text-sm md:text-base font-semibold text-slate-900">
            {title}
          </h2>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="ml-4 flex items-center gap-2">
          {loading ? <span className="text-xs text-slate-400">Loading...</span> : null}
          {error && !open ? <span className="text-xs text-rose-500">Error</span> : null}
          {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {open ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={`mc-module-skel-${idx}`} className="flex flex-col gap-1 rounded-2xl bg-slate-50 p-3 animate-pulse">
                  <div className="h-3 w-24 rounded bg-slate-200" />
                  <div className="h-5 w-12 rounded bg-slate-300" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          ) : !hasMetrics ? (
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">{emptyMessage}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {metrics.map((metric) => (
                <MetricPill
                  key={metric.id}
                  label={metric.label}
                  value={metric.value}
                  tone={metric.variant ? toneMap[metric.variant] : 'default'}
                  className="h-full"
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};
