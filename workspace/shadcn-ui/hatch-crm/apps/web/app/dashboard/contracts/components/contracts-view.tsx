"use client";

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { listContractInstances, type ContractInstanceRecord } from '@/lib/api/contracts';

type ContractsViewProps = {
  orgId: string;
};

const filters = [
  { id: 'ALL', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'OUT_FOR_SIGNATURE', label: 'Sent' },
  { id: 'SIGNED', label: 'Signed' },
  { id: 'VOIDED', label: 'Voided' }
] as const;

export function ContractsView({ orgId }: ContractsViewProps) {
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('ALL');
  const searchParams = useSearchParams();
  const transactionId = searchParams.get('transactionId')?.trim() || undefined;
  const propertyId = searchParams.get('propertyId')?.trim() || undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'contracts', orgId, filter, transactionId ?? null, propertyId ?? null],
    queryFn: () =>
      listContractInstances(orgId, {
        ...(filter === 'ALL' ? {} : { status: filter }),
        ...(transactionId ? { transactionId } : {}),
        ...(propertyId ? { propertyId } : {})
      }),
    staleTime: 15_000
  });

  const instances = useMemo(() => data ?? [], [data]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Contracts</p>
          <h1 className="text-2xl font-semibold text-slate-900">Contract instances</h1>
          <p className="text-sm text-slate-500">Create a contract from a property to auto-fill parties and address fields.</p>
          {transactionId || propertyId ? (
            <p className="mt-1 text-xs text-slate-500">
              Filtered{' '}
              {transactionId ? (
                <>
                  to transaction <span className="font-mono">{transactionId}</span>
                </>
              ) : (
                <>
                  to property <span className="font-mono">{propertyId}</span>
                </>
              )}{' '}
              ·{' '}
              <Link href="/dashboard/contracts" className="text-brand-600 hover:underline">
                Clear
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`rounded-full px-4 py-1 text-sm font-medium ${
                filter === option.id ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'
              }`}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recent contracts</h2>
        <p className="text-sm text-slate-500">Filter by status to find drafts, sent envelopes, and signed records.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Buyer</th>
                <th className="py-2 pr-4">Seller</th>
                <th className="py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-400">
                    Loading contracts…
                  </td>
                </tr>
              ) : instances.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-400">
                    No contracts yet. Create one from a property detail page.
                  </td>
                </tr>
              ) : (
                instances.map((instance) => (
                  <tr key={instance.id} className="border-t border-slate-100">
                    <td className="py-3 pr-4">
                      <Link href={`/dashboard/contracts/${instance.id}`} className="font-medium text-brand-600 hover:underline">
                        {instance.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {instance.template?.code ? `${instance.template.code} · ` : ''}
                        {instance.orgListingId ? `Property ${instance.orgListingId}` : 'No property linked'}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge className={getStatusBadge(instance.status)}>{formatStatus(instance.status)}</Badge>
                    </td>
                    <td className="py-3 pr-4">{renderParty(instance.buyerPerson)}</td>
                    <td className="py-3 pr-4">{renderParty(instance.sellerPerson)}</td>
                    <td className="py-3">{new Date(instance.updatedAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function renderParty(party: ContractInstanceRecord['buyerPerson']): string {
  if (!party) return '—';
  return party.fullName?.trim() || `${party.firstName ?? ''} ${party.lastName ?? ''}`.trim() || party.id;
}

const formatStatus = (status: string) => {
  if (status === 'OUT_FOR_SIGNATURE') return 'Sent';
  return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
};

const getStatusBadge = (status: string) => {
  if (status === 'SIGNED') return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status === 'OUT_FOR_SIGNATURE') return 'border border-amber-100 bg-amber-50 text-amber-700';
  if (status === 'VOIDED') return 'border border-rose-100 bg-rose-50 text-rose-700';
  return 'border bg-slate-100 text-slate-700';
};
