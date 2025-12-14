import { ClientInsightsHub } from './components/client-insights-hub';

export const dynamic = 'force-dynamic';

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch';

export default async function DashboardPage() {
  return (
    <div className="space-y-4">
      <ClientInsightsHub tenantId={TENANT_ID} />
    </div>
  );
}
