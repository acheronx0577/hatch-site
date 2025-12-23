import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('hatch-shimmer rounded-md', className)} {...props} />;
}

export { Skeleton };
