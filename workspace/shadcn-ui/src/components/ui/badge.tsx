import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-none tracking-[0.02em] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[color:var(--focus-ring)] focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/92',
        secondary: 'border-[var(--glass-border)] bg-white/35 text-ink-700 hover:bg-white/45 dark:bg-white/10 dark:text-ink-100 dark:hover:bg-white/15',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/92',
        outline: 'border-[var(--glass-border)] bg-transparent text-ink-700 hover:bg-white/25 dark:text-ink-100 dark:hover:bg-white/10',
        success: 'border-emerald-200/70 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-200',
        warning: 'border-amber-200/70 bg-amber-500/10 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-200',
        danger: 'border-rose-200/70 bg-rose-500/10 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/15 dark:text-rose-200',
        info: 'border-sky-200/70 bg-sky-500/10 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-200',
        neutral: 'border-slate-200/70 bg-slate-500/10 text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-ink-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
