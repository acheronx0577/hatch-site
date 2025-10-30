'use client';

import { useState } from 'react';

import { ErrorBanner } from '@/components/error-banner';
import { useApiError } from '@/hooks/use-api-error';
import { useClearOnEdit } from '@/hooks/use-clear-on-edit';
import { requestTour, type ContactListItem, type ListingSummary } from '@/lib/api';

interface TourBookerFormProps {
  tenantId: string;
  contacts: Array<Pick<ContactListItem, 'id' | 'firstName' | 'lastName'>>;
  listings: Array<Pick<ListingSummary, 'id' | 'addressLine1' | 'city' | 'state'>>;
}

export default function TourBookerForm({ tenantId, contacts, listings }: TourBookerFormProps) {
  const [contactId, setContactId] = useState(contacts[0]?.id ?? '');
  const [listingId, setListingId] = useState(listings[0]?.id ?? '');
  const [startAt, setStartAt] = useState(new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 16));
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { error, banner, showError, clearError } = useApiError();
  const clearOnEdit = useClearOnEdit(clearError, [error]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    clearError();

    try {
      const payload = {
        tenantId,
        personId: contactId,
        listingId,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(new Date(startAt).getTime() + 3600000).toISOString()
      };
      const result = await requestTour(payload);
      setStatus(`Tour ${result.status} for contact`);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {banner && <ErrorBanner {...banner} onDismiss={clearError} />}
      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Contact</label>
        <select
          className="mt-1 w-full rounded border border-slate-200 p-2"
          value={contactId}
          onChange={(event) => {
            clearOnEdit();
            setContactId(event.target.value);
          }}
        >
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.firstName} {contact.lastName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Listing</label>
        <select
          className="mt-1 w-full rounded border border-slate-200 p-2"
          value={listingId}
          onChange={(event) => {
            clearOnEdit();
            setListingId(event.target.value);
          }}
        >
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>
              {listing.addressLine1}, {listing.city}, {listing.state}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Start Time</label>
        <input
          type="datetime-local"
          className="mt-1 w-full rounded border border-slate-200 p-2"
          value={startAt}
          onChange={(event) => {
            clearOnEdit();
            setStartAt(event.target.value);
          }}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !contactId || !listingId}
        className="w-full rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Request Tour
      </button>

      {status && <p className="text-xs text-emerald-600">{status}</p>}
    </form>
  );
}
