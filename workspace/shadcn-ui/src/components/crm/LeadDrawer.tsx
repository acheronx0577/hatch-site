import { useEffect, useMemo, useRef, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Loader2, Mail, MessageSquare, Phone } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { useLeadActions } from '@/hooks/useLeadActions'
import { getLead, type LeadDetail, type LeadSummary, type Pipeline, type PipelineStage } from '@/lib/api/hatch'
import { getStageDisplay } from '@/lib/stageDisplay'
import { cn } from '@/lib/utils'
import { emitCopilotContext } from '@/lib/copilot/events'

interface OwnerOption {
  id: string
  name: string
}

interface LeadDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string | null
  lead: LeadSummary | null
  pipelines: Pipeline[]
  owners: OwnerOption[]
  onLeadUpdated: (lead: LeadSummary) => void
  onMessage: (leadId: string) => void
}

export function LeadDrawer({
  open,
  onOpenChange,
  leadId,
  lead,
  pipelines,
  owners,
  onLeadUpdated,
  onMessage
}: LeadDrawerProps) {
  const [detail, setDetail] = useState<LeadDetail>(() => createFallbackDetail(lead))
  const [loading, setLoading] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [fitForm, setFitForm] = useState(() => ({
    preapproved: Boolean(lead?.preapproved ?? false),
    budgetMin: lead?.budgetMin != null ? String(lead.budgetMin) : '',
    budgetMax: lead?.budgetMax != null ? String(lead.budgetMax) : '',
    timeframeDays: lead?.timeframeDays != null ? String(lead.timeframeDays) : '',
    geo: ''
  }))
  const [fitInventoryMatch, setFitInventoryMatch] = useState<number | null>(null)
  const [hasRemoteDetail, setHasRemoteDetail] = useState(false)
  const { pending, error, clearError, changeStage, assignOwner, updateLeadType, addNote, updateFit } = useLeadActions(leadId)
  const seededLeadIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (open) return
    seededLeadIdRef.current = null
    setHasRemoteDetail(false)
  }, [open])

  useEffect(() => {
    if (!open || !leadId) return
    if (seededLeadIdRef.current === leadId) return

    seededLeadIdRef.current = leadId
    setHasRemoteDetail(false)
    if (lead) {
      setDetail(createFallbackDetail(lead))
      setFitForm({
        preapproved: Boolean(lead.preapproved ?? false),
        budgetMin: lead.budgetMin != null ? String(lead.budgetMin) : '',
        budgetMax: lead.budgetMax != null ? String(lead.budgetMax) : '',
        timeframeDays: lead.timeframeDays != null ? String(lead.timeframeDays) : '',
        geo: ''
      })
      setFitInventoryMatch(null)
    }
    setNoteDraft('')
    clearError()
  }, [open, lead, leadId, clearError])

  useEffect(() => {
    if (!open) return
    if (!leadId) return

    let cancelled = false
    const fetchDetail = async () => {
      setLoading(true)
      try {
        const result = await getLead(leadId)
        if (!cancelled) {
          setDetail(result)
          const fit = result.fit ?? null
          const budgetMin = fit?.budgetMin ?? result.budgetMin ?? null
          const budgetMax = fit?.budgetMax ?? result.budgetMax ?? null
          const timeframeDays = fit?.timeframeDays ?? result.timeframeDays ?? null
          const geo = fit?.geo ?? ''

          setFitForm({
            preapproved: Boolean(fit?.preapproved ?? result.preapproved ?? false),
            budgetMin: typeof budgetMin === 'number' ? String(budgetMin) : '',
            budgetMax: typeof budgetMax === 'number' ? String(budgetMax) : '',
            timeframeDays: typeof timeframeDays === 'number' ? String(timeframeDays) : '',
            geo: geo ?? ''
          })
          setFitInventoryMatch(typeof fit?.inventoryMatch === 'number' ? fit.inventoryMatch : null)
          setNoteDraft('')
          setHasRemoteDetail(true)
        }
      } catch (err) {
        console.error('Failed to load lead details', err)
        if (!cancelled && lead) {
          setDetail(createFallbackDetail(lead))
          setFitForm({
            preapproved: Boolean(lead.preapproved ?? false),
            budgetMin: lead.budgetMin != null ? String(lead.budgetMin) : '',
            budgetMax: lead.budgetMax != null ? String(lead.budgetMax) : '',
            timeframeDays: lead.timeframeDays != null ? String(lead.timeframeDays) : '',
            geo: ''
          })
          setFitInventoryMatch(null)
          setNoteDraft('')
        }
        if (!cancelled) {
          setHasRemoteDetail(false)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchDetail()

    return () => {
      cancelled = true
    }
  }, [open, leadId])

  // Emit Copilot context with the lead's email when drawer is open so composer can prefill recipients
  useEffect(() => {
    if (!open) return
    const email = detail?.email ?? lead?.email ?? null
    const summary = detail
      ? `${detail.firstName ?? ''} ${detail.lastName ?? ''}`.trim() || detail.email || detail.id
      : lead
      ? `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || lead.email || lead.id
      : 'Lead'
    emitCopilotContext({
      surface: 'lead',
      entityType: 'lead',
      entityId: leadId ?? lead?.id ?? undefined,
      summary,
      metadata: { email }
    })
  }, [open, detail, lead, leadId])

  const activeStageId =
    detail?.stage?.id ?? detail?.stageId ?? lead?.stage?.id ?? lead?.stageId ?? null

  const activePipelineId =
    detail?.pipelineId ??
    detail?.stage?.pipelineId ??
    lead?.pipelineId ??
    lead?.stage?.pipelineId ??
    pipelines[0]?.id ??
    null

  const stageOptions: PipelineStage[] = useMemo(() => {
    if (!pipelines.length) return []
    if (activePipelineId) {
      const pipeline = pipelines.find((pipe) => pipe.id === activePipelineId)
      if (pipeline) {
        return pipeline.stages
      }
    }
    return pipelines.flatMap((pipeline) => pipeline.stages)
  }, [pipelines, activePipelineId])

  const ownerOptions = useMemo(() => {
    const map = new Map<string, OwnerOption>()
    owners.forEach((owner) => map.set(owner.id, owner))
    if (detail?.owner) {
      map.set(detail.owner.id, { id: detail.owner.id, name: detail.owner.name })
    }
    if (lead?.owner) {
      map.set(lead.owner.id, { id: lead.owner.id, name: lead.owner.name })
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [owners, detail?.owner, lead?.owner])

  const handleStageChange = async (stage: PipelineStage) => {
    try {
      const updated = await changeStage(stage.id, stage.pipelineId)
      setDetail(updated)
      onLeadUpdated(extractSummary(updated))
    } catch (err) {
      console.error(err)
    }
  }

  const handleOwnerChange = async (ownerId: string) => {
    const normalizedId = ownerId === 'unassigned' ? '' : ownerId;
    if (normalizedId === (detail?.owner?.id ?? lead?.owner?.id ?? '')) {
      return
    }
    try {
      const updated = await assignOwner(normalizedId)
      setDetail(updated)
      onLeadUpdated(extractSummary(updated))
    } catch (err) {
      console.error(err)
    }
  }

  const handleLeadTypeChange = async (nextLeadType: string) => {
    try {
      const updated = await updateLeadType(nextLeadType as any)
      setDetail(updated)
      onLeadUpdated(extractSummary(updated))
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddNote = async () => {
    const text = noteDraft.trim()
    if (!text) return
    try {
      const note = await addNote(text)
      setDetail((prev) =>
        prev
          ? { ...prev, notes: [note, ...(prev.notes ?? [])] }
          : prev
      )
      setNoteDraft('')
    } catch (err) {
      console.error(err)
    }
  }

  const parseOptionalInt = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) return null
    return Math.max(0, Math.round(parsed))
  }

  const handleSaveQualification = async () => {
    try {
      const updated = await updateFit({
        preapproved: fitForm.preapproved,
        budgetMin: parseOptionalInt(fitForm.budgetMin),
        budgetMax: parseOptionalInt(fitForm.budgetMax),
        timeframeDays: parseOptionalInt(fitForm.timeframeDays),
        geo: fitForm.geo.trim() || null,
        inventoryMatch: fitInventoryMatch
      })
      setDetail(updated)
      onLeadUpdated(extractSummary(updated))
    } catch (err) {
      console.error(err)
    }
  }

  const displayName = detail
    ? `${detail.firstName ?? ''} ${detail.lastName ?? ''}`.trim() || 'Lead'
    : lead
    ? `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() || 'Lead'
    : 'Lead'

  const lastActivity = detail?.lastActivityAt ?? lead?.lastActivityAt
  const stageEnteredAt = detail?.stageEnteredAt ?? lead?.stageEnteredAt
  const ownerName = detail?.owner?.name ?? lead?.owner?.name ?? 'Unassigned'
  const leadType = detail?.leadType ?? lead?.leadType ?? 'UNKNOWN'
  const leadTypeLabel = leadType === 'BUYER' ? 'Buyer' : leadType === 'SELLER' ? 'Seller' : null
  const stageName = detail?.stage?.name ?? lead?.stage?.name ?? 'Unassigned'
  const stageDisplay = getStageDisplay(stageName)
  const pipelineName =
    detail?.pipelineName ?? detail?.stage?.pipelineName ?? lead?.pipelineName ?? lead?.stage?.pipelineName ?? 'Pipeline'
  const qualificationDisabled = pending === 'fit' || !hasRemoteDetail || loading

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-4 bg-background p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 px-6 py-5 text-left">
          <SheetTitle className="text-xl">{displayName}</SheetTitle>
          <SheetDescription>
            {pipelineName} · {stageDisplay.short}
            {stageDisplay.long ? ` · ${stageDisplay.long}` : ''}{leadTypeLabel ? ` · ${leadTypeLabel} lead` : ''} · Representing Licensee {ownerName}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-4">
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            {!detail ? (
              <div className="flex h-40 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading lead details…
              </div>
            ) : (
              <>
                {loading && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    Refreshing latest lead data…
                  </div>
                )}
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last activity</p>
                      <p className="text-sm text-slate-700">
                        {lastActivity
                          ? formatDistanceToNow(new Date(lastActivity), { addSuffix: true })
                          : 'No recent activity'}
                      </p>
                    </div>
                    <Badge variant="secondary">Score {Math.round(detail.score ?? 0)}</Badge>
                  </div>
                  <Separator className="my-3" />
                  <dl className="grid gap-3 text-sm text-slate-600">
                    <div className="flex items-center justify-between">
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Time in stage</dt>
                      <dd>{stageEnteredAt ? formatDistanceToNow(new Date(stageEnteredAt), { addSuffix: true }) : '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
                      <dd>{detail.email ?? '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Phone</dt>
                      <dd>{detail.phone ?? '—'}</dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qualification</p>
                      <p className="text-sm text-slate-700">
                        Mortgage and buying criteria{!hasRemoteDetail ? ' (syncing…)': ''}
                      </p>
                    </div>
                    <Badge variant={fitForm.preapproved ? 'default' : 'secondary'}>
                      {fitForm.preapproved ? 'Pre-approved' : 'Not pre-approved'}
                    </Badge>
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="lead-preapproved" className="text-sm text-slate-700">
                        Pre-approved
                      </Label>
                      <Switch
                        id="lead-preapproved"
                        checked={fitForm.preapproved}
                        onCheckedChange={(checked) => setFitForm((prev) => ({ ...prev, preapproved: checked }))}
                        disabled={qualificationDisabled}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="lead-budget-min" className="text-xs text-slate-600">
                          Budget min
                        </Label>
                        <Input
                          id="lead-budget-min"
                          type="number"
                          value={fitForm.budgetMin}
                          onChange={(event) => setFitForm((prev) => ({ ...prev, budgetMin: event.target.value }))}
                          placeholder="e.g. 350000"
                          disabled={qualificationDisabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lead-budget-max" className="text-xs text-slate-600">
                          Budget max
                        </Label>
                        <Input
                          id="lead-budget-max"
                          type="number"
                          value={fitForm.budgetMax}
                          onChange={(event) => setFitForm((prev) => ({ ...prev, budgetMax: event.target.value }))}
                          placeholder="e.g. 550000"
                          disabled={qualificationDisabled}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="lead-timeframe" className="text-xs text-slate-600">
                          Timeframe (days)
                        </Label>
                        <Input
                          id="lead-timeframe"
                          type="number"
                          value={fitForm.timeframeDays}
                          onChange={(event) => setFitForm((prev) => ({ ...prev, timeframeDays: event.target.value }))}
                          placeholder="e.g. 30"
                          disabled={qualificationDisabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="lead-geo" className="text-xs text-slate-600">
                          Target area
                        </Label>
                        <Input
                          id="lead-geo"
                          value={fitForm.geo}
                          onChange={(event) => setFitForm((prev) => ({ ...prev, geo: event.target.value }))}
                          placeholder="e.g. Miami Beach"
                          disabled={qualificationDisabled}
                        />
                      </div>
                    </div>

                    <Button type="button" size="sm" onClick={handleSaveQualification} disabled={qualificationDisabled}>
                      {pending === 'fit' && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Save qualification
                    </Button>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Stage</h3>
                    <span className="text-xs text-slate-500">{stageOptions.length} steps</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {stageOptions.map((stageOption) => {
                      const optionDisplay = getStageDisplay(stageOption.name)
                      return (
                        <Button
                          key={stageOption.id}
                          type="button"
                          variant={stageOption.id === activeStageId ? 'default' : 'outline'}
                          size="sm"
                          disabled={pending === 'stage'}
                          onClick={() => handleStageChange(stageOption)}
                          className="flex flex-col items-start text-xs"
                        >
                          <span className="font-semibold text-slate-800">
                            {optionDisplay.short}
                          </span>
                          {optionDisplay.long && (
                            <span className="text-[11px] font-normal text-slate-500">
                              {optionDisplay.long}
                            </span>
                          )}
                        </Button>
                      )
                    })}
                  </div>
                </section>

                <section className="space-y-2">
                  <Label htmlFor="lead-owner">Representing Licensee</Label>
                  <Select
                    value={detail.owner?.id ?? 'unassigned'}
                    onValueChange={handleOwnerChange}
                    disabled={pending === 'owner'}
                  >
                    <SelectTrigger id="lead-owner">
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {ownerOptions.map((owner) => (
                        <SelectItem key={owner.id} value={owner.id}>
                          {owner.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </section>

                <section className="space-y-2">
                  <Label htmlFor="lead-type">Lead type</Label>
                  <Select
                    value={detail.leadType ?? 'UNKNOWN'}
                    onValueChange={handleLeadTypeChange}
                    disabled={pending === 'leadType'}
                  >
                    <SelectTrigger id="lead-type">
                      <SelectValue placeholder="Unknown" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNKNOWN">Unknown</SelectItem>
                      <SelectItem value="BUYER">Buyer</SelectItem>
                      <SelectItem value="SELLER">Seller</SelectItem>
                    </SelectContent>
                  </Select>
                </section>

                <section className="space-y-2">
                  <Label htmlFor="lead-note">Add note</Label>
                  <Textarea
                    id="lead-note"
                    placeholder="Log a quick follow-up note…"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    rows={3}
                    disabled={pending === 'note'}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending === 'note' || noteDraft.trim().length === 0}
                      onClick={handleAddNote}
                    >
                      {pending === 'note' && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Save note
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => leadId && onMessage(leadId)}
                    >
                      <MessageSquare className="mr-2 h-3.5 w-3.5" />
                      Message
                    </Button>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Recent notes</h3>
                    {detail.notes.length > 0 && (
                      <span className="text-xs text-slate-500">{detail.notes.length} total</span>
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
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function extractSummary(lead: LeadDetail): LeadSummary {
  const { notes, tasks, consents, events, fit, touchpoints, ...summary } = lead
  return summary
}

function createFallbackDetail(summary: LeadSummary): LeadDetail {
  const {
    preapproved,
    budgetMin,
    budgetMax,
    timeframeDays,
    ...rest
  } = summary

  return {
    ...rest,
    preapproved,
    budgetMin,
    budgetMax,
    timeframeDays,
    notes: [],
    tasks: [],
    consents: [],
    events: [],
    fit:
      preapproved !== undefined || budgetMin !== undefined || budgetMax !== undefined || timeframeDays !== undefined
        ? {
            preapproved: preapproved ?? undefined,
            budgetMin: budgetMin ?? null,
            budgetMax: budgetMax ?? null,
            timeframeDays: timeframeDays ?? null,
            geo: null,
            inventoryMatch: null,
          }
        : null,
  }
}

export default LeadDrawer
