import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Link2, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/lib/api/hatch';
import { cn } from '@/lib/utils';
import {
  createLedgerEntry,
  deleteLedgerEntry,
  fetchFinancialsDashboard,
  listLedgerEntries,
  type LedgerEntryType,
  type OrgLedgerEntry,
  type FinancialsDashboardResponse,
  type FinancialsPeriod
} from '@/lib/api/financials';
import { fetchOrgTransactions, type OrgTransactionRecord } from '@/lib/api/org-transactions';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';
const ACCOUNTING_ENABLED = (import.meta.env.VITE_ACCOUNTING_ENABLED ?? 'false').toLowerCase() === 'true';

const formatNumber = new Intl.NumberFormat('en-US');
const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const financialsQueryKey = (orgId: string, period: FinancialsPeriod) => ['financials', 'dashboard', orgId, period];
const ledgerQueryKey = (orgId: string, period: FinancialsPeriod) => ['financials', 'ledger', orgId, period];

export default function BrokerFinancials() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;

  if (!orgId) {
    return <div className="text-sm text-slate-600">Select an organization to view financials.</div>;
  }

  if (!ACCOUNTING_ENABLED) {
    return <div className="text-sm text-slate-600">Accounting is disabled in this environment.</div>;
  }

  return (
    <div className="space-y-6">
      <FinancialsView orgId={orgId} />
    </div>
  );
}

