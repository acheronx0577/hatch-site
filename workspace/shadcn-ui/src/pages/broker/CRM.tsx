import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { motion } from 'framer-motion'
import { usePageAnimations } from '@/hooks/usePageAnimations'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Users,
  TrendingUp,
  Phone,
  Mail,
  Plus,
  Filter,
  Search,
  User,
  Building,
  Target,
  AlertTriangle,
  MoreHorizontal
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import {
  listContacts,
  listListings,
  getBrokerDashboard,
  listCalendarEvents,
  type BrokerDashboardSummary,
  type ListingSummary,
  type ContactListItem,
  type CalendarEventRecord,
  type ContactListResponse,
  listTeamMembers,
  type TeamMemberRecord,
  deleteContact,
  restoreContact,
  listContactViews,
  saveContactView,
  deleteContactView,
  type ContactSavedView,
  assignContactOwner
} from '@/lib/api/hatch'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/use-toast'
import NewContactDrawer from '@/components/contacts/NewContactDrawer'
import ContactFiltersDialog, { type ContactFiltersState } from '@/components/contacts/ContactFiltersDialog'
import AssignOwnerDialog from '@/components/contacts/AssignOwnerDialog'
import ContactDetailsDrawer from '@/components/contacts/ContactDetailsDrawer'
import ContactBulkBar from '@/components/contacts/ContactBulkBar'
import { useMessenger } from '@/contexts/MessengerContext'
import { formatCurrencySafe } from '@/utils/export'

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'

const calendarTypeOptions = [
  { label: 'Meeting', value: 'MEETING' as CalendarEventRecord['eventType'] },
  { label: 'Property Showing', value: 'SHOWING' },
  { label: 'Inspection', value: 'INSPECTION' },
  { label: 'Closing', value: 'CLOSING' },
  { label: 'Follow Up', value: 'FOLLOW_UP' },
  { label: 'Marketing', value: 'MARKETING' },
  { label: 'Other', value: 'OTHER' }
]

interface Lead {
  id: string
  name: string
  email?: string
  phone?: string
  stage: string
  ownerId?: string | null
  doNotContact: boolean
  consent: ContactListItem['consent']
  deletedAt: string | null
}

interface DeliverabilityTotals {
  accepted: number
  delivered: number
  bounced: number
  optOuts: number
}

const stageLabelMap: Record<string, { label: string; badge: string }> = {
  NEW: { label: 'New', badge: 'bg-blue-100 text-blue-800' },
  NURTURE: { label: 'Nurture', badge: 'bg-sky-100 text-sky-800' },
  CONTACTED: { label: 'Contacted', badge: 'bg-amber-100 text-amber-800' },
  QUALIFIED: { label: 'Qualified', badge: 'bg-green-100 text-green-800' },
  ACTIVE: { label: 'Active', badge: 'bg-sky-100 text-sky-800' },
  UNDER_CONTRACT: { label: 'Under contract', badge: 'bg-indigo-100 text-indigo-800' },
  CLOSED: { label: 'Closed', badge: 'bg-emerald-100 text-emerald-800' },
  LOST: { label: 'Lost', badge: 'bg-rose-100 text-rose-800' },
  CLIENT: { label: 'Client', badge: 'bg-purple-100 text-purple-800' },
  PAST_CLIENT: { label: 'Past Client', badge: 'bg-gray-100 text-gray-800' },
  ARCHIVED: { label: 'Archived', badge: 'bg-slate-100 text-slate-800' }
}

const formatStage = (stage: string) => stageLabelMap[stage]?.label ?? stage.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\w/g, (m) => m.toUpperCase())
const getStageBadge = (stage: string) => stageLabelMap[stage]?.badge ?? 'bg-gray-100 text-gray-800'

const eventStatusBadge = (status: CalendarEventRecord['status']) => {
  switch (status) {
    case 'CONFIRMED':
      return 'bg-green-100 text-green-800'
    case 'COMPLETED':
      return 'bg-blue-100 text-blue-800'
    case 'CANCELLED':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-amber-100 text-amber-800'
  }
}

