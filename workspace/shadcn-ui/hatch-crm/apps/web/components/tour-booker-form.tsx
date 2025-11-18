'use client';

import { useState } from 'react';

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);

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
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="text-xs font-semibold uppercase text-slate-500">Contact</label>
        <select
          className="mt-1 w-full rounded border border-slate-200 bg-white p-2 text-slate-900"
          value={contactId}
          onChange={(event) => setContactId(event.target.value)}
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
          className="mt-1 w-full rounded border border-slate-200 bg-white p-2 text-slate-900"
          value={listingId}
          onChange={(event) => setListingId(event.target.value)}
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
          className="mt-1 w-full rounded border border-slate-200 bg-white p-2 text-slate-900"
          value={startAt}
          onChange={(event) => setStartAt(event.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !contactId || !listingId}
        className="w-full rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Request Tour
      </button>

      {status && <p className="text-xs text-slate-500">{status}</p>}
    </form>
  );
}
