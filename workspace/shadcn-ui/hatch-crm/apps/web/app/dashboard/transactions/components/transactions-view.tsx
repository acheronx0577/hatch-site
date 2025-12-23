"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchOrgTransactions, OrgTransactionRecord } from '@/lib/api/org-transactions';
import { askAiBroker } from '@/lib/api/mission-control';
import { TransactionsBoard } from './transactions-board';
import { NewTransactionSheet } from './new-transaction-sheet';

type TransactionsViewProps = {
  orgId: string;
};

const filters = [
  { id: 'ALL', label: 'All' },
  { id: 'UNDER_CONTRACT', label: 'Under contract' },
  { id: 'CONTINGENT', label: 'Contingent' },
  { id: 'CLOSED', label: 'Closed' },
  { id: 'ATTENTION', label: 'Needs attention' },
  { id: 'MISSING_DOCS', label: 'Missing docs' },
  { id: 'MISSING_DOCS_30D', label: 'Closing (30d) missing docs' }
] as const;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

export function TransactionsView({ orgId }: TransactionsViewProps) {
  const searchParams = useSearchParams() as unknown as URLSearchParams | null;
  const focusAgentProfileId = searchParams?.get('agentProfileId') ?? null;
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('ALL');
  const [view, setView] = useState<'board' | 'table'>('board');
  const [newTransactionOpen, setNewTransactionOpen] = useState(false);
  const [assistant, setAssistant] = useState<{
    transactionId: string | null;
    loading: boolean;
    answer: string | null;
    error: string | null;
  }>({ transactionId: null, loading: false, answer: null, error: null });

  useEffect(() => {
    const filterParam = searchParams?.get('filter');
    const viewParam = (searchParams?.get('view') ?? '').trim().toLowerCase();

    if (viewParam === 'table') {
      setView('table');
    } else if (viewParam === 'board') {
      setView('board');
    }

    if (!filterParam) return;

    if (filterParam === 'missing-docs') {
      const withinDaysRaw = searchParams?.get('withinDays');
      const withinDays = withinDaysRaw ? Number(withinDaysRaw) : NaN;
      if (withinDays === 30) {
        setFilter('MISSING_DOCS_30D');
      } else {
        setFilter('MISSING_DOCS');
      }
      setView('table');
      return;
    }

    const normalizedFilter = filterParam.trim().toUpperCase().replace(/-/g, '_');
    const isKnownFilter = filters.some((option) => option.id === normalizedFilter);
    if (isKnownFilter) {
      setFilter(normalizedFilter as (typeof filters)[number]['id']);
      setView('table');
    }
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'transactions', orgId],
    queryFn: () => fetchOrgTransactions(orgId),
    staleTime: 30_000
  });

  const transactions = useMemo(() => data ?? [], [data]);

  const scopedTransactions = useMemo(() => {
    if (!focusAgentProfileId) return transactions;
    return transactions.filter((txn) => txn.agentProfileId === focusAgentProfileId);
  }, [focusAgentProfileId, transactions]);

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
        case 'MISSING_DOCS':
          return hasMissingDocs(txn);
        case 'MISSING_DOCS_30D':
          return hasMissingDocs(txn) && isClosingWithinDays(txn.closingDate, 30);
        default:
          return true;
      }
    });
  }, [filter, scopedTransactions]);

  return (
    <Tabs value={view} onValueChange={(value) => setView(value as typeof view)} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Transactions</p>
          <h1 className="text-2xl font-semibold text-slate-900">Pipeline tracker</h1>
          <p className="text-sm text-slate-500">Monitor contract milestones and closings.</p>
          {focusAgentProfileId ? (
            <p className="mt-1 text-xs text-slate-500">
              Filtered to agent <span className="font-mono">{focusAgentProfileId}</span>.{' '}
              <Link href="/dashboard/transactions" className="font-semibold text-brand-700 hover:underline">
                Clear filter
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setNewTransactionOpen(true)}>New transaction</Button>
          <TabsList>
            <TabsTrigger value="board">Board</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Transactions" value={summary.total} helper={`${summary.underContract} under contract`} />
        <KpiCard label="Contingent" value={summary.contingent} helper={`${summary.closingSoon} closing soon`} />
        <KpiCard label="Needs attention" value={summary.requiresAction} />
        <KpiCard label="Closing soon" value={summary.closingSoon} helper="Next 14 days" />
      </div>

      <TabsContent value="board" className="mt-0">
        {isLoading ? (
          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Loading transactions…</p>
          </Card>
        ) : (
          <TransactionsBoard orgId={orgId} transactions={scopedTransactions} />
        )}
      </TabsContent>

      <TabsContent value="table" className="mt-0 space-y-4">
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

        <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Transaction table</h2>
          <p className="text-sm text-slate-500">Listing, agent assignment, and closing state.</p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Property</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Agent</th>
                  <th className="py-2 pr-4">Closing</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                      Loading transactions…
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                      No transactions match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((txn) => (
                    <tr key={txn.id} className="border-t border-slate-100">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-slate-900">{txn.listing?.addressLine1 ?? 'Unlinked transaction'}</div>
                        <div className="text-xs text-slate-500">
                          {txn.listing?.city} {txn.listing?.state} {txn.listing?.postalCode}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge className={getStatusTone(txn)}>{formatStatus(txn.status)}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {txn.agentProfile?.user ? (
                          <div>
                            <p className="font-medium text-slate-900">
                              {txn.agentProfile.user.firstName} {txn.agentProfile.user.lastName}
                            </p>
                            <p className="text-xs text-slate-500">{txn.agentProfile.user.email}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">Unassigned</p>
                        )}
                      </td>
                      <td className="py-3 pr-4">{txn.closingDate ? new Date(txn.closingDate).toLocaleDateString() : '—'}</td>
                      <td className="py-3 pr-4 font-medium text-slate-900">
                        {txn.listing?.listPrice ? currencyFormatter.format(txn.listing.listPrice) : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-2">
                          <Button asChild size="sm" variant="secondary">
                            <Link href="/dashboard/mission-control">Mission Control</Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost">
                            <Link href="/dashboard/compliance">Compliance</Link>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setAssistant({ transactionId: txn.id, loading: true, answer: null, error: null });
                              askAiBroker(orgId, {
                                question: 'What should I do next for this transaction?',
                                contextType: 'TRANSACTION',
                                transactionId: txn.id
                              })
                                .then((res) =>
                                  setAssistant({
                                    transactionId: txn.id,
                                    loading: false,
                                    answer: res.answer,
                                    error: null
                                  })
                                )
                                .catch((err) => {
                                  console.error(err);
                                  setAssistant({
                                    transactionId: txn.id,
                                    loading: false,
                                    answer: null,
                                    error: 'TC assistant is unavailable right now.'
                                  });
                                });
                            }}
                            disabled={assistant.loading && assistant.transactionId === txn.id}
                          >
                            {assistant.loading && assistant.transactionId === txn.id ? 'Asking...' : 'Ask TC Assistant'}
                          </Button>
                          {assistant.transactionId === txn.id && assistant.answer ? <p className="text-xs text-slate-600">AI: {assistant.answer}</p> : null}
                          {assistant.transactionId === txn.id && assistant.error ? <p className="text-xs text-rose-600">{assistant.error}</p> : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </TabsContent>

      <NewTransactionSheet orgId={orgId} open={newTransactionOpen} onOpenChange={setNewTransactionOpen} />
    </Tabs>
  );
}

function KpiCard({ label, value, helper }: { label: string; value: number; helper?: string }) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-slate-900">{value.toLocaleString()}</p>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </Card>
  );
}

