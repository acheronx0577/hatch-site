import { JourneysTable } from '@/components/journeys-table';
import { listJourneys } from '@/lib/api/journeys';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface JourneysPageProps {
  searchParams?: {
    q?: string;
    status?: string;
  };
}

export default async function JourneysPage({ searchParams }: JourneysPageProps) {
  const initialQuery = searchParams?.q ?? '';
  const initialStatus =
    searchParams?.status === 'active'
      ? 'active'
      : searchParams?.status === 'inactive'
        ? 'inactive'
        : 'all';

  const initial = await listJourneys({
    limit: PAGE_SIZE,
    q: initialQuery || undefined,
    active: initialStatus as 'all' | 'active' | 'inactive'
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Journeys</h1>
        <p className="text-sm text-slate-500">
          Inspect automation flows, triggers, and rollout status.
        </p>
      </div>

      <JourneysTable
        initialItems={initial.items}
        initialNextCursor={initial.nextCursor}
        pageSize={PAGE_SIZE}
        initialQuery={initialQuery}
        initialStatus={initialStatus as 'all' | 'active' | 'inactive'}
      />
    </div>
  );
}
