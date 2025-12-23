import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  CheckSquare,
  Clock3,
  Mail,
  MapPin,
  NotebookPen,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  Users
} from 'lucide-react';
import { differenceInCalendarDays, format, formatDistanceToNow } from 'date-fns';
import { FIELD_MAP } from '@hatch/shared/layout';

import ActivityFeed, { type ActivityItem } from '@/components/activity/activity-feed';
import ContactActions from '@/components/contact-actions';
import { ReindexEntityButton } from '@/components/personas/ReindexEntityButton';
import { PersonaContextEmitter } from '@/components/personas/PersonaContextEmitter';
import { Section } from '@/components/ui/section';
import { type LeadDetail, type LeadStageSummary, getLead, getPipelines } from '@/lib/api';
import { resolveLayout } from '@/lib/api/admin.layouts';
import { applyLayout } from '@/lib/layouts/applyLayout';
import { LeadSectionNav } from './LeadSectionNav';
import { ListingsPanels } from './ListingsPanels';
import { LiveActivity } from './LiveActivity';

export const dynamic = 'force-dynamic';

export default async function LeadProfilePage({ params }: { params: { id: string } }) {
  const [lead, pipelines, layoutManifest] = await Promise.all([
    getLead(params.id),
    getPipelines(),
    resolveLayout({ object: 'leads', kind: 'detail' }).catch(() => null)
  ]);

  const displayName = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Lead';
  const stageName = lead.stage?.name ?? 'Unassigned';
  const pipelineName = lead.pipelineName ?? lead.stage?.pipelineName ?? 'No pipeline';
  const ownerName = lead.owner?.name ?? 'Unassigned';
  const leadTypeLabel =
    lead.leadType === 'BUYER' ? 'Buyer' : lead.leadType === 'SELLER' ? 'Seller' : 'Unknown';
  const timeInStage = formatDistanceToNow(new Date(lead.stageEnteredAt ?? lead.createdAt), {
    addSuffix: true
  });
  const lastActivity = lead.lastActivityAt
    ? formatDistanceToNow(new Date(lead.lastActivityAt), { addSuffix: true })
    : null;
  const openTasks = lead.tasks.filter((task) => task.status !== 'DONE');
  const touchesLast7Days = lead.events.filter((event) => {
    const days = differenceInCalendarDays(new Date(), new Date(event.timestamp));
    return days <= 7;
  }).length;

  const summaryNarrative = [
    touchesLast7Days
      ? `${touchesLast7Days} engagement ${touchesLast7Days === 1 ? 'touch' : 'touches'} this week`
      : 'No engagement yet this week',
    openTasks.length
      ? `${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'}`
      : 'No open tasks queued',
    lastActivity ? `last activity ${lastActivity}` : 'awaiting first outreach'
  ].join(' · ');

  const quickStats: QuickStatConfig[] = [
    { icon: CheckSquare, label: 'Open tasks', value: openTasks.length ? String(openTasks.length) : 'None' },
    { icon: Sparkles, label: 'Touches this week', value: String(touchesLast7Days) },
    { icon: Target, label: 'Stage', value: stageName },
    { icon: CalendarDays, label: 'Last activity', value: lastActivity ?? 'No recent activity' }
  ];

  const quickActions: QuickActionConfig[] = [
    {
      label: 'Call',
      icon: Phone,
      href: lead.phone ? `tel:${lead.phone}` : undefined,
      mutedLabel: lead.phone ? undefined : 'Phone unavailable'
    },
    {
      label: 'Text',
      icon: MessageCircle,
      href: lead.phone ? `sms:${lead.phone}` : undefined,
      mutedLabel: lead.phone ? undefined : 'Phone unavailable'
    },
    {
      label: 'Email',
      icon: Mail,
      href: lead.email ? `mailto:${lead.email}` : undefined,
      mutedLabel: lead.email ? undefined : 'Email unavailable'
    }
  ];

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
      description: `Status: ${task.status}${
        task.dueAt ? ` · Due ${format(new Date(task.dueAt), 'PPp')}` : ''
      }`,
      actor: task.assignee?.name ?? undefined
    }))
  ].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  const baseline = FIELD_MAP['leads'] ?? [];
  const allowedFields = Object.keys(lead ?? {});
  const manifestFields =
    layoutManifest?.fields ??
    baseline.map((field, index) => ({
      field: field.field,
      label: field.label,
      order: index,
      width: field.width
    }));
  const orderedFields = applyLayout({ fields: manifestFields }, allowedFields, baseline);

  const detailTiles = orderedFields
    .map((field) => ({
      key: field.field,
      label: field.label ?? field.field,
      value: renderFieldValue(field.field, {
        lead,
        stageName,
        leadStatus,
        leadSource
      })
    }))
    .filter((tile) => tile.value && tile.value !== '—');

  const nextTask = openTasks[0] ?? null;
  const consentSummary =
    lead.consents.length > 0
      ? lead.consents
          .map((consent) => {
            const statusLabel =
              consent.status === 'GRANTED'
                ? 'opted in'
                : consent.status === 'REVOKED'
                  ? 'opted out'
                  : consent.status.toLowerCase();
            return `${consent.channel.toLowerCase()}: ${statusLabel}`;
          })
          .join(' · ')
      : 'No consent captured';

  const leadPersonaContext = {
    surface: 'lead' as const,
    entityType: 'lead' as const,
    entityId: lead.id,
    summary: `${displayName} · ${stageName}`,
    metadata: {
      pipeline: pipelineName,
      owner: ownerName,
      touchesLast7Days,
      openTasks: openTasks.length,
      consentSummary,
      quickStats
    }
  };

  const leadSource = (lead as { source?: string | null }).source ?? undefined;
  const rawStatus = (lead as { status?: string | LeadStageSummary | null }).status;
  const leadStatus: string | null = (() => {
    if (typeof rawStatus === 'string') {
      return rawStatus;
    }
    if (rawStatus && typeof rawStatus === 'object' && typeof (rawStatus as LeadStageSummary).name === 'string') {
      return (rawStatus as LeadStageSummary).name ?? null;
    }
    if (typeof lead.stage === 'string') {
      return lead.stage;
    }
    if (typeof lead.stageId === 'string') {
      return lead.stageId;
    }
    return null;
  })();

  const infoGroups: InfoGroupConfig[] = [
    {
      title: 'Contact info',
      icon: Mail,
      items: [
        { label: 'Email', icon: Mail, value: lead.email ?? 'Not provided' },
        { label: 'Phone', icon: Phone, value: lead.phone ?? 'Not provided' }
      ]
    },
    {
      title: 'Ownership & source',
      icon: Users,
      items: [
        { label: 'Assigned agent', icon: Users, value: ownerName },
        { label: 'Lead type', icon: Target, value: leadTypeLabel },
        { label: 'Source', icon: Target, value: leadSource ?? '—' },
        { label: 'Pipeline', icon: Sparkles, value: pipelineName }
      ]
    },
    {
      title: 'Tasks & consent',
      icon: CheckSquare,
      items: [
        {
          label: 'Open tasks',
          icon: CheckSquare,
          value: openTasks.length
            ? `${openTasks.length} open${nextTask?.dueAt ? ` · next due ${format(new Date(nextTask.dueAt), 'PP p')}` : ''}`
            : 'No tasks yet — log the next best action to keep pace.'
        },
        {
          label: 'Latest note',
          icon: NotebookPen,
          value: lead.notes[0]?.author
            ? `${lead.notes[0].author.name} · ${format(new Date(lead.notes[0].createdAt), 'PPp')}`
            : 'No notes yet'
        },
        { label: 'Consent', icon: ShieldCheck, value: consentSummary }
      ]
    },
    {
      title: 'Status & dates',
      icon: Clock3,
      items: [
        { label: 'Stage', icon: Target, value: stageName },
        {
          label: 'Status',
          icon: Sparkles,
          value: leadStatus ?? 'Not specified'
        },
        {
          label: 'Created',
          icon: CalendarDays,
          value: lead.createdAt ? format(new Date(lead.createdAt), 'PP p') : '—'
        },
        {
          label: 'Updated',
          icon: CalendarDays,
          value: lead.updatedAt ? format(new Date(lead.updatedAt), 'PP p') : '—'
        }
      ]
    }
  ];

  const fitPills: FitPillConfig[] = [
    {
      label: 'Preapproved',
      prefix: '🏦',
      value: lead.fit?.preapproved ? 'Yes' : 'No'
    },
    {
      label: 'Budget',
      prefix: '💰',
      value:
        lead.fit?.budgetMin || lead.fit?.budgetMax
          ? [
              lead.fit?.budgetMin ? `$${lead.fit.budgetMin.toLocaleString()}` : '—',
              lead.fit?.budgetMax ? `$${lead.fit.budgetMax.toLocaleString()}` : '—'
            ].join(' – ')
          : '—'
    },
    {
      label: 'Timeframe',
      prefix: '⏱',
      value: lead.fit?.timeframeDays ? `${lead.fit.timeframeDays} days` : 'Flexible'
    },
    {
      label: 'Target area',
      prefix: '📍',
      value: lead.fit?.geo ?? 'Not specified'
    }
  ];

  const navSections = [
    { id: 'lead-overview', label: 'Overview', icon: User },
    {
      id: 'lead-engagement',
      label: 'Engagement',
      icon: Sparkles,
      count: lead.events.length + lead.notes.length + openTasks.length
    },
    {
      id: 'lead-fit',
      label: 'Listings & Fit',
      icon: MapPin,
      count: fitPills.filter((pill) => pill.value && pill.value !== '—').length
    },
    { id: 'lead-timeline', label: 'Timeline', icon: Clock3, count: activityItems.length }
  ];

  return (
    <>
      <PersonaContextEmitter context={leadPersonaContext} />
      <div className="space-y-8">
      <header className="sticky top-0 z-10 overflow-hidden rounded-3xl bg-gradient-to-r from-[#1F5FFF] via-[#396CFF] to-[#2A47FF] px-6 py-7 text-white/95 shadow-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_52%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
              {pipelineName}
            </p>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{displayName}</h1>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
                <span>Stage · {stageName}</span>
                <span>Time in stage · {timeInStage}</span>
                <span>Last activity · {lastActivity ?? 'No recent activity'}</span>
                <span>Assigned agent · {ownerName}</span>
                <span>Type · {leadTypeLabel}</span>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-white/80">{summaryNarrative}</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/75">
              {quickStats.map((stat) => (
                <QuickStat key={stat.label} {...stat} />
              ))}
            </div>
          </div>
          <div className="relative inline-flex min-w-[220px] flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-white/95 backdrop-blur-sm">
            <span className="text-[11px] uppercase tracking-[0.2em] text-white/65">Lead score</span>
            <span className="text-3xl font-semibold leading-snug">
              {Math.round(lead.score ?? 0)}
            </span>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">
              Tier {lead.scoreTier ?? '—'}
            </span>
            <div className="flex items-center gap-2 text-xs text-white/75">
              <Target className="h-3.5 w-3.5 opacity-80" />
              <span>{stageName}</span>
            </div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-2">
          {quickActions.map((action) => (
            <QuickActionButton key={action.label} {...action} />
          ))}
          <ReindexEntityButton entityType="lead" entityId={lead.id} />
        </div>
      </header>

      <LeadSectionNav sections={navSections} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,0.85fr)]">
        <div className="space-y-8">
          <Section
            id="lead-overview"
            title="Lead Overview"
            description="Contact details, context, and current responsibilities."
            icon={<User className="h-4 w-4" />}
            contentClassName="space-y-6"
          >
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {infoGroups.map((group) => (
                <InfoGroup key={group.title} {...group} />
              ))}
            </div>

            {detailTiles.length ? (
              <div className="border-t border-slate-200/60 pt-6">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  {detailTiles.map((tile) => (
                    <DetailField key={tile.key} label={tile.label} value={tile.value} />
                  ))}
                </dl>
              </div>
            ) : null}
          </Section>

          <Section
            id="lead-engagement"
            title="Engagement Summary"
            description="Recent touchpoints and activity worth noting."
            icon={<Sparkles className="h-4 w-4" />}
            contentClassName="space-y-6"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <EngagementMetric
                label="Touches this week"
                value={touchesLast7Days}
                helper={lastActivity ? `Last touch ${lastActivity}` : 'No recent touchpoints'}
              />
              <EngagementMetric
                label="Notes captured"
                value={lead.notes.length}
                helper={lead.notes[0] ? `Latest by ${lead.notes[0].author.name}` : 'Start documenting context'}
              />
              <EngagementMetric
                label="Open tasks"
                value={openTasks.length}
                helper={
                  openTasks[0]?.dueAt
                    ? `Next due ${format(new Date(openTasks[0].dueAt!), 'PP p')}`
                    : 'Keep the queue fresh'
                }
              />
            </div>
            <ListingsPanels contactId={params.id} />
          </Section>

          <Section
            id="lead-fit"
            title="Listings & Fit Insights"
            description="Budget, approval status, and property preferences."
            icon={<MapPin className="h-4 w-4" />}
            contentClassName="space-y-6"
          >
            <div className="rounded-xl border border-slate-200/60 bg-white/50 px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {fitPills.map((pill) => (
                  <FitPill key={pill.label} {...pill} />
                ))}
              </div>
            </div>
          </Section>

          <Section
            id="lead-timeline"
            title="Activity Timeline"
            description="Chronology of notes, tasks, and engagements."
            icon={<Clock3 className="h-4 w-4" />}
          >
            <ActivityFeed
              items={activityItems}
              emptyMessage="No activity captured yet—log a note or create a task to begin the story."
            />
          </Section>
        </div>

        <aside className="space-y-8 lg:sticky lg:top-24">
          <Section
            title="Live Activity"
            description="Streaming updates from portal interactions."
            icon={<Sparkles className="h-4 w-4" />}
          >
            <LiveActivity contactId={params.id} />
          </Section>

          <Section
            title="Pipeline & Follow-up"
            description="Stage changes, consent, and quick capture tools."
            icon={<Target className="h-4 w-4" />}
          >
            <ContactActions lead={lead} pipelines={pipelines} />
          </Section>
        </aside>
      </div>
      </div>
    </>
  );
}

