import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { differenceInDays, differenceInMinutes, formatDistanceToNow } from 'date-fns'

import {
  LeadActivityRollup,
  LeadSummary,
  Pipeline,
  PipelineStage,
  updateLead,
  startVoiceCall,
  createLeadTouchpoint,
  type LeadTouchpointType,
  type MessageChannelType
} from '@/lib/api/hatch'
import { getStageDisplay } from '@/lib/stageDisplay'
import { cn } from '@/lib/utils'
import { useLeadMessaging } from '@/contexts/LeadMessagingContext'
import { useToast } from '@/components/ui/use-toast'
import { useLeadDetailView } from '@/hooks/useLeadDetailView'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlarmClock, CheckCircle, Eye, Mail, MessageSquare, MoreHorizontal, Phone, Sparkles, Search, Rows2, Minimize2, Plus } from 'lucide-react'
import LeadDrawer from './LeadDrawer'

interface PipelineBoardProps {
  pipelines: Pipeline[]
  initialLeads: LeadSummary[]
  onRefresh?: () => Promise<void> | void
  showHero?: boolean
  onRequestAddLead?: () => void
}

export default function PipelineBoard({
  pipelines,
  initialLeads,
  onRefresh,
  showHero = true,
  onRequestAddLead
}: PipelineBoardProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { openForLead } = useLeadMessaging()
  const [leads, setLeads] = useState<LeadSummary[]>(initialLeads)
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(pipelines[0]?.id ?? '')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [leadTypeFilter, setLeadTypeFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [activityFilter, setActivityFilter] = useState<string>('all')
  const [preapprovedOnly, setPreapprovedOnly] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [compactMode, setCompactMode] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const snapshotRef = useRef<LeadSummary[] | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const overdueInitializedRef = useRef(false)
  const overduePreviousCountRef = useRef(0)
  const { isOpen: isDrawerOpen, leadId: activeLeadId, openLeadDetails, setIsOpen: setDrawerOpen } = useLeadDetailView({ closeDelayMs: 300 })
  const [activeLeadSnapshot, setActiveLeadSnapshot] = useState<LeadSummary | null>(null)

  useEffect(() => {
    setLeads(initialLeads)
  }, [initialLeads])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const handleTouchpoint = (event: Event) => {
      const { detail } = event as CustomEvent<{
        personId?: string
        timestamp?: string
        score?: number
        scoreTier?: string
        activityRollup?: LeadActivityRollup
        lastActivityAt?: string
      }>
      const personId = detail?.personId
      if (!personId) return
      const timestamp = detail?.timestamp ?? new Date().toISOString()
      setLeads((previous) =>
        previous.map((lead) => {
          if (lead.id !== personId) return lead
          const rollup = lead.activityRollup ?? {
            last7dListingViews: 0,
            last7dSessions: 0,
            lastReplyAt: null,
            lastEmailOpenAt: null,
            lastTouchpointAt: null
          }
          const incomingRollup = detail.activityRollup
          const updatedRollup: LeadActivityRollup = {
            last7dListingViews: incomingRollup?.last7dListingViews ?? rollup.last7dListingViews,
            last7dSessions: incomingRollup?.last7dSessions ?? rollup.last7dSessions,
            lastReplyAt: incomingRollup?.lastReplyAt ?? rollup.lastReplyAt ?? timestamp,
            lastEmailOpenAt: incomingRollup?.lastEmailOpenAt ?? rollup.lastEmailOpenAt ?? null,
            lastTouchpointAt: incomingRollup?.lastTouchpointAt ?? timestamp
          }
          return {
            ...lead,
            lastActivityAt: detail.lastActivityAt ?? timestamp,
            score: detail.score ?? lead.score,
            scoreTier: detail.scoreTier ?? lead.scoreTier,
            activityRollup: updatedRollup
          }
        })
      )
    }

    window.addEventListener('hatch:conversation:touchpoint', handleTouchpoint as EventListener)
    return () => {
      window.removeEventListener('hatch:conversation:touchpoint', handleTouchpoint as EventListener)
    }
  }, [])

  const stageLookup = useMemo(() => {
    const map = new Map<string, { stage: PipelineStage; pipeline: Pipeline }>()
    pipelines.forEach((pipeline) => {
      pipeline.stages.forEach((stage) => {
        map.set(stage.id, { stage, pipeline })
      })
    })
    return map
  }, [pipelines])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  )

  const selectedPipeline = useMemo(() => {
    if (!pipelines.length) return undefined
    return pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? pipelines[0]
  }, [pipelines, selectedPipelineId])

  const owners = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    leads.forEach((lead) => {
      if (lead.owner) {
        map.set(lead.owner.id, {
          id: lead.owner.id,
          name: lead.owner.name
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [leads])

  const activeLead = useMemo(() => {
    if (!activeLeadId) return null
    return leads.find((lead) => lead.id === activeLeadId) ?? activeLeadSnapshot
  }, [activeLeadId, activeLeadSnapshot, leads])

  const trimmedSearch = searchQuery.trim()
  const normalizedSearch = trimmedSearch.toLowerCase()
  const hasSearch = normalizedSearch.length > 0

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const pipelineId = lead.pipelineId ?? lead.stage?.pipelineId ?? null
      if (selectedPipeline && pipelineId !== selectedPipeline.id) {
        return false
      }
      if (ownerFilter !== 'all' && lead.owner?.id !== ownerFilter) {
        return false
      }
      if (leadTypeFilter !== 'all' && (lead.leadType ?? 'UNKNOWN') !== leadTypeFilter) {
        return false
      }
      if (tierFilter !== 'all' && lead.scoreTier !== tierFilter) {
        return false
      }
      if (preapprovedOnly && !lead.preapproved) {
        return false
      }
      if (activityFilter !== 'all') {
        const windowDays = Number(activityFilter)
        if (!lead.lastActivityAt) {
          return false
        }
        const diff = differenceInDays(new Date(), new Date(lead.lastActivityAt))
        if (diff > windowDays) {
          return false
        }
      }
      if (normalizedSearch) {
        const haystack = [
          // displayName not guaranteed; synthesize from available fields
          lead.firstName,
          lead.lastName,
          lead.email,
          lead.phone,
          lead.owner?.name,
          lead.stage?.name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(normalizedSearch)) {
          return false
        }
      }
      return true
    })
  }, [leads, ownerFilter, leadTypeFilter, tierFilter, activityFilter, preapprovedOnly, selectedPipeline, normalizedSearch])

  const columns = useMemo(() => {
    const map = new Map<string, LeadSummary[]>()
    selectedPipeline?.stages.forEach((stage) => {
      map.set(stage.id, [])
    })
    filteredLeads.forEach((lead) => {
      const stageId = lead.stage?.id ?? lead.stageId
      if (!stageId) return
      const bucket = map.get(stageId)
      if (bucket) {
        bucket.push(lead)
      }
    })
    selectedPipeline?.stages.forEach((stage) => {
      const bucket = map.get(stage.id)
      if (bucket) {
        bucket.sort((a, b) => {
          const aDate = new Date(a.stageEnteredAt ?? a.createdAt).getTime()
          const bDate = new Date(b.stageEnteredAt ?? b.createdAt).getTime()
          return aDate - bDate
        })
      }
    })
    return map
  }, [filteredLeads, selectedPipeline])

  const visibleStages = useMemo(() => {
    if (!selectedPipeline) return []
    if (!hasSearch) return selectedPipeline.stages
    return selectedPipeline.stages.filter((stage) => {
      const bucket = columns.get(stage.id)
      return (bucket?.length ?? 0) > 0
    })
  }, [columns, hasSearch, selectedPipeline])

  const heroMetrics = useMemo(() => {
    const totalLeads = filteredLeads.length
    if (!selectedPipeline || totalLeads === 0) {
      return [
        { label: 'Active Leads', value: totalLeads.toString() },
        { label: 'Avg Time In Stage', value: '—' },
        { label: 'Conversion Rate', value: '0%' }
      ]
    }

    const totalMinutesInStage = filteredLeads.reduce((minutes, lead) => {
      return (
        minutes +
        differenceInMinutes(new Date(), new Date(lead.stageEnteredAt ?? lead.createdAt))
      )
    }, 0)

    const highestStageOrder = selectedPipeline.stages.reduce((maxOrder, stage, index) => {
      const orderValue = stage.order ?? index + 1
      return Math.max(maxOrder, orderValue)
    }, 0)

    const convertedLeads = filteredLeads.reduce((count, lead) => {
      const stageId = lead.stage?.id ?? lead.stageId
      if (!stageId) {
        return count
      }
      const meta = stageLookup.get(stageId)
      if (!meta) {
        return count
      }
      const orderValue =
        meta.stage.order ??
        selectedPipeline.stages.findIndex((pipelineStage) => pipelineStage.id === meta.stage.id) + 1
      return orderValue >= highestStageOrder ? count + 1 : count
    }, 0)

    const avgMinutes = totalLeads === 0 ? 0 : totalMinutesInStage / totalLeads
    const conversionRate = totalLeads === 0 ? 0 : (convertedLeads / totalLeads) * 100

    return [
      { label: 'Active Leads', value: totalLeads.toString() },
      { label: 'Avg Time In Stage', value: formatMinutesToLabel(avgMinutes) },
      { label: 'Conversion Rate', value: formatConversionRateLabel(conversionRate) }
    ]
  }, [filteredLeads, selectedPipeline, stageLookup])

  const overdueLeads = useMemo(() => {
    return filteredLeads.filter((lead) => {
      const stageId = lead.stage?.id ?? lead.stageId
      if (!stageId) return false
      const stageEntry = stageLookup.get(stageId)
      const slaMinutes = stageEntry?.stage.slaMinutes ?? lead.stage?.slaMinutes ?? null
      if (slaMinutes === null) return false
      const minutesSinceTouch = getMinutesSinceLastInteraction(lead, now)
      return minutesSinceTouch > slaMinutes
    })
  }, [filteredLeads, now, stageLookup])

  const overdueLeadNames = useMemo(() => {
    if (!overdueLeads.length) return ''
    const names = overdueLeads
      .slice(0, 3)
      .map((lead) => getLeadDisplayName(lead))
      .filter(Boolean)
    return names.join(', ')
  }, [overdueLeads])

  const focusOldestOverdue = useCallback(() => {
    if (!overdueLeads.length) return
    const target = overdueLeads.reduce<LeadSummary | null>((oldest, lead) => {
      if (!oldest) return lead
      const oldestTimestamp = getLastInteractionTimestamp(oldest)
      const leadTimestamp = getLastInteractionTimestamp(lead)
      return leadTimestamp < oldestTimestamp ? lead : oldest
    }, null)
    if (!target) return
    const element = document.getElementById(`lead-card-${target.id}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.classList.add('animate-pulse')
      window.setTimeout(() => element.classList.remove('animate-pulse'), 1600)
    }
  }, [overdueLeads])

  useEffect(() => {
    if (!overdueInitializedRef.current) {
      overdueInitializedRef.current = true
      overduePreviousCountRef.current = overdueLeads.length
      return
    }
    if (overdueLeads.length > overduePreviousCountRef.current) {
      const delta = overdueLeads.length - overduePreviousCountRef.current
      toast({
        title: 'Follow-up reminder',
        description:
          delta === 1
            ? '1 lead just passed their response target.'
            : `${delta} leads just passed their response targets.`,
        variant: 'default'
      })
    }
    overduePreviousCountRef.current = overdueLeads.length
  }, [overdueLeads.length, toast])

  const totalLeads = filteredLeads.length

  const handleRefresh = () => {
    if (typeof onRefresh === 'function') {
      void onRefresh()
    }
  }

  const handleLeadUpdated = useCallback((updated: LeadSummary) => {
    setLeads((prev) =>
      prev.map((lead) => (lead.id === updated.id ? { ...lead, ...updated } : lead))
    )
  }, [])

  const handleCallLead = useCallback(
    async (lead: LeadSummary) => {
      if (!lead.phone) {
        toast({ title: 'No phone number', description: 'This lead does not have a phone on file.', variant: 'destructive' })
        return
      }
      const e164 = /^\+[1-9]\d{1,14}$/
      if (!e164.test(lead.phone)) {
        toast({ title: 'Invalid phone format', description: 'Expected E.164 like +16465550123.', variant: 'destructive' })
        return
      }

      const calling = toast({ title: 'Calling…', description: `Dialing ${lead.phone}`, variant: 'default' })
      try {
        const res = await startVoiceCall({ to: lead.phone })
        if (!res?.success) {
          throw new Error('Failed to start call')
        }
        toast({ title: 'Call in progress', description: `Outbound call to ${lead.phone}`, variant: 'default' })

        const occurredAt = new Date().toISOString()
        try {
          await createLeadTouchpoint(lead.id, {
            type: 'CALL' as LeadTouchpointType,
            channel: 'VOICE' as MessageChannelType,
            summary: `Outbound call started to ${lead.phone}`,
            metadata: { sid: res.sid, to: lead.phone },
            occurredAt
          })
        } catch (err) {
          // Best-effort; don't block the UI
          console.error('Failed to log call touchpoint', err)
        }

        // Optimistically update last activity
        setLeads((prev) =>
          prev.map((l) =>
            l.id === lead.id
              ? {
                  ...l,
                  lastActivityAt: occurredAt,
                  activityRollup: {
                    last7dListingViews: l.activityRollup?.last7dListingViews ?? 0,
                    last7dSessions: l.activityRollup?.last7dSessions ?? 0,
                    lastReplyAt: l.activityRollup?.lastReplyAt ?? null,
                    lastEmailOpenAt: l.activityRollup?.lastEmailOpenAt ?? null,
                    lastTouchpointAt: occurredAt
                  }
                }
              : l
          )
        )
      } catch (err) {
        console.error('Start call failed', err)
        toast({ title: 'Call failed', description: err instanceof Error ? err.message : 'Unable to start call', variant: 'destructive' })
      } finally {
        // no-op
      }
    },
    [toast]
  )

  const handleSelectLead = useCallback((lead: LeadSummary) => {
    setActiveLeadSnapshot(lead)
    openLeadDetails(lead.id)
  }, [openLeadDetails])

  const handleMessageLead = useCallback(
    (leadId: string) => {
      openForLead(leadId)
    },
    [openForLead]
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const leadId = String(active.id)
    const fromStageId = active.data.current?.fromStageId as string | undefined
    const toStageId = String(over.id)

    if (!toStageId || toStageId === fromStageId) {
      return
    }

    const destinationMeta = stageLookup.get(toStageId)
    if (!destinationMeta) {
      return
    }

    const { stage, pipeline } = destinationMeta
    const nowIso = new Date().toISOString()

    snapshotRef.current = leads.map((lead) => ({ ...lead }))
    setError(null)
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              pipelineId: pipeline.id,
              pipelineName: pipeline.name,
              pipelineType: pipeline.type,
              stageId: stage.id,
              stage: {
                id: stage.id,
                name: stage.name,
                order: stage.order,
                pipelineId: pipeline.id,
                pipelineName: pipeline.name,
                pipelineType: pipeline.type,
                slaMinutes: stage.slaMinutes
              },
              stageEnteredAt: nowIso
            }
          : lead
      )
    )

    startTransition(async () => {
      try {
        await updateLead(leadId, { stageId: stage.id, pipelineId: pipeline.id })
        snapshotRef.current = null
        queryClient.invalidateQueries({ queryKey: ['pipeline-board', 'columns'] })
        queryClient.invalidateQueries({ queryKey: ['mission-control', 'overview'] })
        queryClient.invalidateQueries({ queryKey: ['mission-control', 'agents'] })
        handleRefresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update lead'
        setError(message)
        const snapshot = snapshotRef.current
        if (snapshot) {
          setLeads(snapshot)
        }
      }
    })
  }

  if (!selectedPipeline) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No pipelines configured yet. Add a pipeline in the admin console to begin routing leads.
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-8">
        {showHero && (
          <PipelineHero
            pipelineName={selectedPipeline.name}
            stageCount={selectedPipeline.stages.length}
            metrics={heroMetrics}
          />
        )}
        <PipelineFilterBar
          pipelines={pipelines}
          selectedPipelineId={selectedPipeline.id}
          onSelectPipeline={setSelectedPipelineId}
          ownerFilter={ownerFilter}
          onOwnerFilter={setOwnerFilter}
          leadTypeFilter={leadTypeFilter}
          onLeadTypeFilter={setLeadTypeFilter}
          ownerOptions={owners}
          tierFilter={tierFilter}
          onTierFilter={setTierFilter}
          activityFilter={activityFilter}
          onActivityFilter={setActivityFilter}
          preapprovedOnly={preapprovedOnly}
          onTogglePreapproved={setPreapprovedOnly}
          totalLeads={totalLeads}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          compactMode={compactMode}
          onToggleCompact={setCompactMode}
          onRequestAddLead={onRequestAddLead}
        />
        {overdueLeads.length > 0 && (
          <OverdueBanner
            count={overdueLeads.length}
            namesPreview={overdueLeadNames}
            onViewOldest={focusOldestOverdue}
          />
        )}
        {error && (
          <div className="rounded-2xl border border-red-200/60 bg-red-50/80 px-4 py-3 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}
        <div className="overflow-x-auto pb-4">
          {hasSearch && visibleStages.length === 0 ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              <Search className="h-6 w-6 text-slate-400" aria-hidden />
              <p className="text-base font-semibold text-slate-700">No matches found</p>
              <p>No leads in this pipeline match “{trimmedSearch}”. Try another search or clear filters.</p>
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Clear search
              </Button>
            </div>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div
                className={clsx(
                  // Single-row horizontal layout with scroll
                  'inline-flex w-max gap-6 transition-all duration-200',
                  // Smooth snapping as you scroll sideways
                  'snap-x snap-mandatory px-1'
                )}
                aria-busy={isPending}
              >
                {visibleStages.map((stage) => {
                  const originalIndex = selectedPipeline.stages.findIndex((candidate) => candidate.id === stage.id)
                  const stageIndex = originalIndex === -1 ? 0 : originalIndex
                  return (
                    <StageColumn
                      key={stage.id}
                      stage={stage}
                      stageIndex={stageIndex}
                      totalStages={selectedPipeline.stages.length}
                      leads={columns.get(stage.id) ?? []}
                      now={now}
                      onSelectLead={handleSelectLead}
                      activeLeadId={isDrawerOpen ? activeLeadId : null}
                      onMessage={handleMessageLead}
                      onCall={handleCallLead}
                      compactMode={compactMode}
                      onRequestAddLead={onRequestAddLead}
                    />
                  )
                })}
              </div>
            </DndContext>
          )}
        </div>
        {activeLeadId && activeLead && (
          <LeadDrawer
            open={isDrawerOpen}
            onOpenChange={setDrawerOpen}
            leadId={activeLeadId}
            lead={activeLead}
            pipelines={pipelines}
            owners={owners}
            onLeadUpdated={handleLeadUpdated}
            onMessage={handleMessageLead}
          />
        )}
      </div>
    </TooltipProvider>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 md:inline">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 min-w-[160px] rounded-full px-4 text-sm font-medium">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

interface StageColumnProps {
  stage: PipelineStage
  leads: LeadSummary[]
  now: number
  onSelectLead: (lead: LeadSummary) => void
  activeLeadId: string | null
  stageIndex: number
  totalStages: number
  onMessage: (leadId: string) => void
  onCall: (lead: LeadSummary) => void
  compactMode: boolean
  onRequestAddLead?: () => void
}

function StageColumn({
  stage,
  stageIndex,
  totalStages,
  leads,
  now,
  onSelectLead,
  activeLeadId,
  onMessage,
  onCall,
  compactMode,
  onRequestAddLead
}: StageColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id })
  const stageDisplay = getStageDisplay(stage.name)
  const stageName = stageDisplay.long ?? stripStagePrefix(stage.name)

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'relative flex min-h-[24rem] flex-col rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-card-alpha)] p-5 shadow-brand backdrop-blur-[var(--hatch-card-blur)]',
        // Fixed width so columns never wrap; allow horizontal scroll
        'w-[340px] md:w-[360px] xl:w-[380px] shrink-0',
        // Align scrolling snaps to each column
        'snap-start'
      )}
    >
      {isOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed border-brand-blue-600/60 bg-brand-blue-600/10 text-base font-semibold text-brand-blue-700">
          Drop lead here
        </div>
      )}
      <div className="flex items-start justify-between rounded-[var(--radius-lg)] border border-white/20 bg-card/[var(--hatch-glass-alpha-recessed)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {stage.pipelineName ?? 'Pipeline'}
          </p>
          <h2 className="text-base font-semibold text-slate-900">{stageName}</h2>
          <p className="text-xs text-slate-500">
            {stage.slaMinutes ? `Response target · ${stage.slaMinutes} minutes` : 'No SLA'} • {leads.length}{' '}
            {leads.length === 1 ? 'lead' : 'leads'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/35 text-sm font-semibold text-slate-900 shadow-brand backdrop-blur-md dark:bg-white/10 dark:text-ink-100">
            {stageIndex + 1}
          </div>
          <div className="text-[11px] font-semibold text-slate-500">/{totalStages}</div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {leads.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--hatch-card-border)] bg-white/10 p-6 text-center text-sm text-slate-600 backdrop-blur-md dark:bg-white/5 dark:text-ink-100/70">
            <Sparkles className="h-6 w-6 text-hatch-blue" />
            <p className="font-medium">No leads yet.</p>
            <p className="text-xs text-hatch-muted/80">Drag a lead here or add a new one.</p>
            <button
              type="button"
              onClick={() => onRequestAddLead?.()}
              className="group inline-flex items-center justify-center rounded-full border border-dashed border-white/35 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-900 backdrop-blur-md transition-colors duration-200 hover:bg-white/20 dark:border-white/15 dark:bg-white/5 dark:text-ink-100 dark:hover:bg-white/10"
            >
              <Plus className="h-4 w-4" />
              <span className="ml-2 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[8rem] group-hover:opacity-100">
                Add lead
              </span>
            </button>
          </div>
        ) : (
          leads.map((lead, index) => (
            <DraggableLeadCard
              key={lead.id}
              lead={lead}
              stage={stage}
              stageIndex={stageIndex}
              totalStages={totalStages}
              now={now}
              onSelect={onSelectLead}
              isActive={lead.id === activeLeadId}
              onMessage={onMessage}
              onCall={onCall}
              compactMode={compactMode}
              sequence={index + 1}
            />
          ))
        )}
      </div>

      {onRequestAddLead ? (
        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={() => onRequestAddLead?.()}
            className="group inline-flex w-full items-center justify-center rounded-full border border-dashed border-white/35 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-800 backdrop-blur-md transition-colors duration-200 hover:bg-white/20 dark:border-white/15 dark:bg-white/5 dark:text-ink-100 dark:hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            <span className="ml-2 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[8rem] group-hover:opacity-100">
              Add lead
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

interface DraggableLeadCardProps extends LeadCardProps {
  sequence: number
}

function DraggableLeadCard({
  lead,
  stage,
  stageIndex,
  totalStages,
  now,
  onSelect,
  isActive,
  onMessage,
  onCall,
  compactMode,
  sequence
}: DraggableLeadCardProps) {
  const stageId = lead.stage?.id ?? lead.stageId ?? stage.id
  const pipelineId = lead.pipelineId ?? lead.stage?.pipelineId ?? stage.pipelineId
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: {
      fromStageId: stageId,
      pipelineId
    }
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  const [expanded, setExpanded] = useState(false)
  const summaryStageName = lead.stage?.name ?? stage.name

  return (
    <details
      ref={setNodeRef}
      style={style}
      open={expanded}
      className={cn(
        'overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-card-alpha)] shadow-brand backdrop-blur-md transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-brand-md [&_summary::-webkit-details-marker]:hidden',
        isDragging && 'pointer-events-none opacity-80 shadow-lg'
      )}
    >
      <summary
        className="flex cursor-grab items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 md:cursor-grab"
        onClick={(event) => {
          event.preventDefault()
          setExpanded((prev) => !prev)
        }}
        {...listeners}
        {...attributes}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{getLeadDisplayName(lead)}</p>
          <p className="text-xs text-slate-500">{summaryStageName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-500 hover:text-slate-900"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onSelect(lead)
            }}
          >
            <Eye className="h-4 w-4" />
            <span className="sr-only">Open</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-500 hover:text-slate-900"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onMessage(lead.id)
            }}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="sr-only">Message</span>
          </Button>
          <span className="text-xs text-slate-400">#{sequence}</span>
        </div>
      </summary>
      <div className="border-t border-[color:var(--hatch-card-border)] p-3">
        <LeadCard
          lead={lead}
          stage={stage}
          stageIndex={stageIndex}
          totalStages={totalStages}
          now={now}
          onSelect={onSelect}
          isActive={isActive}
          onMessage={onMessage}
          onCall={onCall}
          compactMode={compactMode}
          isDragging={isDragging}
        />
      </div>
    </details>
  )
}

interface LeadCardProps {
  lead: LeadSummary
  stage: PipelineStage
  stageIndex: number
  totalStages: number
  now: number
  onSelect: (lead: LeadSummary) => void
  isActive: boolean
  onMessage: (leadId: string) => void
  onCall: (lead: LeadSummary) => void
  compactMode: boolean
  isDragging?: boolean
}

function LeadCard({ lead, stage, stageIndex, totalStages, now, onSelect, isActive, onMessage, onCall, compactMode, isDragging }: LeadCardProps) {

  const rawStageName = lead.stage?.name ?? stage.name
  const stageDisplay = getStageDisplay(rawStageName)
  const stageName = stageDisplay.long ?? stripStagePrefix(rawStageName)
  const timeInStage = formatDistanceToNow(new Date(lead.stageEnteredAt ?? lead.createdAt), {
    addSuffix: true
  })
  const slaMinutes = stage.slaMinutes ?? null
  const lastInteractionAt = getLastInteractionAt(lead)
  const minutesSinceTouch = getMinutesSinceLastInteraction(lead, now)
  const lastTouchLabel = lastInteractionAt ? formatDistanceToNow(new Date(lastInteractionAt), { addSuffix: true }) : 'No touch recorded'
  const slaBreached = slaMinutes !== null ? minutesSinceTouch > slaMinutes : false
  const bestAction = getNextBestAction(lead, stageName.toLowerCase())
  const progress = totalStages > 0 ? Math.min(100, Math.max(0, ((stageIndex + 1) / totalStages) * 100)) : 0

  const ownerName = lead.owner?.name ?? 'Unassigned'
  const leadType = lead.leadType ?? 'UNKNOWN'
  const leadTypeLabel = leadType === 'BUYER' ? 'Buyer' : leadType === 'SELLER' ? 'Seller' : null
  const ownerInitials = ownerName
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'LD'

  const leadInitials =
    [lead.firstName, lead.lastName]
      .filter(Boolean)
      .map((part) => String(part).trim().charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'LD'

  const scoreValue = typeof lead.score === 'number' ? Math.round(lead.score) : null

  return (
    <div
      id={`lead-card-${lead.id}`}
      className={cn(
      'group relative cursor-pointer rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-glass-alpha-elevated)] shadow-brand backdrop-blur-md transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-brand-blue-600/40 hover:shadow-brand-md focus:outline-none focus:ring-2 focus:ring-[color:var(--focus-ring)] focus:ring-offset-2 md:cursor-grab',
      compactMode ? 'p-3 text-xs' : 'p-4 text-sm',
      slaBreached && 'border-rose-300/60 ring-2 ring-rose-300/30',
      isDragging && 'pointer-events-none opacity-80 shadow-lg',
      !isDragging && isActive && 'ring-2 ring-[rgba(31,95,255,0.45)]'
    )}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(lead)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(lead)
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Avatar className={cn('border border-hatch-neutral/60 bg-hatch-background text-hatch-text shadow-sm', compactMode ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm')}>
              <AvatarFallback>{leadInitials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <p className={cn('break-words font-semibold text-hatch-text', compactMode ? 'text-sm' : 'text-base')}>
                {(lead.firstName ?? '—') + ' ' + (lead.lastName ?? '')}
              </p>
              {!compactMode && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-hatch-muted">
                  <span className="inline-flex items-center gap-1 break-words">
                    <Mail className="h-3.5 w-3.5" />
                    {lead.email ?? 'No email'}
                  </span>
                  <span className="inline-flex items-center gap-1 break-words">
                    <Phone className="h-3.5 w-3.5" />
                    {lead.phone ?? 'No phone'}
                  </span>
                </div>
              )}
            </div>
          </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {lead.preapproved ? (
            <Badge className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle className="mr-1 h-3.5 w-3.5" />
              Pre-approved
            </Badge>
          ) : null}
          {leadTypeLabel ? (
            <Badge className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
              {leadTypeLabel}
            </Badge>
          ) : null}
          {scoreValue !== null && (
            <Badge className={cn('rounded-full px-3 py-1 text-xs font-semibold', getTierClass(lead.scoreTier ?? ''))}>
              {lead.scoreTier ?? '—'}-{scoreValue}
            </Badge>
          )}
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-hatch-muted hover:text-hatch-text"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Lead actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px] rounded-xl border border-hatch-neutral/40 bg-white/95 shadow-lg backdrop-blur">
              <DropdownMenuItem asChild>
                <Link to={`/broker/crm/leads/${lead.id}`} state={{ lead }}>
                  Open details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCall(lead)}>Call lead</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMessage(lead.id)}>Send message</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSelect(lead)}>Highlight card</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {compactMode ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-hatch-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-hatch-background px-2.5 py-0.5 text-hatch-blue">
            {stageName}
          </span>
          <span className="inline-flex items-center gap-1 text-hatch-muted/80">
            <AlarmClock className="h-3 w-3" />
            In stage {timeInStage}
          </span>
          <span className="text-hatch-muted/70">Last touch {lastTouchLabel}</span>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-hatch-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-hatch-background px-3 py-1 text-hatch-blue">
            {stageName}
          </span>
          <span className="inline-flex items-center gap-1 text-hatch-muted/80">
            <AlarmClock className="h-3.5 w-3.5" />
            In stage {timeInStage}
          </span>
          {lead.activityRollup && lead.activityRollup.last7dListingViews > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-hatch-background px-3 py-1 text-hatch-muted/90">
              {lead.activityRollup.last7dListingViews} listing views (7d)
            </span>
          )}
          {bestAction && (
            <span className="inline-flex items-center gap-2 rounded-full bg-hatch-blue/12 px-3 py-1 text-hatch-blue">
              <Sparkles className="h-3.5 w-3.5" />
              {bestAction}
            </span>
          )}
        </div>
      )}

      {!compactMode && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full bg-hatch-background/80 px-3 py-1 text-xs font-medium text-hatch-muted">
              <Avatar className="h-5 w-5 border border-transparent bg-white text-[10px] font-semibold text-hatch-text">
                <AvatarFallback>{ownerInitials}</AvatarFallback>
              </Avatar>
              {ownerName}
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-hatch-muted hover:text-hatch-blue"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                      onMessage(lead.id)
                    }}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span className="sr-only">Message lead</span>
                  </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center">
                Message lead
              </TooltipContent>
            </Tooltip>
            </div>
          </div>

          <div className="mt-4 space-y-1">
            <Progress value={progress} className="h-1.5 bg-hatch-neutral/40" />
            <div className="flex items-center justify-between text-[11px] text-hatch-muted/80">
              <span>
                Stage {stageIndex + 1} of {totalStages}
              </span>
              {slaMinutes !== null && (
                <span className={slaBreached ? 'text-hatch-danger' : 'text-hatch-success'}>
                  {slaBreached ? 'Response overdue' : 'On track'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-hatch-muted/70">Last touch {lastTouchLabel}</p>
          </div>
        </>
      )}
    </div>
  )
}

interface PipelineHeroProps {
  pipelineName: string
  stageCount: number
  metrics: Array<{ label: string; value: string }>
}

function PipelineHero({ pipelineName, stageCount, metrics }: PipelineHeroProps) {
  return (
    <div className="hatch-hero relative overflow-hidden rounded-3xl border border-white/25 bg-gradient-to-r from-[#1F5FFF] to-[#00C6A2] text-white shadow-[0_36px_88px_rgba(31,95,255,0.35)]">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_52%)]" />
      <div className="relative z-10 flex flex-col gap-6 px-6 py-8 md:px-10 md:py-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.4em] text-white/80">CRM · Pipeline</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Pipeline Overview</h1>
          </div>
          <p className="text-sm text-white/85">Active pipeline: <span className="font-medium text-white">{pipelineName}</span></p>
        </div>
        <div className="grid w-full gap-4 rounded-2xl border border-white/20 bg-white/15 p-5 backdrop-blur sm:grid-cols-3 lg:max-w-xl">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl bg-white/30 px-4 py-3 text-start shadow-inner shadow-white/20">
              <p className="text-xs uppercase tracking-wide text-white/75">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface PipelineFilterBarProps {
  pipelines: Pipeline[]
  selectedPipelineId: string
  onSelectPipeline: (value: string) => void
  ownerFilter: string
  onOwnerFilter: (value: string) => void
  leadTypeFilter: string
  onLeadTypeFilter: (value: string) => void
  ownerOptions: Array<{ id: string; name: string }>
  tierFilter: string
  onTierFilter: (value: string) => void
  activityFilter: string
  onActivityFilter: (value: string) => void
  preapprovedOnly: boolean
  onTogglePreapproved: (value: boolean) => void
  totalLeads: number
  searchQuery: string
  onSearch: (value: string) => void
  compactMode: boolean
  onToggleCompact: (value: boolean) => void
  onRequestAddLead?: () => void
}

function PipelineFilterBar({
  pipelines,
  selectedPipelineId,
  onSelectPipeline,
  ownerFilter,
  onOwnerFilter,
  leadTypeFilter,
  onLeadTypeFilter,
  ownerOptions,
  tierFilter,
  onTierFilter,
  activityFilter,
  onActivityFilter,
  preapprovedOnly,
  onTogglePreapproved,
  totalLeads,
  searchQuery,
  onSearch,
  compactMode,
  onToggleCompact,
  onRequestAddLead
}: PipelineFilterBarProps) {
  return (
    <div className="sticky top-0 z-30">
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-background)] px-4 py-3 shadow-brand backdrop-blur-xl">
        <div className="relative flex flex-1 min-w-[220px] items-center">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            className="h-9 w-full rounded-full border border-[var(--glass-border)] bg-white/25 pl-9 pr-3 text-sm text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-xl outline-none placeholder:text-ink-500/80 focus-visible:ring-[3px] focus-visible:ring-[color:var(--focus-ring)] focus-visible:ring-offset-[var(--focus-ring-offset)] dark:bg-white/10 dark:text-ink-100 dark:placeholder:text-ink-100/60"
            placeholder="Search leads or licensees"
            value={searchQuery}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
        <FilterSelect
          label="Pipeline"
          value={selectedPipelineId}
          onChange={onSelectPipeline}
          options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
        />
        <FilterSelect
          label="Representing Licensee"
          value={ownerFilter}
          onChange={onOwnerFilter}
          options={[{ value: 'all', label: 'All licensees' }, ...ownerOptions.map((owner) => ({ value: owner.id, label: owner.name }))]}
        />
        <FilterSelect
          label="Lead type"
          value={leadTypeFilter}
          onChange={onLeadTypeFilter}
          options={[
            { value: 'all', label: 'All types' },
            { value: 'BUYER', label: 'Buyer' },
            { value: 'SELLER', label: 'Seller' },
            { value: 'UNKNOWN', label: 'Unknown' }
          ]}
        />
        <FilterSelect
          label="Score Tier"
          value={tierFilter}
          onChange={onTierFilter}
          options={[
            { value: 'all', label: 'All tiers' },
            ...(['A', 'B', 'C', 'D'] as const).map((tier) => ({ value: tier, label: tier }))
          ]}
        />
        <FilterSelect
          label="Last Activity"
          value={activityFilter}
          onChange={onActivityFilter}
          options={[
            { value: 'all', label: 'Any time' },
            { value: '7', label: 'Last 7 days' },
            { value: '14', label: 'Last 14 days' },
            { value: '30', label: 'Last 30 days' }
          ]}
        />
        <Button
          type="button"
          variant={preapprovedOnly ? 'default' : 'outline'}
          size="sm"
          className="rounded-full px-4 text-xs font-semibold"
          onClick={() => onTogglePreapproved(!preapprovedOnly)}
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          Preapproved only
        </Button>
        <div className="ml-auto inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-white/20 px-3 py-1 text-[11px] font-semibold text-slate-700 backdrop-blur-md dark:bg-white/10 dark:text-ink-100">
          <span className="h-2 w-2 rounded-full bg-brand-green-500" />
          {totalLeads} in view
        </div>
        {onRequestAddLead && (
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={onRequestAddLead}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add lead
          </Button>
        )}
        <Button
          type="button"
          variant={compactMode ? 'secondary' : 'outline'}
          size="sm"
          className="rounded-full px-4 text-xs font-semibold"
          onClick={() => onToggleCompact(!compactMode)}
        >
          {compactMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Rows2 className="h-3.5 w-3.5" />}
          {compactMode ? 'Expanded' : 'Compact'}
        </Button>
      </div>
    </div>
  )
}

interface OverdueBannerProps {
  count: number
  namesPreview: string
  onViewOldest: () => void
}

function OverdueBanner({ count, namesPreview, onViewOldest }: OverdueBannerProps) {
  const needsPlural = count !== 1
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-hatch-warning/40 bg-white px-5 py-4 text-sm text-hatch-warning shadow-sm">
      <div className="space-y-1">
        <p className="font-semibold">{count} {needsPlural ? 'leads' : 'lead'} need follow-up</p>
        <p className="text-xs text-hatch-muted">
          {namesPreview ? `Waiting: ${namesPreview}${count > 3 ? '…' : ''}` : 'Reach out again to stay on track.'}
        </p>
      </div>
      <Button
        variant="outline"
        className="rounded-full border-hatch-warning text-hatch-warning hover:bg-hatch-warning hover:text-white"
        onClick={onViewOldest}
      >
        View oldest
      </Button>
    </div>
  )
}

function formatMinutesToLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '—'
  }
  if (minutes >= 1440) {
    const days = minutes / 1440
    return `${days >= 10 ? Math.round(days) : Number(days.toFixed(1))}d`
  }
  if (minutes >= 60) {
    const hours = minutes / 60
    return `${hours >= 10 ? Math.round(hours) : Number(hours.toFixed(1))}h`
  }
  return `${Math.max(1, Math.round(minutes))}m`
}

function formatConversionRateLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0%'
  }
  return value >= 10 ? `${Math.round(value)}%` : `${value.toFixed(1)}%`
}

function stripStagePrefix(stageName: string): string {
  const trimmed = stageName.trim()
  const withoutCode = trimmed.replace(/^S\d+\s*[–—\-\/|.]?\s*/i, '').trim()
  return withoutCode.length > 0 ? withoutCode : trimmed
}

function getLastInteractionAt(lead: LeadSummary): string | null {
  return (
    lead.activityRollup?.lastTouchpointAt ??
    lead.activityRollup?.lastReplyAt ??
    lead.lastActivityAt ??
    lead.stageEnteredAt ??
    lead.updatedAt ??
    lead.createdAt ??
    null
  )
}

function getMinutesSinceLastInteraction(lead: LeadSummary, now: number): number {
  const lastInteractionAt = getLastInteractionAt(lead)
  if (!lastInteractionAt) {
    return Number.POSITIVE_INFINITY
  }
  return differenceInMinutes(now, new Date(lastInteractionAt))
}

function getLastInteractionTimestamp(lead: LeadSummary): number {
  const lastInteractionAt = getLastInteractionAt(lead)
  return lastInteractionAt ? new Date(lastInteractionAt).getTime() : 0
}

function getLeadDisplayName(lead: LeadSummary): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim()
  if (name) return name
  if (lead.email) return lead.email
  if (lead.phone) return lead.phone
  return lead.id
}

function getTierClass(tier: string) {
  switch (tier) {
    case 'A':
      return 'bg-emerald-100 text-emerald-700'
    case 'B':
      return 'bg-blue-100 text-blue-700'
    case 'C':
      return 'bg-amber-100 text-amber-700'
    case 'D':
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function getNextBestAction(lead: LeadSummary, stageDescriptor: string): string | null {
  const listingViews = lead.activityRollup?.last7dListingViews ?? 0
  const sessions = lead.activityRollup?.last7dSessions ?? 0
  const stageName = stageDescriptor || (lead.stage?.name?.toLowerCase() ?? '')

  if (lead.preapproved && (stageName.includes('new') || stageName.includes('inquiry'))) {
    return 'Make intro call'
  }
  if (listingViews >= 3 && !stageName.includes('showing') && !stageName.includes('demo')) {
    return 'Offer a tour'
  }
  if (sessions === 0 && (stageName.includes('nurture') || stageName.includes('negotiation'))) {
    return 'Send market update'
  }
  if (lead.scoreTier === 'A' && !stageName.includes('offer')) {
    return 'Discuss offer strategy'
  }
  return null
}
