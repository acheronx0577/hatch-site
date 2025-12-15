import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { fetchOrgTransactions, type OrgTransactionRecord } from '@/lib/api/org-transactions';
import { emitCopilotContext, emitCopilotPrefill } from '@/lib/copilot/events';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

const filters = [
  { id: 'ALL', label: 'All' },
  { id: 'UNDER_CONTRACT', label: 'Under contract' },
  { id: 'CONTINGENT', label: 'Contingent' },
  { id: 'CLOSED', label: 'Closed' },
  { id: 'ATTENTION', label: 'Needs attention' }
] as const;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

type TransactionsFilter = (typeof filters)[number]['id'];

export default function BrokerTransactions() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;

  const handleAskHatch = (txn: OrgTransactionRecord) => {
    const addressLine1 = txn.listing?.addressLine1?.trim();
    const city = txn.listing?.city?.trim();
    const state = txn.listing?.state?.trim();
    const postalCode = txn.listing?.postalCode?.trim();
    const statusLabel = formatStatus(txn.status);
    const closingLabel = txn.closingDate ? new Date(txn.closingDate).toLocaleDateString() : '—';
    const location = [city, state, postalCode].filter(Boolean).join(' ');
    const listingLabel = [addressLine1, location].filter(Boolean).join(', ') || 'Unlinked transaction';
    const summary = `${listingLabel} · ${statusLabel}${txn.closingDate ? ` · Closing ${closingLabel}` : ''}`;
    const agentName = txn.agentProfile?.user
      ? [txn.agentProfile.user.firstName, txn.agentProfile.user.lastName].filter(Boolean).join(' ')
      : null;
    const agentEmail = txn.agentProfile?.user?.email ?? null;

    emitCopilotContext({
      surface: 'transaction',
      entityType: 'transaction',
      entityId: txn.id,
      summary,
      contextType: 'transaction',
      contextId: txn.id,
      metadata: {
        transactionId: txn.id,
        status: txn.status,
        listingId: txn.listingId ?? txn.listing?.id ?? null,
        listingAddress: {
          addressLine1: txn.listing?.addressLine1 ?? null,
          city: txn.listing?.city ?? null,
          state: txn.listing?.state ?? null,
          postalCode: txn.listing?.postalCode ?? null
        },
        listPrice: txn.listing?.listPrice ?? null,
        buyerName: txn.buyerName ?? null,
        sellerName: txn.sellerName ?? null,
        contractSignedAt: txn.contractSignedAt ?? null,
        inspectionDate: txn.inspectionDate ?? null,
        financingDate: txn.financingDate ?? null,
        closingDate: txn.closingDate ?? null,
        isCompliant: typeof txn.isCompliant === 'boolean' ? txn.isCompliant : null,
        requiresAction: Boolean(txn.requiresAction),
        agent: {
          name: agentName,
          email: agentEmail
        }
      }
    });

    emitCopilotPrefill({
      personaId: 'hatch_assistant',
      chatMode: 'team',
      message: [
        `Act as my transaction coordinator.`,
        ``,
        `Transaction: ${listingLabel} (${txn.id})`,
        `Status: ${statusLabel}`,
        `Closing: ${closingLabel}`,
        agentName || agentEmail ? `Agent: ${[agentName, agentEmail].filter(Boolean).join(' · ')}` : null,
        ``,
        `What is missing or overdue on this transaction, and what should we do next? Please give me a prioritized checklist.`
      ]
        .filter(Boolean)
        .join('\n')
    });
  };

  if (!orgId) {
    return <div className="p-8 text-sm text-gray-600">Select an organization to view transactions.</div>;
  }
  return (
    <div className="space-y-6 p-6">
      <TransactionsView orgId={orgId} onAskHatch={handleAskHatch} />
    </div>
  );
}

