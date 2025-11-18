import Link from 'next/link';

import { listContacts } from '@/lib/api';

export const dynamic = 'force-dynamic';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch';

export default async function PeoplePage() {
  const contacts = await listContacts(TENANT_ID);

  // Ensure contacts is always an array
  const contactsList = Array.isArray(contacts) ? contacts : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">People</h1>
          <p className="text-sm text-slate-500">Search, filter, and take consent-aware actions.</p>
        </div>
        <Link
          href="/tour-booker"
          className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow transition-colors hover:bg-brand-700"
        >
          Book Tour
        </Link>
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Stage</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Phone</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contactsList.length > 0 ? (
              contactsList.map((contact) => (
                <tr key={contact.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">
                    {contact.firstName} {contact.lastName}
                  </td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">{contact.stage}</td>
                  <td className="px-4 py-3 text-slate-500">
                    <span className="truncate block max-w-xs">{contact.primaryEmail ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{contact.primaryPhone ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/people/${contact.id}`}
                      className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                      aria-label={`Open ${contact.firstName} ${contact.lastName}`}
                    >
                      Open
                    </Link>                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                  No contacts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-3 sm:hidden">
        {contactsList.length > 0 ? (
          contactsList.map((contact) => (
            <div key={contact.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-slate-900">
                    {contact.firstName} {contact.lastName}
                  </h3>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{contact.stage}</p>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {contact.primaryEmail && (
                      <p className="truncate">
                        <span className="font-medium">Email:</span> {contact.primaryEmail}
                      </p>
                    )}
                    {contact.primaryPhone && (
                      <p>
                        <span className="font-medium">Phone:</span> {contact.primaryPhone}
                      </p>
                    )}
                  </div>
                </div>
                <Link
                  href={`/people/${contact.id}`}
                  className="ml-4 rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                  aria-label={`Open ${contact.firstName} ${contact.lastName}`}
                >
                  Open
                </Link>              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-500">No contacts found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
