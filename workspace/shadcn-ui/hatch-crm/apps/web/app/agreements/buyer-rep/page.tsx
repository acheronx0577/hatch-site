import BbaWizard from '@/components/bba-wizard';
import { listContacts } from '@/lib/api';

export const dynamic = 'force-dynamic';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch';

export default async function BuyerRepPage() {
  const { items: contacts } = await listContacts(TENANT_ID);
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Buyer-Rep Agreement</h1>
        <p className="text-sm text-slate-500">
          Draft and mark agreements signed before confirming tours. Broker overrides are logged.
        </p>
      </div>
      <BbaWizard tenantId={TENANT_ID} contacts={contacts} />
    </div>
  );
}
