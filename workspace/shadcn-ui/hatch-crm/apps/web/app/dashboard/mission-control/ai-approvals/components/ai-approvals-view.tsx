"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  approveAiPendingAction,
  executeAiPendingAction,
  fetchAiPendingActions,
  regenerateAiPendingAction,
  rejectAiPendingAction,
  type AiPendingAction,
  type ApprovalStatus
} from '@/lib/api/ai-approvals';

const statusOptions: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'executed', 'expired', 'superseded'];

const numberFormatter = new Intl.NumberFormat('en-US');

export function AiApprovalsView() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ApprovalStatus>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-approvals', status],
    queryFn: () => fetchAiPendingActions({ status, limit: 25 }),
    staleTime: 15_000
  });

  const items = data?.items ?? [];
  const countLabel = numberFormatter.format(items.length);

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => approveAiPendingAction(id, notes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-approvals'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectAiPendingAction(id, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-approvals'] });
    }
  });

  const regenerateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => regenerateAiPendingAction(id, content),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-approvals'] });
    }
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => executeAiPendingAction(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-approvals'] });
    }
  });

  const setEdit = (id: string, value: string) => {
    setDraftEdits((prev) => ({ ...prev, [id]: value }));
  };

  const getEdit = (action: AiPendingAction) => {
    return draftEdits[action.id] ?? action.generatedContent ?? '';
  };

  const busy = approveMutation.isPending || rejectMutation.isPending || regenerateMutation.isPending || executeMutation.isPending;

  const statusIcon = useMemo(() => {
    switch (status) {
      case 'pending':
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case 'approved':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-rose-600" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-slate-400" />;
    }
  }, [status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Mission Control</p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">AI Approvals</h1>
            <p className="text-sm text-slate-500">
              Review and approve AI-generated content before it’s used.
            </p>
          </div>
          <Link href="/dashboard/mission-control" className="text-sm font-medium text-slate-700 hover:text-slate-900">
            Back to Mission Control
          </Link>
        </div>
      </div>

      <Card className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            {statusIcon}
            <span className="font-medium">Showing</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{status}</span>
            <span className="text-slate-500">({countLabel})</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              value={status}
              onChange={(event) => setStatus(event.target.value as ApprovalStatus)}
              disabled={busy}
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => queryClient.invalidateQueries({ queryKey: ['ai-approvals'] })}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Unable to load AI approvals. Please retry shortly.
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <Card className="rounded-2xl border border-slate-100 bg-white p-6">
          <p className="text-sm text-slate-600">No AI actions found for this status.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((action) => {
            const isExpanded = expandedId === action.id;
            const canApproveOrReject = action.status === 'pending';
            const canExecute = action.status === 'approved';
            const canRegenerate = action.status === 'pending' || action.status === 'approved';

            return (
              <Card key={action.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[240px]">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Feature</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{action.feature}</p>
                    <p className="mt-1 text-xs text-slate-500">Action: {action.actionType}</p>
                  </div>
                  <div className="min-w-[200px]">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                    <p className="mt-1 text-sm text-slate-800">{action.status}</p>
                    <p className="mt-1 text-xs text-slate-500">Expires: {new Date(action.expiresAt).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setExpandedId(isExpanded ? null : action.id)}>
                      {isExpanded ? 'Hide' : 'View / Edit'}
                    </Button>

                    <Button
                      type="button"
                      disabled={!canApproveOrReject || approveMutation.isPending}
                      onClick={async () => {
                        const notes = window.prompt('Approval notes (optional):') ?? '';
                        await approveMutation.mutateAsync({ id: action.id, notes: notes.trim() || undefined });
                      }}
                    >
                      Approve
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      disabled={!canApproveOrReject || rejectMutation.isPending}
                      onClick={async () => {
                        const reason = window.prompt('Rejection reason (required):') ?? '';
                        if (!reason.trim()) return;
                        await rejectMutation.mutateAsync({ id: action.id, reason: reason.trim() });
                      }}
                    >
                      Reject
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canExecute || executeMutation.isPending}
                      onClick={() => executeMutation.mutate(action.id)}
                    >
                      Execute
                    </Button>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Preview</p>
                  <p className="mt-2 text-sm text-slate-700">{action.contentPreview}</p>
                </div>

                {isExpanded ? (
                  <div className="mt-4 space-y-3">
                    <Textarea
                      value={getEdit(action)}
                      onChange={(event) => setEdit(action.id, event.target.value)}
                      className="min-h-[220px] border-slate-200 bg-white"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canRegenerate || regenerateMutation.isPending}
                        onClick={() => regenerateMutation.mutate({ id: action.id, content: getEdit(action) })}
                      >
                        Regenerate with edits
                      </Button>
                      <p className="text-xs text-slate-500">
                        Tip: Edit the content above, then regenerate to create a new pending action.
                      </p>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

