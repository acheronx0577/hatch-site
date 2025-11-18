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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">People</h1>
          <p className="text-sm text-slate-500">Search, filter, and take consent-aware actions.</p>
        </div>
        <Link
          href="/tour-booker"
          className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow"
        >
          Book Tour
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
            {contactsList.map((contact) => (
              <tr key={contact.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700">
                  {contact.firstName} {contact.lastName}
                </td>
                <td className="px-4 py-3 text-xs uppercase tracking-wide text-slate-500">{contact.stage}</td>
                <td className="px-4 py-3 text-slate-500">{contact.primaryEmail ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{contact.primaryPhone ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/people/${contact.id}`}
                    className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
