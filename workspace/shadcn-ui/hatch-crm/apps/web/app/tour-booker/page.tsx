import TourBookerForm from '@/components/tour-booker-form';
import { listContacts, listListings } from '@/lib/api';

export const dynamic = 'force-dynamic';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch';

export default async function TourBookerPage() {
  const [contacts, listings] = await Promise.all([
    listContacts(TENANT_ID),
    listListings(TENANT_ID)
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tour Booker</h1>
        <p className="mt-1 text-sm text-slate-500">Tours require an active buyer-rep agreement before confirmation.</p>
      </div>
      {contacts.length > 0 && listings.length > 0 ? (
        <TourBookerForm tenantId={TENANT_ID} contacts={contacts} listings={listings} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            {contacts.length === 0 && listings.length === 0
              ? 'No contacts or listings available. Please add contacts and listings first.'
              : contacts.length === 0
                ? 'No contacts available. Please add contacts first.'
                : 'No listings available. Please add listings first.'}
          </p>
        </div>
      )}
    </div>
  );
}
