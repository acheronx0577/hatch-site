import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-xl border border-[var(--glass-border)] bg-white/25 px-3 py-2 text-sm text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-xl ring-offset-background placeholder:text-ink-500/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-[var(--focus-ring-offset)] disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink-900 dark:bg-white/10 dark:text-ink-100 dark:placeholder:text-ink-100/60 dark:file:text-ink-100',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
