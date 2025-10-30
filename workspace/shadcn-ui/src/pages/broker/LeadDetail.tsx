import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

import {
  getLead,
  getPipelines,
  type LeadDetail,
  type Pipeline
} from '@/lib/api/hatch'
import { getStageDisplay } from '@/lib/stageDisplay'
import ActivityFeed, { type ActivityItem } from '@/components/crm/ActivityFeed'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'

const tierBadgeClass = (tier: string) => {
  switch (tier) {
    case 'A':
      return 'bg-emerald-100 text-emerald-700'
    case 'B':
      return 'bg-blue-100 text-blue-700'
    case 'C':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

const formatEventDetails = (properties?: Record<string, unknown>) => {
  if (!properties) return undefined
  try {
    return Object.entries(properties)
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
      .join(' · ')
  } catch (error) {
    return JSON.stringify(properties)
  }
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLead = async () => {
      if (!id) return
      try {
        setLoading(true)
        const [leadData, pipelineData] = await Promise.all([getLead(id), getPipelines()])
        setLead(leadData)
        setPipelines(pipelineData)
        setError(null)
      } catch (err) {
        console.error('Failed to load lead', err)
        setError(err instanceof Error ? err.message : 'Failed to load lead')
      } finally {
        setLoading(false)
      }
    }

    void fetchLead()
  }, [id])

  const pipelineName = useMemo(() => {
    if (!lead) return 'No pipeline'
    return lead.pipelineName ?? lead.stage?.pipelineName ?? 'No pipeline'
  }, [lead])

  const stageName = lead?.stage?.name ?? 'Unassigned'
  const stageDisplay = getStageDisplay(stageName)
  const timeInStage = lead?.stageEnteredAt
    ? formatDistanceToNow(new Date(lead.stageEnteredAt), { addSuffix: true })
    : formatDistanceToNow(new Date(lead?.createdAt ?? Date.now()), { addSuffix: true })
  const lastTouchpoint = lead?.activityRollup?.lastTouchpointAt ?? lead?.lastActivityAt ?? null

  const activityItems = useMemo<ActivityItem[]>(() => {
    if (!lead) return []
    const items: ActivityItem[] = [
      ...lead.touchpoints.map((touchpoint) => ({
        id: `touchpoint-${touchpoint.id}`,
        title: `Touchpoint · ${touchpoint.type}`,
        occurredAt: touchpoint.occurredAt,
        description: touchpoint.summary || touchpoint.body || 'Interaction recorded',
        actor: touchpoint.recordedBy?.name
      })),
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
    ]

    return items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
  }, [lead])

  if (loading && !lead) {
    return (
      <div className="flex h-48 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading lead…
      </div>
    )
  }

  if (error || !lead) {
    return (
      <div className="space-y-4">
        <Link to="/broker/crm" className="inline-flex items-center text-sm text-brand-600 hover:text-brand-700">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to pipeline
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Lead not available</CardTitle>
            <CardDescription>{error ?? 'We could not find this lead.'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const openTasks = lead.tasks.filter((task) => task.status !== 'DONE')

  return (
    <div className="space-y-6">
      <Link to="/broker/crm" className="inline-flex items-center text-sm text-brand-600 hover:text-brand-700">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to pipeline
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-2xl">
                  {lead.firstName ?? '—'} {lead.lastName ?? ''}
                </CardTitle>
                <CardDescription>
                  {pipelineName} · {stageDisplay.short}
                  {stageDisplay.long ? ` · ${stageDisplay.long}` : ''} · Owner {lead.owner?.name ?? 'Unassigned'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={tierBadgeClass(lead.scoreTier)}>Tier {lead.scoreTier}</Badge>
                <Badge variant="secondary">Score {Math.round(lead.score ?? 0)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-slate-600 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time in stage</p>
                <p>{timeInStage}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last activity</p>
                <p>
                  {lastTouchpoint
                    ? formatDistanceToNow(new Date(lastTouchpoint), { addSuffix: true })
                    : 'No recent activity'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
                <p>{lead.email ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p>
                <p>{lead.phone ?? '—'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fit profile</CardTitle>
              <CardDescription>Qualification signals derived from fit scoring.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-slate-600 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preapproved</p>
                <p>{lead.fit?.preapproved ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Budget</p>
                <p>
                  {lead.fit?.budgetMin || lead.fit?.budgetMax
                    ? `${lead.fit?.budgetMin ? `$${lead.fit.budgetMin.toLocaleString()}` : '—'} - ${lead.fit?.budgetMax ? `$${lead.fit.budgetMax.toLocaleString()}` : '—'}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timeframe</p>
                <p>{lead.fit?.timeframeDays ? `${lead.fit.timeframeDays} days` : '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target area</p>
                <p>{lead.fit?.geo ?? '—'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Engagement timeline</CardTitle>
              <CardDescription>Events, notes, touchpoints, and tasks for this relationship.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityFeed items={activityItems} />
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Open tasks</CardTitle>
              <CardDescription>Outstanding follow-ups for this lead.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              {openTasks.length === 0 && <p>No active tasks.</p>}
              {openTasks.map((task) => (
                <div key={task.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-semibold text-slate-800">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {task.dueAt ? `Due ${format(new Date(task.dueAt), 'PPp')}` : 'No due date'}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Communication preferences</CardTitle>
              <CardDescription>Latest consent status captured for this contact.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-slate-600">
                {lead.consents.length === 0 && <p>No consent records captured.</p>}
                {lead.consents.map((consent) => (
                  <div key={consent.id} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                    <span>{consent.channel}</span>
                    <Badge variant={consent.status === 'GRANTED' ? 'default' : 'secondary'}>{consent.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pipeline map</CardTitle>
              <CardDescription>Stage order for quick reference.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              {pipelines.map((pipeline) => (
                <div key={pipeline.id} className="space-y-1">
                  <p className="font-semibold text-slate-800">{pipeline.name}</p>
                  <Separator />
                  <div className="flex flex-wrap gap-2 text-xs">
                    {pipeline.stages.map((stage) => {
                      const display = getStageDisplay(stage.name)
                      const isActive = stage.id === lead.stage?.id
                      return (
                        <Badge
                          key={stage.id}
                          variant={isActive ? 'default' : 'secondary'}
                          className="flex flex-col items-start gap-0.5 leading-tight"
                        >
                          <span className="text-[11px] font-semibold">
                            {display.short}
                          </span>
                          {display.long && (
                            <span
                              className={isActive ? 'text-[10px] text-white/80' : 'text-[10px] text-slate-600'}
                            >
                              {display.long}
                            </span>
                          )}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Button asChild variant="secondary">
        <Link to="/broker/crm">Return to pipeline</Link>
      </Button>
    </div>
  )
}
