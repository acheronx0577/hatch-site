import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
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
  updateLead
} from '@/lib/api/hatch'
import { getStageDisplay } from '@/lib/stageDisplay'
import { cn } from '@/lib/utils'
import { useMessenger } from '@/contexts/MessengerContext'
import { useToast } from '@/components/ui/use-toast'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlarmClock, Eye, Mail, MessageSquare, MoreHorizontal, Phone, Sparkles } from 'lucide-react'
import LeadDrawer from './LeadDrawer'

interface PipelineBoardProps {
  pipelines: Pipeline[]
  initialLeads: LeadSummary[]
  onRefresh?: () => Promise<void> | void
}

export default function PipelineBoard({ pipelines, initialLeads, onRefresh }: PipelineBoardProps) {
  const { toast } = useToast()
  const { openForContact } = useMessenger()
  const [leads, setLeads] = useState<LeadSummary[]>(initialLeads)
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(pipelines[0]?.id ?? '')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [activityFilter, setActivityFilter] = useState<string>('all')
  const [preapprovedOnly, setPreapprovedOnly] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const snapshotRef = useRef<LeadSummary[] | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const overdueInitializedRef = useRef(false)
  const overduePreviousCountRef = useRef(0)
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

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

  const activeLead = useMemo(() => (activeLeadId ? leads.find((lead) => lead.id === activeLeadId) ?? null : null), [activeLeadId, leads])

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const pipelineId = lead.pipelineId ?? lead.stage?.pipelineId ?? null
      if (selectedPipeline && pipelineId !== selectedPipeline.id) {
        return false
      }
      if (ownerFilter !== 'all' && lead.owner?.id !== ownerFilter) {
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
      return true
    })
  }, [leads, ownerFilter, tierFilter, activityFilter, preapprovedOnly, selectedPipeline])

  const columns = useMemo(() => {
    const map = new Map<string, LeadSummary[]>()
    if (selectedPipeline) {
      selectedPipeline.stages.forEach((stage) => {
        map.set(stage.id, [])
      })
    }
    filteredLeads.forEach((lead) => {
      const stageId = lead.stage?.id ?? lead.stageId
      if (!stageId) return
      const bucket = map.get(stageId)
      if (bucket) {
        bucket.push(lead)
      }
    })
    if (selectedPipeline) {
      selectedPipeline.stages.forEach((stage) => {
        const bucket = map.get(stage.id)
        if (bucket) {
          bucket.sort((a, b) => {
            const aDate = new Date(a.stageEnteredAt ?? a.createdAt).getTime()
            const bDate = new Date(b.stageEnteredAt ?? b.createdAt).getTime()
            return aDate - bDate
          })
        }
      })
    }
    return map
  }, [filteredLeads, selectedPipeline])

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

  const handleSelectLead = useCallback((lead: LeadSummary) => {
    setActiveLeadId(lead.id)
    setIsDrawerOpen(true)
  }, [])

  const handleCloseDrawer = useCallback((open: boolean) => {
    setIsDrawerOpen(open)
    if (!open) {
      setActiveLeadId(null)
    }
  }, [])

  const handleMessageLead = useCallback(
    (leadId: string) => {
      openForContact(leadId)
    },
    [openForContact]
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
        <PipelineHero
          pipelineName={selectedPipeline.name}
          stageCount={selectedPipeline.stages.length}
          metrics={heroMetrics}
        />
        <PipelineFilterBar
          pipelines={pipelines}
          selectedPipelineId={selectedPipeline.id}
          onSelectPipeline={setSelectedPipelineId}
          ownerFilter={ownerFilter}
          onOwnerFilter={setOwnerFilter}
          ownerOptions={owners}
          tierFilter={tierFilter}
          onTierFilter={setTierFilter}
          activityFilter={activityFilter}
          onActivityFilter={setActivityFilter}
          preapprovedOnly={preapprovedOnly}
          onTogglePreapproved={setPreapprovedOnly}
          totalLeads={totalLeads}
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
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div
            className={clsx(
              'grid gap-6 transition-all duration-200',
              'md:grid-cols-2',
              selectedPipeline.stages.length >= 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2',
              selectedPipeline.stages.length >= 4 && '2xl:grid-cols-4'
            )}
            aria-busy={isPending}
          >
            {selectedPipeline.stages.map((stage, index) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                stageIndex={index}
                totalStages={selectedPipeline.stages.length}
                leads={columns.get(stage.id) ?? []}
                now={now}
                onSelectLead={handleSelectLead}
                activeLeadId={activeLeadId}
                onMessage={handleMessageLead}
              />
            ))}
          </div>
        </DndContext>
        {activeLead && (
          <LeadDrawer
            open={isDrawerOpen}
            onOpenChange={handleCloseDrawer}
            leadId={activeLead.id}
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
        <SelectTrigger className="min-w-[160px] rounded-full border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand-200 focus:ring-2 focus:ring-brand-200">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent className="rounded-xl border border-hatch-neutral/40 bg-white/95 shadow-xl backdrop-blur">
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
}

function StageColumn({ stage, stageIndex, totalStages, leads, now, onSelectLead, activeLeadId, onMessage }: StageColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id })
  const stageDisplay = getStageDisplay(stage.name)
  const stageName = stageDisplay.long ?? stripStagePrefix(stage.name)

  return (
    <div
      ref={setNodeRef}
      className="relative flex min-h-[24rem] flex-col rounded-3xl border border-[#E2E8F0] bg-white p-4 shadow-sm"
    >
      {isOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl border-4 border-dashed border-hatch-blue/60 bg-hatch-blue/10 text-base font-semibold text-hatch-blue">
          Drop lead here
        </div>
      )}
      <div className="flex items-start justify-between rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 shadow-sm">
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
        <Badge variant="secondary" className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-semibold text-slate-600 shadow">
          {stageIndex + 1}/{totalStages}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        {leads.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-hatch-neutral/60 bg-hatch-background/70 p-6 text-center text-sm text-hatch-muted">
            <Sparkles className="h-6 w-6 text-hatch-blue" />
            <p className="font-medium">No leads yet.</p>
            <p className="text-xs text-hatch-muted/80">Drag a lead here or add a new one.</p>
            <Button type="button" variant="default" className="rounded-full bg-gradient-to-r from-[#1F5FFF] to-[#00C6A2] text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(31,95,255,0.24)] hover:animate-[hatch-pulse_1.8s_ease-in-out]">
              Add lead
            </Button>
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              stage={stage}
              stageIndex={stageIndex}
              totalStages={totalStages}
              now={now}
              onSelect={onSelectLead}
              isActive={lead.id === activeLeadId}
              onMessage={onMessage}
            />
          ))
        )}
      </div>
    </div>
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
}

