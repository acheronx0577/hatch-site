import { useEffect, useMemo, useState } from 'react'
import {
  Users,
  Phone,
  Mail,
  Plus,
  Filter,
  Search,
  ArrowRight,
  Briefcase
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  ContactListItem,
  createContact,
  deleteContact,
  listContacts,
  updateContact,
  convertContactToOpportunity
} from '@/lib/api/hatch'

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'

const stageColor = (stage: string) => {
  switch (stage) {
    case 'NURTURE':
      return 'bg-amber-100 text-amber-800'
    case 'ACTIVE':
      return 'bg-blue-100 text-blue-800'
    case 'UNDER_CONTRACT':
      return 'bg-purple-100 text-purple-800'
    case 'CLOSED':
      return 'bg-green-100 text-green-800'
    case 'LOST':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const scoreTierColor = (tier: string) => {
  switch (tier?.toUpperCase()) {
    case 'A':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300'
    case 'B':
      return 'bg-blue-100 text-blue-800 border-blue-300'
    case 'C':
      return 'bg-amber-100 text-amber-800 border-amber-300'
    case 'D':
      return 'bg-gray-100 text-gray-800 border-gray-300'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-300'
  }
}

interface LeadFormState {
  firstName: string
  lastName: string
  email: string
  phone: string
  stage: string
}

const emptyFormState: LeadFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  stage: 'NEW'
}

const LeadsPage = () => {
  const { activeOrgId, userId } = useAuth()
  const [leads, setLeads] = useState<ContactListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formState, setFormState] = useState<LeadFormState>(emptyFormState)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [selectedLeadForConversion, setSelectedLeadForConversion] = useState<ContactListItem | null>(null)
  const [isConverting, setIsConverting] = useState(false)

  const stageFilters = ['ALL', 'NEW', 'ACTIVE', 'UNDER_CONTRACT', 'CLOSED', 'NURTURE', 'LOST'] as const
  type StageFilter = (typeof stageFilters)[number]
  const parseStageFilter = (value: string | null): StageFilter => {
    if (!value) return 'ALL'
    const normalized = value.toUpperCase()
    return stageFilters.includes(normalized as StageFilter) ? (normalized as StageFilter) : 'ALL'
  }

  const [stageFilter, setStageFilter] = useState<StageFilter>(() => parseStageFilter(searchParams.get('stage')))

  useEffect(() => {
    const nextFilter = parseStageFilter(searchParams.get('stage'))
    if (nextFilter !== stageFilter) {
      setStageFilter(nextFilter)
    }
  }, [searchParams, stageFilter])

  const updateStageParam = (value: StageFilter) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'ALL') {
      next.delete('stage')
    } else {
      next.set('stage', value)
    }
    setSearchParams(next, { replace: true })
  }

  const handleStageFilterChange = (value: StageFilter) => {
    setStageFilter(value)
    updateStageParam(value)
  }

  const loadLeads = async () => {
    try {
      setIsLoading(true)
      const response = await listContacts(TENANT_ID)
      const items = Array.isArray((response as any)?.items)
        ? (response as any).items
        : Array.isArray(response)
          ? (response as any)
          : []
      setLeads(items)
    } catch (error) {
      setLeads([])
      toast({
        title: 'Unable to load leads',
        description: error instanceof Error ? error.message : 'Unexpected error fetching leads',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadLeads()
  }, [])

  const visibleLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        if (stageFilter === 'ALL') return true
        return (lead.stage ?? '').toUpperCase() === stageFilter
      })
      .filter((lead) => {
        if (!searchTerm) return true
        const haystack = [lead.firstName, lead.lastName, lead.primaryEmail, lead.primaryPhone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(searchTerm.toLowerCase())
      })
  }, [leads, stageFilter, searchTerm])

  const resetForm = () => {
    setFormState(emptyFormState)
    setDialogOpen(false)
  }

  const handleCreateLead = async () => {
    if (!formState.firstName.trim() || !formState.lastName.trim()) {
      toast({
        title: 'Missing name',
        description: 'First and last name are required.',
        variant: 'destructive'
      })
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        tenantId: TENANT_ID,
        organizationId: activeOrgId ?? 'demo-organization',
        ownerId: userId ?? undefined,
        firstName: formState.firstName,
        lastName: formState.lastName,
        primaryEmail: formState.email || undefined,
        primaryPhone: formState.phone || undefined,
        stage: formState.stage
      }

      const created = await createContact(payload)
      setLeads((prev) => [{
        id: created.id,
        firstName: created.firstName ?? '',
        lastName: created.lastName ?? '',
        stage: created.stage ?? 'NEW',
        primaryEmail: created.primaryEmail ?? null,
        primaryPhone: created.primaryPhone ?? null,
        ownerId: created.ownerId ?? null
      }, ...prev])

      toast({ title: 'Lead added' })
      resetForm()
    } catch (error) {
      toast({
        title: 'Failed to add lead',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleStageChange = async (lead: ContactListItem, nextStage: string) => {
    try {
      await updateContact(lead.id, {
        tenantId: TENANT_ID,
        stage: nextStage
      })
      setLeads((prev) =>
        prev.map((item) => (item.id === lead.id ? { ...item, stage: nextStage } : item))
      )
      toast({ title: 'Lead updated' })
    } catch (error) {
      toast({
        title: 'Failed to update lead',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteLead = async (lead: ContactListItem) => {
    try {
      await deleteContact(lead.id, TENANT_ID)
      setLeads((prev) => prev.filter((item) => item.id !== lead.id))
      toast({ title: 'Lead removed' })
    } catch (error) {
      toast({
        title: 'Failed to delete lead',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      })
    }
  }

  const handleConvertLead = (lead: ContactListItem) => {
    setSelectedLeadForConversion(lead)
    setConvertDialogOpen(true)
  }

  const handleConfirmConversion = async () => {
    if (!selectedLeadForConversion) return

    setIsConverting(true)
    try {
      const fullName = `${selectedLeadForConversion.firstName || ''} ${selectedLeadForConversion.lastName || ''}`.trim()
      const result = await convertContactToOpportunity(selectedLeadForConversion.id, {
        opportunityName: `${fullName} - Opportunity`,
        accountName: fullName || 'Unnamed Account'
      })

      setLeads((prev) => prev.filter((item) => item.id !== selectedLeadForConversion.id))
      setConvertDialogOpen(false)
      setSelectedLeadForConversion(null)

      toast({
        title: 'Lead converted to opportunity',
        description: result.message
      })
    } catch (error) {
      toast({
        title: 'Failed to convert lead',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      })
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-600">Manage prospects captured across your Hatch funnels</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" disabled>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add lead</DialogTitle>
                <DialogDescription>Store a new contact in your Hatch CRM</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First name *</Label>
                    <Input
                      id="firstName"
                      value={formState.firstName}
                      onChange={(event) => setFormState((prev) => ({ ...prev, firstName: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last name *</Label>
                    <Input
                      id="lastName"
                      value={formState.lastName}
                      onChange={(event) => setFormState((prev) => ({ ...prev, lastName: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formState.email}
                      onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formState.phone}
                      onChange={(event) => setFormState((prev) => ({ ...prev, phone: event.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="stage">Stage</Label>
                  <Tabs value={formState.stage} onValueChange={(value) => setFormState((prev) => ({ ...prev, stage: value }))}>
                    <TabsList className="grid grid-cols-4">
                      <TabsTrigger value="NEW">New</TabsTrigger>
                      <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                      <TabsTrigger value="UNDER_CONTRACT">Under contract</TabsTrigger>
                      <TabsTrigger value="CLOSED">Closed</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateLead} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Create lead'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>All leads</CardTitle>
                <CardDescription>Synced from the Hatch back office</CardDescription>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-9 w-64"
                  placeholder="Search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {stageFilters.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleStageFilterChange(option)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    stageFilter === option
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {option === 'ALL' ? 'All leads' : option.replace(/_/g, ' ').toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={`lead-skeleton-${index}`} className="h-20 w-full" />
              ))}
            </div>
          ) : visibleLeads.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No leads yet</h3>
              <p className="text-gray-600 mb-6">
                {stageFilter === 'ALL'
                  ? 'Start generating leads to grow your business.'
                  : `No leads match the ${stageFilter.replace(/_/g, ' ').toLowerCase()} stage.`}
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add your first lead
              </Button>
            </div>
          ) : (
            visibleLeads.map((lead) => {
              const scoreTier = (lead as any).scoreTier
              const leadScore = (lead as any).leadScore

              return (
                <Card key={lead.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">
                          {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed contact'}
                        </h3>
                        {scoreTier && (
                          <Badge className={`${scoreTierColor(scoreTier)} border font-bold px-2`} variant="outline">
                            {scoreTier.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {lead.primaryEmail ?? 'No email'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.primaryPhone ?? 'No phone'}
                        </span>
                        {typeof leadScore === 'number' && (
                          <span className="text-[11px] text-slate-600">
                            Score: <strong>{Math.round(leadScore)}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={stageColor(lead.stage)}>{lead.stage.replace(/_/g, ' ').toLowerCase()}</Badge>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => handleConvertLead(lead)}
                        >
                          <Briefcase className="w-3 h-3 mr-1" />
                          Convert
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleStageChange(lead, 'ACTIVE')}>
                          Move to Active
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDeleteLead(lead)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Conversion Confirmation Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Lead to Opportunity</DialogTitle>
            <DialogDescription>
              This will create a new opportunity and account for{' '}
              <strong>
                {selectedLeadForConversion
                  ? `${selectedLeadForConversion.firstName || ''} ${selectedLeadForConversion.lastName || ''}`.trim() ||
                    'this lead'
                  : 'this lead'}
              </strong>
              . The lead will be moved to the Opportunities pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)} disabled={isConverting}>
              Cancel
            </Button>
            <Button onClick={handleConfirmConversion} disabled={isConverting} className="bg-emerald-600 hover:bg-emerald-700">
              <ArrowRight className="w-4 h-4 mr-2" />
              {isConverting ? 'Converting...' : 'Convert to Opportunity'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default LeadsPage
