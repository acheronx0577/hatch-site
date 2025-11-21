import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { usePageAnimations } from '@/hooks/usePageAnimations'
import {
  Users,
  Phone,
  Mail,
  Plus,
  Filter,
  Search
} from 'lucide-react'

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
  updateContact
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
  const { pageVariants, buttonHoverVariant, cardHoverVariant, getInitialState } = usePageAnimations()
  const [leads, setLeads] = useState<ContactListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formState, setFormState] = useState<LeadFormState>(emptyFormState)
  const [searchTerm, setSearchTerm] = useState('')

  const loadLeads = async () => {
    try {
      setIsLoading(true)
      const response = await listContacts(TENANT_ID)
      setLeads(response)
    } catch (error) {
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

  const filteredLeads = useMemo(() => {
    if (!searchTerm) return leads
    return leads.filter((lead) => {
      const haystack = [lead.firstName, lead.lastName, lead.primaryEmail, lead.primaryPhone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(searchTerm.toLowerCase())
    })
  }, [leads, searchTerm])

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

  return (
    <div className="p-6 space-y-6">
      <motion.div 
        className="flex justify-between items-center"
        initial={getInitialState('headerVariant')}
        animate="visible"
        variants={pageVariants.headerVariant}
      >
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
      </motion.div>

      <motion.div
        initial={getInitialState('contentVariant')}
        animate="visible"
        variants={pageVariants.contentVariant}
      >
        <Card>
          <CardHeader>
          <div className="flex items-center justify-between">
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
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={`lead-skeleton-${index}`} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No leads yet</h3>
              <p className="text-gray-600 mb-6">Start generating leads to grow your business.</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add your first lead
              </Button>
            </div>
          ) : (
            filteredLeads.map((lead) => (
              <Card key={lead.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">
                      {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unnamed contact'}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {lead.primaryEmail ?? 'No email'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {lead.primaryPhone ?? 'No phone'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge className={stageColor(lead.stage)}>{lead.stage.replace(/_/g, ' ').toLowerCase()}</Badge>
                    <div className="flex gap-2">
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
            ))
          )}
        </CardContent>
      </Card>
      </motion.div>
    </div>
  )
}

export default LeadsPage
