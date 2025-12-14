'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-amber-600">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm font-semibold">Something went wrong</p>
        </div>
        <p className="text-sm text-slate-600">
          We hit an unexpected error. Try again, and if it keeps happening please let us know.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button className="gap-2" onClick={() => reset()}>
            <RefreshCcw className="h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" asChild>
            <a href="/">Go home</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
