import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/lib/auth/roles';
import {
  fetchOrgTransactionActivity,
  fetchOrgTransactions,
  updateOrgTransaction,
  type OrgTransactionActivityEvent,
  type OrgTransactionRecord,
  type UpdateOrgTransactionPayload
} from '@/lib/api/org-transactions';
import { emitAskHatchOpen } from '@/lib/ask-hatch/events';
import { cn } from '@/lib/utils';
import { Eye, Info, LayoutDashboard, Pencil, Sparkles } from 'lucide-react';

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
    const title = addressLine1 ? `Transaction · ${addressLine1}` : `Transaction · ${txn.id.slice(-6)}`;

    emitAskHatchOpen({
      title,
      contextType: 'TRANSACTION',
      contextId: txn.id,
      contextSnapshot: {
        listingLabel,
        statusLabel,
        closingLabel
      }
    });
  };

  if (!orgId) {
    return <div className="text-sm text-gray-600">Select an organization to view transactions.</div>;
  }
  return (
    <div className="space-y-6">
      <TransactionsView orgId={orgId} onAskHatch={handleAskHatch} />
    </div>
  );
}

function TransactionsView({ orgId, onAskHatch }: { orgId: string; onAskHatch: (txn: OrgTransactionRecord) => void }) {
  const role = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const parseFilter = (value: string | null): TransactionsFilter => {
    if (!value) return 'ALL';
    const match = filters.find((filter) => filter.id === value.toUpperCase());
    return (match?.id ?? 'ALL') as TransactionsFilter;
  };

  const [filter, setFilter] = useState<TransactionsFilter>(() => parseFilter(searchParams.get('filter')));
  const [agentFilter, setAgentFilter] = useState<string | null>(() => searchParams.get('agent'));
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [detailsTransactionId, setDetailsTransactionId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['broker', 'transactions', orgId],
    queryFn: () => fetchOrgTransactions(orgId),
    staleTime: 30_000
  });

  const transactions = data ?? [];
  const detailsTransaction = useMemo(() => {
    if (!detailsTransactionId) return null;
    return transactions.find((txn) => txn.id === detailsTransactionId) ?? null;
  }, [detailsTransactionId, transactions]);

  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId || transactions.length === 0) return;
    if (focusId === detailsTransactionId && detailsOpen) return;
    setDetailsTransactionId(focusId);
    setDetailsOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [detailsOpen, detailsTransactionId, searchParams, setSearchParams, transactions.length]);

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

  const updateTransaction = useMutation({
    mutationFn: async (params: { transactionId: string; payload: UpdateOrgTransactionPayload }) => {
      return updateOrgTransaction(orgId, params.transactionId, params.payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['broker', 'transactions', orgId] });
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'overview', orgId] });
      toast({ title: 'Transaction updated', description: 'Changes saved successfully.' });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unable to update transaction.';
      toast({ variant: 'destructive', title: 'Update failed', description: message });
    }
  });

  return (
    <>
      <section className="hatch-hero relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-r from-[#1F5FFF] via-[#3D86FF] to-[#00C6A2] text-white shadow-[0_30px_80px_rgba(31,95,255,0.35)]">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_52%)]" />
        <div className="relative z-10 flex flex-col gap-6 px-6 py-8 md:px-10 md:py-12 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl space-y-3">
            <p className="text-xs uppercase tracking-[0.4em] text-white/80">Mission control</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Transaction pipeline</h1>
            <p className="text-sm text-white/85">
              Watch contract milestones and compliance flags in one place. Hatch keeps an eye on deadlines and missing docs.
            </p>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur text-white/85">
                {summary.total} transactions
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 backdrop-blur text-white/85">
                {summary.closingSoon} closing soon
              </span>
              {agentLabel ? (
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 backdrop-blur text-white/85">
                  Filtered to <span className="font-medium text-white">{agentLabel}</span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid w-full gap-4 rounded-2xl border border-white/20 bg-white/15 p-5 backdrop-blur sm:grid-cols-2 lg:max-w-xl lg:grid-cols-4">
            <HeroStat label="Under contract" value={summary.underContract} helper="Active contracts" />
            <HeroStat label="Contingent" value={summary.contingent} helper="In contingency" />
            <HeroStat label="Needs attention" value={summary.requiresAction} helper="Docs & deadlines" tone="warning" />
            <HeroStat label="Closing soon" value={summary.closingSoon} helper="Next 14 days" />
          </div>
        </div>

        <div className="border-t border-white/10 bg-white/5 px-6 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="bg-white text-blue-700 hover:bg-blue-50" asChild>
                <Link to="/broker/mission-control">
                  <LayoutDashboard className="h-4 w-4" /> Back to Mission Control
                </Link>
              </Button>
              <Button
                variant="secondary"
                className="border border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                onClick={() => setHowItWorksOpen(true)}
              >
                <Info className="h-4 w-4" /> How it works
              </Button>
              {agentFilter ? (
                <Button
                  variant="secondary"
                  className="border border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                  onClick={clearAgentFilter}
                >
                  Clear agent filter
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-white/70">Tip: Use “Ask Hatch” on any row to get a prioritized TC checklist.</p>
          </div>
        </div>
      </section>

      <Card className="overflow-hidden hover:translate-y-0 hover:shadow-brand">
        <div className="flex flex-col gap-4 border-b border-[color:var(--hatch-card-border)] px-6 pb-4 pt-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-medium text-slate-900">Transactions</h2>
            <p className="text-sm text-slate-600">Surface-level view of brokerage deals.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--glass-border)] bg-white/25 p-1 backdrop-blur-md dark:bg-white/10">
              {filters.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleFilterChange(option.id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-200',
                    filter === option.id
                      ? 'border border-white/20 bg-white/50 text-slate-900 shadow-brand'
                      : 'text-slate-600 hover:bg-white/25 hover:text-slate-900 dark:text-ink-100/70 dark:hover:bg-white/10 dark:hover:text-ink-100'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Closing</TableHead>
              <TableHead>TC</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-rose-600">
                  Unable to load transactions.
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  Loading transactions…
                </TableCell>
              </TableRow>
            ) : filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No transactions match the selected filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map((txn) => {
                const needsAttention = txn.requiresAction || txn.isCompliant === false;
                const isSoon = isClosingSoon(txn.closingDate);

                return (
                  <TableRow
                    key={txn.id}
                    className={cn(needsAttention && 'odd:bg-rose-50/60 even:bg-rose-50/60 hover:bg-rose-50/70')}
                  >
                    <TableCell>
                      <div className="font-medium text-slate-900">
                        {txn.listing?.addressLine1 ?? 'Unlinked transaction'}
                      </div>
                      <p className="text-xs text-slate-500">
                        {txn.listing?.city} {txn.listing?.state} {txn.listing?.postalCode}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusBadgeVariant(txn.status)}>{formatStatus(txn.status)}</Badge>
                        {needsAttention ? <Badge variant="danger">Attention</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {txn.agentProfile?.user ? (
                        <>
                          <div className="font-medium text-slate-900">
                            {txn.agentProfile.user.firstName} {txn.agentProfile.user.lastName}
                          </div>
                          <p className="text-xs text-slate-500">{txn.agentProfile.user.email}</p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">Unassigned</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-slate-900">
                        {txn.closingDate ? new Date(txn.closingDate).toLocaleDateString() : '—'}
                      </div>
                      {isSoon ? (
                        <p className="mt-1 text-xs text-amber-700">Closing soon</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Badge variant={needsAttention ? 'danger' : 'neutral'}>
                          {needsAttention ? 'Needs attention' : 'Monitoring'}
                        </Badge>
                        <div className="space-y-1 text-xs text-slate-600">
                          {txn.inspectionDate ? (
                            <p>Inspection: {new Date(txn.inspectionDate).toLocaleDateString()}</p>
                          ) : null}
                          {txn.financingDate ? (
                            <p>Financing: {new Date(txn.financingDate).toLocaleDateString()}</p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {txn.listing?.listPrice ? currencyFormatter.format(txn.listing.listPrice) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          onClick={() => {
                            setDetailsTransactionId(txn.id);
                            setDetailsOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" /> Details
                        </Button>
                        <Button size="sm" variant="default" className="h-9" onClick={() => onAskHatch(txn)}>
                          <Sparkles className="h-4 w-4" /> Ask Hatch
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <HowItWorksDialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen} />

      <TransactionDetailsDialog
        orgId={orgId}
        role={role}
        transaction={detailsTransaction}
        open={detailsOpen}
        onOpenChange={(next) => {
          setDetailsOpen(next);
          if (!next) {
            setDetailsTransactionId(null);
          }
        }}
        onSave={async (transactionId, payload) => {
          await updateTransaction.mutateAsync({ transactionId, payload });
        }}
        saving={updateTransaction.isPending}
      />
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

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case 'CLOSED':
      return 'success' as const;
    case 'UNDER_CONTRACT':
      return 'info' as const;
    case 'CONTINGENT':
      return 'warning' as const;
    default:
      return 'neutral' as const;
  }
};

function HeroStat({
  label,
  value,
  helper,
  tone
}: {
  label: string;
  value: number;
  helper?: string;
  tone?: 'warning' | 'neutral';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-white/30 px-4 py-3 text-start shadow-inner shadow-white/20',
        tone === 'warning' && 'bg-amber-500/15'
      )}
    >
      <p className="text-xs uppercase tracking-wide text-white/80">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white md:text-4xl">{value}</p>
      {helper ? <p className="mt-1 text-xs text-white/75">{helper}</p> : null}
    </div>
  );
}

function HowItWorksDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>How the transaction pipeline works</DialogTitle>
          <DialogDescription>
            Hatch tracks milestones as you move a deal through stages. Some stages require key dates or documents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-slate-700">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stages</p>
            <ul className="mt-2 space-y-1">
              <li>
                <span className="font-semibold">Pre-contract</span> → intake &amp; parties.
              </li>
              <li>
                <span className="font-semibold">Under contract</span> → contract signed date or a passing purchase contract file.
              </li>
              <li>
                <span className="font-semibold">Contingent</span> → purchase contract + proof of funds (passing compliance).
              </li>
              <li>
                <span className="font-semibold">Closed</span> → closing date + passing closing disclosure.
              </li>
              <li>
                <span className="font-semibold">Cancelled</span> → can be reopened to pre-contract if needed.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</p>
            <p className="mt-2">
              If a stage change is blocked, Hatch will tell you exactly what’s missing (dates or required documents).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TRANSACTION_STATUSES = [
  'PRE_CONTRACT',
  'UNDER_CONTRACT',
  'CONTINGENT',
  'CLOSED',
  'CANCELLED'
] as const;

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function TransactionDetailsDialog({
  orgId,
  role,
  transaction,
  open,
  onOpenChange,
  onSave,
  saving
}: {
  orgId: string;
  role: string;
  transaction: OrgTransactionRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (transactionId: string, payload: UpdateOrgTransactionPayload) => Promise<void>;
  saving: boolean;
}) {
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['broker', 'transactions', orgId, transaction?.id, 'activity'],
    queryFn: () => fetchOrgTransactionActivity(orgId, transaction?.id ?? ''),
    enabled: Boolean(open && transaction?.id),
    staleTime: 10_000
  });

  const [form, setForm] = useState(() => ({
    status: transaction?.status ?? 'PRE_CONTRACT',
    buyerName: transaction?.buyerName ?? '',
    sellerName: transaction?.sellerName ?? '',
    contractSignedAt: toDateInputValue(transaction?.contractSignedAt),
    inspectionDate: toDateInputValue(transaction?.inspectionDate),
    financingDate: toDateInputValue(transaction?.financingDate),
    closingDate: toDateInputValue(transaction?.closingDate),
    requiresAction: Boolean(transaction?.requiresAction),
    isCompliant: transaction?.isCompliant ?? true,
    complianceNotes: transaction?.complianceNotes ?? ''
  }));
  const [error, setError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setRequirements(null);
    setForm({
      status: transaction?.status ?? 'PRE_CONTRACT',
      buyerName: transaction?.buyerName ?? '',
      sellerName: transaction?.sellerName ?? '',
      contractSignedAt: toDateInputValue(transaction?.contractSignedAt),
      inspectionDate: toDateInputValue(transaction?.inspectionDate),
      financingDate: toDateInputValue(transaction?.financingDate),
      closingDate: toDateInputValue(transaction?.closingDate),
      requiresAction: Boolean(transaction?.requiresAction),
      isCompliant: transaction?.isCompliant ?? true,
      complianceNotes: transaction?.complianceNotes ?? ''
    });
  }, [open, transaction]);

  const canEditCompliance = role === 'BROKER' || role === 'ADMIN';

  const listingLabel = transaction?.listing?.addressLine1?.trim() || 'Unlinked transaction';
  const statusLabel = transaction?.status ? formatStatus(transaction.status) : '—';

  const handleSave = async () => {
    if (!transaction) return;
    setError(null);
    setRequirements(null);

    const payload: UpdateOrgTransactionPayload = {};
    if (form.status !== transaction.status) payload.status = form.status;
    if ((form.buyerName || null) !== (transaction.buyerName ?? null)) payload.buyerName = form.buyerName || null;
    if ((form.sellerName || null) !== (transaction.sellerName ?? null)) payload.sellerName = form.sellerName || null;

    const contractSignedAt = form.contractSignedAt || null;
    if (contractSignedAt !== (toDateInputValue(transaction.contractSignedAt) || null)) payload.contractSignedAt = contractSignedAt;
    const inspectionDate = form.inspectionDate || null;
    if (inspectionDate !== (toDateInputValue(transaction.inspectionDate) || null)) payload.inspectionDate = inspectionDate;
    const financingDate = form.financingDate || null;
    if (financingDate !== (toDateInputValue(transaction.financingDate) || null)) payload.financingDate = financingDate;
    const closingDate = form.closingDate || null;
    if (closingDate !== (toDateInputValue(transaction.closingDate) || null)) payload.closingDate = closingDate;

    if (canEditCompliance) {
      if (form.requiresAction !== Boolean(transaction.requiresAction)) payload.requiresAction = form.requiresAction;
      if (Boolean(form.isCompliant) !== Boolean(transaction.isCompliant)) payload.isCompliant = Boolean(form.isCompliant);
      if ((form.complianceNotes || null) !== (transaction.complianceNotes ?? null)) payload.complianceNotes = form.complianceNotes || null;
    }

    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      await onSave(transaction.id, payload);
      onOpenChange(false);
    } catch (err: unknown) {
      const status = (err as any)?.status ?? (err as any)?.response?.status;
      const details = (err as any)?.details;
      if (status === 422 && details && typeof details === 'object') {
        const missing = (details as any)?.missing;
        if (Array.isArray(missing)) {
          setRequirements(missing.map((value) => String(value)));
        }
      }
      setError(err instanceof Error ? err.message : 'Unable to update transaction.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> Transaction details
          </DialogTitle>
          <DialogDescription>
            {listingLabel} · {statusLabel}
          </DialogDescription>
        </DialogHeader>

        {!transaction ? (
          <div className="text-sm text-slate-600">Select a transaction to view details.</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</label>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  {TRANSACTION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Buyer</label>
                  <Input value={form.buyerName} onChange={(event) => setForm((prev) => ({ ...prev, buyerName: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Seller</label>
                  <Input value={form.sellerName} onChange={(event) => setForm((prev) => ({ ...prev, sellerName: event.target.value }))} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Contract signed</label>
                  <Input type="date" value={form.contractSignedAt} onChange={(event) => setForm((prev) => ({ ...prev, contractSignedAt: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Inspection</label>
                  <Input type="date" value={form.inspectionDate} onChange={(event) => setForm((prev) => ({ ...prev, inspectionDate: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Financing</label>
                  <Input type="date" value={form.financingDate} onChange={(event) => setForm((prev) => ({ ...prev, financingDate: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Closing</label>
                  <Input type="date" value={form.closingDate} onChange={(event) => setForm((prev) => ({ ...prev, closingDate: event.target.value }))} />
                </div>
              </div>

              {canEditCompliance ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Broker controls</p>
                  <div className="mt-3 grid gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.requiresAction}
                        onChange={(event) => setForm((prev) => ({ ...prev, requiresAction: event.target.checked }))}
                      />
                      Requires action
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.isCompliant}
                        onChange={(event) => setForm((prev) => ({ ...prev, isCompliant: event.target.checked }))}
                      />
                      Mark compliant
                    </label>
                    <Textarea
                      value={form.complianceNotes}
                      onChange={(event) => setForm((prev) => ({ ...prev, complianceNotes: event.target.value }))}
                      placeholder="Compliance notes (optional)"
                    />
                  </div>
                </div>
              ) : null}

              {requirements && requirements.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Stage change blocked</p>
                  <ul className="mt-2 list-disc pl-5">
                    {requirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent activity</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {activityLoading ? (
                    <p className="text-sm text-slate-500">Loading activity…</p>
                  ) : (activity ?? []).length === 0 ? (
                    <p className="text-sm text-slate-500">No activity recorded yet.</p>
                  ) : (
                    (activity ?? []).slice(0, 10).map((event: OrgTransactionActivityEvent) => (
                      <div key={event.id} className="rounded-lg border border-slate-100 bg-slate-50/40 px-3 py-2">
                        <p className="font-medium text-slate-900">{event.message ?? event.type}</p>
                        <p className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!transaction || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
