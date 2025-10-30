import { RoutingRulesTable } from '@/components/routing-rules-table';
import { listRoutingRules } from '@/lib/api/routing';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface RoutingPageProps {
  searchParams?: {
    q?: string;
    mode?: string;
  };
}

export default async function RoutingPage({ searchParams }: RoutingPageProps) {
  const initialQuery = searchParams?.q ?? '';
  const initialModeParam = searchParams?.mode === 'FIRST_MATCH'
    ? 'FIRST_MATCH'
    : searchParams?.mode === 'SCORE_AND_ASSIGN'
      ? 'SCORE_AND_ASSIGN'
      : 'all';

  const initial = await listRoutingRules({
    limit: PAGE_SIZE,
    q: initialQuery || undefined,
    mode: initialModeParam === 'all' ? undefined : initialModeParam
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Routing Rules</h1>
        <p className="text-sm text-slate-500">
          Review routing automation, priorities, and SLA coverage.
        </p>
      </div>

      <RoutingRulesTable
        initialItems={initial.items}
        initialNextCursor={initial.nextCursor}
        initialQuery={initialQuery}
        initialMode={initialModeParam as 'all' | 'FIRST_MATCH' | 'SCORE_AND_ASSIGN'}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
