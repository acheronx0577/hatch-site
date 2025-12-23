import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Phone, Pencil } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

import {
  getLead,
  getPipelines,
  type LeadDetail,
  type LeadSummary,
  type Pipeline,
  startVoiceCall,
  createLeadTouchpoint,
  type LeadTouchpointType,
  type MessageChannelType,
  updateLead
} from '@/lib/api/hatch'
import {
  listSequences,
  enrollLeadInSequence,
  draftNextForLead
} from '@/lib/api/outreach'
import { getStageDisplay } from '@/lib/stageDisplay'
import ActivityFeed, { type ActivityItem } from '@/components/crm/ActivityFeed'
import { ReindexEntityButton } from '@/components/copilot/ReindexEntityButton'
import { EntityPresenceIndicator } from '@/components/presence/EntityPresenceIndicator'
import { EntityTimeline } from '@/components/timeline/EntityTimeline'
import { LeadScoreBadge } from '@/components/leads/LeadScoreBadge'
import { LeadScoreExplanation } from '@/components/leads/LeadScoreExplanation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { getLatestDripStepForLead } from '@/lib/api/drip-campaigns'
import { emitCopilotContext } from '@/lib/copilot/events'
import { emitAskHatchOpen } from '@/lib/ask-hatch/events'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ApiError } from '@/lib/api/errors'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

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

const buildLeadDetailFromSummary = (lead: LeadSummary): LeadDetail => {
  const hasFitData =
    typeof lead.preapproved === 'boolean' ||
    typeof lead.budgetMin === 'number' ||
    typeof lead.budgetMax === 'number' ||
    typeof lead.timeframeDays === 'number'

  return {
    ...lead,
    notes: [],
    tasks: [],
    consents: [],
    events: [],
    touchpoints: [],
    fit: hasFitData
      ? {
          preapproved: lead.preapproved,
          budgetMin: lead.budgetMin ?? null,
          budgetMax: lead.budgetMax ?? null,
          timeframeDays: lead.timeframeDays ?? null,
          geo: null,
          inventoryMatch: null
        }
      : null
  }
}

