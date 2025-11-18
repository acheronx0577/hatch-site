import MlsPreflightForm from '@/components/mls-preflight-form';
import { listMlsProfiles } from '@/lib/api';

export const dynamic = 'force-dynamic';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch';

export default async function MlsPreflightPage() {
  const profiles = await listMlsProfiles(TENANT_ID);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Publishing Pre-flight</h1>
        <p className="mt-1 text-sm text-slate-500">
          Validate marketing assets against MLS disclaimers, compensation rules, and Clear Cooperation SLA.
        </p>
      </div>
      {profiles.length > 0 ? (
        <MlsPreflightForm tenantId={TENANT_ID} profiles={profiles} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">No MLS profiles available. Please configure MLS profiles first.</p>
        </div>
      )}
    </div>
  );
}
