import { listAuditEvents } from '@/lib/api/admin.audit';
import { AuditTable } from '@/components/admin/audit-table';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function AdminAuditPage() {
  const { items, nextCursor } = await listAuditEvents({ limit: PAGE_SIZE });

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-800">Audit Log</h1>
        <p className="text-sm text-slate-600">
          Review recent changes across the CRM. Filters intersect with org context and field-level security so sensitive data remains protected.
        </p>
      </div>

      <AuditTable initialItems={items} initialNextCursor={nextCursor ?? null} pageSize={PAGE_SIZE} />
    </div>
  );
}
