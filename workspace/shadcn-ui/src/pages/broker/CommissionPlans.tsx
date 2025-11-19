import React, { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react'
import { format } from 'date-fns'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'

import {
  assignCommissionPlan,
  createCommissionPlan,
  endCommissionPlanAssignment,
  fetchCapProgress,
  fetchCommissionPlanAssignments,
  fetchCommissionPlans,
  type AssignCommissionPlanPayload,
  type CapProgressItem,
  type CommissionPlan,
  type CommissionPlanAssignment,
  type CreateCommissionPlanPayload
} from '@/lib/api/hatch'
import { formatCurrency } from '@/utils/export'

const DEFAULT_DEFINITION = JSON.stringify(
  {
    type: 'FLAT',
    split: { agent: 0.7, brokerage: 0.3 },
    fees: [],
    bonuses: []
  },
  null,
  2
)

const planTypeLabels: Record<CommissionPlan['type'], string> = {
  FLAT: 'Flat Split',
  TIERED: 'Tiered / Cap',
  CAP: 'Cap Plan'
}

const PLAN_COLORS: Record<CommissionPlan['type'], string> = {
  FLAT: 'bg-blue-100 text-blue-700',
  TIERED: 'bg-purple-100 text-purple-700',
  CAP: 'bg-emerald-100 text-emerald-700'
}

const modalTitle = {
  create: 'Create Commission Plan',
  assign: 'Assign Commission Plan'
}

export default function CommissionPlansPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plans, setPlans] = useState<CommissionPlan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<CommissionPlanAssignment[]>([])
  const [capProgress, setCapProgress] = useState<CapProgressItem[]>([])

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [assignmentSaving, setAssignmentSaving] = useState(false)

  const [createPayload, setCreatePayload] = useState<CreateCommissionPlanPayload>({
    name: '',
    type: 'FLAT',
    definition: JSON.parse(DEFAULT_DEFINITION)
  })

  const [definitionText, setDefinitionText] = useState(DEFAULT_DEFINITION)

  const [assignmentPayload, setAssignmentPayload] = useState<Omit<AssignCommissionPlanPayload, 'planId'>>({
    assigneeType: 'USER',
    assigneeId: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: undefined,
    priority: 0
  })

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === selectedPlanId) ?? null, [plans, selectedPlanId])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [planList, capData] = await Promise.all([fetchCommissionPlans(), fetchCapProgress({})])
        setPlans(planList)
        setCapProgress(capData)
        if (planList.length > 0) {
          setSelectedPlanId(planList[0].id)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load commission plans')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const loadAssignments = async () => {
      if (!selectedPlanId) {
        setAssignments([])
        return
      }
      try {
        const data = await fetchCommissionPlanAssignments(selectedPlanId)
        setAssignments(data)
      } catch (err) {
        toast({
          title: 'Unable to load assignments',
          description: err instanceof Error ? err.message : 'Unexpected error',
          variant: 'destructive'
        })
      }
    }
    loadAssignments()
  }, [selectedPlanId, toast])

  const handleCreatePlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    try {
      const parsedDefinition = JSON.parse(definitionText)
      const payload: CreateCommissionPlanPayload = {
        ...createPayload,
        definition: parsedDefinition
      }
      const plan = await createCommissionPlan(payload)
      toast({ title: 'Commission plan created', description: `${plan.name} is now available.` })
      setPlans((prev) => [plan, ...prev])
      setSelectedPlanId(plan.id)
      setCreateDialogOpen(false)
      setCreatePayload({ name: '', type: 'FLAT', definition: parsedDefinition })
      setDefinitionText(DEFAULT_DEFINITION)
    } catch (err) {
      toast({
        title: 'Failed to create plan',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleAssignPlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedPlanId) return
    setAssignmentSaving(true)
    try {
      const payload: AssignCommissionPlanPayload = {
        ...assignmentPayload,
        planId: selectedPlanId,
        effectiveFrom: new Date(assignmentPayload.effectiveFrom).toISOString()
      }
      if (assignmentPayload.effectiveTo) {
        payload.effectiveTo = new Date(assignmentPayload.effectiveTo).toISOString()
      }
      await assignCommissionPlan(selectedPlanId, payload)
      toast({ title: 'Assignment created', description: 'Plan assignment saved.' })
      const data = await fetchCommissionPlanAssignments(selectedPlanId)
      setAssignments(data)
      setAssignDialogOpen(false)
    } catch (err) {
      toast({
        title: 'Failed to assign plan',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive'
      })
    } finally {
      setAssignmentSaving(false)
    }
  }

  const handleEndAssignment = async (assignment: CommissionPlanAssignment) => {
    try {
      await endCommissionPlanAssignment(assignment.id, new Date().toISOString())
      toast({ title: 'Assignment ended', description: 'The plan assignment was ended.' })
      const data = await fetchCommissionPlanAssignments(selectedPlanId!)
      setAssignments(data)
    } catch (err) {
      toast({
        title: 'Failed to end assignment',
        description: err instanceof Error ? err.message : 'Unexpected error',
        variant: 'destructive'
      })
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Loading commission plans…</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">Fetching data, please wait.</CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Unable to load commission plans</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Commission Plans</h1>
          <p className="text-gray-600">Manage splits, caps, and assignments for your team.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Plan
          </Button>
          <Button variant="outline" onClick={() => setAssignDialogOpen(true)} disabled={!selectedPlanId}>
            <ShieldCheck className="w-4 h-4 mr-2" /> Assign Plan
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Plans</CardTitle>
            <CardDescription>Select a plan to manage assignments and view details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No commission plans yet. Create one to get started.</p>
            ) : (
              <div className="space-y-2">
                {plans.map((plan) => {
                  const isSelected = plan.id === selectedPlanId
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`w-full rounded-lg border p-4 text-left transition hover:shadow ${
                        isSelected ? 'border-primary shadow' : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                          <p className="text-xs text-gray-500">
                            Updated {format(new Date(plan.updatedAt), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <Badge className={PLAN_COLORS[plan.type]}>{planTypeLabels[plan.type]}</Badge>
                      </div>
                      {plan.description && <p className="mt-2 text-sm text-gray-600">{plan.description}</p>}
                      <div className="mt-3 text-xs text-gray-500 flex gap-4">
                        <span>Version {plan.version}</span>
                        {plan.isArchived && <span className="text-amber-600">Archived</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Cap Progress</CardTitle>
            <CardDescription>Track company dollar progress toward caps.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-auto">
            {capProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cap ledger entries yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Cap</TableHead>
                    <TableHead className="text-right">Company $ YTD</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {capProgress.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.userName}</TableCell>
                      <TableCell>{entry.plan.name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(entry.capAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(entry.companyDollarYtd)}</TableCell>
                      <TableCell className="text-right">{Math.round(entry.progressPct * 100)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedPlan && (
        <Card>
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
            <CardDescription>Who is currently using {selectedPlan.name}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assignments yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Effective From</TableHead>
                    <TableHead>Effective To</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>{assignment.assigneeId}</TableCell>
                      <TableCell>{assignment.assigneeType}</TableCell>
                      <TableCell>{format(new Date(assignment.effectiveFrom), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        {assignment.effectiveTo ? format(new Date(assignment.effectiveTo), 'MMM d, yyyy') : 'Active'}
                      </TableCell>
                      <TableCell>{assignment.priority}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEndAssignment(assignment)}>
                          End
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Plan Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleCreatePlan} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{modalTitle.create}</DialogTitle>
              <DialogDescription>Define the commission structure for your team.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="plan-name">Name</Label>
                <Input
                  id="plan-name"
                  value={createPayload.name}
                  onChange={(event) => setCreatePayload((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-type">Plan Type</Label>
                <Select
                  value={createPayload.type}
                  onValueChange={(value: CommissionPlan['type']) => setCreatePayload((prev) => ({ ...prev, type: value }))}
                >
                  <SelectTrigger id="plan-type">
                    <SelectValue placeholder="Select plan type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FLAT">Flat split</SelectItem>
                    <SelectItem value="TIERED">Tiered / cap</SelectItem>
                    <SelectItem value="CAP">Cap plan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-description">Description</Label>
              <Input
                id="plan-description"
                value={createPayload.description ?? ''}
                onChange={(event) => setCreatePayload((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-definition">Plan Definition (JSON)</Label>
              <Textarea
                id="plan-definition"
                value={definitionText}
                onChange={(event) => setDefinitionText(event.target.value)}
                rows={10}
              />
              <p className="text-xs text-muted-foreground">
                Provide the plan tiers, caps, and fees as JSON. See documentation for schema examples.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Create plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Plan Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <form onSubmit={handleAssignPlan} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{modalTitle.assign}</DialogTitle>
              <DialogDescription>Assign the selected plan to an agent or team.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assignee-type">Assignee Type</Label>
                <Select
                  value={assignmentPayload.assigneeType}
                  onValueChange={(value: 'USER' | 'TEAM') =>
                    setAssignmentPayload((prev) => ({ ...prev, assigneeType: value }))
                  }
                >
                  <SelectTrigger id="assignee-type">
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">Agent</SelectItem>
                    <SelectItem value="TEAM">Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignee-id">Assignee ID</Label>
                <Input
                  id="assignee-id"
                  value={assignmentPayload.assigneeId}
                  onChange={(event) => setAssignmentPayload((prev) => ({ ...prev, assigneeId: event.target.value }))}
                  placeholder={assignmentPayload.assigneeType === 'USER' ? 'Agent user id' : 'Team id'}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="effective-from">Effective From</Label>
                <Input
                  id="effective-from"
                  type="date"
                  value={assignmentPayload.effectiveFrom}
                  onChange={(event) => setAssignmentPayload((prev) => ({ ...prev, effectiveFrom: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="effective-to">Effective To</Label>
                <Input
                  id="effective-to"
                  type="date"
                  value={assignmentPayload.effectiveTo ?? ''}
                  onChange={(event) =>
                    setAssignmentPayload((prev) => ({ ...prev, effectiveTo: event.target.value || undefined }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                min={0}
                value={assignmentPayload.priority ?? 0}
                onChange={(event) =>
                  setAssignmentPayload((prev) => ({ ...prev, priority: Number(event.target.value) || 0 }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={assignmentSaving || !selectedPlanId}>
                {assignmentSaving ? 'Saving…' : 'Assign'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
