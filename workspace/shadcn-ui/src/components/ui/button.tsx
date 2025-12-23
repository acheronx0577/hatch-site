import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-sm font-semibold tracking-tight antialiased [text-rendering:geometricPrecision] ' +
    'transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-200 ease-out ' +
    'motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 ' +
    'ring-offset-background focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-[var(--focus-ring-offset)] ' +
    'disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-gradient text-ink-50 shadow-brand hover:shadow-brand-md hover:brightness-[1.03]',
        destructive: 'bg-destructive text-destructive-foreground shadow-brand hover:bg-destructive/88 hover:shadow-brand-md',
        outline:
          'border border-[var(--glass-border)] bg-white/25 text-ink-700 shadow-none backdrop-blur-xl hover:bg-white/35 hover:text-ink-900 hover:shadow-brand dark:bg-white/10 dark:text-ink-100 dark:hover:bg-white/15',
        secondary:
          'border border-[var(--glass-border)] bg-white/35 text-ink-800 shadow-brand hover:bg-white/45 hover:shadow-brand-md dark:bg-white/10 dark:text-ink-100 dark:hover:bg-white/15',
        ghost: 'bg-transparent text-ink-700 shadow-none hover:bg-white/25 hover:text-ink-900 dark:text-ink-100 dark:hover:bg-white/10',
        link: 'text-brand-blue-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-6',
        sm: 'h-9 px-4 text-sm',
        lg: 'h-12 px-8 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
