import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useBroker } from '@/contexts/BrokerContext'
import { MLSProperty } from '@/types/MLSProperty'
import BulkListingUpload from '@/components/upload/BulkListingUpload'
import type { DraftListing as UploadDraftListing } from '@/components/upload/BulkListingUpload'
import PhotoUpload from '@/components/PhotoUpload'
import { MIN_PROPERTY_PHOTOS, MAX_PROPERTY_PHOTOS } from '@/constants/photoRequirements'
import PropertyPreview from '@/components/PropertyPreview'
import { PropertyFiltersComponent, PROPERTY_FILTER_LIMITS, createDefaultPropertyFilters } from '@/components/PropertyFilters'
import type { PropertyFilters } from '@/components/PropertyFilters'
import { motion } from 'framer-motion'
import { usePageAnimations } from '@/hooks/usePageAnimations'
import {
  FileText,
  Edit,
  Trash2,
  Eye,
  Upload,
  Plus,
  Filter,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  MapPin,
  Home,
  DollarSign,
  User,
  FileImage,
  Settings,
  Check,
  Loader2,
} from 'lucide-react'

const cloneFilters = (filters: PropertyFilters): PropertyFilters => ({
  ...filters,
  priceRange: [...filters.priceRange] as [number, number],
  propertyTypes: [...filters.propertyTypes],
  sqftRange: [...filters.sqftRange] as [number, number],
  yearBuiltRange: [...filters.yearBuiltRange] as [number, number],
  status: [...filters.status],
  agents: [...filters.agents],
  cities: [...filters.cities],
  daysOnMarket: [...filters.daysOnMarket] as [number, number],
  listingDateRange: { ...filters.listingDateRange },
  lotSizeRange: [...filters.lotSizeRange] as [number, number],
})

const countActiveFilters = (filters: PropertyFilters) => {
  let count = 0
  if (filters.search) count++
  if (filters.priceRange[0] > 0 || filters.priceRange[1] < PROPERTY_FILTER_LIMITS.priceMax) count++
  if (filters.propertyTypes.length > 0) count++
  if (filters.bedrooms !== 'Any') count++
  if (filters.bathrooms !== 'Any') count++
  if (filters.sqftRange[0] > 0 || filters.sqftRange[1] < PROPERTY_FILTER_LIMITS.sqftMax) count++
  if (filters.status.length > 0) count++
  if (filters.agents.length > 0) count++
  if (filters.cities.length > 0) count++
  if (filters.mlsNumber) count++
  if (filters.listingDateRange.from || filters.listingDateRange.to) count++
  if (filters.daysOnMarket[0] > 0 || filters.daysOnMarket[1] < 365) count++
  if (filters.lotSizeRange[0] > 0 || filters.lotSizeRange[1] < PROPERTY_FILTER_LIMITS.lotSizeMax) count++
  return count
}

