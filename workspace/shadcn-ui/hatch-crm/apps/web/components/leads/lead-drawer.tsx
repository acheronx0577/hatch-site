'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';
import { Loader2, X } from 'lucide-react';

import { ErrorBanner } from '@/components/error-banner';
import {
  getLead,
  type LeadDetail,
  type LeadSummary,
  type Pipeline,
  type PipelineStage
} from '@/lib/api';
import { useLeadActions } from '@/hooks/use-lead-actions';

type OwnerOption = { id: string; name: string };

export interface LeadDrawerProps {
  lead: LeadSummary;
  pipelines: Pipeline[];
  owners: OwnerOption[];
  onClose: () => void;
  onLeadUpdated?: (lead: LeadSummary) => void;
}

export function LeadDrawer({ lead, pipelines, owners, onClose, onLeadUpdated }: LeadDrawerProps) {
  const [detail, setDetail] = useState<LeadDetail>(() => createFallbackDetail(lead));
  const [loading, setLoading] = useState(true);
  const [noteDraft, setNoteDraft] = useState('');
  const { pending, error, clearError, changeStage, assignOwner, setLeadType, addNote } = useLeadActions(lead.id);

  useEffect(() => {
    let cancelled = false;
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const result = await getLead(lead.id);
        if (!cancelled) {
          setDetail(result);
        }
      } catch (err) {
        console.error('Failed to load lead details', err);
        if (!cancelled) {
          setDetail(createFallbackDetail(lead));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [lead]);

  const stageOptions = useMemo(() => {
    if (!pipelines.length) return [];
    const pipelineId =
      detail?.pipelineId ?? lead.pipelineId ?? lead.stage?.pipelineId ?? pipelines[0]?.id;
    const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
    return pipeline?.stages ?? [];
  }, [pipelines, detail, lead]);

  const activeStageId = detail?.stage?.id ?? detail?.stageId ?? lead.stage?.id ?? lead.stageId ?? null;

  const handleStageChange = async (stage: PipelineStage) => {
    try {
      const result = await changeStage(stage.id, stage.pipelineId);
      setDetail(result);
      onLeadUpdated?.(result);
    } catch {
      /* handled in hook */
    }
  };

  const handleOwnerChange = async (ownerId: string) => {
    if (!ownerId || ownerId === detail?.owner?.id) {
      return;
    }
    try {
      const result = await assignOwner(ownerId);
      setDetail(result);
      onLeadUpdated?.(result);
    } catch {
      /* handled in hook */
    }
  };

  const handleAddNote = async () => {
    const text = noteDraft.trim();
    if (!text) return;
    try {
      const note = await addNote(text);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              notes: [note, ...(prev.notes ?? [])]
            }
          : prev
      );
      setNoteDraft('');
    } catch {
      /* handled */
    }
  };

  const ownerOptions = useMemo(() => {
    const ids = new Set<string>();
    if (detail?.owner) {
      ids.add(detail.owner.id);
    }
    owners.forEach((owner) => ids.add(owner.id));
    return Array.from(ids).map((id) => {
      const option = owners.find((owner) => owner.id === id);
      return option ?? { id, name: detail?.owner?.name ?? 'Unknown agent' };
    });
  }, [owners, detail]);

  const displayName = detail
    ? `${detail.firstName ?? ''} ${detail.lastName ?? ''}`.trim() || 'Lead'
    : `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Lead';

  const lastActivity = detail?.lastActivityAt ?? lead.lastActivityAt;
  const stageEnteredAt = detail?.stageEnteredAt ?? lead.stageEnteredAt;
  const ownerName = detail?.owner?.name ?? lead.owner?.name ?? 'Unassigned';
  const stageName = detail?.stage?.name ?? lead.stage?.name ?? 'Unassigned';
  const pipelineName = detail?.pipelineName ?? lead.pipelineName ?? detail?.stage?.pipelineName ?? lead.stage?.pipelineName;
  const leadType = detail?.leadType ?? lead.leadType ?? 'UNKNOWN';

  return (
    <div className="fixed inset-0 z-40 flex">
      <button
        type="button"
        aria-label="Close lead drawer"
        className="flex-1 bg-slate-900/30"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-slate-500">{pipelineName ?? 'Pipeline'}</p>
            <h2 className="text-xl font-semibold text-slate-900">{displayName}</h2>
            <p className="text-sm text-slate-500">
              Stage · {stageName} · Assigned agent · {ownerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4">
              <ErrorBanner title="Lead update failed" detail={error} onDismiss={clearError} />
            </div>
          )}

          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading lead details…
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-700">At a glance</h3>
                <dl className="mt-3 grid gap-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Last activity
                    </dt>
                    <dd>{lastActivity ? formatDistanceToNow(new Date(lastActivity), { addSuffix: true }) : 'No recent activity'}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Time in stage
                    </dt>
                    <dd>{stageEnteredAt ? formatDistanceToNow(new Date(stageEnteredAt), { addSuffix: true }) : '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Score
                    </dt>
                    <dd>{Math.round(detail.score ?? 0)} · Tier {detail.scoreTier}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Contact
                    </dt>
                    <dd className="text-right">
                      <div>{detail.email ?? '—'}</div>
                      <div>{detail.phone ?? '—'}</div>
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-700">Stage</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {stageOptions.map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      disabled={pending === 'stage'}
                      onClick={() => handleStageChange(stage)}
                      className={clsx(
                        'rounded-full border px-3 py-1 text-xs font-semibold transition',
                        stage.id === activeStageId
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600',
                        pending === 'stage' && 'opacity-60'
                      )}
                    >
                      {stage.name}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">Assigned agent</h3>
                <select
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  value={detail.owner?.id ?? ''}
                  disabled={pending === 'assign'}
                  onChange={(event) => handleOwnerChange(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">Lead type</h3>
                <select
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  value={leadType}
                  disabled={pending === 'type'}
                  onChange={async (event) => {
                    const nextType = event.target.value as typeof leadType;
                    if (!nextType || nextType === leadType) return;
                    try {
                      const result = await setLeadType(nextType);
                      setDetail(result);
                      onLeadUpdated?.(result);
                    } catch {
                      /* handled in hook */
                    }
                  }}
                >
                  <option value="UNKNOWN">Unknown</option>
                  <option value="BUYER">Buyer</option>
                  <option value="SELLER">Seller</option>
                </select>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">Add note</h3>
                <textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  rows={3}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="Log a quick follow-up note…"
                  disabled={pending === 'note'}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={pending === 'note' || !noteDraft.trim()}
                    className="inline-flex items-center rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending === 'note' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add note
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Recent notes</h3>
                  {detail.notes.length > 0 && (
                    <span className="text-xs text-slate-500">
                      {detail.notes.length} total
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {detail.notes.length === 0 && (
                    <p className="text-sm text-slate-500">No notes captured yet.</p>
                  )}
                  {detail.notes.slice(0, 5).map((note) => (
                    <article key={note.id} className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <header className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                        <span>{note.author.name}</span>
                        <span>{format(new Date(note.createdAt), 'PP p')}</span>
                      </header>
                      <p className="whitespace-pre-wrap">{note.body}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default LeadDrawer;

function createFallbackDetail(summary: LeadSummary): LeadDetail {
  return {
    ...summary,
    notes: [],
    tasks: [],
    consents: [],
    events: [],
    fit:
      summary.preapproved !== undefined ||
      summary.budgetMin !== undefined ||
      summary.budgetMax !== undefined ||
      summary.timeframeDays !== undefined
        ? {
            preapproved: summary.preapproved ?? undefined,
            budgetMin: summary.budgetMin ?? null,
            budgetMax: summary.budgetMax ?? null,
            timeframeDays: summary.timeframeDays ?? null,
            geo: null,
            inventoryMatch: null
          }
        : null
  };
}
