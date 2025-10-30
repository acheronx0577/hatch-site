'use client';

import { FormEvent, useState, useTransition } from 'react';

import { ErrorBanner } from '@/components/error-banner';
import { useApiError } from '@/hooks/use-api-error';
import { submitDealDeskRequest } from '@/lib/api/deal-desk';

interface DealDeskRequestFormProps {
  opportunityId: string;
  defaultAmount?: number | null;
}

export function DealDeskRequestForm({ opportunityId, defaultAmount }: DealDeskRequestFormProps) {
  const [amount, setAmount] = useState<string>(
    typeof defaultAmount === 'number' ? String(defaultAmount) : ''
  );
  const [discountPct, setDiscountPct] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { banner, showError, clearError } = useApiError();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        clearError();
        await submitDealDeskRequest({
          opportunityId,
          amount: amount ? Number(amount) : undefined,
          discountPct: discountPct ? Number(discountPct) : undefined,
          reason: reason || undefined
        });
        setMessage('Submitted for approval');
      } catch (err) {
        showError(err);
        setMessage(null);
      }
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Deal Desk</h2>
          <p className="text-xs text-slate-500">Request approval for non-standard pricing.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {banner && <ErrorBanner {...banner} onDismiss={clearError} />}
        <label className="flex flex-col text-sm text-slate-600">
          Amount (optional override)
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1 rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col text-sm text-slate-600">
          Discount %
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={discountPct}
            onChange={(event) => setDiscountPct(event.target.value)}
            className="mt-1 rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col text-sm text-slate-600">
          Reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 rounded border border-slate-300 px-3 py-2"
            rows={3}
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Submit Request
        </button>
      </form>

      {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
    </div>
  );
}

export default DealDeskRequestForm;
