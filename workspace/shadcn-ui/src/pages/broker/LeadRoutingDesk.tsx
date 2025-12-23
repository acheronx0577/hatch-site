import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  approveRoutingApprovalQueueItem,
  fetchRoutingCapacity,
  fetchRoutingApprovalQueue,
  fetchRoutingEvents,
  fetchRoutingMetrics,
  fetchRoutingRules,
  fetchRoutingSettings,
  fetchRoutingSla,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  processRoutingSla,
  rejectRoutingApprovalQueueItem,
  updateRoutingSettings,
  type LeadRoutingOrgMode,
  type LeadRoutingRule,
  type LeadRouteEventRecord,
  type LeadRoutingRulePayload,
  type LeadRoutingSettings,
  type RoutingApprovalQueueItem,
  type RoutingCapacityAgent,
  type RoutingMetricsSummary,
  type RoutingSlaDashboard,
  type RoutingDecisionCandidate
} from '@/lib/api/hatch'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/components/ui/use-toast'
import { AlertTriangle, Edit3, Loader2, PlusCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'

type RuleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRule?: LeadRoutingRule | null
  onSubmit: (payload: { ruleId?: string; data: LeadRoutingRulePayload }) => Promise<void>
}

type RuleFormState = {
  name: string
  priority: string
  mode: 'FIRST_MATCH' | 'SCORE_AND_ASSIGN'
  enabled: boolean
  requireSmsConsent: boolean
  requireActiveBba: boolean
  includeCity: string
  priceMin: string
  priceMax: string
  agentTargets: string
  teamTarget: string
  teamLeadersOnly: boolean
  pondTeam: string
  slaFirstTouch: string
  slaKeptAppointment: string
}

const emptyForm: RuleFormState = {
  name: '',
  priority: '0',
  mode: 'SCORE_AND_ASSIGN',
  enabled: true,
  requireSmsConsent: true,
  requireActiveBba: false,
  includeCity: '',
  priceMin: '',
  priceMax: '',
  agentTargets: '',
  teamTarget: '',
  teamLeadersOnly: false,
  pondTeam: '',
  slaFirstTouch: '30',
  slaKeptAppointment: '1440'
}

