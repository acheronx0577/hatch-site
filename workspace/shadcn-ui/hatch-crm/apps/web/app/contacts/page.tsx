import ContactsTable from '@/components/contacts-table';
import { listContacts } from '@/lib/api';
import { resolveLayout } from '@/lib/api/admin.layouts';

export const dynamic = 'force-dynamic';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch';
const CONTACTS_PAGE_SIZE = 50;

export default async function ContactsPage() {
  const [contacts, manifest] = await Promise.all([
    listContacts(TENANT_ID, { limit: CONTACTS_PAGE_SIZE }),
    resolveLayout({ object: 'contacts', kind: 'list' }).catch(() => null)
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Contacts</h1>
        <p className="text-sm text-slate-500">
          Manage your relationships and see key communication details aligned with your layout preferences.
        </p>
      </div>

      <ContactsTable
        tenantId={TENANT_ID}
        initialItems={contacts.items}
        initialNextCursor={contacts.nextCursor ?? null}
        pageSize={CONTACTS_PAGE_SIZE}
        initialManifest={manifest ?? undefined}
      />
    </div>
  );
}