function FinancialsView({ orgId }: { orgId: string }) {
  const [period, setPeriod] = useState<FinancialsPeriod>('month');
  const queryClient = useQueryClient();
  const range = useMemo(() => resolveRange(period), [period]);

  const {
    data: dashboard,
    isLoading,
    isFetching,
    error,
    refetch
  } = useQuery({
    queryKey: financialsQueryKey(orgId, period),
    queryFn: () => fetchFinancialsDashboard(orgId, { period, source: 'auto' }),
    staleTime: 60_000
  });

  const ledgerQuery = useQuery({
    queryKey: ledgerQueryKey(orgId, period),
    queryFn: () =>
      listLedgerEntries(orgId, {
        limit: 50,
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString()
      }),
    staleTime: 30_000
  });

  const transactionsQuery = useQuery({
    queryKey: ['broker', 'transactions', orgId, 'financials'],
    queryFn: () => fetchOrgTransactions(orgId),
    staleTime: 60_000
  });

  const createLedger = useMutation({
    mutationFn: (payload: Parameters<typeof createLedgerEntry>[1]) => createLedgerEntry(orgId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ledgerQueryKey(orgId, period) }),
        queryClient.invalidateQueries({ queryKey: financialsQueryKey(orgId, period) })
      ]);
    }
  });

  const deleteLedger = useMutation({
    mutationFn: (id: string) => deleteLedgerEntry(orgId, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ledgerQueryKey(orgId, period) }),
        queryClient.invalidateQueries({ queryKey: financialsQueryKey(orgId, period) })
      ]);
    }
  });

  const handleOAuthConnect = () => {
    const authorizeUrl = `${API_BASE_URL}integrations/quickbooks/authorize?orgId=${encodeURIComponent(orgId)}`;
    window.location.assign(authorizeUrl);
  };

  const summaryCards = useMemo(() => mapDashboardToCards(dashboard), [dashboard]);
  const ledgerItems = ledgerQuery.data?.items ?? [];
  const transactions = transactionsQuery.data ?? [];

  return (
    <section className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-background)] p-6 shadow-brand-lg backdrop-blur-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-blue-600/16 via-white/0 to-brand-green-500/14 dark:from-brand-blue-600/24 dark:to-brand-green-500/18"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_60%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_60%)]"
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Brokerage Financials</p>
            <h1 className="text-3xl font-semibold text-slate-900">Financials</h1>
            <p className="text-sm text-slate-600">
              Pull Profit &amp; Loss from QuickBooks when connected, with internal commissions and production metrics as a fallback.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Tabs value={period} onValueChange={(value) => setPeriod(value as FinancialsPeriod)}>
              <TabsList className="rounded-full bg-white/20 backdrop-blur-sm dark:bg-white/10">
                <TabsTrigger value="month" className="rounded-full px-4">
                  Month
                </TabsTrigger>
                <TabsTrigger value="quarter" className="rounded-full px-4">
                  Quarter
                </TabsTrigger>
                <TabsTrigger value="year" className="rounded-full px-4">
                  Year
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {dashboard?.quickbooks.connected ? (
              <Badge className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                QuickBooks connected
              </Badge>
            ) : (
              <Button
                variant="outline"
                className="border-[var(--glass-border)] bg-white/25 dark:bg-white/10"
                onClick={handleOAuthConnect}
                disabled={isFetching}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Connect QuickBooks
              </Button>
            )}

            {dashboard ? (
              <Badge className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Source: {dashboard.source === 'quickbooks' ? 'QuickBooks' : 'Internal'}
              </Badge>
            ) : null}
          </div>
        </div>
      </header>

      {dashboard?.warnings?.length ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <div className="space-y-0.5">
            {dashboard.warnings.map((warning) => (
              <p key={`${warning.source}:${warning.message}`}>{warning.message}</p>
            ))}
          </div>
        </div>
      ) : null}

      {summaryCards.length > 0 ? <SummaryCards metrics={summaryCards} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="Revenue by Source"
          subtitle={dashboard?.source === 'quickbooks' ? 'Top income accounts from QuickBooks' : 'Internal commission revenue'}
          items={dashboard?.revenue.bySource ?? []}
          total={dashboard?.revenue.total ?? 0}
          isLoading={isLoading}
        />
        <BreakdownCard
          title="Expenses by Category"
          subtitle={dashboard?.source === 'quickbooks' ? 'Top expense accounts from QuickBooks' : 'Internal ledger expenses (fallback)'}
          items={dashboard?.expenses.byCategory ?? []}
          total={dashboard?.expenses.total ?? 0}
          isLoading={isLoading}
        />
      </div>

      <InternalLedgerCard
        period={period}
        isLoading={ledgerQuery.isLoading}
        isSaving={createLedger.isPending}
        isDeleting={deleteLedger.isPending}
        items={ledgerItems}
        transactions={transactions}
        onCreate={(payload) => createLedger.mutate(payload)}
        onDelete={(id) => deleteLedger.mutate(id)}
        error={
          ledgerQuery.error
            ? ledgerQuery.error instanceof Error
              ? ledgerQuery.error.message
              : 'Unable to load ledger entries.'
            : createLedger.error
              ? createLedger.error instanceof Error
                ? createLedger.error.message
                : 'Unable to save ledger entry.'
              : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden !rounded-2xl">
          <div className="flex items-center justify-between border-b border-[color:var(--hatch-card-border)] bg-white/10 px-4 py-3 backdrop-blur-sm dark:bg-white/5">
            <div>
              <p className="text-sm font-semibold text-slate-900">Recent payouts</p>
              <p className="text-xs text-slate-500">Commission payouts recorded in Hatch.</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500"
              onClick={() => refetch()}
              aria-label="Refresh"
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
          <RecentPayoutsTable isLoading={isLoading} payouts={dashboard?.recentPayouts ?? []} />
        </Card>

        <Card className="overflow-hidden !rounded-2xl">
          <div className="border-b border-[color:var(--hatch-card-border)] bg-white/10 px-4 py-3 backdrop-blur-sm dark:bg-white/5">
            <p className="text-sm font-semibold text-slate-900">Commissions by agent</p>
            <p className="text-xs text-slate-500">Paid vs pending commissions for the selected period.</p>
          </div>
          <CommissionsByAgentTable isLoading={isLoading} rows={dashboard?.commissions.byAgent ?? []} />
        </Card>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" /> Unable to load financials. Please retry shortly.
        </div>
      ) : null}
    </section>
  );
}

type MetricCard = {
  label: string;
  value: string;
  caption: string;
};

const ledgerTypeOptions: Array<{ id: LedgerEntryType; label: string }> = [
  { id: 'INCOME', label: 'Income' },
  { id: 'EXPENSE', label: 'Expense' }
];

