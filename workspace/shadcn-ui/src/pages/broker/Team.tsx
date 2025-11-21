import React, { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import { usePageAnimations } from '@/hooks/usePageAnimations'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useBroker, type TeamMember } from '@/contexts/BrokerContext'
import { Users, Phone, Mail, UserPlus, Star, BarChart3 } from 'lucide-react'

export default function Team() {
  const {
    teamMembers,
    teamMembersLoading,
    teamMembersError,
    refreshTeamMembers,
    addTeamMember,
    updateTeamMember,
    removeTeamMember,
    getTeamSummary,
    getMemberPerformance
  } = useBroker()
  const { pageVariants, buttonHoverVariant, cardHoverVariant, getInitialState } = usePageAnimations()
  const { toast } = useToast()

  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'pending'>('all')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRemovingMember, setIsRemovingMember] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)

  interface AddMemberFormState {
    name: string
    email: string
    phone: string
    role: string
    status: 'active' | 'inactive' | 'pending'
    experienceYears: string
    rating: string
    totalSales: string
    dealsInProgress: string
    openLeads: string
    responseTimeHours: string
    notes: string
  }

  const initialFormState: AddMemberFormState = {
    name: '',
    email: '',
    phone: '',
    role: 'Agent',
    status: 'active',
    experienceYears: '0',
    rating: '4.8',
    totalSales: '0',
    dealsInProgress: '0',
    openLeads: '0',
    responseTimeHours: '24',
    notes: ''
  }

  const [formState, setFormState] = useState<AddMemberFormState>(initialFormState)

  const filterMembers = (members: TeamMember[]) => {
    if (statusFilter === 'all') return members
    return members.filter((member) => member.status === statusFilter)
  }

  const filteredMembers = useMemo(() => filterMembers(teamMembers), [statusFilter, teamMembers])

  const summary = useMemo(() => getTeamSummary(), [getTeamSummary, teamMembers])

  const performanceMember = selectedMember ? getMemberPerformance(selectedMember.id) : null

  const resetForm = () => setFormState(initialFormState)

  const handleAddMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    try {
      const member = await addTeamMember({
        name: formState.name,
        email: formState.email,
        phone: formState.phone,
        role: formState.role,
        status: formState.status,
        experienceYears: Number(formState.experienceYears) || 0,
        rating: Number(formState.rating) || 0,
        totalSales: Number(formState.totalSales) || 0,
        dealsInProgress: Number(formState.dealsInProgress) || 0,
        openLeads: Number(formState.openLeads) || 0,
        responseTimeHours: Number(formState.responseTimeHours) || 0,
        notes: formState.notes
      })
      toast({ title: 'Team member added', description: `${member.name} was added to your roster.` })
      resetForm()
      setAddDialogOpen(false)
    } catch (error) {
      toast({
        title: 'Failed to add team member',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveMember = async (member: TeamMember) => {
    try {
      setIsRemovingMember(true)
      await removeTeamMember(member.id)
      toast({ title: 'Team member removed', description: `${member.name} was removed from your roster.` })
      setSelectedMember(null)
    } catch (error) {
      toast({
        title: 'Failed to remove team member',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      })
    } finally {
      setIsRemovingMember(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'inactive': return 'bg-gray-100 text-gray-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="p-6 space-y-6">
      <motion.div 
        className="flex justify-between items-center"
        initial={getInitialState('headerVariant')}
        animate="visible"
        variants={pageVariants.headerVariant}
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-600">Manage your team members and track performance</p>
        </div>
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={(value: typeof statusFilter) => setStatusFilter(value)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setAddDialogOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Add Team Member
          </Button>
        </div>
      </motion.div>

      {teamMembersError && (
        <Card className="border-red-200 bg-red-50 text-red-700">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <p>{teamMembersError}</p>
              <Button variant="outline" size="sm" onClick={() => void refreshTeamMembers()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {teamMembers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total team members</CardDescription>
              <CardTitle>{summary.totalMembers}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active members</CardDescription>
              <CardTitle>{summary.activeMembers}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Average rating</CardDescription>
              <CardTitle>{summary.averageRating.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total sales closed</CardDescription>
              <CardTitle>{summary.totalSales}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Team grid */}
      {teamMembersLoading && teamMembers.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`team-skeleton-${index}`} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMembers.map((agent) => (
            <Card key={agent.id} className="flex flex-col hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{agent.name}</CardTitle>
                  <Badge className={getStatusColor(agent.status)}>
                    {agent.status}
                  </Badge>
                </div>
                <CardDescription>
                  {agent.role}
                  {typeof agent.experienceYears === 'number' && agent.experienceYears > 0
                    ? ` • ${agent.experienceYears} ${agent.experienceYears === 1 ? 'year' : 'years'}`
                    : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex h-full flex-col gap-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="w-4 h-4 mr-2" />
                    {agent.email}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="w-4 h-4 mr-2" />
                    {agent.phone || 'Phone not available'}
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center text-sm text-gray-600">
                      <Star className="w-4 h-4 mr-1 text-yellow-500" />
                      <span>{agent.rating?.toFixed(1) ?? 'N/A'}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {agent.totalSales ?? 0} sales
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-w-[140px] sm:flex-none"
                      onClick={async () => {
                        setSelectedMember(agent)
                        try {
                          const updated = await updateTeamMember(agent.id, { lastActiveAt: new Date().toISOString() })
                          setSelectedMember(updated)
                      } catch (error) {
                        toast({
                          title: 'Unable to load performance',
                          description: error instanceof Error ? error.message : 'Unexpected error',
                          variant: 'destructive'
                        })
                      }
                    }}
                  >
                    <BarChart3 className="w-4 h-4 mr-1" />
                    Performance
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 min-w-[140px] sm:flex-none"
                    onClick={() => window.open(`mailto:${agent.email}`)}
                  >
                      <Mail className="w-4 h-4 mr-1" />
                      Contact
                    </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          ))}
        </div>
      )}

      {/* Empty state - only show if no mock data and no real agents */}
      {teamMembers.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No team members yet</h3>
          <p className="text-gray-600 mb-6">Start building your team to grow your business</p>
          <Button onClick={() => setAddDialogOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Add Your First Team Member
          </Button>
        </div>
      )}

      {teamMembers.length > 0 && filteredMembers.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-600">
          No team members match the selected filter.
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        setAddDialogOpen(open)
        if (!open) {
          resetForm()
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>Capture the basics so you can track performance later.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAddMember}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="member-name">Name</Label>
                <Input
                  id="member-name"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  value={formState.email}
                  onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="member-phone">Phone</Label>
                <Input
                  id="member-phone"
                  value={formState.phone}
                  onChange={(event) => setFormState((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="(305) 555-0123"
                />
              </div>
              <div>
                <Label htmlFor="member-role">Role</Label>
                <Input
                  id="member-role"
                  value={formState.role}
                  onChange={(event) => setFormState((prev) => ({ ...prev, role: event.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={formState.status}
                  onValueChange={(value: AddMemberFormState['status']) =>
                    setFormState((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="member-experience">Experience (years)</Label>
                <Input
                  id="member-experience"
                  type="number"
                  min="0"
                  value={formState.experienceYears}
                  onChange={(event) => setFormState((prev) => ({ ...prev, experienceYears: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-rating">Average rating</Label>
                <Input
                  id="member-rating"
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={formState.rating}
                  onChange={(event) => setFormState((prev) => ({ ...prev, rating: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-sales">Total sales</Label>
                <Input
                  id="member-sales"
                  type="number"
                  min="0"
                  value={formState.totalSales}
                  onChange={(event) => setFormState((prev) => ({ ...prev, totalSales: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-deals">Deals in progress</Label>
                <Input
                  id="member-deals"
                  type="number"
                  min="0"
                  value={formState.dealsInProgress}
                  onChange={(event) => setFormState((prev) => ({ ...prev, dealsInProgress: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-leads">Open leads</Label>
                <Input
                  id="member-leads"
                  type="number"
                  min="0"
                  value={formState.openLeads}
                  onChange={(event) => setFormState((prev) => ({ ...prev, openLeads: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="member-response">Avg. response time (hours)</Label>
                <Input
                  id="member-response"
                  type="number"
                  min="0"
                  value={formState.responseTimeHours}
                  onChange={(event) => setFormState((prev) => ({ ...prev, responseTimeHours: event.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="member-notes">Notes</Label>
              <Textarea
                id="member-notes"
                value={formState.notes}
                onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Optional context for this teammate"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                resetForm()
                setAddDialogOpen(false)
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Add member'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(performanceMember)} onOpenChange={(open) => {
        if (!open) setSelectedMember(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {performanceMember?.name ?? 'Team member'} performance
            </DialogTitle>
            <DialogDescription>Snapshot of activity and pipeline health.</DialogDescription>
          </DialogHeader>
          {performanceMember && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total sales</CardDescription>
                    <CardTitle>{performanceMember.totalSales}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Deals in progress</CardDescription>
                    <CardTitle>{performanceMember.dealsInProgress}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Open leads</CardDescription>
                    <CardTitle>{performanceMember.openLeads}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Avg. response time</CardDescription>
                    <CardTitle>{performanceMember.responseTimeHours} hrs</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Separator />

              <div className="grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
                <div>
                  <span className="font-medium text-gray-800">Role:</span> {performanceMember.role}
                </div>
                <div>
                  <span className="font-medium text-gray-800">Status:</span> {performanceMember.status}
                </div>
                <div>
                  <span className="font-medium text-gray-800">Rating:</span> {performanceMember.rating.toFixed(1)} / 5
                </div>
                <div>
                  <span className="font-medium text-gray-800">Experience:</span>{' '}
                  {typeof performanceMember.experienceYears === 'number' && performanceMember.experienceYears > 0
                    ? `${performanceMember.experienceYears} ${performanceMember.experienceYears === 1 ? 'year' : 'years'}`
                    : 'Not specified'}
                </div>
              </div>

              {performanceMember.notes && (
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-gray-800">Notes:</span> {performanceMember.notes}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-gray-500">Joined</p>
                  <p className="text-sm font-medium text-gray-800">
                    {format(new Date(performanceMember.joinedAt), 'MMM d, yyyy')}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-gray-500">Last activity</p>
                  <p className="text-sm font-medium text-gray-800">
                    {format(new Date(performanceMember.lastActiveAt), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSelectedMember(null)}>
                  Close
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-600"
                  disabled={!selectedMember || isRemovingMember}
                  onClick={async () => {
                    if (selectedMember) {
                      await handleRemoveMember(selectedMember)
                    }
                  }}
                >
                  Remove member
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