const getDaysOnMarket = (property: MLSProperty) => {
  if (!property.createdAt) return 0
  const created = new Date(property.createdAt)
  const now = new Date()
  const diff = now.getTime() - created.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

const parseDate = (value?: string) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const createEmptyDraftProperty = (): MLSProperty => {
  const now = new Date().toISOString()
  return {
    id: `draft_new_${Date.now()}`,
    status: 'draft',
    workflowState: 'PROPERTY_PENDING',
    listPrice: 0,
    originalListPrice: undefined,
    propertyType: 'residential',
    propertySubType: undefined,
    architecturalStyle: undefined,
    yearBuilt: new Date().getFullYear(),
    livingAreaSqFt: 0,
    bedrooms: 0,
    bathrooms: 0,
    bathroomsHalf: undefined,
    bathroomsPartial: undefined,
    bathroomsTotal: undefined,
    stories: undefined,
    streetNumber: '',
    streetName: '',
    streetSuffix: '',
    city: '',
    state: '',
    zipCode: '',
    county: '',
    subdivision: undefined,
    parcelID: undefined,
    latitude: undefined,
    longitude: undefined,
    lotSize: 0,
    lotSizeAcres: undefined,
    garageSpaces: undefined,
    garageType: undefined,
    flooring: undefined,
    poolFeatures: undefined,
    fireplaceFeatures: undefined,
    kitchenFeatures: undefined,
    primarySuite: undefined,
    laundryFeatures: undefined,
    interiorFeatures: undefined,
    appliances: undefined,
    constructionMaterials: undefined,
    roofType: undefined,
    foundationDetails: undefined,
    exteriorFeatures: undefined,
    propertyView: undefined,
    waterSource: undefined,
    sewerSystem: undefined,
    heatingType: undefined,
    coolingType: undefined,
    taxes: undefined,
    taxYear: undefined,
    hoaFee: undefined,
    buyerAgentCompensation: undefined,
    specialAssessments: undefined,
    listingAgentName: '',
    listingAgentLicense: '',
    listingAgentPhone: '',
    listingAgentEmail: undefined,
    brokerage: '',
    brokerageLicense: undefined,
    showingInstructions: undefined,
    photos: [],
    coverPhotoUrl: undefined,
    publicRemarks: undefined,
    brokerRemarks: undefined,
    virtualTourUrl: undefined,
    videoUrl: undefined,
    listingDate: new Date().toISOString().split('T')[0],
    viewCount: 0,
    leadCount: 0,
    favoriteCount: 0,
    createdAt: now,
    lastModified: now,
    completionPercentage: 0,
    validationErrors: [],
    publishedAt: undefined,
    closedAt: undefined,
  }
}

export default function DraftListings() {
  const { getDraftProperties, updateProperty, deleteProperty, publishDraftProperty, addDraftProperties } = useBroker()
  const { pageVariants, buttonHoverVariant, cardHoverVariant, getInitialState } = usePageAnimations()
  const [editingProperty, setEditingProperty] = useState<MLSProperty | null>(null)
  const [previewProperty, setPreviewProperty] = useState<MLSProperty | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [selectedListings, setSelectedListings] = useState<string[]>([])
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [isNewDraft, setIsNewDraft] = useState(false)
  const [isImportingDrafts, setIsImportingDrafts] = useState(false)
  const [showFiltersDialog, setShowFiltersDialog] = useState(false)
  const [filters, setFilters] = useState<PropertyFilters>(() => createDefaultPropertyFilters())
  const [savedFilterPresets, setSavedFilterPresets] = useState<Array<{ name: string; filters: PropertyFilters }>>([])

  const draftListings = getDraftProperties()

  const openNewDraftDialog = useCallback(() => {
    const blank = createEmptyDraftProperty()
    setEditingProperty(blank)
    setIsNewDraft(true)
    setShowEditDialog(true)
  }, [])

  const matchesFilters = (property: MLSProperty): boolean => {
    const searchTerm = filters.search.trim().toLowerCase()
    if (searchTerm) {
      const haystack = [
        property.mlsNumber,
        `${property.streetNumber} ${property.streetName} ${property.streetSuffix}`,
        property.city,
        property.state,
        property.zipCode,
        property.publicRemarks,
        property.brokerRemarks,
        property.listingAgentName,
        property.brokerage,
      ]
        .filter(Boolean)
        .map((value) => value!.toString().toLowerCase())
      if (!haystack.some((value) => value.includes(searchTerm))) {
        return false
      }
    }

    if (property.listPrice < filters.priceRange[0] || property.listPrice > filters.priceRange[1]) {
      return false
    }

    if (filters.propertyTypes.length > 0) {
      const propertyType = (property.propertyType || '').toLowerCase()
      if (!filters.propertyTypes.some((type) => propertyType === type.toLowerCase())) {
        return false
      }
    }

    if (filters.bedrooms !== 'Any') {
      const bedroomsValue = property.bedrooms ?? 0
      if (filters.bedrooms.endsWith('+')) {
        const min = parseInt(filters.bedrooms)
        if (bedroomsValue < min) return false
      } else {
        const target = parseInt(filters.bedrooms)
        if (bedroomsValue !== target) return false
      }
    }

    if (filters.bathrooms !== 'Any') {
      const bathroomsValue = property.bathrooms ?? 0
      if (filters.bathrooms.endsWith('+')) {
        const min = parseFloat(filters.bathrooms)
        if (bathroomsValue < min) return false
      } else {
        const target = parseFloat(filters.bathrooms)
        if (Number.isFinite(target) && bathroomsValue !== target) return false
      }
    }

    if (property.livingAreaSqFt < filters.sqftRange[0] || property.livingAreaSqFt > filters.sqftRange[1]) {
      return false
    }

    if (property.yearBuilt < filters.yearBuiltRange[0] || property.yearBuilt > filters.yearBuiltRange[1]) {
      return false
    }

    if (filters.status.length > 0 && !filters.status.includes(property.status)) {
      return false
    }

    if (filters.agents.length > 0) {
      const agentId = (property.listingAgentEmail || property.listingAgentName || '').toLowerCase()
      if (!filters.agents.includes(agentId)) {
        return false
      }
    }

    if (filters.cities.length > 0) {
      const city = (property.city || '').toLowerCase()
      if (!filters.cities.some((c) => city === c.toLowerCase())) {
        return false
      }
    }

    const daysOnMarket = getDaysOnMarket(property)
    if (daysOnMarket < filters.daysOnMarket[0] || daysOnMarket > filters.daysOnMarket[1]) {
      return false
    }

    if (filters.listingDateRange.from || filters.listingDateRange.to) {
      const listingDate = parseDate(property.listingDate ?? property.createdAt)
      const fromDate = parseDate(filters.listingDateRange.from)
      const toDate = parseDate(filters.listingDateRange.to)
      if ((fromDate && (!listingDate || listingDate < fromDate)) || (toDate && (!listingDate || listingDate > toDate))) {
        return false
      }
    }

    if (filters.mlsNumber) {
      const normalizedMLS = (property.mlsNumber || '').toLowerCase()
      if (!normalizedMLS.includes(filters.mlsNumber.trim().toLowerCase())) {
        return false
      }
    }

    if (property.lotSize < filters.lotSizeRange[0] || property.lotSize > filters.lotSizeRange[1]) {
      return false
    }

    return true
  }

  const filteredDraftListings = useMemo(() => {
    const filtered = draftListings.filter(matchesFilters)
    const sorted = [...filtered].sort((a, b) => {
      const direction = filters.sortOrder === 'asc' ? 1 : -1

      const getSortValue = (property: MLSProperty) => {
        switch (filters.sortBy) {
          case 'price':
            return property.listPrice
          case 'sqft':
            return property.livingAreaSqFt
          case 'bedrooms':
            return property.bedrooms
          case 'listingDate': {
            const date = parseDate(property.listingDate ?? property.createdAt)
            return date ? date.getTime() : 0
          }
          case 'daysOnMarket':
            return getDaysOnMarket(property)
          case 'viewCount':
            return property.viewCount ?? 0
          case 'leadCount':
            return property.leadCount ?? 0
          default:
            return property.lastModified ? new Date(property.lastModified).getTime() : 0
        }
      }

      const valueA = getSortValue(a)
      const valueB = getSortValue(b)

      if (valueA < valueB) return -1 * direction
      if (valueA > valueB) return 1 * direction
      return 0
    })
    return sorted
  }, [draftListings, filters])

  const agentsOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    draftListings.forEach((listing) => {
      const identifier = (listing.listingAgentEmail || listing.listingAgentName || '').trim()
      if (!identifier) return
      const id = identifier.toLowerCase()
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: listing.listingAgentName || listing.listingAgentEmail || identifier,
        })
      }
    })
    return Array.from(map.values())
  }, [draftListings])

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.has('newDraft')) {
      openNewDraftDialog()
      params.delete('newDraft')
      const query = params.toString()
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
      window.history.replaceState({}, '', nextUrl)
    }
  }, [openNewDraftDialog])

  const mergeUploadDraftListings = (listings: UploadDraftListing[]): UploadDraftListing | null => {
    if (!Array.isArray(listings) || listings.length === 0) {
      return null
    }

    const [first, ...rest] = listings
    const merged: UploadDraftListing = {
      ...first,
      id: `draft_batch_${Date.now()}`,
      fileName: listings.length === 1 ? first.fileName : `${listings.length} files`,
      uploadDate: new Date().toISOString(),
      totalRecords: first.totalRecords,
      validRecords: first.validRecords,
      errorRecords: first.errorRecords,
      requiredFieldsComplete: first.requiredFieldsComplete,
      optionalFieldsComplete: first.optionalFieldsComplete,
      photosCount: first.photosCount,
      data: [...(first.data ?? [])],
      validationErrors: [...(first.validationErrors ?? [])],
      fieldMapping: [...(first.fieldMapping ?? [])],
      mlsCompliant: first.mlsCompliant,
      completionPercentage: first.completionPercentage,
    }

    rest.forEach((listing) => {
      merged.data = [...merged.data, ...(listing.data ?? [])]
      merged.validationErrors = [
        ...(merged.validationErrors ?? []),
        ...(listing.validationErrors ?? []),
      ]

      merged.totalRecords += listing.totalRecords
      merged.validRecords += listing.validRecords
      merged.errorRecords += listing.errorRecords
      merged.requiredFieldsComplete += listing.requiredFieldsComplete
      merged.optionalFieldsComplete += listing.optionalFieldsComplete
      merged.photosCount += listing.photosCount
      merged.mlsCompliant = (merged.mlsCompliant ?? true) && (listing.mlsCompliant ?? true)

      const combinedMappings = [...(merged.fieldMapping ?? []), ...(listing.fieldMapping ?? [])]
      const byStandard = new Map<string, typeof combinedMappings[number]>()
      combinedMappings.forEach((mapping) => {
        const key = mapping?.mlsField?.standardName
        if (!key) return
        if (!byStandard.has(key)) {
          byStandard.set(key, mapping)
        }
      })
      merged.fieldMapping = Array.from(byStandard.values())
    })

    if (merged.totalRecords > 0) {
      merged.completionPercentage = Math.round((merged.requiredFieldsComplete / merged.totalRecords) * 100)
    }

    return merged
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-yellow-100 text-yellow-800'
      case 'review': return 'bg-blue-100 text-blue-800'
      case 'ready': return 'bg-green-100 text-green-800'
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

  const validateProperty = (property: MLSProperty) => {
    const errors: string[] = []

    // Required fields validation
    const requiredFields = [
      { field: 'listPrice', name: 'List Price', value: property.listPrice },
      { field: 'yearBuilt', name: 'Year Built', value: property.yearBuilt },
      { field: 'lotSize', name: 'Lot Size', value: property.lotSize },
      // Location fields (ALL REQUIRED)
      { field: 'streetNumber', name: 'Street Number', value: property.streetNumber },
      { field: 'streetName', name: 'Street Name', value: property.streetName },
      { field: 'streetSuffix', name: 'Street Suffix', value: property.streetSuffix },
      { field: 'city', name: 'City', value: property.city },
      { field: 'state', name: 'State', value: property.state },
      { field: 'zipCode', name: 'ZIP Code', value: property.zipCode },
      { field: 'county', name: 'County', value: property.county },
      // Property details
      { field: 'bedrooms', name: 'Bedrooms', value: property.bedrooms },
      { field: 'bathrooms', name: 'Bathrooms', value: property.bathrooms },
      { field: 'livingAreaSqFt', name: 'Living Area', value: property.livingAreaSqFt },
      { field: 'propertyType', name: 'Property Type', value: property.propertyType },
      // Agent info
      { field: 'listingAgentName', name: 'Listing Agent Name', value: property.listingAgentName },
      { field: 'listingAgentLicense', name: 'Agent License', value: property.listingAgentLicense },
      { field: 'listingAgentPhone', name: 'Agent Phone', value: property.listingAgentPhone },
      { field: 'brokerage', name: 'Brokerage', value: property.brokerage }
    ]

    requiredFields.forEach(({ field, name, value }) => {
      const isMissing =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim().length === 0) ||
        (typeof value === 'number' && value === 0)

      if (isMissing) {
        errors.push(`${name} is required`)
      }
    })

    const latitudeValue = property.latitude
    if (latitudeValue === undefined || latitudeValue === null || Number.isNaN(latitudeValue)) {
      errors.push('Latitude is required')
    }

    const longitudeValue = property.longitude
    if (longitudeValue === undefined || longitudeValue === null || Number.isNaN(longitudeValue)) {
      errors.push('Longitude is required')
    }

    // Photo validation - minimum 5 photos required
    if (!property.photos || property.photos.length < MIN_PROPERTY_PHOTOS) {
      errors.push(`Minimum ${MIN_PROPERTY_PHOTOS} photos required (currently have ${property.photos?.length || 0})`)
    }

    return errors
  }

  const calculateCompletionPercentage = (property: MLSProperty) => {
    const errors = validateProperty(property)
    const totalRequiredFields = 18 + 3 // 18 core fields + photos + latitude/longitude
    const completedFields = totalRequiredFields - errors.length
    return Math.round((completedFields / totalRequiredFields) * 100)
  }

  const handleEdit = (property: MLSProperty) => {
    setEditingProperty({ ...property })
    setIsNewDraft(false)
    setShowEditDialog(true)
  }

  const handlePreview = (property: MLSProperty) => {
    setPreviewProperty(property)
    setShowPreviewDialog(true)
  }

  const handleSaveEdit = async () => {
    if (editingProperty) {
      const errors = validateProperty(editingProperty)
      const completionPercentage = calculateCompletionPercentage(editingProperty)
      
      const updatedProperty = {
        ...editingProperty,
        completionPercentage,
        validationErrors: errors.map(error => ({
          field: error.split(' is ')[0].toLowerCase().replace(/\s+/g, ''),
          message: error,
          severity: 'error' as const
        })),
        lastModified: new Date().toISOString()
      }

      if (isNewDraft) {
        const { created, duplicates } = await addDraftProperties([
          updatedProperty as unknown as Record<string, unknown>
        ])

        if (duplicates.length > 0) {
          toast({
            title: duplicates.length === 1 ? 'Duplicate listing skipped' : 'Duplicate listings skipped',
            description: (
              <div className="space-y-1 text-left">
                {duplicates.map((dup, index) => {
                  const identifier = dup.mlsNumber && dup.mlsNumber.trim().length > 0 ? `MLS ${dup.mlsNumber}` : dup.address || 'Listing'
                  const reasonLabel = dup.reason === 'batch_duplicate' ? 'duplicate in upload file' : 'already exists'
                  return (
                    <div key={`${identifier}-${reasonLabel}-${index}`}>
                      {identifier} ({reasonLabel})
                    </div>
                  )
                })}
              </div>
            ),
            variant: 'destructive',
          })
        } else if (created.length > 0) {
          toast({
            title: 'Draft created',
            description: 'You can continue editing the new listing from the drafts list below.',
            variant: 'info',
          })
        }

        setShowEditDialog(false)
        setEditingProperty(null)
        setIsNewDraft(false)
      } else {
        await updateProperty(editingProperty.id, updatedProperty)
        setShowEditDialog(false)
        setEditingProperty(null)
      }
    }
  }

  const handlePublish = async (id: string) => {
    const property = draftListings.find(p => p.id === id)
    if (!property) return

    const errors = validateProperty(property)
    if (errors.length > 0) {
      toast({
        title: 'Publish blocked',
        description: errors.join('\n'),
        variant: 'destructive',
      })
      return
    }

    setPublishingId(id)
    try {
      await publishDraftProperty(id)
      toast({
        title: 'Property published',
        description: 'The listing is now live in the Properties section.',
        variant: 'success',
      })
    } catch (error) {
      console.error('Error publishing property:', error)

      const err = error as Error & { payload?: { reasons?: Record<string, string> } }
      if (err?.message === 'validation_failed' && err.payload?.reasons) {
        const reasonMessages: Record<string, string> = {
          photos: 'Minimum of 5 photos is required before publishing.',
          geo: 'Complete property address with valid latitude and longitude is required.',
          price: 'List price must be greater than 0.',
          bedrooms: 'Bedroom count must be greater than 0.',
          bathrooms: 'Bathroom count must be greater than 0.',
          livingArea: 'Living area (square footage) must be greater than 0.',
          is_test: 'Listing is flagged as test data. Remove test keywords before publishing.',
        }

        const details = Object.entries(err.payload.reasons).map(([key, code]) => {
          const friendly = reasonMessages[key] ?? `Issue with ${key}`
          return `${friendly}${code ? ` (code: ${code})` : ''}`
        })

        toast({
          title: 'Publish blocked',
          description: details.join('\n'),
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Publish failed',
          description: 'Unexpected error publishing property. Please try again.',
          variant: 'destructive',
        })
      }
    } finally {
      setPublishingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteProperty(id)
      setSelectedListings((prev) => prev.filter((selectedId) => selectedId !== id))
      toast({
        title: 'Draft deleted',
        description: 'The draft listing has been removed.',
        variant: 'info',
      })
    } catch (error) {
      console.error('Error deleting draft listing:', error)
      toast({
        title: 'Failed to delete draft',
        description: 'Please try again shortly.',
        variant: 'destructive',
      })
    }
  }

  const IMPORT_TIMEOUT_MS = 45000

  async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('import_timeout'))
      }, timeoutMs)
    })

    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  const handleBulkUploadComplete = async (incoming: UploadDraftListing[] | UploadDraftListing) => {
    const listingsArray = Array.isArray(incoming) ? incoming : [incoming]
    const mergedListing = mergeUploadDraftListings(listingsArray)

    if (!mergedListing) {
      console.warn('No draft listings returned from upload processor.')
      return
    }

    console.log('📥 Received enhanced draft listing batch:', mergedListing)
    
    const draftListing = mergedListing
    const fileSummaryText = listingsArray.length === 1
      ? listingsArray[0]?.fileName ?? '1 file'
      : `${listingsArray.length} files`

    // Convert the enhanced draft listing format to our MLSProperty format
    const convertedProperties = draftListing.data.map((record: any, index: number) => {
      // Map the enhanced field mappings to our property structure
      const mappedProperty: Partial<MLSProperty> = {
        id: `${draftListing.id}_${index}`,
        status: 'draft',
        createdAt: draftListing.uploadDate,
        lastModified: draftListing.uploadDate,
        completionPercentage: draftListing.completionPercentage || 0,
        validationErrors: draftListing.validationErrors || []
      }

      const toTrimmedString = (input: unknown): string | undefined => {
        if (input === undefined || input === null) return undefined
        const str = typeof input === 'string' ? input.trim() : String(input).trim()
        return str.length > 0 ? str : undefined
      }

      const toNumericValue = (input: unknown): number | undefined => {
        if (input === undefined || input === null) return undefined
        if (typeof input === 'number' && Number.isFinite(input)) return input
        const cleaned = String(input).replace(/[^0-9.\-]/g, '')
        if (!cleaned) return undefined
        const num = Number(cleaned)
        return Number.isFinite(num) ? num : undefined
      }

      const toStringArray = (input: unknown): string[] | undefined => {
        if (Array.isArray(input)) {
          const filtered = input
            .map(item => toTrimmedString(item))
            .filter((item): item is string => Boolean(item))
          return filtered.length > 0 ? filtered : undefined
        }
        const str = toTrimmedString(input)
        if (!str) return undefined
        const parts = str
          .split(/[;,]/)
          .map(part => part.trim())
          .filter(Boolean)
        return parts.length > 0 ? parts : undefined
      }

      const isMeaningful = (value: unknown) => {
        if (value === undefined || value === null) return false
        if (typeof value === 'string') return value.trim().length > 0
        return true
      }

      const normalizedRecord = new Map<string, unknown>()
      Object.entries(record || {}).forEach(([key, value]) => {
        const normalizedKey = key.toLowerCase()
        if (!normalizedRecord.has(normalizedKey) && isMeaningful(value)) {
          normalizedRecord.set(normalizedKey, value)
        }

        const compactKey = normalizedKey.replace(/[^a-z0-9]/g, '')
        if (compactKey && !normalizedRecord.has(compactKey) && isMeaningful(value)) {
          normalizedRecord.set(compactKey, value)
        }
      })

      const pickValue = (...keys: string[]): unknown => {
        for (const key of keys) {
          if (key in (record || {})) {
            const direct = record[key]
            if (isMeaningful(direct)) return direct
          }
          const normalized = normalizedRecord.get(key.toLowerCase())
          if (isMeaningful(normalized)) return normalized
        }
        return undefined
      }

      const ensureString = (propertyKey: string, ...candidates: string[]) => {
        const current = toTrimmedString((mappedProperty as any)[propertyKey])
        if (!current) {
          const fallback = toTrimmedString(pickValue(...candidates))
          if (fallback) {
            (mappedProperty as any)[propertyKey] = fallback
          }
        }
      }

      const ensureNumber = (propertyKey: string, ...candidates: string[]) => {
        const current = (mappedProperty as any)[propertyKey]
        if (current === undefined || current === null) {
          const fallback = toNumericValue(pickValue(...candidates))
          if (fallback !== undefined) {
            (mappedProperty as any)[propertyKey] = fallback
          }
        }
      }

      const ensureStringArray = (propertyKey: string, ...candidates: string[]) => {
        const current = (mappedProperty as any)[propertyKey]
        if (!Array.isArray(current) || current.length === 0) {
          const fallback = toStringArray(pickValue(...candidates))
          if (fallback && fallback.length > 0) {
            (mappedProperty as any)[propertyKey] = fallback
          }
        }
      }

      const normalizePropertyTypeValue = (input: unknown): string | undefined => {
        const str = toTrimmedString(input)
        if (!str) return undefined
        const lower = str.toLowerCase()
        if (/(residential|single|condo|town|multi|duplex|villa|mobile|manufactured)/.test(lower)) return 'residential'
        if (/(commercial|office|retail|industrial|warehouse|mixed use|mixed-use)/.test(lower)) return 'commercial'
        if (/(land|lot|acre|parcel|farm|agricultural)/.test(lower)) return 'land'
        if (/(rental|lease|rent)/.test(lower)) return 'rental'
        return undefined
      }

      // Apply field mappings from the enhanced system
      draftListing.fieldMapping.forEach((mapping: any) => {
        const rawValue = record[mapping.inputField]
        if (!isMeaningful(rawValue)) {
          return
        }

        const standardName = (mapping.mlsField?.standardName || '').toString().toLowerCase()

        switch (standardName) {
          case 'mlsnumber': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.mlsNumber = value
            break
          }
          case 'status': {
            const value = toTrimmedString(rawValue)
            if (value) (mappedProperty as any).sourceStatus = value
            break
          }
          case 'listprice': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.listPrice = value
            break
          }
          case 'price': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) {
              if (mapping.inputField && /original/i.test(mapping.inputField)) {
                mappedProperty.originalListPrice = value
              } else if (mappedProperty.listPrice === undefined) {
                mappedProperty.listPrice = value
              }
            }
            break
          }
          case 'originallistprice':
          case 'previousprice':
          case 'priceoriginal': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.originalListPrice = value
            break
          }
          case 'propertytype': {
            const value = toTrimmedString(rawValue)
            if (value) {
              mappedProperty.propertyType = value
              ;(mappedProperty as any).rawPropertyType = value
            }
            break
          }
          case 'propertycategory': {
            const value = toTrimmedString(rawValue)
            if (value) {
              mappedProperty.propertyType = mappedProperty.propertyType || value
              ;(mappedProperty as any).PropertyCategory = value
            }
            break
          }
          case 'propertysubtype': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.propertySubType = value
            break
          }
          case 'architecturalstyle': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.architecturalStyle = value
            break
          }
          case 'yearbuilt': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.yearBuilt = value
            break
          }
          case 'livingarea':
          case 'livingareasqft':
          case 'buildingareatotal': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.livingAreaSqFt = value
            break
          }
          case 'bedroomstotal':
          case 'bedrooms': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.bedrooms = value
            break
          }
          case 'bathroomstotal': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) {
              mappedProperty.bathroomsTotal = value
              if (mappedProperty.bathrooms === undefined) {
                mappedProperty.bathrooms = value
              }
            }
            break
          }
          case 'bathroomsfull':
          case 'bathrooms': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.bathrooms = value
            break
          }
          case 'bathroomshalf': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.bathroomsHalf = value
            break
          }
          case 'bathroomsthreequarter': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.bathroomsThreeQuarter = value
            break
          }
          case 'lotsizeacres':
          case 'acres': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.lotSizeAcres = value
            break
          }
          case 'storiestotal':
          case 'stories': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.stories = value
            break
          }
          case 'streetnumber': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.streetNumber = value
            break
          }
          case 'streetname': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.streetName = value
            break
          }
          case 'streetsuffix': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.streetSuffix = value
            break
          }
          case 'streetline':
          case 'streetaddress':
          case 'address': {
            const value = toTrimmedString(rawValue)
            if (value) (mappedProperty as any).streetLine = value
            break
          }
          case 'city': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.city = value
            break
          }
          case 'state':
          case 'stateorprovince':
          case 'province': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.state = value
            break
          }
          case 'zip':
          case 'zipcode':
          case 'postalcode': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.zipCode = value
            break
          }
          case 'zipplus4': {
            const value = toTrimmedString(rawValue)
            if (value) (mappedProperty as any).zipPlus4 = value
            break
          }
          case 'county':
          case 'countyorparish': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.county = value
            break
          }
          case 'subdivision':
          case 'subdivisionname':
          case 'neighborhood': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.subdivision = value
            break
          }
          case 'parcelid':
          case 'apn': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.parcelID = value
            break
          }
          case 'latitude':
          case 'lat': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) (mappedProperty as any).latitude = value
            break
          }
          case 'longitude':
          case 'long':
          case 'lng': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) (mappedProperty as any).longitude = value
            break
          }
          case 'lotsizesqft':
          case 'lotsize':
          case 'lotsquarefeet': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.lotSize = value
            break
          }
          case 'lotsizeacres':
          case 'acres': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.lotSizeAcres = value
            break
          }
          case 'garagespaces':
          case 'garage': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.garageSpaces = value
            break
          }
          case 'taxesannual':
          case 'taxamount':
          case 'taxes': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.taxes = value
            break
          }
          case 'taxyear': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.taxYear = value
            break
          }
          case 'associationfee':
          case 'hoafee':
          case 'hoa': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.hoaFee = value
            break
          }
          case 'listingagentname':
          case 'listingagentfullname':
          case 'agentname': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingAgentName = value
            break
          }
          case 'listingagentlicense':
          case 'agentlicense': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingAgentLicense = value
            break
          }
          case 'listingagentphone':
          case 'agentphone': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingAgentPhone = value
            break
          }
          case 'listingagentemail':
          case 'agentemail': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingAgentEmail = value
            break
          }
          case 'listingofficename':
          case 'brokerage':
          case 'office': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.brokerage = value
            break
          }
          case 'listingofficelicense':
          case 'brokeragelicense':
          case 'officelicense': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.brokerageLicense = value
            break
          }
          case 'photourls':
          case 'photos': {
            const value = toStringArray(rawValue)
            if (value) mappedProperty.photos = value
            break
          }
          case 'publicremarks':
          case 'remarks':
          case 'description': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.publicRemarks = value
            break
          }
          case 'brokerremarks':
          case 'privateremarks': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.brokerRemarks = value
            break
          }
          case 'showinginstructions': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.showingInstructions = value
            break
          }
          case 'flooring': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.flooring = value
            break
          }
          case 'poolfeatures':
          case 'featurepool': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.poolFeatures = value
            break
          }
          case 'garagetype': {
            const value = toTrimmedString(rawValue)
            if (value) (mappedProperty as any).garageType = value
            break
          }
          case 'interiorfeatures':
          case 'interior': {
            const value = toTrimmedString(rawValue)
            if (value) (mappedProperty as any).interiorFeatures = value
            break
          }
          case 'appliances': {
            const value = toTrimmedString(rawValue)
            if (value) (mappedProperty as any).appliances = value
            break
          }
          case 'fireplacefeatures': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.fireplaceFeatures = value
            break
          }
          case 'kitchenfeatures':
          case 'features': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.kitchenFeatures = value
            break
          }
          case 'primarysuite': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.primarySuite = value
            break
          }
          case 'laundryfeatures': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.laundryFeatures = value
            break
          }
          case 'laundry': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.laundryFeatures = value
            break
          }
          case 'constructionmaterials': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.constructionMaterials = value
            break
          }
          case 'construction': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.constructionMaterials = value
            break
          }
          case 'roof': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.roofType = value
            break
          }
          case 'foundationdetails': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.foundationDetails = value
            break
          }
          case 'foundation': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.foundationDetails = value
            break
          }
          case 'exteriorfeatures': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.exteriorFeatures = value
            break
          }
          case 'view': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.propertyView = value
            break
          }
          case 'watersource': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.waterSource = value
            break
          }
          case 'sewer': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.sewerSystem = value
            break
          }
          case 'heatingtype':
          case 'heating': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.heatingType = value
            break
          }
          case 'coolingtype':
          case 'cooling': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.coolingType = value
            break
          }
          default:
            break
        }
      })

      // Fallbacks: hydrate critical fields even if the fuzzy mapping used aliases
      ensureString('mlsNumber', 'mlsnumber', 'mls', 'mlsid', 'mls#', 'id')
      ensureNumber('listPrice', 'listprice', 'price', 'askingprice')
      ensureNumber('originalListPrice', 'originallistprice', 'originalprice', 'previousprice', 'priceprevious')
      ensureString('propertyType', 'propertytype', 'propertycategory', 'type')
      ensureString('propertySubType', 'propertysubtype', 'subtype')
      ensureString('architecturalStyle', 'architecturalstyle', 'style')
      ensureNumber('yearBuilt', 'yearbuilt', 'yrbuilt', 'built')
      ensureNumber('livingAreaSqFt', 'livingareasqft', 'livingarea', 'sqft', 'livingsqft', 'buildingareatotal', 'totalsqft')
      ensureNumber('bedrooms', 'bedroomstotal', 'bedrooms', 'beds')
      ensureNumber('bathrooms', 'bathroomstotal', 'bathrooms', 'baths', 'bathroomsfull')
      ensureNumber('bathroomsHalf', 'bathroomshalf', 'bathshalf', 'halfbaths')
      ensureNumber('bathroomsThreeQuarter', 'bathroomsthreequarter', 'threequarterbaths')
      ensureNumber('stories', 'stories', 'storiestotal')
      ensureString('streetNumber', 'streetnumber', 'street_no', 'stnumber')
      ensureString('streetName', 'streetname', 'street', 'streetline')
      ensureString('streetSuffix', 'streetsuffix', 'suffix')
      ensureString('city', 'city', 'town', 'municipality')
      ensureString('state', 'state', 'stateorprovince', 'province')
      ensureString('zipCode', 'zipcode', 'postalcode', 'zip')
      ensureString('county', 'county', 'countyorparish')
      ensureString('subdivision', 'subdivision', 'subdivisionname', 'neighborhood')
      ensureString('parcelID', 'parcelid', 'apn', 'strap', 'parcel')
      ensureNumber('latitude', 'latitude', 'lat')
      ensureNumber('longitude', 'longitude', 'long', 'lng')
      ensureNumber('lotSize', 'lotsizesqft', 'lotsize', 'lotsquarefeet')
      ensureNumber('lotSizeAcres', 'lotsizeacres', 'acres')
      ensureNumber('garageSpaces', 'garagespaces', 'garage')
      ensureString('garageType', 'garagetype')
      ensureNumber('taxes', 'taxesannual', 'taxamount', 'taxes', 'annualtaxes')
      ensureNumber('taxYear', 'taxyear')
      ensureNumber('hoaFee', 'associationfee', 'hoafee', 'hoa')
      ensureString('listingAgentName', 'listingagentname', 'listingagentfullname', 'agentname')
      ensureString('listingAgentLicense', 'listingagentlicense', 'agentlicense')
      ensureString('listingAgentPhone', 'listingagentphone', 'agentphone')
      ensureString('listingAgentEmail', 'listingagentemail', 'agentemail')
      ensureString('brokerage', 'listingofficename', 'brokerage', 'office')
      ensureString('brokerageLicense', 'listingofficelicense', 'brokeragelicense', 'officelicense')
      ensureStringArray('photos', 'photourls', 'photos', 'imageurls', 'images')
      ensureString('publicRemarks', 'publicremarks', 'remarks', 'description', 'publicdescription')
      ensureString('brokerRemarks', 'brokerremarks', 'privateremarks')
      ensureString('showingInstructions', 'showinginstructions')
      ensureString('flooring', 'flooring')
      ensureString('poolFeatures', 'poolfeatures', 'pool', 'featurepool')
      ensureString('fireplaceFeatures', 'fireplacefeatures')
      ensureString('kitchenFeatures', 'kitchenfeatures')
      ensureString('primarySuite', 'primarysuite')
      ensureString('laundryFeatures', 'laundryfeatures', 'laundry')
      ensureString('interiorFeatures', 'interiorfeatures', 'interior')
      ensureString('appliances', 'appliances')
      ensureString('constructionMaterials', 'constructionmaterials', 'construction')
      ensureString('roofType', 'roof')
      ensureString('foundationDetails', 'foundationdetails', 'foundation')
      ensureString('exteriorFeatures', 'exteriorfeatures')
      ensureString('propertyView', 'view')
      ensureString('waterSource', 'watersource')
      ensureString('sewerSystem', 'sewer', 'sewersystem', 'septic')
      ensureString('heatingType', 'heating', 'heatingtype')
      ensureString('coolingType', 'cooling', 'coolingtype')

      const propertyCategoryValue = toTrimmedString(pickValue('propertycategory', 'propertytype', 'type'))
      if (propertyCategoryValue && !toTrimmedString(mappedProperty.propertyType)) {
        mappedProperty.propertyType = propertyCategoryValue
      }
      if (propertyCategoryValue) {
        ;(mappedProperty as any).PropertyCategory = propertyCategoryValue
      }

      const parcelIdentifier = toTrimmedString(pickValue('parcelid', 'parcel', 'apn', 'strap'))
      if (parcelIdentifier) {
        mappedProperty.parcelID = mappedProperty.parcelID || parcelIdentifier
        ;(mappedProperty as any).ParcelID = parcelIdentifier
      }

      const appliancesValue = toTrimmedString(pickValue('appliances'))
      if (appliancesValue) {
        if (!(mappedProperty as any).appliances) {
          (mappedProperty as any).appliances = appliancesValue
        }
        if (!toTrimmedString(mappedProperty.kitchenFeatures)) {
          mappedProperty.kitchenFeatures = appliancesValue
        }
      }

      const normalizedType = normalizePropertyTypeValue(
        mappedProperty.propertyType ||
        (mappedProperty as any).rawPropertyType ||
        (mappedProperty as any).PropertyCategory
      )
      if (normalizedType) {
        mappedProperty.propertyType = normalizedType
      }
      if (!mappedProperty.propertySubType) {
        const rawType = toTrimmedString((mappedProperty as any).rawPropertyType)
        if (rawType && (!normalizedType || rawType.toLowerCase() !== normalizedType)) {
          mappedProperty.propertySubType = rawType
        } else {
          const rawCategory = toTrimmedString((mappedProperty as any).PropertyCategory)
          if (rawCategory && (!normalizedType || rawCategory.toLowerCase() !== normalizedType)) {
            mappedProperty.propertySubType = rawCategory
          }
        }
      }

      const streetLineFallback = toTrimmedString(pickValue('streetline', 'streetaddress', 'address'))
      if (streetLineFallback) {
        const detailed = streetLineFallback
        const exactMatch = detailed.match(/^\s*(\d+[A-Za-z]?)\s+(.+?)\s+([A-Za-z\.]+)\s*$/)
        if (exactMatch) {
          if (!toTrimmedString(mappedProperty.streetNumber)) mappedProperty.streetNumber = exactMatch[1]
          if (!toTrimmedString(mappedProperty.streetName)) mappedProperty.streetName = exactMatch[2]
          if (!toTrimmedString(mappedProperty.streetSuffix)) mappedProperty.streetSuffix = exactMatch[3]
        } else {
          const parts = detailed.split(/\s+/)
          if (!toTrimmedString(mappedProperty.streetNumber) && /^\d/.test(parts[0] || '')) {
            mappedProperty.streetNumber = parts[0]
          }
          if (!toTrimmedString(mappedProperty.streetSuffix) && parts.length > 2) {
            const suffixCandidate = parts[parts.length - 1]?.trim()
            if (suffixCandidate) mappedProperty.streetSuffix = suffixCandidate
          }
          if (!toTrimmedString(mappedProperty.streetName)) {
            const nameCandidate = parts.slice(1, parts.length - 1).join(' ').trim() || parts.slice(1).join(' ').trim()
            if (nameCandidate) mappedProperty.streetName = nameCandidate
          }
        }
      }

      // Ensure required fields have defaults
      return {
        id: mappedProperty.id || `draft_${Date.now()}_${index}`,
        mlsNumber: mappedProperty.mlsNumber || '',
        status: 'draft',
        listPrice: mappedProperty.listPrice || 0,
        originalListPrice: mappedProperty.originalListPrice,
        propertyType: mappedProperty.propertyType || '',
        propertySubType: mappedProperty.propertySubType,
        architecturalStyle: mappedProperty.architecturalStyle,
        yearBuilt: mappedProperty.yearBuilt || 0,
        livingAreaSqFt: mappedProperty.livingAreaSqFt || 0,
        bedrooms: mappedProperty.bedrooms || 0,
        bathrooms: mappedProperty.bathrooms || 0,
        bathroomsTotal: mappedProperty.bathroomsTotal,
        bathroomsHalf: mappedProperty.bathroomsHalf,
        bathroomsThreeQuarter: mappedProperty.bathroomsThreeQuarter,
        stories: mappedProperty.stories,
        streetNumber: mappedProperty.streetNumber || '',
        streetName: mappedProperty.streetName || '',
        streetSuffix: mappedProperty.streetSuffix || '',
        city: mappedProperty.city || '',
        state: mappedProperty.state || '',
        zipCode: mappedProperty.zipCode || '',
        county: mappedProperty.county || '',
        subdivision: mappedProperty.subdivision,
        parcelID: mappedProperty.parcelID,
        latitude: (mappedProperty as any).latitude,
        longitude: (mappedProperty as any).longitude,
        lotSize: mappedProperty.lotSize || 0,
        lotSizeAcres: mappedProperty.lotSizeAcres,
        garageSpaces: mappedProperty.garageSpaces,
        garageType: (mappedProperty as any).garageType,
        taxes: mappedProperty.taxes,
        taxYear: mappedProperty.taxYear,
        hoaFee: mappedProperty.hoaFee,
        listingAgentName: mappedProperty.listingAgentName || '',
        listingAgentLicense: mappedProperty.listingAgentLicense || '',
        listingAgentPhone: mappedProperty.listingAgentPhone || '',
        listingAgentEmail: mappedProperty.listingAgentEmail,
        brokerage: mappedProperty.brokerage || '',
        brokerageLicense: mappedProperty.brokerageLicense,
        photos: mappedProperty.photos || [],
        publicRemarks: mappedProperty.publicRemarks,
        brokerRemarks: mappedProperty.brokerRemarks,
        showingInstructions: mappedProperty.showingInstructions,
        // Feature fields
        flooring: mappedProperty.flooring,
        poolFeatures: mappedProperty.poolFeatures,
        fireplaceFeatures: mappedProperty.fireplaceFeatures,
        kitchenFeatures: mappedProperty.kitchenFeatures,
        primarySuite: mappedProperty.primarySuite,
        laundryFeatures: mappedProperty.laundryFeatures,
        interiorFeatures: (mappedProperty as any).interiorFeatures,
        appliances: (mappedProperty as any).appliances,
        constructionMaterials: mappedProperty.constructionMaterials,
        roofType: mappedProperty.roofType,
        foundationDetails: mappedProperty.foundationDetails,
        exteriorFeatures: mappedProperty.exteriorFeatures,
        propertyView: mappedProperty.propertyView,
        waterSource: mappedProperty.waterSource,
        sewerSystem: mappedProperty.sewerSystem,
        heatingType: mappedProperty.heatingType,
        coolingType: mappedProperty.coolingType,
        createdAt: mappedProperty.createdAt || new Date().toISOString(),
        lastModified: mappedProperty.lastModified || new Date().toISOString(),
        completionPercentage: mappedProperty.completionPercentage || 0,
        validationErrors: mappedProperty.validationErrors || []
      } as MLSProperty
    })

    console.log('🔄 Converted properties with enhanced fields:', convertedProperties)
    if (convertedProperties.length > 0) {
      console.log('🧾 First converted property preview:', {
        propertyType: convertedProperties[0].propertyType,
        propertySubType: convertedProperties[0].propertySubType,
        parcelID: (convertedProperties[0] as any).parcelID,
        parcelIdAlt: (convertedProperties[0] as any).parcelId,
        lotSizeAcres: convertedProperties[0].lotSizeAcres,
        garageType: (convertedProperties[0] as any).garageType,
        appliances: (convertedProperties[0] as any).appliances,
        laundryFeatures: convertedProperties[0].laundryFeatures,
        constructionMaterials: convertedProperties[0].constructionMaterials,
        foundationDetails: convertedProperties[0].foundationDetails,
        architecturalStyle: convertedProperties[0].architecturalStyle,
        kitchenFeatures: convertedProperties[0].kitchenFeatures,
        flooring: convertedProperties[0].flooring,
        poolFeatures: convertedProperties[0].poolFeatures,
        sourceKeys: Object.keys(convertedProperties[0])
      })
    }
    
    setIsImportingDrafts(true)

    try {
      const { created, duplicates, warnings } = await runWithTimeout(
        addDraftProperties(convertedProperties),
        IMPORT_TIMEOUT_MS
      )

      setShowBulkUpload(false)

      if (created.length > 0) {
        toast({
          title: 'Draft listings imported',
          description: `Successfully imported ${created.length} propert${created.length === 1 ? 'y' : 'ies'} from ${fileSummaryText}.`,
          variant: 'info',
        })
      }

      if (duplicates.length > 0) {
        const duplicateDetails = duplicates
          .map((dup) => {
            const identifier = dup.mlsNumber && dup.mlsNumber.trim().length > 0
              ? `MLS ${dup.mlsNumber}`
              : dup.address || 'Listing'
            const reasonLabel = dup.reason === 'batch_duplicate'
              ? 'duplicate in upload file'
              : 'already exists'
            return `${identifier} (${reasonLabel})`
          })
          .join(', ')

        toast({
          title: 'Duplicate listings skipped',
          description: duplicateDetails,
          variant: 'destructive',
        })
      }

      if (warnings?.timeouts || warnings?.failures) {
        const parts: string[] = []
        if (warnings.timeouts) {
          parts.push(`${warnings.timeouts} listing${warnings.timeouts === 1 ? '' : 's'} timed out`)
        }
        if (warnings.failures) {
          parts.push(`${warnings.failures} listing${warnings.failures === 1 ? '' : 's'} failed to reach Supabase`)
        }

        toast({
          title: 'Import completed with warnings',
          description: `${parts.join(' and ')}. They remain saved locally—retry once your connection stabilizes.`,
          variant: 'info',
        })
      }
    } catch (error) {
      console.error('Failed to import draft listings', error)

      const message = (() => {
        if (error instanceof Error) {
          if (error.message === 'import_timeout') {
            return 'Import is taking longer than expected. Please check your network connection and try again.'
          }
          return error.message
        }
        return 'An unexpected error occurred while importing listings.'
      })()

      toast({
        title: 'Import failed',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsImportingDrafts(false)
    }
  }

  const updateEditingProperty = (field: keyof MLSProperty, value: any) => {
    if (editingProperty) {
      setEditingProperty({
        ...editingProperty,
        [field]: value
      })
    }
  }

  const handlePhotosChange = (photos: string[]) => {
    if (editingProperty) {
      setEditingProperty({
        ...editingProperty,
        photos
      })
    }
  }

  // Bulk selection functions
  const handleSelectListing = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedListings((prev) => Array.from(new Set([...prev, id])))
    } else {
      setSelectedListings((prev) => prev.filter(listingId => listingId !== id))
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const ids = filteredDraftListings.map(listing => listing.id)
      setSelectedListings((prev) => Array.from(new Set([...prev, ...ids])))
    } else {
      setSelectedListings((prev) => prev.filter(id => !filteredDraftListings.some(listing => listing.id === id)))
    }
  }

  const handleBulkDelete = () => {
    setShowBulkDeleteConfirm(true)
  }

  const confirmBulkDelete = async () => {
    if (selectedListings.length === 0) {
      setShowBulkDeleteConfirm(false)
      return
    }

    const idsToDelete = [...selectedListings]
    const results = await Promise.allSettled(idsToDelete.map((id) => deleteProperty(id)))
    const failed = idsToDelete.filter((_, index) => results[index].status === 'rejected')

    setSelectedListings((prev) => prev.filter((id) => failed.includes(id)))
    setShowBulkDeleteConfirm(false)

    if (failed.length === 0) {
      toast({
        title: 'Drafts deleted',
        description: `${idsToDelete.length} draft${idsToDelete.length === 1 ? '' : 's'} removed.`,
        variant: 'info',
      })
    } else {
      toast({
        title: 'Some drafts could not be deleted',
        description: `${failed.length} draft${failed.length === 1 ? '' : 's'} still need attention. Try again or refresh.`,
        variant: 'destructive',
      })
    }
  }

  const isAllSelected = filteredDraftListings.length > 0 && filteredDraftListings.every(listing => selectedListings.includes(listing.id))
  const isIndeterminate = filteredDraftListings.length > 0 && !isAllSelected && filteredDraftListings.some(listing => selectedListings.includes(listing.id))

  return (
    <div className="relative min-h-screen bg-gray-50 p-6 space-y-6">
      {isImportingDrafts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="text-sm font-medium text-gray-700">
              Processing uploaded listings...
            </span>
          </div>
        </div>
      )}
      {/* Header */}
      <motion.div 
        className="flex justify-between items-center"
        initial={getInitialState('headerVariant')}
        animate="visible"
        variants={pageVariants.headerVariant}
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Draft Listings</h1>
          <p className="text-gray-600">
            Manage your property listings in progress ({filteredDraftListings.length} of {draftListings.length} drafts)
          </p>
        </div>
        <div className="flex gap-3">
          <motion.div {...buttonHoverVariant}>
            <Button variant="outline" onClick={() => setShowFiltersDialog(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Filter
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">{activeFilterCount}</Badge>
              )}
            </Button>
          </motion.div>
          <motion.div {...buttonHoverVariant}>
            <Button onClick={() => setShowBulkUpload(true)} className="bg-blue-600 hover:bg-blue-700">
              <Upload className="w-4 h-4 mr-2" />
              Upload Listings
            </Button>
          </motion.div>
          <motion.div {...buttonHoverVariant}>
            <Button onClick={openNewDraftDialog}>
              <Plus className="w-4 h-4 mr-2" />
              New Draft
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Bulk Actions Bar */}
      {filteredDraftListings.length > 0 && (
        <motion.div 
          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
          initial={getInitialState('contentVariant')}
          animate="visible"
          variants={pageVariants.contentVariant}
        >
          <div className="flex items-center space-x-4">
            <Checkbox
              checked={isAllSelected}
              ref={(el) => {
                if (el) el.indeterminate = isIndeterminate
              }}
              onCheckedChange={handleSelectAll}
            />
            <span className="text-sm text-gray-600">
              {selectedListings.length === 0 
                ? 'Select listings for bulk actions'
                : `${selectedListings.length} selected`
              }
            </span>
          </div>
          
          {selectedListings.length > 0 && (
            <div className="flex gap-2">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleBulkDelete}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedListings.length})
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {/* Draft listings grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDraftListings.map((draft, index) => {
          const errors = validateProperty(draft)
          const canPublish = errors.length === 0
          const isPublishing = publishingId === draft.id
          
          return (
            <motion.div
              key={draft.id}
              custom={index}
              initial={getInitialState('cardVariant')}
              animate="visible"
              variants={pageVariants.cardVariant}
              {...cardHoverVariant}
            >
              <Card className={`shadow-md hover:shadow-xl transition-shadow h-full ${selectedListings.includes(draft.id) ? 'ring-2 ring-blue-500' : ''}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={selectedListings.includes(draft.id)}
                      onCheckedChange={(checked) => handleSelectListing(draft.id, checked as boolean)}
                    />
                    <Badge className={getStatusColor(draft.status)}>
                      {draft.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-500">
                    {calculateCompletionPercentage(draft)}% complete
                  </div>
                </div>
                <CardTitle className="text-lg line-clamp-2">
                  {draft.streetNumber} {draft.streetName} {draft.streetSuffix}
                </CardTitle>
                <CardDescription className="line-clamp-1">
                  {draft.city}, {draft.state} {draft.zipCode}
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatPrice(draft.listPrice)}
                    </div>
                    <div className="text-sm text-gray-500">
                      Modified {formatDate(draft.lastModified)}
                    </div>
                  </div>

                  {/* Property Details */}
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>🛏️ {draft.bedrooms} beds • 🚿 {draft.bathrooms} baths</div>
                    {draft.bathroomsHalf && <div>🚽 {draft.bathroomsHalf} half baths</div>}
                    <div>📐 {draft.livingAreaSqFt?.toLocaleString()} sq ft</div>
                    <div>🏠 {draft.propertyType} {draft.propertySubType && `• ${draft.propertySubType}`}</div>
                    {draft.architecturalStyle && <div>🏛️ {draft.architecturalStyle}</div>}
                    {draft.stories && <div>🏢 {draft.stories} stories</div>}
                    {draft.parcelID && <div>📋 Parcel: {draft.parcelID}</div>}
                    <div>📸 {draft.photos?.length || 0}/{MIN_PROPERTY_PHOTOS} photos</div>
                    {errors.length > 0 && (
                      <div className="flex items-center text-red-600 text-xs">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {errors.length} validation error(s)
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${calculateCompletionPercentage(draft)}%` }}
                    ></div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handleEdit(draft)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handlePreview(draft)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Preview
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="sm" 
                          className="flex-1"
                          disabled={!canPublish || isPublishing}
                        >
                          {isPublishing ? (
                            <>
                              <div className="w-4 h-4 mr-1 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Publishing...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-1" />
                              Publish
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Publish this listing?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Publishing will make this listing visible to clients. Confirm that all required data and media are complete before proceeding.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => { void handlePublish(draft.id) }}
                            disabled={isPublishing}
                          >
                            Publish listing
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          disabled={isPublishing}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete draft listing?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. The draft and its data will be permanently removed.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={() => { void handleDelete(draft.id) }}
                          >
                            Delete draft
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          )
        })}
      </div>

      {/* Empty State */}
      {draftListings.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No draft listings</h3>
          <p className="text-gray-600 mb-6">Nothing here… yet. Be the first to change that.</p>
          <Button onClick={() => setShowBulkUpload(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Your First Listings
          </Button>
        </div>
      )}

      {/* Property Preview Dialog */}
      <PropertyPreview
        property={previewProperty}
        isOpen={showPreviewDialog}
        onClose={() => {
          setShowPreviewDialog(false)
          setPreviewProperty(null)
        }}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedListings.length} selected draft listing(s)? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmBulkDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete {selectedListings.length} Listings
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <BulkListingUpload
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onUploadComplete={handleBulkUploadComplete}
      />

      {/* Filters Dialog */}
      <Dialog open={showFiltersDialog} onOpenChange={setShowFiltersDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filter Draft Listings</DialogTitle>
            <DialogDescription>Refine the draft listings displayed below.</DialogDescription>
          </DialogHeader>
          <PropertyFiltersComponent
            filters={filters}
            onFiltersChange={setFilters}
            agents={agentsOptions}
            onSavePreset={(name, presetFilters) => {
              setSavedFilterPresets((prev) => {
                const filtered = prev.filter((preset) => preset.name.toLowerCase() !== name.toLowerCase())
                return [...filtered, { name, filters: cloneFilters(presetFilters) }]
              })
            }}
            onLoadPreset={(presetFilters) => {
              setFilters(cloneFilters(presetFilters))
            }}
            savedPresets={savedFilterPresets}
            propertyCount={filteredDraftListings.length}
            totalCount={draftListings.length}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Property Dialog with MLS Fields */}
      <Dialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open)
          if (!open) {
            setEditingProperty(null)
            setIsNewDraft(false)
          }
        }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Property Listing</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          
          {editingProperty && (
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="basic" className="flex items-center gap-1">
                  <Home className="w-3 h-3" />
                  Basic
                </TabsTrigger>
                <TabsTrigger value="location" className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Location
                </TabsTrigger>
                <TabsTrigger value="features" className="flex items-center gap-1">
                  <Settings className="w-3 h-3" />
                  Features
                </TabsTrigger>
                <TabsTrigger value="financial" className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Financial
                </TabsTrigger>
                <TabsTrigger value="agent" className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  Agent Info
                </TabsTrigger>
                <TabsTrigger value="media" className="flex items-center gap-1">
                  <FileImage className="w-3 h-3" />
                  Media
                </TabsTrigger>
              </TabsList>

              {/* Basic Information Tab */}
              <TabsContent value="basic" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="listPrice">List Price *</Label>
                    <Input
                      id="listPrice"
                      type="number"
                      value={editingProperty.listPrice}
                      onChange={(e) => updateEditingProperty('listPrice', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="propertyType">Property Type *</Label>
                    <Select 
                      value={editingProperty.propertyType} 
                      onValueChange={(value) => updateEditingProperty('propertyType', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="residential">Residential</SelectItem>
                        <SelectItem value="commercial">Commercial</SelectItem>
                        <SelectItem value="land">Land</SelectItem>
                        <SelectItem value="rental">Rental</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="propertySubType">Property Sub Type</Label>
                    <Input
                      id="propertySubType"
                      value={editingProperty.propertySubType || ''}
                      onChange={(e) => updateEditingProperty('propertySubType', e.target.value)}
                      placeholder="e.g., Single Family, Condo, Townhouse"
                    />
                  </div>
                  <div>
                    <Label htmlFor="architecturalStyle">Architectural Style</Label>
                    <Input
                      id="architecturalStyle"
                      value={editingProperty.architecturalStyle || ''}
                      onChange={(e) => updateEditingProperty('architecturalStyle', e.target.value)}
                      placeholder="e.g., Colonial, Modern, Ranch"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="bedrooms">Bedrooms *</Label>
                    <Input
                      id="bedrooms"
                      type="number"
                      value={editingProperty.bedrooms || ''}
                      onChange={(e) => updateEditingProperty('bedrooms', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bathrooms">Full Bathrooms *</Label>
                    <Input
                      id="bathrooms"
                      type="number"
                      step="0.5"
                      value={editingProperty.bathrooms || ''}
                      onChange={(e) => updateEditingProperty('bathrooms', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bathroomsHalf">Half Bathrooms</Label>
                    <Input
                      id="bathroomsHalf"
                      type="number"
                      value={editingProperty.bathroomsHalf || ''}
                      onChange={(e) => updateEditingProperty('bathroomsHalf', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="stories">Stories</Label>
                    <Input
                      id="stories"
                      type="number"
                      value={editingProperty.stories || ''}
                      onChange={(e) => updateEditingProperty('stories', parseInt(e.target.value) || 0)}
                      placeholder="1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="livingAreaSqFt">Living Area (sq ft) *</Label>
                    <Input
                      id="livingAreaSqFt"
                      type="number"
                      value={editingProperty.livingAreaSqFt || ''}
                      onChange={(e) => updateEditingProperty('livingAreaSqFt', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="yearBuilt">Year Built *</Label>
                    <Input
                      id="yearBuilt"
                      type="number"
                      value={editingProperty.yearBuilt || ''}
                      onChange={(e) => updateEditingProperty('yearBuilt', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="lotSize">Lot Size (sq ft) *</Label>
                  <Input
                    id="lotSize"
                    type="number"
                    value={editingProperty.lotSize || ''}
                    onChange={(e) => updateEditingProperty('lotSize', parseInt(e.target.value) || 0)}
                  />
                </div>
              </TabsContent>

              {/* Location Tab with Parcel ID */}
              <TabsContent value="location" className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="streetNumber">Street Number *</Label>
                    <Input
                      id="streetNumber"
                      value={editingProperty.streetNumber || ''}
                      onChange={(e) => updateEditingProperty('streetNumber', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="streetName">Street Name *</Label>
                    <Input
                      id="streetName"
                      value={editingProperty.streetName || ''}
                      onChange={(e) => updateEditingProperty('streetName', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="streetSuffix">Street Suffix *</Label>
                    <Input
                      id="streetSuffix"
                      value={editingProperty.streetSuffix || ''}
                      onChange={(e) => updateEditingProperty('streetSuffix', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={editingProperty.city}
                      onChange={(e) => updateEditingProperty('city', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      value={editingProperty.state}
                      onChange={(e) => updateEditingProperty('state', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="zipCode">ZIP Code *</Label>
                    <Input
                      id="zipCode"
                      value={editingProperty.zipCode}
                      onChange={(e) => updateEditingProperty('zipCode', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="county">County *</Label>
                    <Input
                      id="county"
                      value={editingProperty.county || ''}
                      onChange={(e) => updateEditingProperty('county', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="subdivision">Subdivision</Label>
                    <Input
                      id="subdivision"
                      value={editingProperty.subdivision || ''}
                      onChange={(e) => updateEditingProperty('subdivision', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="parcelID">Parcel ID</Label>
                    <Input
                      id="parcelID"
                      value={editingProperty.parcelID || ''}
                      onChange={(e) => updateEditingProperty('parcelID', e.target.value)}
                      placeholder="Tax Parcel Number"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="latitude">Latitude *</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="0.000001"
                      value={editingProperty.latitude ?? ''}
                      onChange={(e) => {
                        const value = e.target.value
                        updateEditingProperty('latitude', value === '' ? undefined : parseFloat(value))
                      }}
                      placeholder="28.538336"
                    />
                  </div>
                  <div>
                    <Label htmlFor="longitude">Longitude *</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="0.000001"
                      value={editingProperty.longitude ?? ''}
                      onChange={(e) => {
                        const value = e.target.value
                        updateEditingProperty('longitude', value === '' ? undefined : parseFloat(value))
                      }}
                      placeholder="-81.379234"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Features Tab */}
              <TabsContent value="features" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="garageSpaces">Garage Spaces</Label>
                    <Input
                      id="garageSpaces"
                      type="number"
                      value={editingProperty.garageSpaces || ''}
                      onChange={(e) => updateEditingProperty('garageSpaces', parseInt(e.target.value) || undefined)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="flooring">Flooring</Label>
                    <Input
                      id="flooring"
                      value={editingProperty.flooring || ''}
                      onChange={(e) => updateEditingProperty('flooring', e.target.value)}
                      placeholder="e.g., Hardwood, Carpet, Tile"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="garageType">Garage Type</Label>
                    <Input
                      id="garageType"
                      value={editingProperty.garageType || ''}
                      onChange={(e) => updateEditingProperty('garageType', e.target.value)}
                      placeholder="e.g., Attached, Detached, Carport"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="poolFeatures">Pool Features</Label>
                    <Input
                      id="poolFeatures"
                      value={editingProperty.poolFeatures || ''}
                      onChange={(e) => updateEditingProperty('poolFeatures', e.target.value)}
                      placeholder="e.g., In-ground, Heated, Salt Water"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fireplaceFeatures">Fireplace Features</Label>
                    <Input
                      id="fireplaceFeatures"
                      value={editingProperty.fireplaceFeatures || ''}
                      onChange={(e) => updateEditingProperty('fireplaceFeatures', e.target.value)}
                      placeholder="e.g., Gas, Wood Burning, Electric"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="kitchenFeatures">Kitchen Features</Label>
                    <Input
                      id="kitchenFeatures"
                      value={editingProperty.kitchenFeatures || ''}
                      onChange={(e) => updateEditingProperty('kitchenFeatures', e.target.value)}
                      placeholder="e.g., Granite Counters, Stainless Appliances"
                    />
                  </div>
                  <div>
                    <Label htmlFor="primarySuite">Primary Suite</Label>
                    <Input
                      id="primarySuite"
                      value={editingProperty.primarySuite || ''}
                      onChange={(e) => updateEditingProperty('primarySuite', e.target.value)}
                      placeholder="e.g., Walk-in Closet, En-suite Bath"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="laundryFeatures">Laundry Features</Label>
                    <Input
                      id="laundryFeatures"
                      value={editingProperty.laundryFeatures || ''}
                      onChange={(e) => updateEditingProperty('laundryFeatures', e.target.value)}
                      placeholder="e.g., Laundry Room, Washer/Dryer Included"
                    />
                  </div>
                  <div>
                    <Label htmlFor="appliances">Appliances</Label>
                    <Input
                      id="appliances"
                      value={editingProperty.appliances || ''}
                      onChange={(e) => updateEditingProperty('appliances', e.target.value)}
                      placeholder="e.g., Dishwasher, Disposal, Microwave, Range, Refrigerator"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="constructionMaterials">Construction Materials</Label>
                    <Input
                      id="constructionMaterials"
                      value={editingProperty.constructionMaterials || ''}
                      onChange={(e) => updateEditingProperty('constructionMaterials', e.target.value)}
                      placeholder="e.g., Brick, Vinyl Siding, Stone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="interiorFeatures">Interior Features</Label>
                    <Input
                      id="interiorFeatures"
                      value={editingProperty.interiorFeatures || ''}
                      onChange={(e) => updateEditingProperty('interiorFeatures', e.target.value)}
                      placeholder="e.g., Walk-In Closet, Pantry, Ceiling Fans"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="roofType">Roof Type</Label>
                    <Input
                      id="roofType"
                      value={editingProperty.roofType || ''}
                      onChange={(e) => updateEditingProperty('roofType', e.target.value)}
                      placeholder="e.g., Asphalt Shingle, Metal, Tile"
                    />
                  </div>
                  <div>
                    <Label htmlFor="foundationDetails">Foundation Details</Label>
                    <Input
                      id="foundationDetails"
                      value={editingProperty.foundationDetails || ''}
                      onChange={(e) => updateEditingProperty('foundationDetails', e.target.value)}
                      placeholder="e.g., Concrete Slab, Basement, Crawl Space"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="exteriorFeatures">Exterior Features</Label>
                    <Input
                      id="exteriorFeatures"
                      value={editingProperty.exteriorFeatures || ''}
                      onChange={(e) => updateEditingProperty('exteriorFeatures', e.target.value)}
                      placeholder="e.g., Deck, Patio, Landscaping"
                    />
                  </div>
                  <div>
                    <Label htmlFor="propertyView">View</Label>
                    <Input
                      id="propertyView"
                      value={editingProperty.propertyView || ''}
                      onChange={(e) => updateEditingProperty('propertyView', e.target.value)}
                      placeholder="e.g., Mountain, Water, City"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="waterSource">Water Source</Label>
                    <Input
                      id="waterSource"
                      value={editingProperty.waterSource || ''}
                      onChange={(e) => updateEditingProperty('waterSource', e.target.value)}
                      placeholder="e.g., City Water, Well, Spring"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sewerSystem">Sewer System</Label>
                    <Input
                      id="sewerSystem"
                      value={editingProperty.sewerSystem || ''}
                      onChange={(e) => updateEditingProperty('sewerSystem', e.target.value)}
                      placeholder="e.g., City Sewer, Septic, Lagoon"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="heatingType">Heating Type</Label>
                    <Input
                      id="heatingType"
                      value={editingProperty.heatingType || ''}
                      onChange={(e) => updateEditingProperty('heatingType', e.target.value)}
                      placeholder="e.g., Forced Air, Radiant, Heat Pump"
                    />
                  </div>
                  <div>
                    <Label htmlFor="coolingType">Cooling Type</Label>
                    <Input
                      id="coolingType"
                      value={editingProperty.coolingType || ''}
                      onChange={(e) => updateEditingProperty('coolingType', e.target.value)}
                      placeholder="e.g., Central Air, Window Units, None"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Financial Tab */}
              <TabsContent value="financial" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="taxes">Annual Taxes</Label>
                    <Input
                      id="taxes"
                      type="number"
                      value={editingProperty.taxes || ''}
                      onChange={(e) => updateEditingProperty('taxes', parseFloat(e.target.value) || undefined)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="taxYear">Tax Year</Label>
                    <Input
                      id="taxYear"
                      type="number"
                      value={editingProperty.taxYear || ''}
                      onChange={(e) => updateEditingProperty('taxYear', parseInt(e.target.value) || undefined)}
                      placeholder="2024"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="hoaFee">HOA Fee</Label>
                    <Input
                      id="hoaFee"
                      type="number"
                      value={editingProperty.hoaFee || ''}
                      onChange={(e) => updateEditingProperty('hoaFee', parseFloat(e.target.value) || undefined)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="buyerAgentCompensation">Buyer Agent Compensation (%)</Label>
                    <Input
                      id="buyerAgentCompensation"
                      type="number"
                      step="0.1"
                      value={editingProperty.buyerAgentCompensation || ''}
                      onChange={(e) => updateEditingProperty('buyerAgentCompensation', parseFloat(e.target.value) || undefined)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="specialAssessments">Special Assessments</Label>
                  <Input
                    id="specialAssessments"
                    type="number"
                    value={editingProperty.specialAssessments || ''}
                    onChange={(e) => updateEditingProperty('specialAssessments', parseFloat(e.target.value) || undefined)}
                  />
                </div>
              </TabsContent>

              {/* Agent Info Tab */}
              <TabsContent value="agent" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="listingAgentName">Listing Agent Name *</Label>
                    <Input
                      id="listingAgentName"
                      value={editingProperty.listingAgentName || ''}
                      onChange={(e) => updateEditingProperty('listingAgentName', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="listingAgentLicense">Agent License # *</Label>
                    <Input
                      id="listingAgentLicense"
                      value={editingProperty.listingAgentLicense || ''}
                      onChange={(e) => updateEditingProperty('listingAgentLicense', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="listingAgentPhone">Agent Phone *</Label>
                    <Input
                      id="listingAgentPhone"
                      value={editingProperty.listingAgentPhone || ''}
                      onChange={(e) => updateEditingProperty('listingAgentPhone', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="listingAgentEmail">Agent Email</Label>
                    <Input
                      id="listingAgentEmail"
                      type="email"
                      value={editingProperty.listingAgentEmail || ''}
                      onChange={(e) => updateEditingProperty('listingAgentEmail', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="brokerage">Brokerage *</Label>
                    <Input
                      id="brokerage"
                      value={editingProperty.brokerage || ''}
                      onChange={(e) => updateEditingProperty('brokerage', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="brokerageLicense">Brokerage License</Label>
                    <Input
                      id="brokerageLicense"
                      value={editingProperty.brokerageLicense || ''}
                      onChange={(e) => updateEditingProperty('brokerageLicense', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="showingInstructions">Showing Instructions</Label>
                  <Textarea
                    id="showingInstructions"
                    value={editingProperty.showingInstructions || ''}
                    onChange={(e) => updateEditingProperty('showingInstructions', e.target.value)}
                    rows={3}
                  />
                </div>
              </TabsContent>

              {/* Media Tab with Photo Upload */}
              <TabsContent value="media" className="space-y-4">
                <div>
                  <Label>Property Photos * (Minimum {MIN_PROPERTY_PHOTOS}, Maximum {MAX_PROPERTY_PHOTOS})</Label>
                  <PhotoUpload
                    photos={editingProperty.photos || []}
                    onPhotosChange={handlePhotosChange}
                    minPhotos={MIN_PROPERTY_PHOTOS}
                    maxPhotos={MAX_PROPERTY_PHOTOS}
                  />
                </div>

                <div>
                  <Label htmlFor="publicRemarks">Public Description</Label>
                  <Textarea
                    id="publicRemarks"
                    value={editingProperty.publicRemarks || ''}
                    onChange={(e) => updateEditingProperty('publicRemarks', e.target.value)}
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="brokerRemarks">Broker Remarks (Private)</Label>
                  <Textarea
                    id="brokerRemarks"
                    value={editingProperty.brokerRemarks || ''}
                    onChange={(e) => updateEditingProperty('brokerRemarks', e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="virtualTourUrl">Virtual Tour URL</Label>
                    <Input
                      id="virtualTourUrl"
                      type="url"
                      value={editingProperty.virtualTourUrl || ''}
                      onChange={(e) => updateEditingProperty('virtualTourUrl', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="videoUrl">Video URL</Label>
                    <Input
                      id="videoUrl"
                      type="url"
                      value={editingProperty.videoUrl || ''}
                      onChange={(e) => updateEditingProperty('videoUrl', e.target.value)}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setShowEditDialog(false)}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
