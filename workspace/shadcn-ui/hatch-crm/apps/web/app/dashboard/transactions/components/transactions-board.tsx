"use client";

import Link from 'next/link';
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, type DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { normaliseApiError } from '@/lib/api/errors';
import { updateOrgTransaction, type OrgTransactionRecord } from '@/lib/api/org-transactions';
import { cn } from '@/lib/utils';

const STAGES = [
  { id: 'PRE_CONTRACT', label: 'Pre-contract' },
  { id: 'UNDER_CONTRACT', label: 'Under contract' },
  { id: 'CONTINGENT', label: 'Contingent' },
  { id: 'CLOSED', label: 'Closed' },
  { id: 'CANCELLED', label: 'Cancelled' }
] as const;

type StageId = (typeof STAGES)[number]['id'];

const STAGE_ID_SET = new Set<string>(STAGES.map((stage) => stage.id));

const REQUIRED_TRANSACTION_DOC_TYPES = ['PURCHASE_CONTRACT', 'ADDENDUM', 'CLOSING_DOC', 'PROOF_OF_FUNDS'] as const;
const NON_PASSING_DOC_STATUSES = new Set(['FAILED', 'NEEDS_REVIEW', 'UNKNOWN', 'PENDING']);

export function TransactionsBoard({ orgId, transactions }: { orgId: string; transactions: OrgTransactionRecord[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  );

  const transactionsByStage = useMemo(() => {
    const grouped: Record<StageId, OrgTransactionRecord[]> = {
      PRE_CONTRACT: [],
      UNDER_CONTRACT: [],
      CONTINGENT: [],
      CLOSED: [],
      CANCELLED: []
    };

    for (const txn of transactions) {
      if (STAGE_ID_SET.has(txn.status)) {
        grouped[txn.status as StageId].push(txn);
      } else {
        grouped.PRE_CONTRACT.push(txn);
      }
    }

    return grouped;
  }, [transactions]);

  const updateStatusMutation = useMutation({
    mutationFn: async (params: { transactionId: string; status: StageId }) =>
      updateOrgTransaction(orgId, params.transactionId, { status: params.status }),
    onMutate: async (variables) => {
      const queryKey = ['dashboard', 'transactions', orgId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<OrgTransactionRecord[]>(queryKey);

      queryClient.setQueryData<OrgTransactionRecord[]>(queryKey, (current) => {
        if (!current) return current;
        return current.map((txn) => (txn.id === variables.transactionId ? { ...txn, status: variables.status } : txn));
      });

      return { queryKey, previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }

      const normalized = normaliseApiError(error);
      const missing = (normalized.details as any)?.missing;
      toast({
        variant: 'destructive',
        title: normalized.message || 'Move failed',
        description: Array.isArray(missing) && missing.length ? `Missing: ${missing.join(', ')}` : undefined
      });
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context?.queryKey) {
        void queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
    }
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const overId = event.over?.id;
    if (!overId) return;

    const status = String(overId);
    if (!STAGE_ID_SET.has(status)) return;

    const transactionId = String(event.active.id);
    const txn = transactions.find((row) => row.id === transactionId);
    if (!txn) return;

    const nextStatus = status as StageId;
    if (txn.status === nextStatus) return;

    updateStatusMutation.mutate({ transactionId, status: nextStatus });
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <StageColumn key={stage.id} stage={stage} transactions={transactionsByStage[stage.id]} />
        ))}
      </div>
    </DndContext>
  );
}

function StageColumn({ stage, transactions }: { stage: (typeof STAGES)[number]; transactions: OrgTransactionRecord[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className="w-80 flex-shrink-0">
      <div className="flex items-center justify-between rounded-t-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
        <Badge variant="secondary">{transactions.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[520px] space-y-3 rounded-b-lg border border-t-0 border-slate-200 bg-white p-3',
          isOver && 'bg-slate-50'
        )}
      >
        {transactions.map((txn) => (
          <TransactionCard key={txn.id} txn={txn} />
        ))}
        {transactions.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">Drag a transaction here.</p> : null}
      </div>
    </div>
  );
}

function TransactionCard({ txn }: { txn: OrgTransactionRecord }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: txn.id
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const hasDocsIssue = hasMissingDocs(txn);
  const contractSummary = summarizeContracts(txn);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing',
        isDragging && 'rotate-1 opacity-75 shadow-lg'
      )}
      {...listeners}
      {...attributes}
    >
      <div className="space-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{txn.listing?.addressLine1 ?? 'Unlinked transaction'}</p>
          <p className="truncate text-xs text-slate-500">
            {txn.listing?.city} {txn.listing?.state} {txn.listing?.postalCode}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {txn.requiresAction || txn.isCompliant === false ? (
            <Badge className="border border-rose-100 bg-rose-50 text-rose-700">Needs attention</Badge>
          ) : null}
          {hasDocsIssue ? <Badge className="border border-amber-100 bg-amber-50 text-amber-700">Missing docs</Badge> : null}
          {contractSummary.unsigned > 0 ? (
            <Badge className="border border-blue-100 bg-blue-50 text-blue-700">Awaiting signature</Badge>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Closing</dt>
            <dd className="font-medium text-slate-800">{txn.closingDate ? new Date(txn.closingDate).toLocaleDateString() : '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Contracts</dt>
            <dd className="font-medium text-slate-800">
              {contractSummary.total ? `${contractSummary.total} total` : '—'}
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-2 pt-1 text-xs">
          {txn.listingId ? (
            <Link href={`/dashboard/properties/${txn.listingId}`} className="text-brand-600 hover:underline">
              Property
            </Link>
          ) : null}
          <Link href={`/dashboard/contracts?transactionId=${encodeURIComponent(txn.id)}`} className="text-brand-600 hover:underline">
            Contracts
          </Link>
        </div>
      </div>
    </Card>
  );
}

function hasMissingDocs(txn: OrgTransactionRecord) {
  const docs = (txn.documents ?? []).map((doc) => doc.orgFile).filter(Boolean);
  const missingRequired = REQUIRED_TRANSACTION_DOC_TYPES.some(
    (required) => !docs.some((doc) => doc?.documentType === required)
  );
  const failingDocs = docs.some((doc) => NON_PASSING_DOC_STATUSES.has(doc?.complianceStatus ?? ''));
  return missingRequired || failingDocs;
}

function summarizeContracts(txn: OrgTransactionRecord) {
  const contracts = txn.contractInstances ?? [];

  const unsigned = contracts.filter((contract) => contract.status === 'OUT_FOR_SIGNATURE').length;
  const signed = contracts.filter((contract) => contract.status === 'SIGNED').length;
  const draft = contracts.filter((contract) => contract.status === 'DRAFT').length;

  return { total: contracts.length, unsigned, signed, draft };
}