function resolveRange(period: FinancialsPeriod) {
  const now = new Date();
  const end = now;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (period === 'quarter') {
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    return { start: new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1)), end };
  }
  if (period === 'year') {
    return { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end };
  }
  return { start, end };
}

function formatTransactionLabel(txn: OrgTransactionRecord) {
  const address = txn.listing?.addressLine1?.trim();
  const city = txn.listing?.city?.trim();
  const state = txn.listing?.state?.trim();
  const closing = txn.closingDate ? new Date(txn.closingDate).toLocaleDateString() : null;
  const location = [city, state].filter(Boolean).join(', ');
  const base = address ? `${address}${location ? ` · ${location}` : ''}` : `Transaction ${txn.id.slice(-6)}`;
  return closing ? `${base} · closes ${closing}` : base;
}

function InternalLedgerCard({
  period,
  isLoading,
  isSaving,
  isDeleting,
  items,
  transactions,
  onCreate,
  onDelete,
  error
}: {
  period: FinancialsPeriod;
  isLoading: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  items: OrgLedgerEntry[];
  transactions: OrgTransactionRecord[];
  onCreate: (payload: Parameters<typeof createLedgerEntry>[1]) => void;
  onDelete: (id: string) => void;
  error: string | null;
}) {
  const [type, setType] = useState<LedgerEntryType>('EXPENSE');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [transactionId, setTransactionId] = useState<string>('');

  const canSubmit = category.trim() && amount.trim() && occurredAt;

  const submit = () => {
    if (!canSubmit) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onCreate({
      type,
      category: category.trim(),
      amount: parsed,
      occurredAt,
      memo: memo.trim() || undefined,
      transactionId: transactionId || undefined
    });
    setCategory('');
    setAmount('');
    setMemo('');
    setTransactionId('');
  };

  const emptyLabel = isLoading ? 'Loading…' : `No ledger entries this ${period}.`;

  return (
    <Card className="overflow-hidden !rounded-2xl">
      <div className="border-b border-[color:var(--hatch-card-border)] bg-white/10 px-4 py-3 backdrop-blur-sm dark:bg-white/5">
        <p className="text-sm font-semibold text-slate-900">Internal ledger (fallback)</p>
        <p className="text-xs text-slate-500">Track expenses and off-platform income when QuickBooks is unavailable.</p>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as LedgerEntryType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ledgerTypeOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="h-9" />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Software, Marketing, Rent" className="h-9" />
            </div>

            <div className="space-y-1">
              <Label>Amount</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" inputMode="decimal" className="h-9" />
            </div>

            <div className="space-y-1">
              <Label>Transaction (optional)</Label>
              <Select value={transactionId || '__none'} onValueChange={(value) => setTransactionId(value === '__none' ? '' : value)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {transactions.slice(0, 50).map((txn) => (
                    <SelectItem key={txn.id} value={txn.id}>
                      {formatTransactionLabel(txn)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Memo (optional)</Label>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Notes for this entry" className="h-9" />
            </div>
          </div>

          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <Button onClick={submit} disabled={!canSubmit || isSaving}>
            {isSaving ? 'Saving…' : 'Add entry'}
          </Button>
        </div>

        <div className="lg:col-span-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-2 text-left">Date</th>
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-left">Category</th>
                <th className="py-2 text-left">Memo</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                items.slice(0, 20).map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-200/60">
                    <td className="py-2 text-slate-600">{new Date(entry.occurredAt).toLocaleDateString()}</td>
                    <td className="py-2">
                      <Badge variant={entry.type === 'INCOME' ? 'success' : 'warning'}>
                        {entry.type === 'INCOME' ? 'Income' : 'Expense'}
                      </Badge>
                    </td>
                    <td className="py-2 text-slate-900">{entry.category}</td>
                    <td className="py-2 text-slate-600">{entry.memo ?? '—'}</td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {entry.type === 'EXPENSE' ? '-' : ''}
                      {formatCurrency.format(entry.amount)}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isDeleting}
                        onClick={() => onDelete(entry.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {items.length > 20 ? (
            <p className="mt-2 text-xs text-slate-500">Showing 20 most recent entries.</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function SummaryCards({ metrics }: { metrics: MetricCard[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card
          key={metric.label}
          className="!rounded-2xl px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-brand-md"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{metric.label}</p>
          <p className="text-2xl font-semibold text-slate-900">{metric.value}</p>
          <p className="text-xs text-slate-500">{metric.caption}</p>
        </Card>
      ))}
    </div>
  );
}

function mapDashboardToCards(dashboard?: FinancialsDashboardResponse): MetricCard[] {
  if (!dashboard) return [];
  return [
    {
      label: 'Revenue',
      value: formatCurrency.format(dashboard.revenue.total ?? 0),
      caption: dashboard.source === 'quickbooks' ? 'From QuickBooks P&L' : 'From internal payouts'
    },
    {
      label: 'Expenses',
      value: formatCurrency.format(dashboard.expenses.total ?? 0),
      caption: dashboard.source === 'quickbooks' ? 'From QuickBooks P&L' : 'From internal ledger'
    },
    {
      label: 'Commissions paid',
      value: formatCurrency.format(dashboard.commissions.paid ?? 0),
      caption: `${formatCurrency.format(dashboard.commissions.pending ?? 0)} pending`
    },
    {
      label: 'Net income',
      value: formatCurrency.format(dashboard.netIncome ?? 0),
      caption: `${formatNumber.format(dashboard.transactions.closed ?? 0)} closings this period`
    }
  ];
}

function BreakdownCard({
  title,
  subtitle,
  items,
  total,
  isLoading
}: {
  title: string;
  subtitle: string;
  items: Array<{ label: string; amount: number }>;
  total: number;
  isLoading: boolean;
}) {
  return (
    <Card className="!rounded-2xl p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">No data available.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const pct = total > 0 ? Math.min(100, (item.amount / total) * 100) : 0;
            return (
              <div key={item.label} className="rounded-xl border border-[color:var(--hatch-card-border)] bg-card/40 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-900">{item.label}</span>
                  <span className="font-semibold text-slate-900">{formatCurrency.format(item.amount)}</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-blue-600/70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function RecentPayoutsTable({
  isLoading,
  payouts
}: {
  isLoading: boolean;
  payouts: FinancialsDashboardResponse['recentPayouts'];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-white/10 text-xs uppercase tracking-[0.15em] text-slate-500 dark:bg-white/5">
          <tr>
            <th className="px-4 py-3 text-left">Date</th>
            <th className="px-4 py-3 text-left">Payee</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-right">Agent</th>
            <th className="px-4 py-3 text-right">Broker</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                Loading payouts…
              </td>
            </tr>
          ) : payouts.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                No payouts in this period.
              </td>
            </tr>
          ) : (
            payouts.map((payout) => (
              <tr key={payout.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-600">{new Date(payout.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{payout.payeeName}</p>
                  <p className="text-xs text-slate-500">{payout.opportunityId ? `Opp ${payout.opportunityId}` : '—'}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    className={cn(
                      'rounded-full bg-slate-100 text-slate-700',
                      payout.status?.toUpperCase() === 'PAID' && 'bg-emerald-50 text-emerald-700'
                    )}
                  >
                    {payout.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {formatCurrency.format(payout.agentAmount)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {formatCurrency.format(payout.brokerAmount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CommissionsByAgentTable({
  isLoading,
  rows
}: {
  isLoading: boolean;
  rows: FinancialsDashboardResponse['commissions']['byAgent'];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-white/10 text-xs uppercase tracking-[0.15em] text-slate-500 dark:bg-white/5">
          <tr>
            <th className="px-4 py-3 text-left">Agent</th>
            <th className="px-4 py-3 text-right">Paid</th>
            <th className="px-4 py-3 text-right">Pending</th>
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                Loading commissions…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                No commission activity in this period.
              </td>
            </tr>
          ) : (
            rows.slice(0, 10).map((row) => (
              <tr key={row.agentId} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{row.agentName}</p>
                  <p className="text-xs text-slate-500">{row.agentId}</p>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency.format(row.paid)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency.format(row.pending)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency.format(row.total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
