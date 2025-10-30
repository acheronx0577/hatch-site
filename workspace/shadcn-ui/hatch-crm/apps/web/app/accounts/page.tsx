import AccountsTable from '@/components/accounts-table';
import { listAccounts } from '@/lib/api/accounts';

export const dynamic = 'force-dynamic';

interface AccountsPageProps {
  searchParams?: {
    q?: string;
  };
}

const ACCOUNTS_PAGE_SIZE = 50;

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const q = searchParams?.q ?? '';
  const accounts = await listAccounts({
    ...(q ? { q } : {}),
    limit: ACCOUNTS_PAGE_SIZE
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Accounts</h1>
          <p className="text-sm text-slate-500">
            Manage organisations and link opportunities, cases, and activities.
          </p>
        </div>
        <form className="flex items-center gap-2" action="/accounts" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search accounts"
            className="w-64 rounded border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700"
          >
            Search
          </button>
        </form>
      </div>

      <AccountsTable
        initialItems={accounts.items}
        initialNextCursor={accounts.nextCursor ?? null}
        query={q}
        pageSize={ACCOUNTS_PAGE_SIZE}
      />
    </div>
  );
}
