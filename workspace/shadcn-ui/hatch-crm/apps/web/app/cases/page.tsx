import Link from 'next/link';

import CasesTable from '@/components/cases-table';
import { listCases } from '@/lib/api/cases';

export const dynamic = 'force-dynamic';

const STATUS_OPTIONS = ['New', 'Working', 'Escalated', 'Resolved', 'Closed'] as const;
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent'] as const;

interface CasesPageProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

const toValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value ?? '';

const CASES_PAGE_SIZE = 50;

export default async function CasesPage({ searchParams = {} }: CasesPageProps) {
  const q = toValue(searchParams.q);
  const status = toValue(searchParams.status);
  const priority = toValue(searchParams.priority);

  const listResponse = await listCases({
    q: q || undefined,
    status: status || undefined,
    priority: priority || undefined,
    limit: CASES_PAGE_SIZE
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Cases</h1>
          <p className="text-sm text-slate-500">
            Track customer issues from intake through resolution.
          </p>
        </div>
        <Link
          href="/cases/new"
          className="hidden rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          New Case
        </Link>
      </header>

      <form className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search subject..."
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          name="priority"
          defaultValue={priority}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
        >
          Apply
        </button>
      </form>

      <CasesTable
        initialItems={listResponse.items}
        initialNextCursor={listResponse.nextCursor ?? null}
        filters={{
          q: q || undefined,
          status: status || undefined,
          priority: priority || undefined
        }}
        pageSize={CASES_PAGE_SIZE}
      />
    </div>
  );
}
