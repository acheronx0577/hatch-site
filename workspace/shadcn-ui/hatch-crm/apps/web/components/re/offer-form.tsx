"use client";

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { ErrorBanner } from '@/components/error-banner';
import { useApiError } from '@/hooks/use-api-error';
import { useClearOnEdit } from '@/hooks/use-clear-on-edit';
import { createReOffer } from '@/lib/api/re.offers';

interface OfferFormProps {
  listingId: string;
}

export function OfferForm({ listingId }: OfferFormProps) {
  const router = useRouter();
  const [buyerContactId, setBuyerContactId] = useState('');
  const [amount, setAmount] = useState('');
  const [contingencies, setContingencies] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { error, banner, showError, clearError } = useApiError();
  const clearOnEdit = useClearOnEdit(clearError, [error]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const amountNumber = Number(amount);
        if (!Number.isFinite(amountNumber)) {
          throw new Error('Amount must be a number');
        }

        await createReOffer({
          listingId,
          buyerContactId,
          amount: amountNumber,
          contingencies: parseContingencies(contingencies)
        });

        setBuyerContactId('');
        setAmount('');
        setContingencies('');
        clearError();
        setMessage('Offer submitted for review');
        router.refresh();
      } catch (err) {
        showError(err);
        setMessage(null);
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}
      <div>
        <label className="block text-sm font-medium text-slate-600">
          Buyer Contact ID
          <input
            required
            value={buyerContactId}
            onChange={(event) => {
              clearOnEdit();
              setBuyerContactId(event.target.value);
            }}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="person-id"
          />
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-600">
          Offer Amount
          <input
            required
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => {
              clearOnEdit();
              setAmount(event.target.value);
            }}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="250000"
          />
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-600">
          Contingencies (comma separated)
          <textarea
            value={contingencies}
            onChange={(event) => {
              clearOnEdit();
              setContingencies(event.target.value);
            }}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            rows={2}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? 'Submitting…' : 'Submit Offer'}
        </button>
        {message && <span className="text-sm text-emerald-600">{message}</span>}
      </div>
    </form>
  );
}

const parseContingencies = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export default OfferForm;
