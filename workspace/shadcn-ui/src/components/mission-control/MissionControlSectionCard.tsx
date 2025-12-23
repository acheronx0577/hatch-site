import React from 'react';

import { cn } from '@/lib/utils';

interface SectionCardProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
  children: React.ReactNode;
}

export const MissionControlSectionCard: React.FC<SectionCardProps> = ({
  title,
  subtitle,
  actionLabel,
  actionHref,
  className,
  children,
  ...rest
}) => {
  return (
    <section
      {...rest}
      className={cn(
        'relative overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-card-alpha)] p-6 shadow-brand backdrop-blur-[var(--hatch-card-blur)]',
        className
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="text-lg font-medium text-slate-900">{title}</h2>
          {subtitle ? <p className="text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>

        {actionLabel && actionHref ? (
          <a
            href={actionHref}
            className="text-[11px] font-semibold text-brand-blue-600 transition-colors duration-200 hover:text-brand-blue-700 hover:underline"
          >
            {actionLabel}
          </a>
        ) : null}
      </header>

      {children}
    </section>
  );
};
