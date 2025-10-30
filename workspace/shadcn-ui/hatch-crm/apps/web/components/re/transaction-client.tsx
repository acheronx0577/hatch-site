"use client";

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { ErrorBanner } from '@/components/error-banner';
import { useApiError } from '@/hooks/use-api-error';
import { useClearOnEdit } from '@/hooks/use-clear-on-edit';
import type { CommissionPreview, ReTransaction } from '@/lib/api/re.transactions';
import {
  updateTransactionMilestone,
  generateTransactionPayouts,
  getTransactionCommission
} from '@/lib/api/re.transactions';

interface TransactionClientProps {
  transaction: ReTransaction;
  initialCommission: CommissionPreview | null;
}

export default function TransactionClient({ transaction, initialCommission }: TransactionClientProps) {
  const router = useRouter();
  const [commission, setCommission] = useState<CommissionPreview | null>(initialCommission);
  const [milestoneName, setMilestoneName] = useState('Inspection');
  const [completedAt, setCompletedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { error, banner, showError, clearError } = useApiError();
  const clearOnEdit = useClearOnEdit(clearError, [error]);

  const submitMilestone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        await updateTransactionMilestone(transaction.id, {
          name: milestoneName,
          completedAt: completedAt || undefined,
          notes: notes || undefined
        });
        clearError();
        setMessage('Milestone updated');
        router.refresh();
      } catch (err) {
        showError(err);
        setMessage(null);
      }
    });
  };

  const refreshCommission = () =>
    startTransition(async () => {
      try {
        const preview = await getTransactionCommission(transaction.id);
        setCommission(preview);
      } catch (err) {
        showError(err);
      }
    });

  const triggerPayouts = () =>
    startTransition(async () => {
      try {
        await generateTransactionPayouts(transaction.id);
        setMessage('Payouts generated');
        clearError();
        router.refresh();
      } catch (err) {
        showError(err);
        setMessage(null);
      }
    });

  return (
    <div className="space-y-6">
      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stage</dt>
            <dd>{transaction.stage}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Listing</dt>
            <dd>
              {transaction.listing ? (
                <a href={`/re/listings/${transaction.listing.id}/offers`} className="text-brand-600 hover:underline">
                  {transaction.listing.id}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Milestone Checklist</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {transaction.milestoneChecklist.items.length === 0 && <li>No milestones recorded yet.</li>}
          {transaction.milestoneChecklist.items.map((item) => (
            <li key={item.name} className="flex justify-between rounded border border-slate-100 px-3 py-2">
              <span className="font-medium text-slate-700">{item.name}</span>
              <span className="text-xs text-slate-500">
                {item.completedAt ? `Completed ${new Date(item.completedAt).toLocaleDateString()}` : 'Pending'}
              </span>
            </li>
          ))}
        </ul>

        <form onSubmit={submitMilestone} className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr]">
          <div className="grid gap-2 text-sm">
            <label className="text-slate-600">
              Milestone Name
              <input
                required
                value={milestoneName}
                onChange={(event) => {
                  clearOnEdit();
                  setMilestoneName(event.target.value);
                }}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-slate-600">
              Completed At (optional)
              <input
                type="datetime-local"
                value={completedAt}
                onChange={(event) => {
                  clearOnEdit();
                  setCompletedAt(event.target.value);
                }}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-slate-600">
              Notes
              <textarea
                value={notes}
                onChange={(event) => {
                  clearOnEdit();
                  setNotes(event.target.value);
                }}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                rows={2}
              />
            </label>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save Milestone'}
            </button>
            <button
              type="button"
              onClick={refreshCommission}
              disabled={isPending}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Refresh Commission Preview
            </button>
            <button
              type="button"
              onClick={triggerPayouts}
              disabled={isPending}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Generate Payouts
            </button>
            {message && <span className="text-xs text-emerald-600">{message}</span>}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Commission Preview</h2>
        {commission ? (
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <p>
              Gross: <span className="font-semibold text-slate-800">{formatCurrency(commission.gross)}</span>
            </p>
            <p>
              Broker Share: <span className="font-semibold text-slate-800">{formatCurrency(commission.brokerAmount)}</span>
            </p>
            <p>
              Agent Share: <span className="font-semibold text-slate-800">{formatCurrency(commission.agentAmount)}</span>
            </p>
            {commission.schedule?.length ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {commission.schedule.map((entry) => (
                  <li key={`${entry.payee}-${entry.amount}`}>
                    {entry.payee}: {formatCurrency(entry.amount)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No commission data available yet.</p>
        )}
      </section>
    </div>
  );
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
