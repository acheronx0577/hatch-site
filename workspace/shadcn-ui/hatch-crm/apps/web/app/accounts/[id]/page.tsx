import { notFound } from 'next/navigation';

import AccountOpportunitiesTable from '@/components/account-opportunities-table';
import AttachmentsPanel from '@/components/files/attachments-panel';
import { applyLayout } from '@/lib/layouts/applyLayout';
import { resolveLayout } from '@/lib/api/admin.layouts';
import { FIELD_MAP } from '@hatch/shared/layout';
import { getAccount } from '@/lib/api/accounts';
import { listOpportunities } from '@/lib/api/opportunities';
import { listFilesForRecord } from '@/lib/api/files';

interface AccountPageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

const ACCOUNT_OPPORTUNITY_PAGE_SIZE = 50;

export default async function AccountDetailPage({ params }: AccountPageProps) {
  const { id } = params;

  const ATTACHMENTS_PAGE_SIZE = 25;

  const [account, opportunities, attachments, layoutManifest] = await Promise.all([
    getAccount(id),
    listOpportunities({ accountId: id, limit: ACCOUNT_OPPORTUNITY_PAGE_SIZE }),
    listFilesForRecord('accounts', id, { limit: ATTACHMENTS_PAGE_SIZE }),
    resolveLayout({ object: 'accounts', kind: 'detail' }).catch(() => null)
  ]);

  if (!account) {
    notFound();
  }

  const baseline = FIELD_MAP['accounts'] ?? [];
  const allowedFields = Object.keys(account ?? {});
  const manifestFields = layoutManifest?.fields ??
    baseline.map((field, index) => ({ field: field.field, label: field.label, order: index, width: field.width }));
  const orderedFields = applyLayout({ fields: manifestFields }, allowedFields, baseline);

  const renderFieldValue = (field: string) => {
    switch (field) {
      case 'website':
        return account.website ? (
          <a href={account.website} className="text-brand-600 hover:underline" rel="noreferrer" target="_blank">
            {account.website}
          </a>
        ) : (
          '—'
        );
      case 'industry':
        return account.industry ?? '—';
      case 'phone':
        return account.phone ?? '—';
      case 'owner':
        return account.owner?.name ?? account.ownerId ?? 'Unassigned';
      case 'annualRevenue':
        return typeof account.annualRevenue === 'number' ? `$${account.annualRevenue.toLocaleString()}` : '—';
      case 'createdAt':
      case 'updatedAt': {
        const value = (account as Record<string, unknown>)[field];
        return typeof value === 'string' ? new Date(value).toLocaleString() : '—';
      }
      default: {
        const value = (account as Record<string, unknown>)[field];
        if (value === null || value === undefined || value === '') {
          return '—';
        }
        if (typeof value === 'object') {
          try {
            return JSON.stringify(value);
          } catch {
            return '—';
          }
        }
        return String(value);
      }
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{account.name ?? 'Untitled account'}</h1>
            <p className="text-sm text-slate-500">Owner-managed organisation record.</p>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 text-sm text-slate-600 md:grid-cols-2">
          {orderedFields.map((field) => (
            <div key={field.field} className="rounded border border-slate-100 bg-slate-50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {field.label ?? field.field}
              </dt>
              <dd className="mt-1 font-medium text-slate-800">{renderFieldValue(field.field)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Opportunities</h2>
        <div className="mt-4">
          <AccountOpportunitiesTable
            accountId={id}
            initialItems={opportunities.items}
            initialNextCursor={opportunities.nextCursor ?? null}
            pageSize={ACCOUNT_OPPORTUNITY_PAGE_SIZE}
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <AttachmentsPanel
          object="accounts"
          recordId={id}
          initialItems={attachments.items}
          initialNextCursor={attachments.nextCursor}
          pageSize={ATTACHMENTS_PAGE_SIZE}
        />
      </section>
    </div>
  );
}
