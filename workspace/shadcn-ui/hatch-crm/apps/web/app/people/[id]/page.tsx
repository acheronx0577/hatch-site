import { format, formatDistanceToNow } from 'date-fns';
import { FIELD_MAP } from '@hatch/shared/layout';

import ActivityFeed, { type ActivityItem } from '@/components/activity/activity-feed';
import ContactActions from '@/components/contact-actions';
import { getLead, getPipelines } from '@/lib/api';
import { resolveLayout } from '@/lib/api/admin.layouts';
import { applyLayout } from '@/lib/layouts/applyLayout';

export const dynamic = 'force-dynamic';

export default async function LeadProfilePage({ params }: { params: { id: string } }) {
  const [lead, pipelines, layoutManifest] = await Promise.all([
    getLead(params.id),
    getPipelines(),
    resolveLayout({ object: 'leads', kind: 'detail' }).catch(() => null)
  ]);

  const stageName = lead.stage?.name ?? 'Unassigned';
  const pipelineName = lead.pipelineName ?? lead.stage?.pipelineName ?? 'No pipeline';
  const timeInStage = formatDistanceToNow(new Date(lead.stageEnteredAt ?? lead.createdAt), {
    addSuffix: true
  });
  const openTasks = lead.tasks.filter((task) => task.status !== 'DONE');

  const activityItems: ActivityItem[] = [
    ...lead.events.map((event) => ({
      id: `event-${event.id}`,
      title: event.name,
      occurredAt: event.timestamp,
      description: formatEventDetails(event.properties)
    })),
    ...lead.notes.map((note) => ({
      id: `note-${note.id}`,
      title: 'Note added',
      occurredAt: note.createdAt,
      description: note.body,
      actor: note.author.name
    })),
    ...lead.tasks.map((task) => ({
      id: `task-${task.id}`,
      title: `Task · ${task.title}`,
      occurredAt: task.createdAt,
      description: `Status: ${task.status}${task.dueAt ? ` · Due ${format(new Date(task.dueAt), 'PPp')}` : ''}`,
      actor: task.assignee?.name ?? undefined
    }))
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).reverse();

  const baseline = FIELD_MAP['leads'] ?? [];
  const allowedFields = Object.keys(lead ?? {});
  const manifestFields = layoutManifest?.fields ??
    baseline.map((field, index) => ({ field: field.field, label: field.label, order: index, width: field.width }));
  const orderedFields = applyLayout({ fields: manifestFields }, allowedFields, baseline);

  const renderFieldValue = (field: string) => {
    switch (field) {
      case 'status':
        return lead.status ?? stageName;
      case 'source':
        return lead.source ?? '—';
      case 'owner':
        return lead.owner?.name ?? 'Unassigned';
      case 'email':
        return lead.email ?? '—';
      case 'phone':
        return lead.phone ?? '—';
      case 'score':
        return typeof lead.score === 'number' ? Math.round(lead.score) : '—';
      case 'scoreTier':
        return lead.scoreTier ?? '—';
      case 'createdAt':
        return lead.createdAt ? format(new Date(lead.createdAt), 'PP p') : '—';
      case 'updatedAt':
        return lead.updatedAt ? format(new Date(lead.updatedAt), 'PP p') : '—';
      default: {
        const value = (lead as Record<string, unknown>)[field];
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <section className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {lead.firstName ?? '—'} {lead.lastName ?? ''}
              </h1>
              <p className="text-sm text-slate-500">
                {pipelineName} · {stageName} · Owner {lead.owner?.name ?? 'Unassigned'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded px-3 py-1 text-sm font-semibold text-slate-600">
                Score {Math.round(lead.score ?? 0)}
              </span>
              <span className="rounded bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">
                Tier {lead.scoreTier}
              </span>
            </div>
          </div>
          <dl className="mt-4 grid gap-4 text-sm text-slate-600 md:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time in stage</dt>
              <dd>{timeInStage}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last activity</dt>
              <dd>{lead.lastActivityAt ? formatDistanceToNow(new Date(lead.lastActivityAt), { addSuffix: true }) : 'No recent activity'}</dd>
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

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Fit profile</h2>
          <dl className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preapproved</dt>
              <dd>{lead.fit?.preapproved ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Budget</dt>
              <dd>
                {lead.fit?.budgetMin || lead.fit?.budgetMax
                  ? `${lead.fit?.budgetMin ? `$${lead.fit.budgetMin.toLocaleString()}` : '—'} - ${lead.fit?.budgetMax ? `$${lead.fit.budgetMax.toLocaleString()}` : '—'}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timeframe</dt>
              <dd>{lead.fit?.timeframeDays ? `${lead.fit.timeframeDays} days` : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target area</dt>
              <dd>{lead.fit?.geo ?? '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Engagement timeline</h2>
          <div className="mt-4">
            <ActivityFeed items={activityItems} />
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <ContactActions lead={lead} pipelines={pipelines} />

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Open tasks</h2>
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            {openTasks.length === 0 && <p>No active tasks.</p>}
            {openTasks.map((task) => (
              <div key={task.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="font-semibold text-slate-800">{task.title}</p>
                <p className="text-xs text-slate-500">
                  {task.dueAt ? `Due ${format(new Date(task.dueAt), 'PPp')}` : 'No due date'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Communication preferences</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {lead.consents.map((consent) => (
              <li key={consent.id} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span>{consent.channel}</span>
                <span className={consent.status === 'GRANTED' ? 'text-emerald-600' : 'text-amber-600'}>
                  {consent.status}
                </span>
              </li>
            ))}
            {lead.consents.length === 0 && <li>No consent records captured.</li>}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function formatEventDetails(properties?: Record<string, unknown>) {
  if (!properties) return undefined;
  try {
    return Object.entries(properties)
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
      .join(' · ');
  } catch (error) {
    return JSON.stringify(properties);
  }
}
