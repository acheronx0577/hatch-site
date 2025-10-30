'use client';

import clsx from 'clsx';
import { useEffect, useRef } from 'react';

interface ErrorBannerProps {
  title: string;
  detail?: string;
  status?: number;
  code?: string;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({
  title,
  detail,
  status,
  code,
  onDismiss,
  className
}: ErrorBannerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      aria-live="assertive"
      className={clsx(
        'flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 shadow-sm outline-none',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-semibold">{title}</p>
          {detail ? <p className="mt-1 text-xs text-rose-700/80">{detail}</p> : null}
          {(code || status) && (
            <p className="mt-1 text-[10px] uppercase tracking-wide text-rose-500">
              {[status ? `Status ${status}` : null, code ? `Code ${code}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-transparent px-2 py-1 text-xs font-semibold text-rose-700 hover:border-rose-300 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400"
            aria-label="Dismiss error notification"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
