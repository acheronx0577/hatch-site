import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchRoutingCapacity,
  fetchRoutingEvents,
  fetchRoutingMetrics,
  fetchRoutingRules,
  fetchRoutingSla,
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  processRoutingSla,
  type LeadRoutingRule,
  type LeadRouteEventRecord,
  type LeadRoutingRulePayload,
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
import { AlertTriangle, Edit3, Loader2, PlusCircle, RefreshCcw, Trash2 } from 'lucide-react'

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

const statusVariant = (status: string) => {
  if (status === 'SATISFIED' || status === 'KEPT') return 'secondary'
  if (status === 'BREACHED') return 'destructive'
  if (status === 'PENDING') return 'secondary'
  return 'outline'
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
        const teamTarget = initialRule.targets?.find((target) => target.type === 'TEAM')?.id ?? ''
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
      targets.push({ type: 'TEAM', id: form.teamTarget, strategy: 'BEST_FIT' })
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
  const [sla, setSla] = useState<RoutingSlaDashboard | null>(null)
  const [metrics, setMetrics] = useState<RoutingMetricsSummary | null>(null)
  const [events, setEvents] = useState<LeadRouteEventRecord[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<LeadRoutingRule | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [rulesData, capacityData, slaData, metricsData, eventsData] = await Promise.all([
        fetchRoutingRules(TENANT_ID),
        fetchRoutingCapacity(TENANT_ID),
        fetchRoutingSla(TENANT_ID),
        fetchRoutingMetrics(TENANT_ID),
        fetchRoutingEvents({ tenantId: TENANT_ID, limit: 15 })
      ])
      setRules(rulesData)
      setCapacity(capacityData)
      setSla(slaData)
      setMetrics(metricsData)
      setEvents(eventsData)
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
      const [rulesData, eventsData] = await Promise.all([
        fetchRoutingRules(TENANT_ID),
        fetchRoutingEvents({ tenantId: TENANT_ID, limit: 15 })
      ])
      setRules(rulesData)
      setEvents(eventsData)
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

  const ruleNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const rule of rules) {
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
    <div className="space-y-8 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lead Routing & SLA Desk</h1>
          <p className="text-sm text-muted-foreground">
            Tune assignment rules, monitor SLA health, and audit decision transparency.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshSection} disabled={refreshing}>
            {refreshing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Refresh
          </Button>
          <Button onClick={() => { setEditingRule(null); setDialogOpen(true) }}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New rule
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Routing rules</CardTitle>
            <CardDescription>Ordered by priority; lower numbers evaluate first.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="flex items-center justify-center rounded-md border border-dashed py-10 text-sm text-muted-foreground">
              No routing rules configured yet.
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

        <Card>
          <CardHeader>
            <CardTitle>SLA health</CardTitle>
            <CardDescription>Monitor timer load and process breaches.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total timers</p>
                <p className="text-lg font-semibold">{sla?.summary.total ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-semibold">{sla?.summary.pending ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Breached</p>
                <p className="text-lg font-semibold text-destructive">{sla?.summary.breached ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Satisfied</p>
                <p className="text-lg font-semibold text-emerald-600">{sla?.summary.satisfied ?? 0}</p>
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
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Average time to first touch</p>
                <p className="text-lg font-semibold">{formatMinutes(metrics.firstTouch.averageMinutes)}</p>
                <p className="text-xs text-muted-foreground mt-1">{metrics.firstTouch.count} satisfied timers</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">First-touch breach rate</p>
                <p className="text-lg font-semibold text-destructive">
                  {percent(metrics.breach.firstTouch.percentage)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.breach.firstTouch.breached} of {metrics.breach.firstTouch.total} timers
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Kept appointment breach rate</p>
                <p className="text-lg font-semibold text-destructive">
                  {percent(metrics.breach.keptAppointment.percentage)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Decision viewer</CardTitle>
            <CardDescription>Recent routing events with candidate transparency.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              No routing events captured yet.
            </div>
          ) : (
            events.map((event) => {
              const ruleName = event.matchedRuleId ? ruleNameById.get(event.matchedRuleId) ?? event.matchedRuleId : 'No rule matched'
              return (
                <div key={event.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">{ruleName}</h4>
                      <p className="text-xs text-muted-foreground">
                        Lead {event.leadId} • {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
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
