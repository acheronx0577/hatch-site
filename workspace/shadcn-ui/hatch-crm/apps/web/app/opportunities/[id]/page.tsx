import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { FIELD_MAP } from '@hatch/shared/layout';

import AttachmentsPanel from '@/components/files/attachments-panel';
import DealDeskRequestForm from '@/components/deal-desk-request-form';
import { getOpportunity } from '@/lib/api/opportunities';
import { listFilesForRecord } from '@/lib/api/files';
import { resolveLayout } from '@/lib/api/admin.layouts';
import { applyLayout } from '@/lib/layouts/applyLayout';

interface OpportunityPageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

export default async function OpportunityDetailPage({ params }: OpportunityPageProps) {
  const { id } = params;

  const ATTACHMENTS_PAGE_SIZE = 25;

  const [opportunity, attachments, layoutManifest] = await Promise.all([
    getOpportunity(id),
    listFilesForRecord('opportunities', id, { limit: ATTACHMENTS_PAGE_SIZE }),
    resolveLayout({ object: 'opportunities', kind: 'detail' }).catch(() => null)
  ]);

  if (!opportunity) {
    notFound();
  }

  const amountFormatted =
    typeof opportunity.amount === 'number'
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: opportunity.currency ?? 'USD'
        }).format(opportunity.amount)
      : null;

  const baseline = FIELD_MAP['opportunities'] ?? [];
  const allowedFields = Object.keys(opportunity ?? {});
  const manifestFields = layoutManifest?.fields ??
    baseline.map((field, index) => ({ field: field.field, label: field.label, order: index, width: field.width }));
  const orderedFields = applyLayout({ fields: manifestFields }, allowedFields, baseline);

  const renderFieldValue = (field: string) => {
    switch (field) {
      case 'stage':
        return opportunity.stage ?? '—';
      case 'amount':
        return amountFormatted ?? '—';
      case 'closeDate':
        return opportunity.closeDate ? new Date(opportunity.closeDate).toLocaleDateString() : 'Not set';
      case 'account':
        return opportunity.account ? (
          <Link href={`/accounts/${opportunity.account.id}`} className="text-brand-600 hover:underline">
            {opportunity.account.name ?? 'View account'}
          </Link>
        ) : (
          'Unassigned'
        );
      case 'owner':
        return opportunity.owner?.name ?? opportunity.ownerId ?? 'Unassigned';
      case 'transaction':
        return opportunity.transaction ? (
          <Link href={`/re/transactions/${opportunity.transaction.id}`} className="text-brand-600 hover:underline">
            View transaction ({opportunity.transaction.stage ?? 'In progress'})
          </Link>
        ) : (
          'No transaction linked yet'
        );
      default: {
        const value = (opportunity as Record<string, unknown>)[field];
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
            <h1 className="text-2xl font-semibold text-slate-900">{opportunity.name ?? 'Untitled opportunity'}</h1>
            <p className="text-sm text-slate-500">Sales process record capturing forecast and stage.</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">
                {opportunity.stage ?? 'Unknown stage'}
              </span>
              {amountFormatted && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {amountFormatted}
                </span>
              )}
            </div>
          </div>
          <dl className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
            <div className="rounded border border-slate-100 bg-slate-50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time in stage</dt>
              <dd className="mt-1 font-medium text-slate-800">
                {opportunity.stageEnteredAt
                  ? formatDistanceToNow(new Date(opportunity.stageEnteredAt), { addSuffix: true })
                  : '—'}
              </dd>
            </div>
            <div className="rounded border border-slate-100 bg-slate-50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last activity</dt>
              <dd className="mt-1 font-medium text-slate-800">
                {opportunity.updatedAt ? formatDistanceToNow(new Date(opportunity.updatedAt), { addSuffix: true }) : '—'}
              </dd>
            </div>
            {orderedFields.map((field) => (
              <div key={field.field} className="rounded border border-slate-100 bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {field.label ?? field.field}
                </dt>
                <dd className="mt-1 font-medium text-slate-800">{renderFieldValue(field.field)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <DealDeskRequestForm
          opportunityId={id}
          defaultAmount={typeof opportunity.amount === 'number' ? opportunity.amount : undefined}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <AttachmentsPanel
          object="opportunities"
          recordId={id}
          initialItems={attachments.items}
          initialNextCursor={attachments.nextCursor}
          pageSize={ATTACHMENTS_PAGE_SIZE}
        />
      </section>
    </div>
  );
}
