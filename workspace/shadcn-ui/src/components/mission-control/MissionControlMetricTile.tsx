import React from 'react';

import { cn } from '@/lib/utils';

export type MetricTone = 'neutral' | 'muted' | 'success' | 'warning' | 'danger';

interface MissionControlMetricTileProps {
  label: string;
  value: string | number;
  tone?: MetricTone;
  className?: string;
}

const toneTint: Record<MetricTone, string> = {
  neutral: 'from-white/0',
  muted: 'from-slate-500/5',
  success: 'from-emerald-500/10',
  warning: 'from-amber-500/10',
  danger: 'from-rose-500/10'
};

const toneLabel: Record<MetricTone, string> = {
  neutral: 'text-slate-500',
  muted: 'text-slate-600',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-rose-700'
};

const toneValue: Record<MetricTone, string> = {
  neutral: 'text-slate-900',
  muted: 'text-slate-900',
  success: 'text-emerald-900',
  warning: 'text-amber-900',
  danger: 'text-rose-900'
};

export const MissionControlMetricTile: React.FC<MissionControlMetricTileProps> = ({
  label,
  value,
  tone = 'neutral',
  className
}) => {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border border-white/20 bg-card/[var(--hatch-glass-alpha-recessed)] px-4 py-3 backdrop-blur-md',
        'bg-gradient-to-br to-white/0',
        toneTint[tone],
        className
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
        <span
          className={cn(
            'min-w-0 text-[11px] font-semibold uppercase tracking-[0.12em] leading-snug',
            'whitespace-normal break-words',
            toneLabel[tone]
          )}
        >
          {label}
        </span>
        <span className={cn('text-right text-xl font-semibold leading-none tabular-nums', toneValue[tone])}>
          {value}
        </span>
      </div>
    </div>
  );
};
