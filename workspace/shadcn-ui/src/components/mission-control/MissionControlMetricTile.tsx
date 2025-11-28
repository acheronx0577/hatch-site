import React from 'react';

import { cn } from '@/lib/utils';

export type MetricTone = 'neutral' | 'muted' | 'success' | 'warning' | 'danger';

interface MissionControlMetricTileProps {
  label: string;
  value: string | number;
  tone?: MetricTone;
  className?: string;
}

const toneBg: Record<MetricTone, string> = {
  neutral: 'bg-slate-50',
  muted: 'bg-slate-100',
  success: 'bg-emerald-50',
  warning: 'bg-amber-50',
  danger: 'bg-rose-50'
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
    <div className={cn('rounded-2xl px-3 py-2.5 flex flex-col gap-1', toneBg[tone], className)}>
      <span className={cn('text-[11px] font-medium uppercase tracking-wide', toneLabel[tone])}>{label}</span>
      <span className={cn('text-lg font-semibold leading-tight', toneValue[tone])}>{value}</span>
    </div>
  );
};