type LeadDetailLocationState = {
  lead?: LeadSummary
  skipRemoteFetch?: boolean
} | null

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const locationState = location.state as LeadDetailLocationState
  const initialLeadSummary = locationState?.lead
  const skipRemoteFetch = Boolean(locationState?.skipRemoteFetch)
  const fallbackLeadDetail = useMemo(
    () => (initialLeadSummary ? buildLeadDetailFromSummary(initialLeadSummary) : null),
    [initialLeadSummary]
  )
  const [lead, setLead] = useState<LeadDetail | null>(fallbackLeadDetail)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sequences, setSequences] = useState<Array<{ id: string; name: string }>>([])
  const [sequenceId, setSequenceId] = useState('')
  const [sequenceMsg, setSequenceMsg] = useState<string | null>(null)
  const [sequenceBusy, setSequenceBusy] = useState(false)
  const [draftMsg, setDraftMsg] = useState<string | null>(null)
  const [draftBusy, setDraftBusy] = useState(false)
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(
    fallbackLeadDetail ? 'Showing cached lead snapshot while we sync with the CRM…' : null
  )
  const [nextDrip, setNextDrip] = useState<{
    actionType?: string
    offsetHours?: number
    payload?: Record<string, unknown> | null
  } | null>(null)
  const [calling, setCalling] = useState(false)
  const [callMsg, setCallMsg] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    leadType: 'UNKNOWN',
    consentEmail: false,
    consentSMS: false,
    doNotContact: false
  })

  useEffect(() => {
    if (!fallbackLeadDetail) {
      setFallbackNotice(null)
      return
    }
    setLead((current) => {
      if (!current || current.id !== fallbackLeadDetail.id) {
        return fallbackLeadDetail
      }
      return current
    })
    setFallbackNotice((current) => current ?? 'Showing cached lead snapshot while we sync with the CRM…')
  }, [fallbackLeadDetail])

  useEffect(() => {
    let cancelled = false
    const loadPipelines = async () => {
      try {
        const data = await getPipelines()
        if (!cancelled) {
          setPipelines(data)
        }
      } catch (err) {
        console.error('Failed to load pipelines', err)
      }
    }
    void loadPipelines()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!id) return
    if (skipRemoteFetch) {
      setLoading(false)
      return
    }

    let cancelled = false
    const fetchLead = async () => {
      try {
        setLoading(true)
        const leadData = await getLead(id)
        if (cancelled) return
        setLead(leadData)
        setError(null)
        setFallbackNotice(null)
      } catch (err) {
        console.error('Failed to load lead', err)
        if (err instanceof ApiError && err.status === 404 && fallbackLeadDetail) {
          setError(null)
          setFallbackNotice('This lead is no longer in Hatch. Showing the last known snapshot.')
          setLead(fallbackLeadDetail)
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load lead')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchLead()
    return () => {
      cancelled = true
    }
  }, [fallbackLeadDetail, id, skipRemoteFetch])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const loadNextDrip = async () => {
      try {
        const res = await getLatestDripStepForLead(TENANT_ID, id)
        if (cancelled) return
        if (res?.nextStep) {
          setNextDrip({
            actionType: res.nextStep.actionType,
            offsetHours: res.nextStep.offsetHours,
            payload: res.nextStep.payload ?? null
          })
        } else {
          setNextDrip(null)
        }
      } catch {
        setNextDrip(null)
      }
    }
    void loadNextDrip()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    const loadSequences = async () => {
      try {
        const data = await listSequences()
        setSequences(data)
        if (!sequenceId && data.length > 0) {
          setSequenceId(data[0].id)
        }
      } catch (err) {
        console.error('Failed to load outreach sequences', err)
      }
    }

    void loadSequences()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        title:
          touchpoint.type === 'CALL'
            ? '📞 Outbound call'
            : `Touchpoint · ${touchpoint.type}`,
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

  useEffect(() => {
    if (!lead) return
    emitCopilotContext({
      surface: 'lead',
      entityType: 'lead',
      entityId: lead.id,
      summary: `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || lead.email || lead.id,
      metadata: {
        stage: stageName,
        pipeline: pipelineName,
        scoreTier: lead.scoreTier ?? null,
        timeInStage,
        owner: lead.owner?.name ?? 'Unassigned',
        lastTouchpointAt: lastTouchpoint,
        email: lead.email ?? null
      }
    })
  }, [lead, pipelineName, stageName, timeInStage, lastTouchpoint])

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

  const startSequence = async () => {
    if (!sequenceId) {
      setSequenceMsg('Select a sequence first.')
      return
    }
    try {
      setSequenceBusy(true)
      setSequenceMsg('Enrolling…')
      await enrollLeadInSequence(lead.id, sequenceId)
      setSequenceMsg('Sequence started')
    } catch (err) {
      setSequenceMsg(err instanceof Error ? err.message : 'Unable to start sequence')
    } finally {
      setSequenceBusy(false)
    }
  }

  const draftEmail = async () => {
    try {
      setDraftBusy(true)
      setDraftMsg('Drafting…')
      const result = await draftNextForLead(lead.id)
      setDraftMsg(result?.subject ? `Draft created: ${result.subject}` : 'Draft created')
    } catch (err) {
      setDraftMsg(err instanceof Error ? err.message : 'Draft failed')
    } finally {
      setDraftBusy(false)
    }
  }

  const noticeBanner = fallbackNotice ? (
    <Alert className="border-amber-200 bg-amber-50 text-amber-800">
      <AlertTitle>Cached snapshot</AlertTitle>
      <AlertDescription>{fallbackNotice}</AlertDescription>
    </Alert>
  ) : null

  const openFollowUpChat = () => {
    if (!lead) return
    const label = `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || lead.email || lead.id
    emitAskHatchOpen({
      title: `Lead · ${label}`,
      contextType: 'LEAD',
      contextId: lead.id,
      contextSnapshot: {
        title: label,
        subtitle: lead.email ?? null,
        href: `/broker/crm/leads/${lead.id}`,
        fields: [
          { label: 'Pipeline', value: pipelineName },
          { label: 'Stage', value: stageName },
          { label: 'Lead type', value: lead.leadType ?? 'UNKNOWN' },
          { label: 'Representing Licensee', value: lead.owner?.name ?? 'Unassigned' }
        ]
      }
    })
  }

  const openEdit = () => {
    if (!lead) return
    setForm({
      firstName: lead.firstName ?? '',
      lastName: lead.lastName ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      leadType: lead.leadType ?? 'UNKNOWN',
      consentEmail: Boolean(lead.consents.find((c) => c.channel === 'EMAIL' && c.status === 'GRANTED')),
      consentSMS: Boolean(lead.consents.find((c) => c.channel === 'SMS' && c.status === 'GRANTED')),
      doNotContact: false
    })
    setEditMsg(null)
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!lead) return
    try {
      setEditBusy(true)
      setEditMsg('Saving…')
      const updated = await updateLead(lead.id, {
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        leadType: form.leadType,
        consentEmail: form.consentEmail,
        consentSMS: form.consentSMS,
        doNotContact: form.doNotContact
      })
      setLead(updated)
      setEditMsg('Saved')
      setTimeout(() => setEditOpen(false), 400)
    } catch (err) {
      console.error('Failed to update lead', err)
      setEditMsg(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setEditBusy(false)
    }
  }

  const startCall = async () => {
    if (!lead?.phone) {
      setCallMsg('No phone number on file')
      return
    }
    const e164 = /^\+[1-9]\d{1,14}$/
    if (!e164.test(lead.phone)) {
      setCallMsg('Invalid phone format. Expected E.164 like +16465550123')
      return
    }
    try {
      setCalling(true)
      setCallMsg('Calling…')
      const res = await startVoiceCall({ to: lead.phone })
      if (res?.success) {
        setCallMsg('Call in progress')
        // Log a touchpoint: Call started
        try {
          const summary = `Outbound call started to ${lead.phone}`
          const metadata: Record<string, unknown> = { sid: res.sid, to: lead.phone, channel: 'VOICE' }
          const now = new Date().toISOString()
          const result = await createLeadTouchpoint(lead.id, {
            type: 'CALL' as LeadTouchpointType,
            channel: 'VOICE' as MessageChannelType,
            summary,
            metadata,
            occurredAt: now
          })
          // Optimistically update activity timeline
          setLead((prev) =>
            prev
              ? {
                  ...prev,
                  touchpoints: [result.touchpoint, ...prev.touchpoints]
                }
              : prev
          )
        } catch (err) {
          console.error('Failed to record call touchpoint', err)
        }
      } else {
        setCallMsg('Failed to start call')
      }
    } catch (err) {
      console.error('Call failed', err)
      setCallMsg(err instanceof Error ? err.message : 'Call failed')
    } finally {
      setTimeout(() => setCalling(false), 800)
    }
  }

  const computeEchoSuggestion = () => {
    if (!lead) return null
    const now = Date.now()
    const last = lead.activityRollup?.lastTouchpointAt
      ? new Date(lead.activityRollup.lastTouchpointAt).getTime()
      : lead.lastActivityAt
        ? new Date(lead.lastActivityAt).getTime()
        : null
    const days = last ? Math.floor((now - last) / 86_400_000) : null
    if (days === null || days >= 3) {
      return `Echo suggests calling this lead today because there has ${days ? `been no activity for ${days} days` : 'been no recent activity'}.`
    }
    if ((lead.scoreTier ?? '').toUpperCase() === 'A') {
      return 'Echo suggests calling: high-priority A-tier lead.'
    }
    return null
  }
  const echoSuggestion = computeEchoSuggestion()

  return (
    <div className="space-y-6">
      <Link to="/broker/crm" className="inline-flex items-center text-sm text-brand-600 hover:text-brand-700">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to pipeline
      </Link>

      {noticeBanner}

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
                  {stageDisplay.long ? ` · ${stageDisplay.long}` : ''}{lead.leadType && lead.leadType !== 'UNKNOWN' ? ` · ${lead.leadType === 'BUYER' ? 'Buyer lead' : 'Seller lead'}` : ''} · Representing Licensee {lead.owner?.name ?? 'Unassigned'}
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2 text-right text-xs">
                <EntityPresenceIndicator entityType="lead" entityId={lead.id} />
                <ReindexEntityButton entityType="lead" entityId={lead.id} />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={openEdit}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit lead
                  </Button>
                  <Button size="sm" variant="secondary" onClick={openFollowUpChat}>
                    Ask Hatch
                  </Button>
                  {nextDrip ? (
                    <div className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] text-indigo-800">
                      Next drip: {nextDrip.actionType} @ {nextDrip.offsetHours}h
                    </div>
                  ) : null}
                  <Button size="sm" onClick={() => void startCall()} disabled={calling}>
                    <Phone className="mr-2 h-4 w-4" /> {calling ? 'Calling…' : 'Call lead'}
                  </Button>
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={sequenceId}
                    onChange={(event) => setSequenceId(event.target.value)}
                  >
                    <option value="">Select outreach sequence</option>
                    {sequences.map((seq) => (
                      <option key={seq.id} value={seq.id}>
                        {seq.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded border px-2 py-1 disabled:opacity-50"
                    onClick={() => void startSequence()}
                    disabled={sequenceBusy || !sequenceId}
                  >
                    {sequenceBusy ? 'Enrolling…' : 'Enroll'}
                  </button>
                  <button
                    className="rounded border px-2 py-1 disabled:opacity-50"
                    onClick={() => void draftEmail()}
                    disabled={draftBusy}
                  >
                    {draftBusy ? 'Drafting…' : 'Draft Next Email (AI)'}
                  </button>
                </div>
                {(sequenceMsg || draftMsg) && (
                  <span className="text-[11px] text-slate-500">
                    {[sequenceMsg, draftMsg].filter(Boolean).join(' · ')}
                  </span>
                )}
                {editMsg && <span className="text-[11px] text-slate-500">{editMsg}</span>}
                {callMsg && <span className="text-[11px] text-slate-500">{callMsg}</span>}
                {echoSuggestion && (
                  <div className="mt-1 max-w-[360px] text-[11px] text-slate-500">
                    {echoSuggestion}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <LeadScoreBadge leadId={lead.id} />
                  <Badge className={tierBadgeClass(lead.scoreTier)}>Tier {lead.scoreTier}</Badge>
                </div>
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
          <LeadScoreExplanation leadId={lead.id} />

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
              <CardTitle>AI Lead Insights</CardTitle>
              <CardDescription>Latest AI scoring and conversion signals.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3 text-sm text-slate-700">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">AI score</p>
                <p className="text-lg font-semibold">{lead.aiScore ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Conversion likelihood</p>
                <p className="text-lg font-semibold">
                  {lead.conversionLikelihood != null ? `${Math.round(lead.conversionLikelihood * 100)}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Last scored</p>
                <p className="text-lg font-semibold">
                  {lead.lastAiScoreAt ? formatDistanceToNow(new Date(lead.lastAiScoreAt), { addSuffix: true }) : '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Engagement timeline</CardTitle>
              <CardDescription>Events, notes, touchpoints, and tasks for this relationship.</CardDescription>
            </CardHeader>
            <CardContent>
              {nextDrip ? (
                <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">Next drip step</span>
                    <Badge className="bg-indigo-100 text-indigo-800">
                      {nextDrip.actionType} @ {nextDrip.offsetHours}h
                    </Badge>
                  </div>
                  {nextDrip.payload && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-white px-2 py-1 text-[11px] text-slate-600">
                      {JSON.stringify(nextDrip.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ) : null}
              <ActivityFeed items={activityItems} />
            </CardContent>
          </Card>

          <EntityTimeline entityType="lead" entityId={lead.id} />
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

      {/* Edit Lead Dialog */}
      <EditLeadDialog
        open={editOpen}
        busy={editBusy}
        form={form}
        setForm={setForm}
        onClose={() => setEditOpen(false)}
        onSave={() => void saveEdit()}
      />
    </div>
  )
}

function EditLeadDialog({
  open,
  busy,
  form,
  setForm,
  onClose,
  onSave
}: {
  open: boolean
  busy: boolean
  form: { firstName: string; lastName: string; email: string; phone: string; leadType: string; consentEmail: boolean; consentSMS: boolean; doNotContact: boolean }
  setForm: React.Dispatch<React.SetStateAction<{ firstName: string; lastName: string; email: string; phone: string; leadType: string; consentEmail: boolean; consentSMS: boolean; doNotContact: boolean }>>
  onClose: () => void
  onSave: () => void
}) {
  const e164Hint = 'E.164, e.g. +16465550123'
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? undefined : onClose())}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Edit lead</DialogTitle>
          <DialogDescription>Update contact details and preferences.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" placeholder={e164Hint} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="leadType">Lead type</Label>
            <select
              id="leadType"
              className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.leadType}
              onChange={(e) => setForm((f) => ({ ...f, leadType: e.target.value }))}
            >
              <option value="UNKNOWN">Unknown</option>
              <option value="BUYER">Buyer</option>
              <option value="SELLER">Seller</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.consentEmail} onCheckedChange={(v) => setForm((f) => ({ ...f, consentEmail: v }))} /> Email consent
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.consentSMS} onCheckedChange={(v) => setForm((f) => ({ ...f, consentSMS: v }))} /> SMS consent
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.doNotContact} onCheckedChange={(v) => setForm((f) => ({ ...f, doNotContact: v }))} /> Do not contact
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