function TransactionsView({ orgId, onAskHatch }: { orgId: string; onAskHatch: (txn: OrgTransactionRecord) => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const parseFilter = (value: string | null): TransactionsFilter => {
    if (!value) return 'ALL';
    const match = filters.find((filter) => filter.id === value.toUpperCase());
    return (match?.id ?? 'ALL') as TransactionsFilter;
  };

  const [filter, setFilter] = useState<TransactionsFilter>(() => parseFilter(searchParams.get('filter')));
  const [agentFilter, setAgentFilter] = useState<string | null>(() => searchParams.get('agent'));
  const { data, isLoading, error } = useQuery({
    queryKey: ['broker', 'transactions', orgId],
    queryFn: () => fetchOrgTransactions(orgId),
    staleTime: 30_000
  });

  const transactions = data ?? [];

  useEffect(() => {
    const nextAgent = searchParams.get('agent');
    if (nextAgent !== agentFilter) {
      setAgentFilter(nextAgent);
    }
  }, [searchParams, agentFilter]);

  const scopedTransactions = useMemo(() => {
    if (!agentFilter) return transactions;
    return transactions.filter((txn) => txn.agentProfileId === agentFilter);
  }, [transactions, agentFilter]);

  const summary = useMemo(() => {
    const underContract = scopedTransactions.filter((txn) => txn.status === 'UNDER_CONTRACT').length;
    const contingent = scopedTransactions.filter((txn) => txn.status === 'CONTINGENT').length;
    const closingSoon = scopedTransactions.filter((txn) => isClosingSoon(txn.closingDate)).length;
    const requiresAction = scopedTransactions.filter((txn) => txn.requiresAction || txn.isCompliant === false).length;
    return { total: scopedTransactions.length, underContract, contingent, closingSoon, requiresAction };
  }, [scopedTransactions]);

  const filteredTransactions = useMemo(() => {
    return scopedTransactions.filter((txn) => {
      switch (filter) {
        case 'UNDER_CONTRACT':
          return txn.status === 'UNDER_CONTRACT';
        case 'CONTINGENT':
          return txn.status === 'CONTINGENT';
        case 'CLOSED':
          return txn.status === 'CLOSED';
        case 'ATTENTION':
          return txn.requiresAction || txn.isCompliant === false;
        default:
          return true;
      }
    });
  }, [scopedTransactions, filter]);

  useEffect(() => {
    const next = parseFilter(searchParams.get('filter'));
    if (next !== filter) {
      setFilter(next);
    }
  }, [searchParams, filter]);

  const handleFilterChange = (value: TransactionsFilter) => {
    setFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'ALL') {
      next.delete('filter');
    } else {
      next.set('filter', value);
    }
    setSearchParams(next, { replace: true });
  };

  const clearAgentFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('agent');
    setSearchParams(next, { replace: true });
  };

  const agentLabel = useMemo(() => {
    if (!agentFilter) return null;
    const match = transactions.find((txn) => txn.agentProfileId === agentFilter)?.agentProfile?.user;
    const name = match ? [match.firstName, match.lastName].filter(Boolean).join(' ').trim() : null;
    return name || agentFilter;
  }, [agentFilter, transactions]);

  return (
    <>
      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Mission Control</p>
            <h1 className="text-2xl font-semibold text-slate-900">Transaction pipeline</h1>
            <p className="text-sm text-slate-500">
              Watch contract milestones and compliance flags in one place. TC automation is monitoring deadlines and
              missing docs for you.
            </p>
            {agentLabel ? (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                Filtered to agent: <span className="font-medium text-slate-900">{agentLabel}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {agentFilter ? (
              <Button variant="outline" onClick={clearAgentFilter}>
                Clear agent filter
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link to="/broker/mission-control">Back to Mission Control</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total transactions" value={summary.total} helper={`${summary.underContract} under contract`} />
          <KpiCard label="Contingent" value={summary.contingent} helper={`${summary.closingSoon} closing soon`} />
          <KpiCard label="Needs attention" value={summary.requiresAction} />
          <KpiCard label="Closing soon" value={summary.closingSoon} helper="Next 14 days" />
        </div>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Transaction table</h2>
            <p className="text-sm text-slate-500">Surface-level view of brokerage deals.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleFilterChange(option.id)}
                className={`rounded-full px-4 py-1 text-sm font-medium ${
                  filter === option.id ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="py-6 text-sm text-rose-500">Unable to load transactions.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Property</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-left">Closing</th>
                  <th className="px-4 py-2 text-left">TC</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      Loading transactions…
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      No transactions match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {txn.listing?.addressLine1 ?? 'Unlinked transaction'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {txn.listing?.city} {txn.listing?.state} {txn.listing?.postalCode}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getTransactionTone(txn)}>
                          {formatStatus(txn.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {txn.agentProfile?.user ? (
                          <>
                            <p className="font-medium text-slate-900">
                              {txn.agentProfile.user.firstName} {txn.agentProfile.user.lastName}
                            </p>
                            <p className="text-xs text-slate-500">{txn.agentProfile.user.email}</p>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">Unassigned</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {txn.closingDate ? new Date(txn.closingDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex flex-col gap-1 text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">
                            {txn.requiresAction || txn.isCompliant === false ? 'Needs attention' : 'Monitoring'}
                          </span>
                          {txn.inspectionDate && (
                            <span>Inspection: {new Date(txn.inspectionDate).toLocaleDateString()}</span>
                          )}
                          {txn.financingDate && (
                            <span>Financing: {new Date(txn.financingDate).toLocaleDateString()}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {txn.listing?.listPrice ? currencyFormatter.format(txn.listing.listPrice) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" asChild>
                            <Link to="/broker/compliance">Compliance</Link>
                          </Button>
                          <Button size="sm" variant="ghost" asChild>
                            <Link to="/broker/mission-control">Mission Control</Link>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onAskHatch(txn)}>
                            Ask Hatch
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function isClosingSoon(date?: string | null) {
  if (!date) return false;
  const closing = new Date(date).getTime();
  const now = Date.now();
  const TWO_WEEKS = 1000 * 60 * 60 * 24 * 14;
  return closing - now <= TWO_WEEKS && closing >= now;
}

const formatStatus = (status: string) =>
  status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());

function getTransactionTone(txn: OrgTransactionRecord) {
  if (txn.requiresAction || txn.isCompliant === false) {
    return 'border border-rose-100 bg-rose-50 text-rose-700';
  }
  if (txn.status === 'CLOSED') return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  if (txn.status === 'UNDER_CONTRACT') return 'border border-amber-100 bg-amber-50 text-amber-700';
  return 'border bg-slate-100 text-slate-700';
}

function KpiCard({ label, value, helper }: { label: string; value: number; helper?: string }) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-slate-900">{value}</p>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </Card>
  );
}
