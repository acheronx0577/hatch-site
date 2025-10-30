import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-sm font-semibold tracking-tight transition-all duration-200 ease-[var(--motion-ease-standard)] ring-offset-background focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-[var(--focus-ring-offset)] disabled:pointer-events-none disabled:opacity-60 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-gradient text-ink-50 shadow-brand hover:shadow-brand-md hover:brightness-[1.05]',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/85 shadow-brand',
        outline:
          'border-[1.5px] border-brand-blue-600 bg-background text-brand-blue-700 hover:bg-brand-blue-600/5 hover:text-brand-blue-700',
        secondary:
          'bg-ink-75 text-ink-700 shadow-brand hover:bg-ink-100',
        ghost: 'bg-transparent text-ink-600 hover:bg-ink-75',
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