interface QuickStatConfig {
  icon: LucideIcon;
  label: string;
  value: string;
}

function QuickStat({ icon: Icon, label, value }: QuickStatConfig) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/14">
        <Icon className="h-3.5 w-3.5 text-white/85" />
      </span>
      <span className="font-semibold text-white/90">{label}</span>
      <span className="text-white/70">· {value}</span>
    </span>
  );
}

interface QuickActionConfig {
  label: string;
  icon: LucideIcon;
  href?: string;
  mutedLabel?: string;
}

function QuickActionButton({ label, icon: Icon, href, mutedLabel }: QuickActionConfig) {
  const classes = clsx(
    'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white/90 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
    !href && 'cursor-not-allowed opacity-50'
  );
  if (!href) {
    return (
      <span className={classes} title={mutedLabel ?? 'Unavailable'}>
        <Icon className="h-4 w-4" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <a href={href} className={classes} title={label}>
      <Icon className="h-4 w-4" />
      <span className="sr-only">{label}</span>
    </a>
  );
}

interface InfoGroupConfig {
  title: string;
  icon: LucideIcon;
  items: InfoGroupItem[];
}

interface InfoGroupItem {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
}

function InfoGroup({ title, icon: Icon, items }: InfoGroupConfig) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white/50 px-4 py-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        {title}
      </p>
      <dl className="mt-3 divide-y divide-slate-200/60">
        {items.map((item) => (
          <div
            key={`${title}-${item.label}`}
            className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
          >
            <dt className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {item.icon ? <item.icon className="h-3.5 w-3.5 text-slate-400" /> : null}
              {item.label}
            </dt>
            <dd className="text-sm text-slate-700">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface DetailFieldProps {
  label: string;
  value: ReactNode;
}

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-700">{value}</dd>
    </>
  );
}

interface EngagementMetricProps {
  label: string;
  value: number;
  helper?: string;
}

function EngagementMetric({ label, value, helper }: EngagementMetricProps) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

interface FitPillConfig {
  label: string;
  value: string;
  prefix?: string;
}

function FitPill({ label, value, prefix }: FitPillConfig) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600">
      {prefix ? <span aria-hidden>{prefix}</span> : null}
      <span className="text-slate-500">{label}:</span>
      <span className="text-slate-800">{value}</span>
    </span>
  );
}

function renderFieldValue(
  field: string,
  context: {
    lead: LeadDetail;
    stageName: string;
    leadStatus: string | null;
    leadSource?: string;
  }
) {
  const { lead, stageName, leadStatus, leadSource } = context;
  switch (field) {
    case 'status':
      return leadStatus ?? stageName;
    case 'source': {
      return leadSource ?? '—';
    }
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
}

function formatEventDetails(properties?: Record<string, unknown>) {
  if (!properties) return undefined;
  try {
    return Object.entries(properties)
      .map(([key, value]) =>
        `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`
      )
      .join(' · ');
  } catch (error) {
    return JSON.stringify(properties);
  }
}