const formatMinutes = (minutes: number | null) => {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes.toFixed(1)} min`
  const hours = minutes / 60
  if (hours < 24) return `${hours.toFixed(1)} hr`
  const days = hours / 24
  return `${days.toFixed(1)} days`
}

const percent = (value: number) => `${value.toFixed(1)}%`

const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[]
  }
  if (value && typeof value === 'object' && 'items' in (value as Record<string, unknown>)) {
    const items = (value as { items?: unknown }).items
    if (Array.isArray(items)) {
      return items as T[]
    }
  }
  return []
}

const statusVariant = (status: string) => {
  if (status === 'SATISFIED' || status === 'KEPT') return 'secondary'
  if (status === 'BREACHED') return 'destructive'
  if (status === 'PENDING') return 'secondary'
  return 'outline'
}

const offerStatusFilters = [
  { id: 'ALL', label: 'All decisions' },
  { id: 'SUBMITTED', label: 'Submitted' },
  { id: 'UNDER_REVIEW', label: 'Under review' },
  { id: 'ACCEPTED', label: 'Accepted' },
  { id: 'DECLINED', label: 'Declined' }
] as const

type OfferStatusFilter = (typeof offerStatusFilters)[number]['id']
type OfferStatus = Exclude<OfferStatusFilter, 'ALL'> | 'UNKNOWN'

type EventPayloadEnvelope = {
  status?: string | null
  offerStatus?: string | null
  workflowStatus?: string | null
  decision?: { status?: string | null }
  context?: {
    offerIntent?: { status?: string | null }
    offer?: { status?: string | null }
    workflowStatus?: string | null
  }
}

const normalizeOfferStatus = (value?: string | null): OfferStatus => {
  if (!value) return 'UNKNOWN'
  const normalized = value.toUpperCase()
  if (normalized === 'SUBMITTED') return 'SUBMITTED'
  if (normalized === 'UNDER_REVIEW' || normalized === 'IN_REVIEW') return 'UNDER_REVIEW'
  if (normalized === 'ACCEPTED' || normalized === 'APPROVED') return 'ACCEPTED'
  if (normalized === 'DECLINED' || normalized === 'REJECTED') return 'DECLINED'
  return 'UNKNOWN'
}

const getEventOfferStatus = (event: LeadRouteEventRecord): OfferStatus => {
  const payload = (event.payload ?? {}) as EventPayloadEnvelope
  const status =
    payload.status ??
    payload.offerStatus ??
    payload.workflowStatus ??
    payload.decision?.status ??
    payload.context?.offerIntent?.status ??
    payload.context?.workflowStatus ??
    payload.context?.offer?.status
  return normalizeOfferStatus(status)
}

const offerStatusLabel = (status: OfferStatus | OfferStatusFilter) => {
  if (status === 'UNDER_REVIEW') return 'Under review'
  if (status === 'SUBMITTED') return 'Submitted'
  if (status === 'ACCEPTED') return 'Accepted'
  if (status === 'DECLINED') return 'Declined'
  if (status === 'ALL') return 'All decisions'
  return 'Unknown'
}

function RuleDialog({ open, onOpenChange, initialRule, onSubmit }: RuleDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = useState<RuleFormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (initialRule) {
        const priceBand = initialRule.conditions?.priceBand ?? {}
        const geography = initialRule.conditions?.geography ?? {}
        const consent = initialRule.conditions?.consent ?? {}
        const agentTargets =
          initialRule.targets
            ?.filter((target) => target.type === 'AGENT')
            .map((target) => target.id)
            .join(', ') ?? ''
        const teamTargetConfig = initialRule.targets?.find((target) => target.type === 'TEAM') ?? null
        const teamTarget = teamTargetConfig?.id ?? ''
        const teamLeadersOnly =
          Array.isArray((teamTargetConfig as any)?.includeRoles) &&
          (teamTargetConfig as any).includeRoles.some((role: unknown) => String(role).toLowerCase() === 'leader')
        const pondTarget =
          initialRule.fallback?.teamId ??
          initialRule.targets?.find((target) => target.type === 'POND')?.id ??
          ''

        setForm({
          name: initialRule.name,
          priority: String(initialRule.priority),
          mode: initialRule.mode,
          enabled: initialRule.enabled,
          requireSmsConsent: consent.sms === 'GRANTED',
          requireActiveBba: initialRule.conditions?.buyerRep === 'REQUIRED_ACTIVE',
          includeCity: geography.includeCities?.[0] ?? '',
          priceMin: priceBand.min !== undefined ? String(priceBand.min) : '',
          priceMax: priceBand.max !== undefined ? String(priceBand.max) : '',
          agentTargets,
          teamTarget,
          teamLeadersOnly,
          pondTeam: pondTarget,
          slaFirstTouch:
            initialRule.slaFirstTouchMinutes !== undefined && initialRule.slaFirstTouchMinutes !== null
              ? String(initialRule.slaFirstTouchMinutes)
              : '',
          slaKeptAppointment:
            initialRule.slaKeptAppointmentMinutes !== undefined &&
            initialRule.slaKeptAppointmentMinutes !== null
              ? String(initialRule.slaKeptAppointmentMinutes)
              : ''
        })
      } else {
        setForm(emptyForm)
      }
    }
  }, [open, initialRule])

  const handleChange = (key: keyof RuleFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const buildPayload = (): LeadRoutingRulePayload | null => {
    const priority = Number.parseInt(form.priority, 10)
    if (Number.isNaN(priority)) {
      toast({ title: 'Priority must be a number', variant: 'destructive' })
      return null
    }

    const targets: LeadRoutingRulePayload['targets'] = []
    const agentIds = form.agentTargets
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    if (agentIds.length > 0) {
      for (const id of agentIds) {
        targets.push({ type: 'AGENT', id })
      }
    }
    if (form.teamTarget) {
      targets.push({
        type: 'TEAM',
        id: form.teamTarget,
        strategy: 'BEST_FIT',
        ...(form.teamLeadersOnly ? { includeRoles: ['leader'] } : {})
      })
    }
    if (form.pondTeam) {
      targets.push({ type: 'POND', id: form.pondTeam })
    }

    if (targets.length === 0) {
      toast({ title: 'At least one target is required', variant: 'destructive' })
      return null
    }

    const conditions: LeadRoutingRulePayload['conditions'] = {}
    if (form.requireSmsConsent) {
      conditions.consent = { sms: 'GRANTED' }
    }
    if (form.requireActiveBba) {
      conditions.buyerRep = 'REQUIRED_ACTIVE'
    }
    if (form.priceMin || form.priceMax) {
      conditions.priceBand = {
        min: form.priceMin ? Number(form.priceMin) : undefined,
        max: form.priceMax ? Number(form.priceMax) : undefined
      }
    }
    if (form.includeCity) {
      conditions.geography = { includeCities: [form.includeCity] }
    }

    return {
      name: form.name,
      priority,
      mode: form.mode,
      enabled: form.enabled,
      conditions,
      targets,
      fallback: form.pondTeam ? { teamId: form.pondTeam } : null,
      slaFirstTouchMinutes: form.slaFirstTouch ? Number(form.slaFirstTouch) : null,
      slaKeptAppointmentMinutes: form.slaKeptAppointment ? Number(form.slaKeptAppointment) : null
    }
  }

  const handleSubmit = async () => {
    const payload = buildPayload()
    if (!payload) return
    setSaving(true)
    try {
      await onSubmit({ ruleId: initialRule?.id, data: payload })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Unable to save rule',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initialRule ? 'Edit Routing Rule' : 'New Routing Rule'}</DialogTitle>
          <DialogDescription>
            Define rule conditions, targets, and SLA timers. All fields can be updated later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(event) => handleChange('name', event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                value={form.priority}
                onChange={(event) => handleChange('priority', event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rule-mode">Mode</Label>
              <Select value={form.mode} onValueChange={(value) => handleChange('mode', value)}>
                <SelectTrigger id="rule-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIRST_MATCH">First Match</SelectItem>
                  <SelectItem value="SCORE_AND_ASSIGN">Score & Assign</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <Label className="text-sm font-medium">Enabled</Label>
                <p className="text-xs text-muted-foreground">Toggle rule availability</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(value) => handleChange('enabled', value)} />
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Conditions</h3>
                <p className="text-xs text-muted-foreground">Limit when this rule applies</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label className="text-sm font-medium">Require SMS consent</Label>
                  <p className="text-xs text-muted-foreground">Only route if SMS consent granted</p>
                </div>
                <Switch
                  checked={form.requireSmsConsent}
                  onCheckedChange={(value) => handleChange('requireSmsConsent', value)}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label className="text-sm font-medium">Require active BBA</Label>
                  <p className="text-xs text-muted-foreground">Lead must have an active buyer agreement</p>
                </div>
                <Switch
                  checked={form.requireActiveBba}
                  onCheckedChange={(value) => handleChange('requireActiveBba', value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-city">Include city</Label>
                <Input
                  id="rule-city"
                  value={form.includeCity}
                  onChange={(event) => handleChange('includeCity', event.target.value)}
                  placeholder="e.g. Miami"
                />
              </div>
              <div className="grid gap-2">
                <Label>Price band</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={form.priceMin}
                    onChange={(event) => handleChange('priceMin', event.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={form.priceMax}
                    onChange={(event) => handleChange('priceMax', event.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border p-4">
            <div>
              <h3 className="text-sm font-semibold">Targets</h3>
              <p className="text-xs text-muted-foreground">Specify destination agents or teams</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="rule-agents">Agent IDs</Label>
                <Input
                  id="rule-agents"
                  value={form.agentTargets}
                  onChange={(event) => handleChange('agentTargets', event.target.value)}
                  placeholder="agent-a, agent-b"
                />
                <p className="text-xs text-muted-foreground">Comma separated agent identifiers</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-team">Team target</Label>
                <Input
                  id="rule-team"
                  value={form.teamTarget}
                  onChange={(event) => handleChange('teamTarget', event.target.value)}
                  placeholder="team-id"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label className="text-sm font-medium">Team leaders only</Label>
                  <p className="text-xs text-muted-foreground">Route TEAM targets to members with role “leader”.</p>
                </div>
                <Switch
                  checked={form.teamLeadersOnly}
                  onCheckedChange={(value) => handleChange('teamLeadersOnly', value)}
                  disabled={!form.teamTarget}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-pond">Pond / fallback team</Label>
                <Input
                  id="rule-pond"
                  value={form.pondTeam}
                  onChange={(event) => handleChange('pondTeam', event.target.value)}
                  placeholder="pond-team-id"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label htmlFor="sla-first">First-touch SLA (minutes)</Label>
                  <Input
                    id="sla-first"
                    type="number"
                    value={form.slaFirstTouch}
                    onChange={(event) => handleChange('slaFirstTouch', event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sla-kept">Kept appointment SLA (minutes)</Label>
                  <Input
                    id="sla-kept"
                    type="number"
                    value={form.slaKeptAppointment}
                    onChange={(event) => handleChange('slaKeptAppointment', event.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CandidatesTable({ candidates }: { candidates: RoutingDecisionCandidate[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Capacity</TableHead>
          <TableHead>Reasons</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {candidates.map((candidate) => (
          <TableRow key={`${candidate.agentId}-${candidate.status}`}>
            <TableCell className="font-medium">{candidate.fullName || candidate.agentId}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(candidate.status)}>{candidate.status}</Badge>
            </TableCell>
            <TableCell>{candidate.score !== undefined ? candidate.score.toFixed(2) : '—'}</TableCell>
            <TableCell>{candidate.capacityRemaining}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {candidate.reasons.length > 0 ? candidate.reasons.join(', ') : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function LeadRoutingDesk() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [processingSla, setProcessingSla] = useState(false)

	const [rules, setRules] = useState<LeadRoutingRule[]>([])
	const [capacity, setCapacity] = useState<RoutingCapacityAgent[]>([])
	const [events, setEvents] = useState<LeadRouteEventRecord[]>([])
	const [sla, setSla] = useState<RoutingSlaDashboard | null>(null)
	const [metrics, setMetrics] = useState<RoutingMetricsSummary | null>(null)
	const [routingSettings, setRoutingSettings] = useState<LeadRoutingSettings | null>(null)
	const [approvalQueue, setApprovalQueue] = useState<RoutingApprovalQueueItem[]>([])
	const [updatingMode, setUpdatingMode] = useState(false)
	const [queueActionId, setQueueActionId] = useState<string | null>(null)
	const [advancedOpen, setAdvancedOpen] = useState(false)

	const [reassignDialogOpen, setReassignDialogOpen] = useState(false)
	const [reassignTarget, setReassignTarget] = useState<RoutingApprovalQueueItem | null>(null)
	const [reassignAgentId, setReassignAgentId] = useState<string>('')

	const [dialogOpen, setDialogOpen] = useState(false)
	const [editingRule, setEditingRule] = useState<LeadRoutingRule | null>(null)
	const [searchParams, setSearchParams] = useSearchParams()

  const parseStatus = (value: string | null): OfferStatusFilter => {
    if (!value) return 'ALL'
    const normalized = value.toUpperCase()
    return offerStatusFilters.some((filter) => filter.id === normalized) ? (normalized as OfferStatusFilter) : 'ALL'
  }

  const [statusFilter, setStatusFilter] = useState<OfferStatusFilter>(() => parseStatus(searchParams.get('status')))

  useEffect(() => {
    const nextStatus = parseStatus(searchParams.get('status'))
    if (nextStatus !== statusFilter) {
      setStatusFilter(nextStatus)
    }
  }, [searchParams, statusFilter])

  const handleStatusFilterChange = (value: OfferStatusFilter) => {
    setStatusFilter(value)
    const next = new URLSearchParams(searchParams)
    if (value === 'ALL') {
      next.delete('status')
    } else {
      next.set('status', value)
    }
    setSearchParams(next, { replace: true })
  }

  const filteredEvents = useMemo(() => {
    if (statusFilter === 'ALL') return events
    return events.filter((event) => getEventOfferStatus(event) === statusFilter)
  }, [events, statusFilter])

	const loadData = useCallback(async () => {
		setLoading(true)
		try {
			const [settingsData, queueData, rulesData, capacityData, slaData, metricsData, eventsData] = await Promise.all([
				fetchRoutingSettings(TENANT_ID),
				fetchRoutingApprovalQueue(TENANT_ID),
				fetchRoutingRules(TENANT_ID),
				fetchRoutingCapacity(TENANT_ID),
				fetchRoutingSla(TENANT_ID),
				fetchRoutingMetrics(TENANT_ID),
				fetchRoutingEvents({ tenantId: TENANT_ID, limit: 15 })
			])
			setRoutingSettings(settingsData)
			setApprovalQueue(queueData.items ?? [])
			setRules(normalizeArray<LeadRoutingRule>(rulesData))
			setCapacity(normalizeArray<RoutingCapacityAgent>(capacityData))
			setSla(slaData)
			setMetrics(metricsData)
			setEvents(normalizeArray<LeadRouteEventRecord>(eventsData))
    } catch (error) {
      toast({
        title: 'Unable to load routing data',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

	const refreshSection = async () => {
		setRefreshing(true)
		try {
			const [settingsData, queueData, rulesData, eventsData] = await Promise.all([
				fetchRoutingSettings(TENANT_ID),
				fetchRoutingApprovalQueue(TENANT_ID),
				fetchRoutingRules(TENANT_ID),
				fetchRoutingEvents({ tenantId: TENANT_ID, limit: 15 })
			])
			setRoutingSettings(settingsData)
			setApprovalQueue(queueData.items ?? [])
			setRules(normalizeArray<LeadRoutingRule>(rulesData))
			setEvents(normalizeArray<LeadRouteEventRecord>(eventsData))
		} catch (error) {
			toast({
				title: 'Refresh failed',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive'
			})
		} finally {
			setRefreshing(false)
		}
	}

	const refreshApprovalQueue = useCallback(async () => {
		const queue = await fetchRoutingApprovalQueue(TENANT_ID)
		setApprovalQueue(queue.items ?? [])
	}, [])

	const handleToggleApprovalPool = async (enabled: boolean) => {
		const currentMode = routingSettings?.mode ?? 'AUTOMATIC'
		const nextMode: LeadRoutingOrgMode = enabled ? 'APPROVAL_POOL' : 'AUTOMATIC'
		if (currentMode === nextMode) return

		const ok = window.confirm(
			enabled
				? 'Enable Broker Approval Pool? New inbound leads will be queued until a broker approves an assignee.'
				: 'Disable Broker Approval Pool? New inbound leads will assign automatically; any currently queued leads remain pending until you approve/reject them.'
		)
		if (!ok) return

		setUpdatingMode(true)
		try {
			const updated = await updateRoutingSettings(TENANT_ID, { mode: nextMode })
			setRoutingSettings(updated)
			await refreshApprovalQueue()
			toast({
				title: 'Routing mode updated',
				description: updated.mode === 'APPROVAL_POOL' ? 'New leads will require broker approval.' : 'New leads will assign automatically.'
			})
		} catch (error) {
			toast({
				title: 'Unable to update routing mode',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive'
			})
		} finally {
			setUpdatingMode(false)
		}
	}

	const approveQueueItem = async (item: RoutingApprovalQueueItem, agentId?: string | null) => {
		setQueueActionId(item.assignmentId)
		try {
			await approveRoutingApprovalQueueItem({
				tenantId: TENANT_ID,
				assignmentId: item.assignmentId,
				agentId: agentId ?? null
			})
			toast({
				title: 'Lead assigned',
				description: agentId ? 'Lead assigned to selected agent.' : 'Lead assigned to the system recommendation.'
			})
			await refreshApprovalQueue()
		} catch (error) {
			toast({
				title: 'Unable to approve lead',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive'
			})
		} finally {
			setQueueActionId(null)
		}
	}

	const rejectQueueItem = async (item: RoutingApprovalQueueItem) => {
		const ok = window.confirm('Reject this lead assignment request? The lead will remain unassigned.')
		if (!ok) return
		setQueueActionId(item.assignmentId)
		try {
			await rejectRoutingApprovalQueueItem({ tenantId: TENANT_ID, assignmentId: item.assignmentId })
			toast({ title: 'Removed from approval pool' })
			await refreshApprovalQueue()
		} catch (error) {
			toast({
				title: 'Unable to reject lead',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive'
			})
		} finally {
			setQueueActionId(null)
		}
	}

	const openReassign = (item: RoutingApprovalQueueItem) => {
		setReassignTarget(item)
		setReassignAgentId(item.recommended?.agentId ?? item.candidates[0]?.agentId ?? '')
		setReassignDialogOpen(true)
	}

	const submitReassign = async () => {
		if (!reassignTarget) return
		if (!reassignAgentId) {
			toast({
				title: 'Select an agent',
				description: 'Choose an agent to assign this lead.',
				variant: 'destructive'
			})
			return
		}
		await approveQueueItem(reassignTarget, reassignAgentId)
		setReassignDialogOpen(false)
		setReassignTarget(null)
	}

	const ruleNameById = useMemo(() => {
		const map = new Map<string, string>()
		for (const rule of normalizeArray<LeadRoutingRule>(rules)) {
			map.set(rule.id, rule.name)
    }
    return map
  }, [rules])

  const handleSaveRule = async ({ ruleId, data }: { ruleId?: string; data: LeadRoutingRulePayload }) => {
    try {
      if (ruleId) {
        await updateRoutingRule(ruleId, TENANT_ID, data)
        toast({ title: 'Rule updated' })
      } else {
        await createRoutingRule(TENANT_ID, data)
        toast({ title: 'Rule created' })
      }
      setDialogOpen(false)
      setEditingRule(null)
      await refreshSection()
    } catch (error) {
      toast({
        title: 'Unable to save rule',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
      throw error
    }
  }

  const handleDeleteRule = async (rule: LeadRoutingRule) => {
    const confirmDelete = window.confirm(`Delete rule “${rule.name}”?`)
    if (!confirmDelete) return
    try {
      await deleteRoutingRule(rule.id, TENANT_ID)
      toast({ title: 'Rule deleted' })
      await refreshSection()
    } catch (error) {
      toast({
        title: 'Unable to delete rule',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    }
  }

  const handleProcessSla = async () => {
    setProcessingSla(true)
    try {
      const result = await processRoutingSla(TENANT_ID)
      toast({ title: 'SLA timers processed', description: `${result.processed} timers reviewed` })
      const [slaData, eventsData] = await Promise.all([
        fetchRoutingSla(TENANT_ID),
        fetchRoutingEvents({ tenantId: TENANT_ID, limit: 15 })
      ])
      setSla(slaData)
      setEvents(eventsData)
    } catch (error) {
      toast({
        title: 'Unable to process SLAs',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setProcessingSla(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading lead routing desk…</span>
        </div>
      </div>
    )
  }

	  return (
	    <div className="space-y-8">
	      <div className="flex flex-wrap items-center justify-between gap-4">
	        <div>
	          <h1 className="text-[30px] font-semibold tracking-tight">Lead Routing & SLA Desk</h1>
	          <p className="text-sm text-muted-foreground">
	            Choose how new leads get assigned. Advanced rules and SLA analytics live under “Advanced”.
	          </p>
	        </div>
	        <div className="flex items-center gap-2">
	          <Button variant="outline" onClick={refreshSection} disabled={refreshing}>
	            {refreshing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
	            Refresh
	          </Button>
	        </div>
		      </div>

		      <div className="grid gap-4 md:grid-cols-2">
		        <Card>
		          <CardHeader>
		            <CardTitle>Routing mode</CardTitle>
		            <CardDescription>Automatic assignment or broker approval pool.</CardDescription>
		          </CardHeader>
		          <CardContent className="space-y-3">
		            <div className="flex items-start justify-between gap-4">
		              <div className="space-y-1">
		                <p className="text-sm font-semibold">Broker approval pool</p>
		                <p className="text-xs text-muted-foreground">
		                  When enabled, new inbound leads stay unassigned until a broker approves an assignee.
		                </p>
		              </div>
		              <div className="flex items-center gap-2">
		                <Switch
		                  checked={(routingSettings?.mode ?? 'AUTOMATIC') === 'APPROVAL_POOL'}
		                  onCheckedChange={handleToggleApprovalPool}
		                  disabled={!routingSettings || updatingMode}
		                />
		                {updatingMode ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
		              </div>
		            </div>
		            <div className="text-xs text-muted-foreground">
		              Current:{' '}
		              <span className="font-semibold text-slate-900">
		                {(routingSettings?.mode ?? 'AUTOMATIC') === 'APPROVAL_POOL' ? 'Broker approval pool' : 'Automatic'}
		              </span>
		            </div>
		            {routingSettings?.approvalTeamName ? (
		              <div className="text-xs text-muted-foreground">
		                Queue: <span className="font-semibold text-slate-900">{routingSettings.approvalTeamName}</span>
		              </div>
		            ) : null}
		          </CardContent>
		        </Card>

		        <Card className="md:col-span-2">
		          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
		            <div>
		              <CardTitle>Broker approval pool</CardTitle>
		              <CardDescription>Pending leads waiting for broker assignment.</CardDescription>
		            </div>
		            <Badge variant="secondary">{approvalQueue.length} pending</Badge>
		          </CardHeader>
		          <CardContent>
		            {approvalQueue.length === 0 ? (
		              <div className="text-sm text-muted-foreground">
		                {routingSettings?.mode === 'APPROVAL_POOL'
		                  ? 'No leads waiting for approval.'
		                  : 'Enable Broker approval pool to queue new inbound leads for review.'}
		              </div>
		            ) : (
		              <ScrollArea className="max-h-[320px] pr-2">
		                <Table>
		                  <TableHeader>
		                    <TableRow>
		                      <TableHead>Lead</TableHead>
		                      <TableHead>Recommended</TableHead>
		                      <TableHead>Why</TableHead>
		                      <TableHead className="text-right">Actions</TableHead>
		                    </TableRow>
		                  </TableHeader>
		                  <TableBody>
		                    {approvalQueue.map((item) => (
		                      <TableRow key={item.assignmentId}>
		                        <TableCell className="min-w-[260px]">
		                          <div className="space-y-1">
		                            <div className="flex flex-wrap items-center gap-2">
		                              <Link
		                                to={`/broker/crm/leads/${encodeURIComponent(item.personId)}`}
		                                className="font-semibold hover:underline"
		                              >
		                                {item.lead.name}
		                              </Link>
		                              <Badge variant="outline" className="text-[10px]">
		                                {item.lead.leadType}
		                              </Badge>
		                              <Badge variant="secondary" className="text-[10px]">
		                                {item.lead.stage}
		                              </Badge>
		                            </div>
		                            <div className="text-xs text-muted-foreground">
		                              {[item.lead.email, item.lead.phone].filter(Boolean).join(' • ') || '—'}
		                            </div>
		                          </div>
		                        </TableCell>
		                        <TableCell className="min-w-[220px]">
		                          {item.recommended ? (
		                            <div className="space-y-1">
		                              <div className="font-medium">{item.recommended.fullName || item.recommended.agentId}</div>
		                              {item.recommended.score !== null ? (
		                                <div className="text-xs text-muted-foreground">
		                                  Score {item.recommended.score.toFixed(2)}
		                                </div>
		                              ) : null}
		                            </div>
		                          ) : (
		                            <span className="text-sm text-muted-foreground">—</span>
		                          )}
		                        </TableCell>
		                        <TableCell className="min-w-[260px] text-xs text-muted-foreground">
		                          {item.recommended?.reasons?.length ? item.recommended.reasons.join(' • ') : '—'}
		                        </TableCell>
		                        <TableCell className="text-right">
		                          <div className="flex flex-wrap justify-end gap-2">
		                            <Button
		                              size="sm"
		                              onClick={() => approveQueueItem(item)}
		                              disabled={queueActionId === item.assignmentId}
		                            >
		                              {queueActionId === item.assignmentId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
		                              Approve
		                            </Button>
		                            <Button
		                              size="sm"
		                              variant="outline"
		                              onClick={() => openReassign(item)}
		                              disabled={queueActionId === item.assignmentId}
		                            >
		                              Reassign
		                            </Button>
		                            <Button
		                              size="sm"
		                              variant="destructive"
		                              onClick={() => rejectQueueItem(item)}
		                              disabled={queueActionId === item.assignmentId}
		                            >
		                              Reject
		                            </Button>
		                          </div>
		                        </TableCell>
		                      </TableRow>
		                    ))}
		                  </TableBody>
		                </Table>
		              </ScrollArea>
		            )}
		          </CardContent>
		        </Card>
		      </div>

		      <details
		        open={advancedOpen}
		        onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
		        className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white/5 p-4 backdrop-blur-md dark:bg-white/5"
		      >
		        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-900 dark:text-ink-100">
		          Advanced (rules, capacity, SLA, metrics, events)
		        </summary>
		        <div className="mt-6 space-y-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Routing rules</CardTitle>
            <CardDescription>Ordered by priority; lower numbers evaluate first.</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditingRule(null)
              setDialogOpen(true)
            }}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            New rule
          </Button>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-white/10 py-10 text-sm text-muted-foreground backdrop-blur-md dark:bg-white/5">
              <PlusCircle className="h-6 w-6 text-brand-blue-600" />
              <p className="font-medium text-slate-700 dark:text-ink-100">No routing rules yet.</p>
              <p className="text-xs text-slate-500 dark:text-ink-100/70">
                Create a rule to start assigning new leads automatically.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[340px] pr-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Priority</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Targets</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => {
                    const targetSummary = rule.targets
                      .map((target) => `${target.type.toLowerCase()}:${'id' in target ? target.id : ''}`)
                      .join(', ')
                    const slaSummary = [
                      rule.slaFirstTouchMinutes ? `First touch: ${rule.slaFirstTouchMinutes}m` : null,
                      rule.slaKeptAppointmentMinutes ? `Kept appt: ${rule.slaKeptAppointmentMinutes}m` : null
                    ]
                      .filter(Boolean)
                      .join(' • ')
                    return (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.priority}</TableCell>
                        <TableCell>{rule.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{rule.mode === 'FIRST_MATCH' ? 'First match' : 'Score & assign'}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {targetSummary || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{slaSummary || '—'}</TableCell>
                        <TableCell>
                        <Badge variant={rule.enabled ? 'secondary' : 'outline'}>
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingRule(rule)
                                setDialogOpen(true)
                              }}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRule(rule)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agent capacity</CardTitle>
            <CardDescription>Understand current load and appointment performance.</CardDescription>
          </CardHeader>
          <CardContent>
            {capacity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active agents found.</p>
            ) : (
              <ScrollArea className="max-h-[260px] pr-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Kept appt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {capacity.map((agent) => (
                      <TableRow key={agent.agentId}>
                        <TableCell className="font-medium">{agent.name}</TableCell>
                        <TableCell>{agent.activePipeline}</TableCell>
                        <TableCell>{agent.capacityTarget}</TableCell>
                        <TableCell>{agent.capacityRemaining}</TableCell>
                        <TableCell>{percent(agent.keptApptRate * 100)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-brand-blue-600 before:to-brand-green-500 before:content-['']">
          <CardHeader>
            <CardTitle>SLA health</CardTitle>
            <CardDescription>Monitor timer load and process breaches.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[var(--radius-md)] border border-white/20 bg-card/[var(--hatch-glass-alpha-recessed)] p-4 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Total timers</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{sla?.summary.total ?? 0}</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-white/20 bg-card/[var(--hatch-glass-alpha-recessed)] p-4 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Pending</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{sla?.summary.pending ?? 0}</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-rose-200/60 bg-rose-500/10 p-4 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Breached</p>
                <p className="mt-1 text-2xl font-semibold text-rose-700">{sla?.summary.breached ?? 0}</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-emerald-200/60 bg-emerald-500/10 p-4 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Satisfied</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-700">{sla?.summary.satisfied ?? 0}</p>
              </div>
            </div>
            <Button onClick={handleProcessSla} disabled={processingSla} variant="outline">
              {processingSla && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Process timers
            </Button>
            <ScrollArea className="max-h-[180px] pr-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sla?.timers.map((timer) => (
                    <TableRow key={timer.id}>
                      <TableCell>{timer.leadId}</TableCell>
                      <TableCell>{timer.type.replace('_', ' ').toLowerCase()}</TableCell>
                      <TableCell>{new Date(timer.dueAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(timer.status)}>{timer.status}</Badge>
                      </TableCell>
                    </TableRow>
                  )) || (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No timers found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Routing metrics</CardTitle>
          <CardDescription>Track first-touch velocity and kept appointment performance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {metrics ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[var(--radius-md)] border border-white/20 bg-card/[var(--hatch-glass-alpha-recessed)] p-4 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Avg first touch</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMinutes(metrics.firstTouch.averageMinutes)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metrics.firstTouch.count} satisfied timers</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-rose-200/60 bg-rose-500/10 p-4 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">First-touch breach</p>
                <p className="mt-2 text-2xl font-semibold text-rose-700">
                  {percent(metrics.breach.firstTouch.percentage)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {metrics.breach.firstTouch.breached} of {metrics.breach.firstTouch.total} timers
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-rose-200/60 bg-rose-500/10 p-4 backdrop-blur-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Kept appt breach</p>
                <p className="mt-2 text-2xl font-semibold text-rose-700">
                  {percent(metrics.breach.keptAppointment.percentage)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {metrics.breach.keptAppointment.breached} of {metrics.breach.keptAppointment.total} timers
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Metrics unavailable.</p>
          )}
          {metrics && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold mb-2">Lead → kept appointment by rule</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Kept %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.rules.map((entry) => (
                      <TableRow key={entry.ruleId}>
                        <TableCell>{entry.ruleName}</TableCell>
                        <TableCell>{entry.total}</TableCell>
                        <TableCell>{percent(entry.keptRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Lead → kept appointment by agent</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Kept %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.agents.map((entry) => (
                      <TableRow key={entry.agentId}>
                        <TableCell>{entry.agentName}</TableCell>
                        <TableCell>{entry.total}</TableCell>
                        <TableCell>{percent(entry.keptRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Decision viewer</CardTitle>
            <CardDescription>Recent routing events with candidate transparency.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--glass-border)] bg-white/10 p-1 backdrop-blur-md dark:bg-white/5">
            {offerStatusFilters.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleStatusFilterChange(option.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-200',
                  statusFilter === option.id
                    ? 'border border-white/20 bg-white/35 text-slate-900 shadow-brand'
                    : 'text-slate-600 hover:bg-white/20 hover:text-slate-900 dark:text-ink-100/70 dark:hover:bg-white/10 dark:hover:text-ink-100'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredEvents.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              {statusFilter === 'ALL'
                ? 'No routing events captured yet.'
                : `No routing events with ${offerStatusLabel(statusFilter)} status.`}
            </div>
          ) : (
            filteredEvents.map((event) => {
              const ruleName = event.matchedRuleId ? ruleNameById.get(event.matchedRuleId) ?? event.matchedRuleId : 'No rule matched'
              const offerStatus = getEventOfferStatus(event)
              return (
                <div key={event.id} className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white/10 p-4 backdrop-blur-md dark:bg-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{ruleName}</h4>
                      <p className="text-xs text-muted-foreground">
                        Lead {event.leadId} • {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{offerStatusLabel(offerStatus)}</Badge>
                      <Badge variant={event.fallbackUsed ? 'secondary' : 'default'}>
                        {event.fallbackUsed ? 'Fallback' : 'Direct assignment'}
                      </Badge>
                      {event.reasonCodes?.map((reason) => (
                        <Badge key={`${event.id}-${reason}`} variant="outline">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    {event.payload?.context?.listing?.city && (
                      <div>Listing city: {event.payload.context.listing.city}</div>
                    )}
                    {event.payload?.context?.source && <div>Source: {event.payload.context.source}</div>}
                  </div>
                  <div className="mt-4">
                    <CandidatesTable candidates={event.candidates as RoutingDecisionCandidate[]} />
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
	      </Card>

		      </div>
		    </details>

		    <Dialog
		      open={reassignDialogOpen}
		      onOpenChange={(open) => {
		        setReassignDialogOpen(open)
		        if (!open) {
		          setReassignTarget(null)
		        }
		      }}
		    >
		      <DialogContent>
		        <DialogHeader>
		          <DialogTitle>Reassign lead</DialogTitle>
		          <DialogDescription>Select an agent to take this lead.</DialogDescription>
		        </DialogHeader>

		        <div className="space-y-2">
		          <Label>Agent</Label>
		          <Select value={reassignAgentId} onValueChange={setReassignAgentId}>
		            <SelectTrigger>
		              <SelectValue placeholder="Select an agent" />
		            </SelectTrigger>
		            <SelectContent>
		              {(reassignTarget?.candidates ?? []).map((candidate) => (
		                <SelectItem key={candidate.agentId} value={candidate.agentId}>
		                  {candidate.fullName || candidate.agentId}
		                </SelectItem>
		              ))}
		            </SelectContent>
		          </Select>
		          <p className="text-xs text-muted-foreground">
		            Options come from the last routing run (top candidates).
		          </p>
		        </div>

		        <DialogFooter>
		          <Button variant="outline" onClick={() => setReassignDialogOpen(false)}>
		            Cancel
		          </Button>
		          <Button
		            onClick={submitReassign}
		            disabled={!reassignTarget || !reassignAgentId || queueActionId === reassignTarget.assignmentId}
		          >
		            {reassignTarget && queueActionId === reassignTarget.assignmentId && (
		              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
		            )}
		            Assign
		          </Button>
		        </DialogFooter>
		      </DialogContent>
		    </Dialog>
	
	      <RuleDialog
	        open={dialogOpen}
	        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingRule(null)
        }}
        initialRule={editingRule}
        onSubmit={handleSaveRule}
      />
    </div>
  )
}

export default LeadRoutingDesk
