import React from 'react';

import { cn } from '@/lib/utils';

export type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'muted';

export interface MetricPillProps {
  label: string;
  value: string | number;
  tone?: MetricTone;
  className?: string;
  onClick?: () => void;
}

const toneClasses: Record<MetricTone, string> = {
  default: 'bg-slate-50 text-slate-900 border-slate-200',
  success: 'bg-emerald-50 text-emerald-900 border-emerald-100',
  warning: 'bg-amber-50 text-amber-900 border-amber-100',
  danger: 'bg-rose-50 text-rose-900 border-rose-100',
  muted: 'bg-slate-100 text-slate-700 border-slate-200'
};

export const MetricPill: React.FC<MetricPillProps> = ({ label, value, tone = 'default', className, onClick }) => {
  const content = (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-2xl border px-3 py-2 transition-all',
        'shadow-[0_8px_20px_rgba(15,23,42,0.02)] hover:shadow-[0_12px_30px_rgba(15,23,42,0.06)]',
        'cursor-default',
        toneClasses[tone],
        className
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500/80">{label}</span>
      <span className="text-lg font-semibold leading-tight">{value}</span>
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left">
        {content}
      </button>
    );
  }

  return content;
};