function LeadCard({ lead, stage, stageIndex, totalStages, now, onSelect, isActive, onMessage }: LeadCardProps) {
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
  const ownerInitials = ownerName
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'LD'

  const scoreValue = typeof lead.score === 'number' ? Math.round(lead.score) : null

  return (
    <div
      id={`lead-card-${lead.id}`}
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative cursor-pointer rounded-2xl border border-transparent bg-white/95 p-4 text-sm shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-hatch-blue hover:shadow-[0_14px_28px_rgba(31,95,255,0.14)] focus:outline-none focus:ring-2 focus:ring-hatch-blue/35 focus:ring-offset-2 md:cursor-grab',
        slaBreached && 'border-rose-200/70 ring-2 ring-rose-200/60',
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
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar className="h-11 w-11 border border-hatch-neutral/60 bg-hatch-background text-sm font-semibold text-hatch-text shadow-sm">
            <AvatarFallback>{ownerInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <p className="break-words text-base font-semibold text-hatch-text">
              {(lead.firstName ?? '—') + ' ' + (lead.lastName ?? '')}
            </p>
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
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
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
            <DropdownMenuContent align="end" className="min-w-[160px] rounded-xl border border-hatch-neutral/40 bg-white/95 shadow-lg backdrop-blur">
              <DropdownMenuItem asChild>
                <Link to={`/broker/crm/leads/${lead.id}`}>Open details</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMessage(lead.id)}>Send message</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSelect(lead)}>Highlight card</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

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
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={`/broker/crm/leads/${lead.id}`}
                className="rounded-full p-2 text-hatch-muted transition hover:text-hatch-blue"
              >
                <Eye className="h-4 w-4" />
                <span className="sr-only">Open lead</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="top" align="center">
              Open lead details
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
    <div className="relative overflow-hidden rounded-3xl border border-white/25 bg-gradient-to-r from-[#1F5FFF] to-[#00C6A2] text-white shadow-[0_36px_88px_rgba(31,95,255,0.35)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_52%)]" />
      <div className="relative flex flex-col gap-6 px-6 py-8 md:px-10 md:py-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.4em] text-white/80">CRM · Pipeline</p>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Pipeline Overview</h1>
          </div>
          <p className="text-sm text-white/85">Active pipeline: <span className="font-medium text-white">{pipelineName}</span></p>
        </div>
        <div className="grid w-full gap-4 rounded-2xl border border-white/20 bg-white/18 p-5 backdrop-blur sm:grid-cols-3 lg:max-w-xl">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl bg-white/20 px-4 py-3 text-start shadow-inner">
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
  ownerOptions: Array<{ id: string; name: string }>
  tierFilter: string
  onTierFilter: (value: string) => void
  activityFilter: string
  onActivityFilter: (value: string) => void
  preapprovedOnly: boolean
  onTogglePreapproved: (value: boolean) => void
  totalLeads: number
}

function PipelineFilterBar({
  pipelines,
  selectedPipelineId,
  onSelectPipeline,
  ownerFilter,
  onOwnerFilter,
  ownerOptions,
  tierFilter,
  onTierFilter,
  activityFilter,
  onActivityFilter,
  preapprovedOnly,
  onTogglePreapproved,
  totalLeads
}: PipelineFilterBarProps) {
  return (
    <div className="sticky top-0 z-30">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 shadow-sm">
        <FilterSelect
          label="Pipeline"
          value={selectedPipelineId}
          onChange={onSelectPipeline}
          options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
        />
        <FilterSelect
          label="Owner"
          value={ownerFilter}
          onChange={onOwnerFilter}
          options={[{ value: 'all', label: 'All owners' }, ...ownerOptions.map((owner) => ({ value: owner.id, label: owner.name }))]}
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
          variant={preapprovedOnly ? 'default' : 'ghost'}
          size="sm"
          className={cn(
            'rounded-full px-4 text-xs font-medium transition hover:shadow-[0_0_0_2px_rgba(31,95,255,0.22)]',
            preapprovedOnly
              ? 'bg-gradient-to-r from-[#1F5FFF] to-[#00C6A2] text-white shadow-sm hover:opacity-95'
              : 'border border-white/30 bg-white/20 text-white/85 hover:border-white/40'
          )}
          onClick={() => onTogglePreapproved(!preapprovedOnly)}
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" />
          Preapproved only
        </Button>
        <div className="ml-auto inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-xs font-semibold text-slate-700">
          <span className="h-2 w-2 rounded-full bg-brand-500" />
          {totalLeads} in view
        </div>
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