const eventTypeBadge = (type: CalendarEventRecord['eventType']) => {
  switch (type) {
    case 'SHOWING':
      return 'bg-blue-100 text-blue-800'
    case 'INSPECTION':
      return 'bg-purple-100 text-purple-800'
    case 'CLOSING':
      return 'bg-orange-100 text-orange-800'
    case 'FOLLOW_UP':
      return 'bg-amber-100 text-amber-800'
    case 'MARKETING':
      return 'bg-pink-100 text-pink-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const eventTypeLabel = (type: CalendarEventRecord['eventType']) =>
  calendarTypeOptions.find((option) => option.value === type)?.label ?? type.toLowerCase()


const percentage = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value * 1000) / 10}%`
    : '—'

const OverviewSkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={`metric-skeleton-${index}`}>
          <CardHeader className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-12" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
    <Card>
      <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={`deliverability-skeleton-${index}`} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  </div>
)

const LeadsSkeleton = () => (
  <Card>
    <CardHeader className="space-y-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-24" />
    </CardHeader>
    <CardContent className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={`lead-skeleton-${index}`} className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </CardContent>
  </Card>
)

const CRM = () => {
  const { toast } = useToast()
  const { activeMembership } = useAuth()
  const { openForContact } = useMessenger()
  const navigate = useNavigate()
  const { pageVariants, buttonHoverVariant, cardHoverVariant, getInitialState } = usePageAnimations()
  const [activeTab, setActiveTab] = useState('overview')

  const [leads, setLeads] = useState<Lead[]>([])
  const [contactsMeta, setContactsMeta] = useState<{ total: number; page: number; pageSize: number }>({ total: 0, page: 1, pageSize: 25 })
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)

  const [dashboard, setDashboard] = useState<BrokerDashboardSummary | null>(null)
  const [listings, setListings] = useState<ListingSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [events, setEvents] = useState<CalendarEventRecord[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMemberRecord[]>([])

  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)
  const [isNewContactOpen, setIsNewContactOpen] = useState(false)
  const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(false)
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [selectedContactOwner, setSelectedContactOwner] = useState<string | null>(null)
  const [contactDrawerRefreshKey, setContactDrawerRefreshKey] = useState(0)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [contactFilters, setContactFilters] = useState<ContactFiltersState>({})
  const [savedViews, setSavedViews] = useState<ContactSavedView[]>([])
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null)
  const [isSaveViewDialogOpen, setIsSaveViewDialogOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewAsDefault, setViewAsDefault] = useState(false)
  const [savingView, setSavingView] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const windowStart = new Date()
        windowStart.setMonth(windowStart.getMonth() - 1)
        const windowEnd = new Date()
        windowEnd.setMonth(windowEnd.getMonth() + 2)

        const [listingsResponse, dashboardResponse, calendarResponse] = await Promise.all([
          listListings(TENANT_ID),
          getBrokerDashboard(TENANT_ID),
          listCalendarEvents(TENANT_ID, {
            start: windowStart.toISOString(),
            end: windowEnd.toISOString()
          })
        ])

        if (cancelled) return

        setListings(listingsResponse ?? [])
        setDashboard(dashboardResponse ?? null)
        setEvents(calendarResponse ?? [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load CRM data')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadTeamMembers = async () => {
      try {
        const response = await listTeamMembers(TENANT_ID)
        if (!cancelled) {
          setTeamMembers(response)
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load team members'
          toast({ title: 'Failed to load team members', description: message, variant: 'destructive' })
        }
      }
    }

    loadTeamMembers()

    return () => {
      cancelled = true
    }
  }, [toast])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    let cancelled = false
    const loadViews = async () => {
      try {
        const response = await listContactViews(TENANT_ID)
        if (!cancelled) {
          setSavedViews(response)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load saved views'
        toast({ title: 'Failed to load saved views', description: message, variant: 'destructive' })
      }
    }
    void loadViews()
    return () => {
      cancelled = true
    }
  }, [toast])

  const fetchContacts = useCallback(async () => {
    setContactsLoading(true)
    setContactsError(null)
    try {
      const params: Record<string, unknown> = {}
      if (debouncedSearch) params.search = debouncedSearch
      if (contactFilters.stage?.length) params.stage = contactFilters.stage
      if (contactFilters.ownerId?.length) params.ownerId = contactFilters.ownerId
      if (contactFilters.doNotContact) params.doNotContact = 'true'
      if (contactFilters.includeDeleted) params.includeDeleted = 'true'
      if (selectedViewId) params.savedViewId = selectedViewId

      const response: ContactListResponse = await listContacts(TENANT_ID, params)
      const contactItems = response.items ?? []
      const mappedLeads: Lead[] = contactItems.map((contact: ContactListItem) => ({
        id: contact.id,
        name: [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || 'Unnamed contact',
        email: contact.primaryEmail ?? undefined,
        phone: contact.primaryPhone ?? undefined,
        stage: contact.stage ?? 'NEW',
        ownerId: contact.owner?.id ?? undefined,
        doNotContact: contact.doNotContact,
        consent: contact.consent,
        deletedAt: contact.deletedAt
      }))
      setLeads(mappedLeads)
      setContactsMeta({ total: response.total, page: response.page, pageSize: response.pageSize })
      if (response.savedView) {
        setSelectedViewId(response.savedView.id)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load contacts'
      setContactsError(message)
    } finally {
      setContactsLoading(false)
    }
  }, [contactFilters, debouncedSearch, selectedViewId])

  useEffect(() => {
    void fetchContacts()
  }, [fetchContacts])

  const handleFiltersApply = (filters: ContactFiltersState) => {
    setContactFilters(filters)
    setSelectedViewId(null)
  }

  const handleContactCreated = () => {
    void fetchContacts()
    setContactDrawerRefreshKey((prev) => prev + 1)
  }

  useEffect(() => {
    if (!isSaveViewDialogOpen) {
      setViewName('')
      setViewAsDefault(false)
    }
  }, [isSaveViewDialogOpen])

  useEffect(() => {
    setSelectedContacts((prev) => prev.filter((id) => leads.some((lead) => lead.id === id)))
  }, [leads])

  const parseSavedFilters = (filters: unknown) => {
    let parsed: Record<string, unknown> = {}
    if (typeof filters === 'string') {
      try {
        parsed = JSON.parse(filters)
      } catch (error) {
        parsed = {}
      }
    } else if (filters && typeof filters === 'object') {
      parsed = filters as Record<string, unknown>
    }
    const stage = Array.isArray(parsed.stage)
      ? (parsed.stage as string[])
      : parsed.stage
      ? [String(parsed.stage)]
      : []
    const ownerId = Array.isArray(parsed.ownerId)
      ? (parsed.ownerId as string[])
      : parsed.ownerId
      ? [String(parsed.ownerId)]
      : []
    const doNotContact = parsed.doNotContact === true || parsed.doNotContact === 'true'
    const includeDeleted = parsed.includeDeleted === true || parsed.includeDeleted === 'true'
    const search = typeof parsed.search === 'string' ? parsed.search : ''
    return { stage, ownerId, doNotContact, includeDeleted, search }
  }

  const clearFilters = () => {
    setContactFilters({})
    setSelectedViewId(null)
    setSearchTerm('')
    setSelectedContacts([])
  }

  const applySavedView = (view: ContactSavedView) => {
    const { stage, ownerId, doNotContact, includeDeleted, search } = parseSavedFilters(view.filters)
    setContactFilters({
      stage: stage.length ? stage : undefined,
      ownerId: ownerId.length ? ownerId : undefined,
      doNotContact: doNotContact ? true : undefined,
      includeDeleted: includeDeleted ? true : undefined
    })
    setSearchTerm(search)
    setSelectedViewId(view.id)
    setSelectedContacts([])
    setIsFilterDialogOpen(false)
  }

  const handleDeleteView = async (viewId: string) => {
    try {
      await deleteContactView(viewId, TENANT_ID)
      setSavedViews((prev) => prev.filter((view) => view.id !== viewId))
      if (selectedViewId === viewId) {
        clearFilters()
      }
      toast({ title: 'Saved view deleted' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete saved view'
      toast({ title: 'Failed to delete view', description: message, variant: 'destructive' })
    }
  }

  const handleSaveView = async () => {
    if (!viewName.trim()) {
      toast({ title: 'Name required', description: 'Provide a name for this view.', variant: 'destructive' })
      return
    }
    setSavingView(true)
    try {
      const filtersPayload = {
        stage: contactFilters.stage ?? [],
        ownerId: contactFilters.ownerId ?? [],
        doNotContact: contactFilters.doNotContact ?? false,
        includeDeleted: contactFilters.includeDeleted ?? false,
        search: searchTerm.trim() || undefined
      }
      const saved = await saveContactView({
        tenantId: TENANT_ID,
        name: viewName.trim(),
        filters: filtersPayload,
        isDefault: viewAsDefault
      })
      const latest = await listContactViews(TENANT_ID)
      setSavedViews(latest)
      const applied = latest.find((view) => view.id === saved.id) ?? saved
      applySavedView(applied)
      toast({ title: 'View saved', description: `${applied.name} is ready to use.` })
      setIsSaveViewDialogOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save view'
      toast({ title: 'Failed to save view', description: message, variant: 'destructive' })
    } finally {
      setSavingView(false)
    }
  }

  const openAssignDialog = (contactId: string, ownerId?: string | null) => {
    setSelectedContactId(contactId)
    setSelectedContactOwner(ownerId ?? null)
    setIsAssignDialogOpen(true)
  }

  const handleViewContact = (contactId: string, ownerId?: string | null) => {
    setSelectedContactId(contactId)
    setSelectedContactOwner(ownerId ?? null)
    setIsContactDrawerOpen(true)
  }

  const toggleSelect = (contactId: string, checked: boolean) => {
    setSelectedContacts((prev) => {
      const set = new Set(prev)
      if (checked) {
        set.add(contactId)
      } else {
        set.delete(contactId)
      }
      return Array.from(set)
    })
  }

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContacts(leads.map((lead) => lead.id))
    } else {
      setSelectedContacts([])
      setSelectedViewId(null)
    }
  }

  const handleSoftDelete = async (contactId: string) => {
    try {
      await deleteContact(contactId, TENANT_ID)
      toast({ title: 'Contact moved to trash', description: 'You can restore contacts within 30 days.' })
      setSelectedContacts((prev) => prev.filter((id) => id !== contactId))
      if (selectedContactId === contactId) {
        setIsContactDrawerOpen(false)
      }
      void fetchContacts()
      setContactDrawerRefreshKey((prev) => prev + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete contact'
      toast({ title: 'Failed to delete contact', description: message, variant: 'destructive' })
    } finally {
      setPendingDeleteId(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedContacts.length === 0) return
    setBulkDeleting(true)
    try {
      await Promise.all(selectedContacts.map((id) => deleteContact(id, TENANT_ID)))
      toast({ title: 'Contacts moved to trash', description: `${selectedContacts.length} contact(s) were soft deleted.` })
      setSelectedContacts([])
      if (selectedContactId && selectedContacts.includes(selectedContactId)) {
        setIsContactDrawerOpen(false)
      }
      void fetchContacts()
      setContactDrawerRefreshKey((prev) => prev + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete selected contacts'
      toast({ title: 'Bulk delete failed', description: message, variant: 'destructive' })
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleRestore = async (contactId: string) => {
    setRestoringId(contactId)
    try {
      await restoreContact(contactId, TENANT_ID)
      toast({ title: 'Contact restored', description: 'The contact has been restored from trash.' })
      setSelectedContacts((prev) => prev.filter((id) => id !== contactId))
      void fetchContacts()
      setContactDrawerRefreshKey((prev) => prev + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to restore contact'
      toast({ title: 'Restore failed', description: message, variant: 'destructive' })
    } finally {
      setRestoringId(null)
    }
  }

  const handleBulkAssign = async (ownerId: string) => {
    if (!ownerId || selectedContacts.length === 0) return
    setBulkAssigning(true)
    try {
      await Promise.all(
        selectedContacts.map((id) =>
          assignContactOwner(id, {
            tenantId: TENANT_ID,
            ownerId
          })
        )
      )
      toast({ title: 'Assignment complete', description: `Assigned ${selectedContacts.length} contact(s).` })
      setSelectedContacts([])
      void fetchContacts()
      setContactDrawerRefreshKey((prev) => prev + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to assign selected contacts'
      toast({ title: 'Bulk assign failed', description: message, variant: 'destructive' })
    } finally {
      setBulkAssigning(false)
    }
  }

  const handleMessageContact = (contactId: string) => {
    openForContact(contactId)
  }

  const totalLeads = contactsMeta.total || leads.length
  const allSelected = leads.length > 0 && selectedContacts.length === leads.length
  const partiallySelected = selectedContacts.length > 0 && selectedContacts.length < leads.length
  const activeSavedView = useMemo(() => savedViews.find((view) => view.id === selectedViewId) ?? null, [savedViews, selectedViewId])
  const activeListings = useMemo(() =>
    listings.filter(listing => listing.status?.toLowerCase() === 'active').length,
  [listings])

  const deliverabilityTotals = useMemo<DeliverabilityTotals>(() => {
    return (dashboard?.deliverability ?? []).reduce<DeliverabilityTotals>((acc, row) => ({
      accepted: acc.accepted + (row.accepted ?? 0),
      delivered: acc.delivered + (row.delivered ?? 0),
      bounced: acc.bounced + (row.bounced ?? 0),
      optOuts: acc.optOuts + (row.optOuts ?? 0)
    }), { accepted: 0, delivered: 0, bounced: 0, optOuts: 0 })
  }, [dashboard])

  const recentLeads = leads.slice(0, 5)
  const deliverabilityByChannel = dashboard?.deliverability ?? []
  const deals = dashboard?.deals ?? []
  const clearCooperation = dashboard?.clearCooperation ?? []
  const upcomingEvents = useMemo(
    () =>
      events
        .slice()
        .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime())
        .slice(0, 5),
    [events]
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <motion.div 
          className="mb-8"
          initial={getInitialState('headerVariant')}
          animate="visible"
          variants={pageVariants.headerVariant}
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">CRM Dashboard</h1>
          <p className="text-gray-600">Operational overview for your broker team</p>
          {error && (
            <p className="text-sm text-red-600 mt-2">{error}</p>
          )}
        </motion.div>

        <motion.div
          initial={getInitialState('contentVariant')}
          animate="visible"
          variants={pageVariants.contentVariant}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {isLoading ? (
              <OverviewSkeleton />
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totalLeads}</div>
                      <p className="text-xs text-muted-foreground">CRM contacts synced from Hatch</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Lead → Kept Tour Rate</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{percentage(dashboard?.leadToKeptRate)}</div>
                      <p className="text-xs text-muted-foreground">Tour conversion across your pipeline</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Tours with BBA</CardTitle>
                      <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{percentage(dashboard?.toursWithBbaRate)}</div>
                      <p className="text-xs text-muted-foreground">Share of tours covered by agreements</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Active Listings</CardTitle>
                      <Building className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{activeListings}</div>
                      <p className="text-xs text-muted-foreground">{listings.length} total in pipeline</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Deliverability by Channel</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                        <div>
                          <p className="text-sm text-gray-600">Total delivered</p>
                          <p className="text-lg font-semibold">{deliverabilityTotals.delivered.toLocaleString()}</p>
                        </div>
                        <div className="text-right text-sm text-gray-600">
                          <div>Accepted: {deliverabilityTotals.accepted.toLocaleString()}</div>
                          <div>Bounced: {deliverabilityTotals.bounced.toLocaleString()}</div>
                          <div>Opt-outs: {deliverabilityTotals.optOuts.toLocaleString()}</div>
                        </div>
                      </div>

                      {(deliverabilityByChannel.length === 0) && (
                        <p className="text-sm text-gray-500">No activity recorded yet.</p>
                      )}

                      {deliverabilityByChannel.map((row) => (
                        <div key={`deliverability-${row.channel}`} className="flex items-center justify-between border rounded-lg p-4">
                          <div>
                            <p className="font-medium">{row.channel}</p>
                            <p className="text-sm text-gray-600">Accepted {row.accepted.toLocaleString()}</p>
                          </div>
                          <div className="text-right text-sm text-gray-600">
                            <div>Delivered: {row.delivered.toLocaleString()}</div>
                            <div>Bounced: {row.bounced.toLocaleString()}</div>
                            <div>Opt-outs: {row.optOuts.toLocaleString()}</div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Leads</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {recentLeads.length === 0 && (
                          <p className="text-sm text-gray-500">No contacts found for this tenant.</p>
                        )}
                        {recentLeads.map((lead) => (
                          <div key={lead.id} className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-medium">{lead.name}</p>
                                <p className="text-sm text-gray-600">{lead.email || 'No email'}</p>
                              </div>
                            </div>
                            <Badge className={getStageBadge(lead.stage)}>{formatStage(lead.stage)}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Upcoming Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {upcomingEvents.length === 0 && (
                          <p className="text-sm text-gray-500">No upcoming events scheduled.</p>
                        )}
                        {upcomingEvents.map((event) => (
                          <div key={event.id} className="flex items-center justify-between border rounded-lg p-3">
                            <div>
                              <p className="font-medium">{event.title}</p>
                              <p className="text-sm text-gray-600">
                                {format(parseISO(event.startAt), 'MMM d, h:mm a')}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Badge className={eventTypeBadge(event.eventType)}>{eventTypeLabel(event.eventType)}</Badge>
                              <Badge className={eventStatusBadge(event.status)}>{event.status.toLowerCase()}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Deal Pipeline</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {deals.length === 0 ? (
                        <p className="text-sm text-gray-500">No deals recorded yet for this tenant.</p>
                      ) : (
                        deals.map((deal) => (
                          <div key={`deal-${deal.stage}`} className="flex items-center justify-between border rounded-lg p-4">
                            <div>
                              <p className="font-semibold">{formatStage(deal.stage)}</p>
                              <p className="text-sm text-gray-600">Forecast: {formatCurrencySafe(deal.forecastGci)}</p>
                            </div>
                            <div className="text-right text-sm text-gray-600">
                              <div>Closed: {formatCurrencySafe(deal.actualGci)}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="calendar" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Team calendar</CardTitle>
                  <CardDescription>All events synced from Hatch</CardDescription>
                </div>
                <Button variant="outline" asChild>
                  <a href="/broker/calendar">Open full calendar</a>
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={`calendar-skeleton-${index}`} className="h-16 w-full" />
                    ))}
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-sm text-gray-500">No events recorded for this tenant.</p>
                ) : (
                  <div className="space-y-3">
                    {events
                      .slice()
                      .sort((a, b) => parseISO(a.startAt).getTime() - parseISO(b.startAt).getTime())
                      .map((event) => (
                        <div key={`calendar-row-${event.id}`} className="flex items-start justify-between border rounded-lg p-4">
                          <div>
                            <p className="font-semibold">{event.title}</p>
                            <p className="text-sm text-gray-600">
                              {format(parseISO(event.startAt), 'MMM d, h:mm a')} • {eventTypeLabel(event.eventType)}
                            </p>
                            {event.location && (
                              <p className="text-xs text-gray-500">{event.location}</p>
                            )}
                            {event.notes && (
                              <p className="text-xs text-gray-500">Notes: {event.notes}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge className={eventStatusBadge(event.status)}>{event.status.toLowerCase()}</Badge>
                            <Badge className={eventTypeBadge(event.eventType)}>{event.priority.toLowerCase()} priority</Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="space-y-6">
            {isLoading ? (
              <LeadsSkeleton />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold">Contact Roster</h2>
                    {activeSavedView && (
                      <Badge variant="outline">View: {activeSavedView.name}</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline">Views</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onSelect={() => { clearFilters(); }}>
                          Clear saved view
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {savedViews.length === 0 ? (
                          <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
                        ) : (
                          savedViews.map((view) => (
                            <DropdownMenuItem
                              key={view.id}
                              onSelect={(event) => {
                                event.preventDefault()
                                applySavedView(view)
                              }}
                            >
                              <div className="flex w-full items-center justify-between">
                                <span>
                                  {view.name}
                                  {view.isDefault ? ' • default' : ''}
                                </span>
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    event.preventDefault()
                                    handleDeleteView(view.id)
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="outline" onClick={() => setIsSaveViewDialogOpen(true)}>
                      Save view
                    </Button>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        className="pl-9 w-64"
                        placeholder="Search contacts"
                        value={searchTerm}
                        onChange={(event) => {
                          setSelectedViewId(null)
                          setSearchTerm(event.target.value)
                        }}
                      />
                    </div>
                    <Button variant="outline" onClick={() => setIsFilterDialogOpen(true)}>
                      <Filter className="w-4 h-4 mr-2" />
                      Filters
                    </Button>
                    <Button onClick={() => setIsNewContactOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      New contact
                    </Button>
                  </div>
                </div>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>All contacts</CardTitle>
                      <CardDescription>Synced from Hatch CRM</CardDescription>
                    </div>
                    <div className="text-sm text-muted-foreground">{contactsMeta.total.toLocaleString()} total</div>
                  </CardHeader>
                  <CardContent>
                    {(debouncedSearch || contactFilters.stage?.length || contactFilters.ownerId?.length || contactFilters.doNotContact) && (
                      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                        {debouncedSearch && (
                          <Badge variant="outline" className="flex items-center gap-2">
                            Search: {debouncedSearch}
                            <button type="button" onClick={() => setSearchTerm('')} className="text-muted-foreground hover:text-foreground">×</button>
                          </Badge>
                        )}
                        {contactFilters.stage?.map((stage) => (
                          <Badge key={`stage-chip-${stage}`} variant="outline" className="flex items-center gap-2">
                            Stage: {formatStage(stage)}
                            <button type="button" onClick={() => handleFiltersApply({ ...contactFilters, stage: contactFilters.stage?.filter((value) => value !== stage) })} className="text-muted-foreground hover:text-foreground">×</button>
                          </Badge>
                        ))}
                        {contactFilters.ownerId?.map((ownerId) => {
                          const owner = teamMembers.find((member) => member.id === ownerId)
                          return (
                            <Badge key={`owner-chip-${ownerId}`} variant="outline" className="flex items-center gap-2">
                              Owner: {owner?.name ?? ownerId}
                              <button type="button" onClick={() => handleFiltersApply({ ...contactFilters, ownerId: contactFilters.ownerId?.filter((value) => value !== ownerId) })} className="text-muted-foreground hover:text-foreground">×</button>
                            </Badge>
                          )
                        })}
                        {contactFilters.doNotContact && (
                          <Badge variant="outline" className="flex items-center gap-2">
                            Do not contact
                            <button type="button" onClick={() => handleFiltersApply({ ...contactFilters, doNotContact: undefined })} className="text-muted-foreground hover:text-foreground">×</button>
                          </Badge>
                        )}
                        {contactFilters.includeDeleted && (
                          <Badge variant="outline" className="flex items-center gap-2">
                            Trash
                            <button type="button" onClick={() => handleFiltersApply({ ...contactFilters, includeDeleted: undefined })} className="text-muted-foreground hover:text-foreground">×</button>
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm" className="text-xs" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      </div>
                    )}
                    {contactsError ? (
                      <div className="text-sm text-red-600">{contactsError}</div>
                    ) : contactsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <Skeleton key={`contacts-loading-${index}`} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : leads.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-6">No contacts match your criteria.</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Checkbox
                            checked={allSelected ? true : partiallySelected ? 'indeterminate' : false}
                            onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                          />
                          <span>Select all</span>
                        </div>
                        {selectedContacts.length > 0 && (
                          <ContactBulkBar
                            totalSelected={selectedContacts.length}
                            allSelected={allSelected}
                            partiallySelected={partiallySelected}
                            onToggleAll={(checked) => toggleSelectAll(checked)}
                            onClearSelection={() => setSelectedContacts([])}
                            owners={teamMembers}
                            onBulkAssign={handleBulkAssign}
                            onBulkDelete={handleBulkDelete}
                            deleting={bulkDeleting || bulkAssigning}
                          />
                        )}
                        {leads.map((lead) => (
                          <div
                            key={lead.id}
                            className={`flex items-center justify-between rounded-lg border p-4 ${lead.deletedAt ? 'bg-slate-50 opacity-80' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={selectedContacts.includes(lead.id)}
                                onCheckedChange={(checked) => toggleSelect(lead.id, checked === true)}
                              />
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-blue-600" />
                              </div>
                              <div>
                                <h3 className="font-semibold">{lead.name}</h3>
                                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {lead.email || 'No email'}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {lead.phone || 'No phone'}
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                  <Badge variant="outline">Email: {lead.consent.email.status.toLowerCase()}</Badge>
                                  <Badge variant="outline">SMS: {lead.consent.sms.status.toLowerCase()}</Badge>
                                  {lead.doNotContact && <Badge className="bg-red-100 text-red-800">DNC</Badge>}
                                  {lead.deletedAt && <Badge className="bg-amber-100 text-amber-800">In trash</Badge>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={getStageBadge(lead.stage)}>{formatStage(lead.stage)}</Badge>
                              <Button size="sm" variant="outline" onClick={() => handleViewContact(lead.id, lead.ownerId)}>
                                View
                              </Button>
                              <Button size="sm" onClick={() => handleMessageContact(lead.id)} disabled={!!lead.deletedAt}>
                                Message
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {!lead.deletedAt && (
                                    <DropdownMenuItem onClick={() => openAssignDialog(lead.id, lead.ownerId)}>
                                      Assign owner
                                    </DropdownMenuItem>
                                  )}
                                  {!lead.deletedAt && <DropdownMenuSeparator />}
                                  {lead.deletedAt ? (
                                    <DropdownMenuItem disabled={restoringId === lead.id} onClick={() => handleRestore(lead.id)}>
                                      {restoringId === lead.id ? 'Restoring…' : 'Restore'}
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem className="text-red-600" onClick={() => setPendingDeleteId(lead.id)}>
                                      Soft delete
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            {isLoading ? (
              <OverviewSkeleton />
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Pipeline Performance</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Lead → kept tour</span>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-2xl font-semibold">{percentage(dashboard?.leadToKeptRate)}</p>
                      <p className="text-sm text-gray-500 mt-2">Ratio of total leads to kept tours during the current reporting window.</p>
                    </div>
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Tours with BBA</span>
                        <Target className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-2xl font-semibold">{percentage(dashboard?.toursWithBbaRate)}</p>
                      <p className="text-sm text-gray-500 mt-2">Share of recently kept tours that had an active buyer brokerage agreement.</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Clear Cooperation Timers</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {clearCooperation.length === 0 ? (
                      <p className="text-sm text-gray-500">No active timers at the moment.</p>
                    ) : (
                      clearCooperation.map((row) => {
                        const started = new Date(row.startedAt)
                        const deadline = row.deadlineAt ? new Date(row.deadlineAt) : null
                        return (
                          <div key={row.timerId} className="flex items-start justify-between border rounded-lg p-4">
                            <div>
                              <p className="font-semibold">Timer {row.timerId}</p>
                              <p className="text-sm text-gray-600">Started {started.toLocaleString()}</p>
                              {deadline ? (
                                <p className="text-sm text-gray-600">Deadline {deadline.toLocaleString()}</p>
                              ) : (
                                <p className="text-sm text-gray-600">No deadline recorded</p>
                              )}
                            </div>
                            <Badge className={row.status === 'RED' ? 'bg-red-100 text-red-800' : row.status === 'YELLOW' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}>
                              {row.status}
                            </Badge>
                          </div>
                        )
                      })
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Deliverability Health</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {deliverabilityByChannel.length === 0 ? (
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <AlertTriangle className="h-4 w-4" />
                        No email or SMS activity recorded for this tenant.
                      </div>
                    ) : (
                      deliverabilityByChannel.map((row) => (
                        <div key={`deliverability-insight-${row.channel}`} className="flex items-center justify-between border rounded-lg p-4">
                          <div>
                            <p className="font-semibold">{row.channel}</p>
                            <p className="text-sm text-gray-600">Accepted {row.accepted.toLocaleString()} · Delivered {row.delivered.toLocaleString()}</p>
                          </div>
                          <div className="text-right text-sm text-gray-500">
                            <div>Bounced {row.bounced.toLocaleString()}</div>
                            <div>Opt-outs {row.optOuts.toLocaleString()}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
        </motion.div>

      </div>
      <ContactFiltersDialog
        open={isFilterDialogOpen}
        onOpenChange={setIsFilterDialogOpen}
        initialFilters={contactFilters}
        owners={teamMembers}
        onApply={handleFiltersApply}
      />
      <NewContactDrawer
        open={isNewContactOpen}
        onOpenChange={setIsNewContactOpen}
        tenantId={TENANT_ID}
        organizationId={activeMembership?.org_id ?? null}
        owners={teamMembers}
        onCreated={handleContactCreated}
      />
      <AssignOwnerDialog
        open={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
        tenantId={TENANT_ID}
        contactId={selectedContactId}
        owners={teamMembers}
        initialOwnerId={selectedContactOwner}
        onAssigned={handleContactCreated}
      />
      <ContactDetailsDrawer
        open={isContactDrawerOpen}
        onOpenChange={setIsContactDrawerOpen}
        contactId={selectedContactId}
        tenantId={TENANT_ID}
        onAssignOwner={() => {
          if (selectedContactId) {
            openAssignDialog(selectedContactId, selectedContactOwner)
          }
        }}
        refreshKey={contactDrawerRefreshKey}
        onOwnerChange={setSelectedContactOwner}
        onRestore={(id) => handleRestore(id)}
        restoring={restoringId === selectedContactId}
      />
      <Dialog open={isSaveViewDialogOpen} onOpenChange={setIsSaveViewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>Store the current filters for quick access later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                placeholder="e.g. Hot leads"
              />
            </div>
            <div className="flex items-center space-x-3">
              <Switch id="view-default" checked={viewAsDefault} onCheckedChange={setViewAsDefault} />
              <div>
                <Label htmlFor="view-default">Set as default</Label>
                <p className="text-xs text-muted-foreground">Load this view automatically next time.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveViewDialogOpen(false)} disabled={savingView}>
              Cancel
            </Button>
            <Button onClick={handleSaveView} disabled={savingView || !viewName.trim()}>
              {savingView ? 'Saving…' : 'Save view'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soft delete contact</AlertDialogTitle>
            <AlertDialogDescription>
              This contact will be moved to trash and can be restored within 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDeleteId && handleSoftDelete(pendingDeleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default CRM
