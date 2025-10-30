import MlsPreflightForm from '@/components/mls-preflight-form';
import { listMlsProfiles } from '@/lib/api';

export const dynamic = 'force-dynamic';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch';

export default async function MlsPreflightPage() {
  const { items: profiles } = await listMlsProfiles(TENANT_ID);

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Publishing Pre-flight</h1>
        <p className="text-sm text-slate-500">
          Validate marketing assets against MLS disclaimers, compensation rules, and Clear Cooperation SLA.
        </p>
      </div>
      <MlsPreflightForm tenantId={TENANT_ID} profiles={profiles} />
    </div>
  );
}
