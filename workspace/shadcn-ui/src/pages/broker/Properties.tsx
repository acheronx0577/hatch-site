import React, { useMemo, useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useBroker } from '@/contexts/BrokerContext'
import { MLSProperty } from '@/types/MLSProperty'
import PropertyPreview from '@/components/PropertyPreview'
import { motion } from 'framer-motion'
import {
  Building2,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  MapPin,
  Bed,
  Bath,
  Square,
  Users,
  Star,
  MoreHorizontal,
  Plus,
  Upload,
  User,
  Building,
  Car,
  ImageIcon,
  Undo2,
  ExternalLink,
  Sparkles,
  BarChart3,
  Loader2,
  GitBranch
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

const STATUS_OPTIONS: MLSProperty['status'][] = ['draft', 'active', 'pending', 'sold', 'withdrawn', 'expired']
const PROPERTY_TYPE_OPTIONS = ['residential', 'commercial', 'land', 'rental', 'condo', 'townhouse', 'multi-family']
const PUBLISHED_STATUS_OPTIONS = STATUS_OPTIONS.filter((status): status is Exclude<MLSProperty['status'], 'draft'> => status !== 'draft')
const STATUS_CHANGE_OPTIONS: Array<{ value: MLSProperty['status']; label: string; description: string }> = [
  {
    value: 'active',
    label: 'Active',
    description: 'Return the listing to full market visibility.',
  },
  {
    value: 'pending',
    label: 'Pending',
    description: 'Mark as under contract while keeping the listing visible.',
  },
  {
    value: 'sold',
    label: 'Sold',
    description: 'Archive the listing as closed and capture final metrics.',
  },
  {
    value: 'withdrawn',
    label: 'Off-Market',
    description: 'Keep the listing private while you make updates or plan a relaunch.',
  },
]

type PropertyEditForm = {
  listPrice: string;
  status: MLSProperty['status'];
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  livingAreaSqFt: string;
  yearBuilt: string;
  publicRemarks: string;
  showingInstructions: string;
  listingAgentPhone: string;
  listingAgentEmail: string;
};

export default function Properties() {
  const { properties, leads, updateProperty, deleteProperty, unpublishProperty, updatePropertyStatus, featureProperty } = useBroker()
  const [searchTerm, setSearchTerm] = useState('')
  const [showPropertyPreview, setShowPropertyPreview] = useState(false)
  const [previewProperty, setPreviewProperty] = useState<MLSProperty | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingProperty, setEditingProperty] = useState<MLSProperty | null>(null)
  const [editForm, setEditForm] = useState<PropertyEditForm | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [statusDialogProperty, setStatusDialogProperty] = useState<MLSProperty | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<MLSProperty['status']>('active')
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [analyticsProperty, setAnalyticsProperty] = useState<MLSProperty | null>(null)
  const [menuLoadingId, setMenuLoadingId] = useState<string | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }
    
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Animation variants
  const cardVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: (index: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: index * 0.05,
        duration: 0.3,
      }
    })
  }

  const cardHoverVariant = prefersReducedMotion ? {} : {
    whileHover: { y: -8, transition: { duration: 0.2 } }
  }

  const buttonHoverVariant = prefersReducedMotion ? {} : {
    whileHover: { scale: 1.05, y: -2, transition: { duration: 0.2 } },
    whileTap: { scale: 0.95 }
  }

  const headerVariant = {
    hidden: { opacity: 0, y: -20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 }
    }
  }

  const searchVariant = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { delay: 0.2, duration: 0.4 }
    }
  }

  const emptyStateVariant = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { delay: 0.3, duration: 0.5 }
    }
  }

  const liveProperties = useMemo(
    () => properties.filter((property) => property.workflowState === 'LIVE' || property.workflowState === 'SOLD'),
    [properties]
  )

  // Filter properties based on search term with proper null checks
  const filteredProperties = liveProperties.filter(property => {
    const address = `${property.streetNumber || ''} ${property.streetName || ''} ${property.streetSuffix || ''}, ${property.city || ''}, ${property.state || ''} ${property.zipCode || ''}`.toLowerCase()
    const searchLower = searchTerm.toLowerCase()
    
    return address.includes(searchLower) ||
           (property.listingAgentName || '').toLowerCase().includes(searchLower) ||
           (property.propertyType || '').toLowerCase().includes(searchLower) ||
           (property.publicRemarks || '').toLowerCase().includes(searchLower)
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'sold': return 'bg-blue-100 text-blue-800'
      case 'withdrawn': return 'bg-gray-100 text-gray-800'
      case 'expired': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Recently'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Get leads for a specific property
  const getPropertyLeads = useMemo(
    () => (propertyId: string) => leads.filter(lead => lead.propertyId === propertyId),
    [leads]
  )

  const analyticsLeads = useMemo(
    () => (analyticsProperty ? getPropertyLeads(analyticsProperty.id) : []),
    [analyticsProperty, getPropertyLeads]
  )

  const createEditForm = (property: MLSProperty): PropertyEditForm => ({
    listPrice: property.listPrice?.toString() ?? '',
    status: property.status,
    propertyType: property.propertyType || '',
    bedrooms: property.bedrooms?.toString() ?? '',
    bathrooms: property.bathrooms?.toString() ?? '',
    livingAreaSqFt: property.livingAreaSqFt?.toString() ?? '',
    yearBuilt: property.yearBuilt?.toString() ?? '',
    publicRemarks: property.publicRemarks || '',
    showingInstructions: property.showingInstructions || '',
    listingAgentPhone: property.listingAgentPhone || '',
    listingAgentEmail: property.listingAgentEmail || '',
  })

  const updateEditFormField = <K extends keyof PropertyEditForm>(field: K, value: PropertyEditForm[K]) => {
    setEditForm((current) => (current ? { ...current, [field]: value } : current))
  }

  const resetEditState = () => {
    setShowEditDialog(false)
    setEditingProperty(null)
    setEditForm(null)
    setIsSavingEdit(false)
  }

  const getStatusLabel = (status: MLSProperty['status']) => {
    if (status === 'withdrawn') {
      return 'Off-Market'
    }
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const handlePreview = (property: MLSProperty) => {
    setPreviewProperty(property)
    setShowPropertyPreview(true)
  }

  const handleEdit = (property: MLSProperty) => {
    setEditingProperty(property)
    setEditForm(createEditForm(property))
    setShowEditDialog(true)
  }

  const sanitizeNumericInput = (value: string) => value.replace(/[^0-9.]/g, '')

  const parseNumericValue = (value: string, fallback: number) => {
    const sanitized = sanitizeNumericInput(value)
    if (!sanitized) return fallback
    const parsed = Number(sanitized)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  const handleSaveEdit = async () => {
    if (!editingProperty || !editForm) return

    setIsSavingEdit(true)
    try {
      const updates: Partial<MLSProperty> = {
        listPrice: parseNumericValue(editForm.listPrice, editingProperty.listPrice),
        status: editForm.status,
        propertyType: editForm.propertyType || editingProperty.propertyType,
        bedrooms: parseNumericValue(editForm.bedrooms, editingProperty.bedrooms),
        bathrooms: parseNumericValue(editForm.bathrooms, editingProperty.bathrooms),
        livingAreaSqFt: parseNumericValue(editForm.livingAreaSqFt, editingProperty.livingAreaSqFt),
        yearBuilt: parseNumericValue(editForm.yearBuilt, editingProperty.yearBuilt),
        publicRemarks: editForm.publicRemarks,
        showingInstructions: editForm.showingInstructions,
        listingAgentPhone: editForm.listingAgentPhone,
        listingAgentEmail: editForm.listingAgentEmail ? editForm.listingAgentEmail : undefined,
        lastModified: new Date().toISOString(),
      }

      await updateProperty(editingProperty.id, updates)
      toast({
        title: 'Listing updated',
        description: 'The property details were saved successfully.',
      })
      resetEditState()
    } catch (error) {
      console.error('Error updating property:', error)
      toast({
        title: 'Update failed',
        description: 'We could not save your changes. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteProperty(id)
      toast({
        title: 'Property deleted',
        description: 'The listing has been removed from your portfolio.',
      })
    } catch (error) {
      console.error('Error deleting property:', error)
      toast({
        title: 'Failed to delete property',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      })
    }
  }

  const handleViewPublic = (property: MLSProperty) => {
    const url = `/properties/${property.id}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleUnpublish = async (property: MLSProperty) => {
    setMenuLoadingId(property.id)
    try {
      const result = await updatePropertyStatus(property.id, 'withdrawn')
      if (result) {
        toast({
          title: 'Listing unpublished',
          description: 'The listing is no longer visible to clients.',
        })
        return
      }

      const fallback = await unpublishProperty(property.id)
      if (fallback) {
        toast({
          title: 'Listing unpublished',
          description: 'The listing is no longer visible to clients.',
        })
      } else {
        toast({
          title: 'Unable to unpublish',
          description: 'Please try again shortly.',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error unpublishing property:', error)
      toast({
        title: 'Unable to unpublish',
        description: 'Please try again shortly.',
        variant: 'destructive',
      })
    } finally {
      setMenuLoadingId(null)
    }
  }

  const handleToggleFeatured = (property: MLSProperty) => {
    featureProperty(property.id, !property.isFeatured)
    toast({
      title: property.isFeatured ? 'Feature removed' : 'Listing featured',
      description: property.isFeatured
        ? 'The listing returned to standard ordering.'
        : 'The listing will stay pinned to the top of your list.',
    })
  }

  const openStatusDialog = (property: MLSProperty) => {
    setStatusDialogProperty(property)
    setSelectedStatus(property.status)
  }

  const closeStatusDialog = () => {
    setStatusDialogProperty(null)
    setSelectedStatus('active')
  }

  const handleStatusUpdate = async () => {
    if (!statusDialogProperty) {
      return
    }

    if (selectedStatus === statusDialogProperty.status) {
      toast({
        title: 'No changes made',
        description: 'The listing is already set to this status.',
      })
      closeStatusDialog()
      return
    }

    setIsUpdatingStatus(true)
    try {
      const updated = await updatePropertyStatus(statusDialogProperty.id, selectedStatus)
      if (!updated) {
        throw new Error('status_update_failed')
      }

      const label = getStatusLabel(selectedStatus)
      toast({
        title: `Status updated to ${label}`,
        description:
          selectedStatus === 'withdrawn'
            ? 'The listing is now off-market and hidden from customer views.'
            : 'Clients will now see the updated status.',
      })
      closeStatusDialog()
    } catch (error) {
      console.error('Status update failed', error)
      toast({
        title: 'Failed to update status',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      })
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const getFullAddress = (property: MLSProperty) => {
    const parts = [
      property.streetNumber,
      property.streetName,
      property.streetSuffix
    ].filter(Boolean).join(' ')
    
    return `${parts}, ${property.city}, ${property.state} ${property.zipCode}`
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div 
          className="flex justify-between items-center"
          initial={prefersReducedMotion ? "visible" : "hidden"}
          animate="visible"
          variants={headerVariant}
        >
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Properties</h1>
            <p className="text-gray-600">Manage your published property listings and track performance</p>
          </div>
          <div className="flex gap-3">
            <motion.div {...buttonHoverVariant}>
              <Button variant="outline">
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </motion.div>
            <motion.div {...buttonHoverVariant}>
              <Button onClick={() => {
                window.location.href = '/broker/draft-listings?newDraft=1'
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Property
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Search and Stats */}
        <motion.div 
          className="flex flex-col sm:flex-row gap-4 items-center justify-between"
          initial={prefersReducedMotion ? "visible" : "hidden"}
          animate="visible"
          variants={searchVariant}
        >
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search properties..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-4 text-sm text-gray-600">
            <span>{liveProperties.length} properties</span>
            <span>•</span>
            <span>{liveProperties.filter(p => p.status === 'active').length} active</span>
            <span>•</span>
            <span>{liveProperties.filter(p => p.status === 'pending').length} pending</span>
            <span>•</span>
            <span>{properties.filter(p => p.workflowState !== 'LIVE' && p.workflowState !== 'SOLD').length} drafts</span>
          </div>
        </motion.div>

        {/* Properties Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties.map((property, index) => {
            const propertyLeads = getPropertyLeads(property.id)
            const isMenuLoading = menuLoadingId === property.id

            return (
              <motion.div
                key={property.id}
                custom={index}
                initial={prefersReducedMotion ? "visible" : "hidden"}
                animate="visible"
                variants={cardVariant}
                {...cardHoverVariant}
              >
                <Card className="overflow-hidden shadow-md h-full">
                  {/* Property Image */}
                  <div className="aspect-video bg-gray-200 relative">
                  {property.photos && property.photos.length > 0 ? (
                    <img
                      src={property.photos[0]}
                      alt={`${property.streetNumber} ${property.streetName} ${property.streetSuffix}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        target.nextElementSibling?.classList.remove('invisible')
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                  
                  {/* Hidden fallback for broken images */}
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100 invisible">
                    <ImageIcon className="w-12 h-12 text-gray-400" />
                  </div>
                  
                  {/* Status Badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <Badge className={getStatusColor(property.status)}>
                      {getStatusLabel(property.status)}
                    </Badge>
                    {property.isFeatured && (
                      <Badge className="flex items-center gap-1 bg-amber-400/90 text-amber-900 shadow">
                        <Sparkles className="h-3 w-3" />
                        Featured
                      </Badge>
                    )}
                  </div>

                  {/* Price */}
                  <div className="absolute bottom-3 left-3">
                    <div className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-lg font-bold text-gray-900">
                      {formatPrice(property.listPrice)}
                    </div>
                  </div>

                  {/* Photo Count */}
                  {property.photos && property.photos.length > 1 && (
                    <div className="absolute bottom-3 right-3">
                      <div className="bg-black/60 text-white px-2 py-1 rounded text-sm flex items-center">
                        <ImageIcon className="w-3 h-3 mr-1" />
                        {property.photos.length}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="absolute top-3 right-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="bg-white/90 backdrop-blur-sm"
                          aria-label="Listing actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        side="right"
                        align="start"
                        sideOffset={12}
                        className="w-60 rounded-xl border border-border bg-white/95 p-1 shadow-2xl backdrop-blur-md"
                      >
                        <DropdownMenuItem
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary focus:bg-primary/10 focus:text-primary"
                          disabled={isMenuLoading}
                          onSelect={() => {
                            void handleUnpublish(property)
                          }}
                        >
                          {isMenuLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : (
                            <Undo2 className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="flex-1 text-left">Unpublish</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary focus:bg-primary/10 focus:text-primary"
                          onSelect={() => handleViewPublic(property)}
                        >
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-left">View Public Listing</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-1" />
                        <DropdownMenuItem
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary focus:bg-primary/10 focus:text-primary"
                          onSelect={() => handleToggleFeatured(property)}
                        >
                          <Sparkles className={`h-4 w-4 ${property.isFeatured ? 'text-amber-500' : 'text-muted-foreground'}`} />
                          <span className="flex-1 text-left">
                            {property.isFeatured ? 'Remove Feature' : 'Feature Listing'}
                          </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary focus:bg-primary/10 focus:text-primary"
                          onSelect={() => openStatusDialog(property)}
                        >
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-left">Change Status</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary focus:bg-primary/10 focus:text-primary"
                          onSelect={() => setAnalyticsProperty(property)}
                        >
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-left">Analytics</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <CardContent className="p-4">
                  {/* Property Details */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900 line-clamp-1">
                        {property.streetNumber} {property.streetName} {property.streetSuffix}
                      </h3>
                      <div className="flex items-center text-gray-600 text-sm mt-1">
                        <MapPin className="w-4 h-4 mr-1" />
                        <span className="line-clamp-1">{getFullAddress(property)}</span>
                      </div>
                    </div>

                    {/* Property Features */}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center">
                        <Bed className="w-4 h-4 mr-1" />
                        <span>{property.bedrooms || 0}</span>
                      </div>
                      <div className="flex items-center">
                        <Bath className="w-4 h-4 mr-1" />
                        <span>{property.bathrooms || 0}</span>
                      </div>
                      <div className="flex items-center">
                        <Square className="w-4 h-4 mr-1" />
                        <span>{property.livingAreaSqFt?.toLocaleString() || 0} sq ft</span>
                      </div>
                    </div>

                    {/* Additional Property Info */}
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>🏠 {property.propertyType}</span>
                        <span>🏗️ Built {property.yearBuilt}</span>
                      </div>
                      {property.garageSpaces && (
                        <div className="flex items-center">
                          <Car className="w-3 h-3 mr-1" />
                          <span>{property.garageSpaces} car garage</span>
                        </div>
                      )}
                      {property.lotSize && (
                        <div>📐 Lot: {property.lotSize.toLocaleString()} sq ft</div>
                      )}
                    </div>

                    {/* Agent Information */}
                    {property.listingAgentName && (
                      <div className="bg-gray-50 rounded p-2 text-sm">
                        <div className="flex items-center text-gray-700">
                          <User className="w-3 h-3 mr-1" />
                          <span className="font-medium">{property.listingAgentName}</span>
                        </div>
                        {property.brokerage && (
                          <div className="flex items-center text-gray-600 mt-1">
                            <Building className="w-3 h-3 mr-1" />
                            <span className="text-xs">{property.brokerage}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Performance Metrics */}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Eye className="w-4 h-4 mr-1" />
                          <span>{property.viewCount || 0}</span>
                        </div>
                        <div className="flex items-center">
                          <Users className="w-4 h-4 mr-1" />
                          <span>{propertyLeads.length}</span>
                        </div>
                        <div className="flex items-center">
                          <Star className="w-4 h-4 mr-1" />
                          <span>{property.favoriteCount || 0}</span>
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-500">
                        Listed {formatDate(property.listingDate)}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                      <motion.div className="flex-1" {...buttonHoverVariant}>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full"
                          onClick={() => handleEdit(property)}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </motion.div>
                      <motion.div className="flex-1" {...buttonHoverVariant}>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full"
                          onClick={() => handlePreview(property)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </motion.div>
                    </div>

                    {/* Delete Button */}
                    <motion.div {...buttonHoverVariant}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="destructive" 
                            className="w-full"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete Property
                          </Button>
                        </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this property?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. The listing for {getFullAddress(property)} will be permanently removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={() => { void handleDelete(property.id) }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            )
          })}
        </div>

        {/* Empty State */}
        {filteredProperties.length === 0 && (
          <motion.div 
            className="text-center py-12"
            initial={prefersReducedMotion ? "visible" : "hidden"}
            animate="visible"
            variants={emptyStateVariant}
          >
            <motion.div
              {...(prefersReducedMotion ? {} : {
                animate: { 
                  y: [0, -10, 0],
                  transition: { 
                    repeat: Infinity, 
                    duration: 2,
                    ease: "easeInOut"
                  }
                }
              })}
            >
              <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            </motion.div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchTerm ? 'No properties found' : 'No published properties yet'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm 
                ? 'Try adjusting your search terms or filters'
                : 'Publish draft listings or upload new properties to get started'
              }
            </p>
            {!searchTerm && (
              <div className="flex justify-center gap-3">
                <motion.div {...buttonHoverVariant}>
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.location.href = '/broker/draft-listings?bulkUpload=1'
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Bulk Upload Properties
                  </Button>
                </motion.div>
                <motion.div {...buttonHoverVariant}>
                  <Button
                    onClick={() => {
                      window.location.href = '/broker/draft-listings?newDraft=1'
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Property
                  </Button>
                </motion.div>
              </div>
            )}
          </motion.div>
        )}

        {/* Edit Property Dialog */}
        <Dialog
          open={showEditDialog}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              resetEditState()
            }
          }}
        >
          <DialogContent className="sm:max-w-[640px]">
            <DialogHeader>
              <DialogTitle>Edit Listing</DialogTitle>
              <DialogDescription>
                {editingProperty ? `Update the published details for ${getFullAddress(editingProperty)}.` : 'Update the published listing details.'}
              </DialogDescription>
            </DialogHeader>
            {editForm && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="edit-list-price">List Price</Label>
                    <Input
                      id="edit-list-price"
                      value={editForm.listPrice}
                      onChange={(event) => updateEditFormField('listPrice', event.target.value)}
                      placeholder="450000"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-status">Status</Label>
                    <Select
                      value={editForm.status}
                      onValueChange={(value) => updateEditFormField('status', value as MLSProperty['status'])}
                    >
                      <SelectTrigger id="edit-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {editForm.status === 'draft' && (
                          <SelectItem value={editForm.status}>
                            {editForm.status.charAt(0).toUpperCase() + editForm.status.slice(1)}
                          </SelectItem>
                        )}
                        {PUBLISHED_STATUS_OPTIONS.map((statusOption) => (
                          <SelectItem key={statusOption} value={statusOption}>
                            {statusOption.charAt(0).toUpperCase() + statusOption.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="edit-property-type">Property Type</Label>
                    <Select
                      value={editForm.propertyType || undefined}
                      onValueChange={(value) => updateEditFormField('propertyType', value)}
                    >
                      <SelectTrigger id="edit-property-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {editForm.propertyType && !PROPERTY_TYPE_OPTIONS.includes(editForm.propertyType) && (
                          <SelectItem value={editForm.propertyType}>
                            {editForm.propertyType.charAt(0).toUpperCase() + editForm.propertyType.slice(1)}
                          </SelectItem>
                        )}
                        {PROPERTY_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option.charAt(0).toUpperCase() + option.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="edit-year-built">Year Built</Label>
                    <Input
                      id="edit-year-built"
                      value={editForm.yearBuilt}
                      onChange={(event) => updateEditFormField('yearBuilt', event.target.value)}
                      placeholder="1998"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-bedrooms">Bedrooms</Label>
                    <Input
                      id="edit-bedrooms"
                      value={editForm.bedrooms}
                      onChange={(event) => updateEditFormField('bedrooms', event.target.value)}
                      placeholder="4"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-bathrooms">Bathrooms</Label>
                    <Input
                      id="edit-bathrooms"
                      value={editForm.bathrooms}
                      onChange={(event) => updateEditFormField('bathrooms', event.target.value)}
                      placeholder="2.5"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-living-area">Living Area (sq ft)</Label>
                    <Input
                      id="edit-living-area"
                      value={editForm.livingAreaSqFt}
                      onChange={(event) => updateEditFormField('livingAreaSqFt', event.target.value)}
                      placeholder="2450"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-listing-agent-phone">Listing Agent Phone</Label>
                    <Input
                      id="edit-listing-agent-phone"
                      value={editForm.listingAgentPhone}
                      onChange={(event) => updateEditFormField('listingAgentPhone', event.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="edit-listing-agent-email">Listing Agent Email</Label>
                    <Input
                      id="edit-listing-agent-email"
                      type="email"
                      value={editForm.listingAgentEmail}
                      onChange={(event) => updateEditFormField('listingAgentEmail', event.target.value)}
                      placeholder="agent@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="edit-public-remarks">Public Remarks</Label>
                    <Textarea
                      id="edit-public-remarks"
                      value={editForm.publicRemarks}
                      onChange={(event) => updateEditFormField('publicRemarks', event.target.value)}
                      placeholder="Add a compelling description to highlight the property."
                      rows={4}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-showing-instructions">Showing Instructions</Label>
                    <Textarea
                      id="edit-showing-instructions"
                      value={editForm.showingInstructions}
                      onChange={(event) => updateEditFormField('showingInstructions', event.target.value)}
                      placeholder="Provide guidance for agents scheduling tours."
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={resetEditState} disabled={isSavingEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={isSavingEdit || !editForm}>
                {isSavingEdit ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Status Dialog */}
        <Dialog
          open={Boolean(statusDialogProperty)}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              if (isUpdatingStatus) return
              closeStatusDialog()
            }
          }}
        >
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Change Listing Status</DialogTitle>
              <DialogDescription>
                {statusDialogProperty ? `Adjust the workflow for ${getFullAddress(statusDialogProperty)}.` : 'Update the listing status.'}
              </DialogDescription>
            </DialogHeader>
            {statusDialogProperty && (
              <div className="space-y-4">
                <RadioGroup
                  value={selectedStatus}
                  onValueChange={(value) => setSelectedStatus(value as MLSProperty['status'])}
                  className="grid gap-3"
                >
                  {STATUS_CHANGE_OPTIONS.map((option, index) => (
                    <Label
                      key={option.value}
                      htmlFor={`status-${option.value}`}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${selectedStatus === option.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/60'}`}
                      style={{ animationDelay: `${index * 60}ms` }}
                    >
                      <RadioGroupItem
                        id={`status-${option.value}`}
                        value={option.value}
                        className="mt-1"
                      />
                      <div>
                        <span className="text-sm font-medium">{option.label}</span>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={closeStatusDialog} disabled={isUpdatingStatus}>
                Cancel
              </Button>
              <Button onClick={handleStatusUpdate} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? 'Updating…' : 'Save status'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Analytics Dialog */}
        <Dialog
          open={Boolean(analyticsProperty)}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setAnalyticsProperty(null)
            }
          }}
        >
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Listing Analytics</DialogTitle>
              <DialogDescription>
                {analyticsProperty ? getFullAddress(analyticsProperty) : 'Quick performance overview for this listing.'}
              </DialogDescription>
            </DialogHeader>
            {analyticsProperty && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Views</div>
                    <div className="mt-2 text-2xl font-semibold">{analyticsProperty.viewCount ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Lifetime impressions</p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Leads</div>
                    <div className="mt-2 text-2xl font-semibold">{analyticsLeads.length}</div>
                    <p className="text-xs text-muted-foreground">Captured through Hatch</p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Favorites</div>
                    <div className="mt-2 text-2xl font-semibold">{analyticsProperty.favoriteCount ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Buyers tracking this listing</p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Status</div>
                    <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                      {getStatusLabel(analyticsProperty.status)}
                      {analyticsProperty.isFeatured && (
                        <Badge className="bg-amber-400/90 text-amber-900">Featured</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Workflow: {analyticsProperty.workflowState}</p>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <div className="flex items-center justify-between text-xs font-medium uppercase text-muted-foreground">
                    <span>List price</span>
                    <span>Last update {formatDate(analyticsProperty.lastModified)}</span>
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{formatPrice(analyticsProperty.listPrice)}</div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Property Preview Dialog */}
        <PropertyPreview
          property={previewProperty}
          isOpen={showPropertyPreview}
          onClose={() => {
            setShowPropertyPreview(false)
            setPreviewProperty(null)
          }}
        />
      </div>
    </div>
  )
}