const isClosingSoon = (closingDate?: string | null) => {
  if (!closingDate) return false;
  const closing = new Date(closingDate).getTime();
  const now = Date.now();
  const TWO_WEEKS = 1000 * 60 * 60 * 24 * 14;
  return closing - now <= TWO_WEEKS && closing >= now;
};

const isClosingWithinDays = (closingDate: string | null | undefined, days: number) => {
  if (!closingDate) return false;
  const closing = new Date(closingDate).getTime();
  if (Number.isNaN(closing)) return false;
  const now = Date.now();
  const windowMs = 1000 * 60 * 60 * 24 * days;
  return closing - now <= windowMs && closing >= now;
};

const REQUIRED_TRANSACTION_DOC_TYPES = ['PURCHASE_CONTRACT', 'ADDENDUM', 'CLOSING_DOC', 'PROOF_OF_FUNDS'] as const;
const NON_PASSING_DOC_STATUSES = new Set(['FAILED', 'NEEDS_REVIEW', 'UNKNOWN', 'PENDING']);

const hasMissingDocs = (txn: OrgTransactionRecord) => {
  const docs = (txn.documents ?? []).map((doc) => doc.orgFile).filter(Boolean);
  const missingRequired = REQUIRED_TRANSACTION_DOC_TYPES.some(
    (required) => !docs.some((doc) => doc?.documentType === required)
  );
  const failingDocs = docs.some((doc) => NON_PASSING_DOC_STATUSES.has(doc?.complianceStatus ?? ''));
  return missingRequired || failingDocs;
};

const formatStatus = (status: string) => status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());

const getStatusTone = (txn: OrgTransactionRecord) => {
  if (txn.requiresAction || txn.isCompliant === false) {
    return 'border border-rose-100 bg-rose-50 text-rose-700';
  }
  if (txn.status === 'CLOSED') return 'border border-emerald-100 bg-emerald-50 text-emerald-700';
  if (txn.status === 'UNDER_CONTRACT') return 'border border-amber-100 bg-amber-50 text-amber-700';
  return 'border bg-slate-100 text-slate-700';
};
