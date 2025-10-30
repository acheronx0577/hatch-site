'use client';

import clsx from 'clsx';
import { forwardRef } from 'react';

interface LoadMoreButtonProps {
  hasNext: boolean;
  isLoading: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  className?: string;
}

export const LoadMoreButton = forwardRef<HTMLButtonElement, LoadMoreButtonProps>(
  ({ hasNext, isLoading, onClick, children, className }, ref) => {
    if (!hasNext) {
      return null;
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={clsx(
          'rounded border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
        disabled={isLoading}
      >
        {isLoading ? 'Loading…' : children ?? 'Load more'}
      </button>
    );
  }
);

LoadMoreButton.displayName = 'LoadMoreButton';
