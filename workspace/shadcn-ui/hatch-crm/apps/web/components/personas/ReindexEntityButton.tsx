"use client";

import { useState } from 'react';

import { reindexEntity } from '@/lib/api/index';

type Props = {
  entityType: 'client' | 'lead';
  entityId: string;
  className?: string;
};

export function ReindexEntityButton({ entityType, entityId, className }: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await reindexEntity(entityType, entityId);
      setStatus('Reindex queued');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to enqueue reindex');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="text-xs font-semibold text-emerald-600 transition hover:text-emerald-700 disabled:text-slate-400"
      >
        {busy ? 'Reindexing…' : 'Reindex'}
      </button>
      {status && <span className="text-[11px] text-slate-500">{status}</span>}
    </div>
  );
}
