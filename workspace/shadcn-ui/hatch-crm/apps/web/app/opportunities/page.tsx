import OpportunitiesTable from '@/components/opportunities-table';
import { listOpportunities } from '@/lib/api/opportunities';

export const dynamic = 'force-dynamic';

interface OpportunitiesPageProps {
  searchParams?: {
    q?: string;
    stage?: string;
  };
}

const OPPORTUNITIES_PAGE_SIZE = 50;

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
  const q = searchParams?.q ?? '';
  const stage = searchParams?.stage ?? '';
  const opportunities = await listOpportunities({
    ...(q ? { q } : {}),
    ...(stage ? { stage } : {}),
    limit: OPPORTUNITIES_PAGE_SIZE
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Opportunities</h1>
          <p className="text-sm text-slate-500">
            Track pipeline progress and forecast revenue across selling stages.
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/opportunities" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search opportunities"
            className="w-48 rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <input
            name="stage"
            defaultValue={stage}
            placeholder="Stage"
            className="w-36 rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
          >
            Filter
          </button>
        </form>
      </div>

      <OpportunitiesTable
        initialItems={opportunities.items}
        initialNextCursor={opportunities.nextCursor ?? null}
        pageSize={OPPORTUNITIES_PAGE_SIZE}
        filters={{ q: q || undefined, stage: stage || undefined }}
      />
    </div>
  );
}
