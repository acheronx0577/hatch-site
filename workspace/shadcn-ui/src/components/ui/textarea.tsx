import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[96px] w-full rounded-xl border border-[var(--glass-border)] bg-white/25 px-3 py-2 text-sm text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-xl ring-offset-background placeholder:text-ink-500/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-[var(--focus-ring-offset)] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-ink-100 dark:placeholder:text-ink-100/60',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
