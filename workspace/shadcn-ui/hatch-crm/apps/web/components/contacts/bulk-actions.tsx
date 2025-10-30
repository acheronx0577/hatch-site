'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { ApiError } from '@/lib/api/errors';
import { updateContact } from '@/lib/api';

type PendingAction = 'assign' | 'note' | null;

export interface ContactsBulkActionsProps {
  tenantId: string;
  selectedIds: string[];
  onComplete: () => void;
}

export function ContactsBulkActions({ tenantId, selectedIds, onComplete }: ContactsBulkActionsProps) {
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = selectedIds.length > 0;

  const run = async (action: PendingAction, fn: () => Promise<void>) => {
    if (!hasSelection) {
      return;
    }
    setPending(action);
    setError(null);
    try {
      await fn();
      onComplete();
      if (action === 'assign') {
        setOwnerId('');
      }
      if (action === 'note') {
        setNote('');
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message ?? 'Bulk action failed'
          : err instanceof Error
          ? err.message
          : 'Bulk action failed';
      setError(message);
    } finally {
      setPending(null);
    }
  };

  const handleAssign = () => {
    const trimmed = ownerId.trim();
    if (!trimmed) {
      setError('Enter an owner ID to assign.');
      return;
    }
    void run('assign', async () => {
      await Promise.all(
        selectedIds.map((id) =>
          updateContact(id, {
            tenantId,
            ownerId: trimmed
          })
        )
      );
    });
  };

  const handleNote = () => {
    const trimmed = note.trim();
    if (!trimmed) {
      setError('Enter a note before submitting.');
      return;
    }
    void run('note', async () => {
      await Promise.all(
        selectedIds.map((id) =>
          updateContact(id, {
            tenantId,
            notes: trimmed
          })
        )
      );
    });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex items-center gap-2 text-slate-600">
        <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
          {selectedIds.length}
        </span>
        <span className="font-semibold uppercase tracking-wide text-slate-500">Selected</span>
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <input
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            placeholder="Owner ID"
            className="h-8 rounded border border-slate-300 px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="button"
            onClick={handleAssign}
            disabled={!hasSelection || pending === 'assign'}
            className="inline-flex h-8 items-center rounded bg-brand-600 px-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === 'assign' && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Assign owner
          </button>
        </div>

        <div className="flex flex-1 items-center gap-2">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add quick note"
            className="h-8 flex-1 rounded border border-slate-300 px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="button"
            onClick={handleNote}
            disabled={!hasSelection || pending === 'note'}
            className="inline-flex h-8 items-center rounded border border-brand-600 px-3 text-xs font-semibold uppercase tracking-wide text-brand-600 transition hover:border-brand-700 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === 'note' && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Add note
          </button>
        </div>
      </div>

      {error && <p className="w-full text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export default ContactsBulkActions;

