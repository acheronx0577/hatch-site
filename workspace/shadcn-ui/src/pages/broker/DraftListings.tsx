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
import { MLSProperty, MLSRoom } from '@/types/MLSProperty'
import BulkListingUpload from '@/components/upload/BulkListingUpload'
import type { DraftListing as UploadDraftListing } from '@/components/upload/BulkListingUpload'
import PhotoUpload from '@/components/PhotoUpload'
import { MIN_PROPERTY_PHOTOS, MAX_PROPERTY_PHOTOS } from '@/constants/photoRequirements'
import PropertyPreview from '@/components/PropertyPreview'
import { PropertyFiltersComponent, PROPERTY_FILTER_LIMITS, createDefaultPropertyFilters } from '@/components/PropertyFilters'
import type { PropertyFilters } from '@/components/PropertyFilters'
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

type AdditionalField = {
  label: string
  value: string
  section?: string
}

const mergeAdditionalFields = (
  primary?: Record<string, AdditionalField>,
  secondary?: Record<string, AdditionalField>
): Record<string, AdditionalField> | undefined => {
  if (!primary && !secondary) {
    return undefined
  }

  const merged = new Map<string, AdditionalField>()

  const consume = (fields?: Record<string, AdditionalField>) => {
    if (!fields) return
    Object.values(fields).forEach((field) => {
      if (!field) return
      const key = `${(field.label ?? '').toLowerCase()}:${field.value}`
      if (!merged.has(key)) {
        merged.set(key, field)
      }
    })
  }

  consume(primary)
  consume(secondary)

  if (merged.size === 0) {
    return undefined
  }

  const result: Record<string, AdditionalField> = {}
  let index = 0

  merged.forEach((field) => {
    const baseKey = (field.label ?? `field_${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `field_${index + 1}`
    let key = baseKey
    let suffix = 1
    while (result[key]) {
      key = `${baseKey}_${suffix}`
      suffix += 1
    }
    result[key] = field
    index += 1
  })

  return result
}

const TODAY_ISO_DATE = new Date().toISOString().split('T')[0]

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

const computeBathroomsTotal = (property: MLSProperty): number | undefined => {
  if (!property) return undefined
  if (typeof property.bathroomsTotal === 'number' && !Number.isNaN(property.bathroomsTotal)) {
    return property.bathroomsTotal
  }
  const full = typeof property.bathrooms === 'number' && !Number.isNaN(property.bathrooms) ? property.bathrooms : 0
  const half =
    typeof property.bathroomsHalf === 'number' && !Number.isNaN(property.bathroomsHalf) ? property.bathroomsHalf : 0
  const total = full + half * 0.5
  return total > 0 ? parseFloat(total.toFixed(1)) : undefined
}

const createEmptyDraftProperty = (): MLSProperty => {
  const now = new Date().toISOString()
  return {
    id: `draft_new_${Date.now()}`,
    mlsNumber: '',
    status: 'draft',
    workflowState: 'PROPERTY_PENDING',
    listPrice: 0,
    listPricePerSqFt: undefined,
    originalListPrice: undefined,
    propertyType: 'residential',
    listingType: undefined,
    propertySubType: undefined,
    architecturalStyle: undefined,
    yearBuilt: new Date().getFullYear(),
    livingAreaSqFt: 0,
    totalAreaSqFt: undefined,
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
    carportSpaces: undefined,
    flooring: undefined,
    poolFeatures: undefined,
    fireplaceFeatures: undefined,
    kitchenFeatures: undefined,
    primarySuite: undefined,
    primaryBathFeatures: undefined,
    laundryFeatures: undefined,
    interiorFeatures: undefined,
    appliances: undefined,
    parkingFeatures: undefined,
    constructionMaterials: undefined,
    roofType: undefined,
    foundationDetails: undefined,
    exteriorFinish: undefined,
    exteriorFeatures: undefined,
    propertyView: undefined,
    waterSource: undefined,
    sewerSystem: undefined,
    sewer: undefined,
    heatingType: undefined,
    coolingType: undefined,
    stormProtection: undefined,
    windowFeatures: undefined,
    builderProductYN: undefined,
    builderName: undefined,
    ownership: undefined,
    petsAllowed: undefined,
    roadResponsibility: undefined,
    roadSurfaceType: undefined,
    accessType: undefined,
    newConstructionYN: undefined,
    taxes: undefined,
    taxYear: undefined,
    hoaFee: undefined,
    hoaFeeFrequency: undefined,
    masterHoaFeeFrequency: undefined,
    associationYN: undefined,
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
    floorPlanType: undefined,
    brokerRemarks: undefined,
    virtualTourUrl: undefined,
    videoUrl: undefined,
    directions: undefined,
    listingDate: new Date().toISOString().split('T')[0],
    viewCount: 0,
    leadCount: 0,
    favoriteCount: 0,
    elementarySchool: undefined,
    middleSchool: undefined,
    highSchool: undefined,
    rooms: [],
    taxDistrict: undefined,
    taxDistrictType: undefined,
    domSource: undefined,
    cdomSource: undefined,
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as any).__lastEditingProperty = editingProperty
    }
  }, [editingProperty])

  const draftListings = getDraftProperties()

  const openNewDraftDialog = useCallback(() => {
    const blank = createEmptyDraftProperty()
    setEditingProperty(blank)
    setIsNewDraft(true)
    setShowEditDialog(true)
  }, [])

  const matchesFilters = useCallback((property: MLSProperty): boolean => {
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

    const yearBuiltValue = property.yearBuilt ?? 0
    if (
      yearBuiltValue > 0 &&
      (yearBuiltValue < filters.yearBuiltRange[0] || yearBuiltValue > filters.yearBuiltRange[1])
    ) {
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
  }, [filters])

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
  }, [draftListings, filters, matchesFilters])

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
      matches: [...(first.matches ?? [])],
      extracted: [...(first.extracted ?? [])]
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

      if (listing.matches && listing.matches.length > 0) {
        merged.matches = [...(merged.matches ?? []), ...listing.matches]
      }
      if (listing.extracted && listing.extracted.length > 0) {
        merged.extracted = [...(merged.extracted ?? []), ...listing.extracted]
      }
      merged.additionalFields = mergeAdditionalFields(merged.additionalFields, listing.additionalFields)
    })

    if (merged.totalRecords > 0) {
      merged.completionPercentage = Math.round((merged.requiredFieldsComplete / merged.totalRecords) * 100)
    }

    if (merged.matches) {
      const byKey = new Map<string, typeof merged.matches[number]>()
      merged.matches.forEach((match) => {
        if (!match) return
        const key = `${match.canonical ?? ''}:${match.raw?.label ?? ''}`
        const existing = byKey.get(key)
        if (!existing || (match.score ?? 0) > (existing.score ?? 0)) {
          byKey.set(key, match)
        }
      })
      merged.matches = Array.from(byKey.values())
    }

    if (merged.extracted) {
      const seen = new Set<string>()
      merged.extracted = merged.extracted.filter((item) => {
        if (!item) return false
        const key = `${(item.label ?? '').toLowerCase()}:${String(item.value ?? '')}`
        if (seen.has(key)) {
          return false
        }
        seen.add(key)
        return true
      })
    }

    if (merged.additionalFields) {
      merged.additionalFields = mergeAdditionalFields(merged.additionalFields)
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
          const updates = duplicates.filter((dup) => dup.reason === 'existing')
          const skipped = duplicates.filter((dup) => dup.reason === 'batch_duplicate')

          if (updates.length > 0) {
            toast({
              title: updates.length === 1 ? 'Listing matched existing record' : 'Listings matched existing records',
              description: (
                <div className="space-y-1 text-left">
                  {updates.map((dup, index) => {
                    const identifier =
                      dup.mlsNumber && dup.mlsNumber.trim().length > 0
                        ? `MLS ${dup.mlsNumber}`
                        : dup.address || 'Listing'
                    return (
                      <div key={`${identifier}-existing-${index}`}>
                        {identifier} (will be updated)
                      </div>
                    )
                  })}
                </div>
              ),
              variant: 'info',
            })
          }

          if (skipped.length > 0) {
            toast({
            title: skipped.length === 1 ? 'Duplicate listing skipped' : 'Duplicate listings skipped',
            description: (
              <div className="space-y-1 text-left">
                {skipped.map((dup, index) => {
                  const identifier = dup.mlsNumber && dup.mlsNumber.trim().length > 0 ? `MLS ${dup.mlsNumber}` : dup.address || 'Listing'
                  const reasonLabel = 'duplicate in upload file'
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
          }

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
    if (typeof window !== 'undefined') {
      ;(window as any).__lastUploadBatch = mergedListing
      ;(window as any).__lastAdditionalFieldsRaw = mergedListing.additionalFields ?? null
    }
    
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

      const sanitizeMLSNumber = (input?: string) => {
        if (!input) return undefined
        const compact = input.replace(/[^0-9A-Za-z-]/g, '').trim()
        if (!compact || !/\d/.test(compact)) {
          return undefined
        }
        return compact
      }

      const normalizeIsoDate = (input?: string) => {
        if (!input) return undefined
        const trimmed = input.trim()
        if (!trimmed) return undefined
        const basicMatch = trimmed.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
        if (basicMatch) {
          const [, m, d, y] = basicMatch
          const year = Number(y.length === 2 ? `20${y}` : y)
          const month = Number(m) - 1
          const day = Number(d)
          const candidate = new Date(Date.UTC(year, month, day))
          if (!Number.isNaN(candidate.getTime())) {
            return candidate.toISOString().slice(0, 10)
          }
        }
        const parsed = new Date(trimmed)
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString().slice(0, 10)
        }
        return undefined
      }

      const splitPetInfoFromSubType = (input?: string) => {
        if (!input) return { subtype: undefined as string | undefined, pets: undefined as string | undefined }
        const match = input.match(/\bPets?:\s*(.*)$/i)
        if (!match) {
          return {
            subtype: input.trim() || undefined,
            pets: undefined,
          }
        }
        const subtype = input.slice(0, match.index).trim()
        const pets = match[1]?.trim()
        return {
          subtype: subtype || undefined,
          pets: pets || undefined,
        }
      }

      const findExtractedValue = (...labels: string[]) => {
        if (!draftListing.extracted || draftListing.extracted.length === 0) return undefined
        const targets = labels.map((label) => label.toLowerCase())
        for (const item of draftListing.extracted) {
          if (!item) continue
          const label = toTrimmedString(item.label)?.toLowerCase()
          if (!label) continue
          if (targets.some((target) => label.includes(target))) {
            const value = toTrimmedString(item.value)
            if (value) return value
          }
        }
        const textSources: string[] = []
        const pushText = (value?: string | null) => {
          if (!value) return
          textSources.push(String(value))
        }
        const canonical = (draftListing as any)?.canonicalDraft
        const original = (draftListing as any)?.originalData
        pushText(canonical?.basic?.mls_number)
        pushText(canonical?.source?.mls_number)
        pushText(original?.source?.summary)
        pushText(original?.basic?.description)

        for (const text of textSources) {
          const lower = text.toLowerCase()
          if (targets.some((target) => lower.includes(target))) {
            const sanitized = sanitizeMLSFromString(text)
            if (sanitized) {
              return sanitized
            }
          }
        }
        return undefined
      }

      const findFirstString = (predicate: (key: string, value: string) => boolean): string | undefined => {
        for (const [key, value] of normalizedEntries) {
          if (typeof value !== 'string') continue
          if (predicate(key, value)) {
            return value
          }
        }
        return undefined
      }

      const extractDateFromSources = (...keys: string[]) => {
        for (const key of keys) {
          const direct = toTrimmedString(pickValue(key))
          const normalized = normalizeIsoDate(direct)
          if (normalized) return normalized
        }
        const extracted = findExtractedValue(...keys)
        const fromExtracted = normalizeIsoDate(extracted)
        if (fromExtracted) return fromExtracted
        for (const value of normalizedEntries) {
          const [, raw] = value
          if (typeof raw !== 'string') continue
          if (keys.some((key) => raw.toLowerCase().includes(key.replace(/_/g, ' ').toLowerCase()))) {
            const normalized = normalizeIsoDate(raw)
            if (normalized) return normalized
          }
        }
        return undefined
      }

      const sanitizeMLSFromString = (input?: string) => {
        if (!input) return undefined
        const directMatch = input.match(/MLS[#\s:]*([0-9]{5,})/i)
        if (directMatch) return sanitizeMLSNumber(directMatch[1])
        const looseMatch = input.match(/\b([0-9]{6,})\b/)
        if (looseMatch) return sanitizeMLSNumber(looseMatch[1])
        return undefined
      }

      const findMLSFromSources = () => {
        const candidates: string[] = []
        normalizedEntries.forEach(([key, value]) => {
          if (typeof value === 'string' && key.toLowerCase().includes('mls')) {
            candidates.push(value)
          }
        })
        normalizedEntries.forEach(([key, value]) => {
          if (typeof value === 'string') {
            candidates.push(value)
          }
        })
        if (draftListing.additionalFields) {
          Object.values(draftListing.additionalFields).forEach((field) => {
            const raw = typeof field?.value === 'string' ? field.value : undefined
            if (raw) candidates.push(raw)
          })
        }
        if (draftListing.extracted) {
          draftListing.extracted.forEach((item) => {
            const raw = toTrimmedString(item?.value)
            if (raw) candidates.push(raw)
          })
        }
        const canonicalMLS =
          toTrimmedString((draftListing as any)?.canonicalDraft?.basic?.mls_number) ||
          toTrimmedString((draftListing as any)?.canonicalDraft?.source?.mls_number)
        if (canonicalMLS) {
          candidates.push(canonicalMLS)
        }
        for (const candidate of candidates) {
          const sanitized = sanitizeMLSFromString(candidate)
          if (sanitized) {
            return sanitized
          }
        }
        return undefined
      }

      const parseWaterSegments = (input?: string) => {
        if (!input) return {}
        const segments: Record<string, string> = {}
        const matches = input.matchAll(/([A-Za-z ]+):\s*([^:]+)(?=$|[A-Za-z ]+:\s*)/gi)
        for (const match of matches) {
          const label = match[1]?.trim().toLowerCase()
          const value = match[2]?.trim()
          if (!label || !value) continue
          segments[label] = value
        }
        if (Object.keys(segments).length === 0) {
          const compactMatch = input.match(/front:\s*([A-Za-z ]+)/i)
          if (compactMatch) {
            segments.front = compactMatch[1].trim()
          }
          const descrMatch = input.match(/descrip\.?:\s*([A-Za-z ]+)/i)
          if (descrMatch) {
            segments.description = descrMatch[1].trim()
          }
        }
        return segments
      }

      const collectPhotoUrls = () => {
        const urls = new Set<string>()
        const urlRegex = /(https?:\/\/[^\s"'<>]+?(?:jpg|jpeg|png|gif|webp))(?:[^\s"'<>]*)/gi
        const push = (value: unknown) => {
          if (!value) return
          if (Array.isArray(value)) {
            value.forEach(push)
            return
          }
          if (typeof value === 'object') {
            const recordValue = value as Record<string, unknown>
            const candidateKeys = ['url', 'href', 'src', 'link', 'mediaurl', 'mediaUrl', 'photo_url', 'photoUrl']
            for (const key of candidateKeys) {
              const nested = recordValue[key]
              if (typeof nested === 'string') {
                push(nested)
              }
            }
            return
          }
          if (typeof value === 'string') {
            let match: RegExpExecArray | null
            while ((match = urlRegex.exec(value)) !== null) {
              urls.add(match[1])
            }
          }
        }

        push((record as any)?.photos)
        push((record as any)?.photoUrls)
        push((record as any)?.images)
        Object.values(record || {}).forEach(push)

        if (draftListing.additionalFields) {
          Object.values(draftListing.additionalFields).forEach((field) => push(field?.value))
        }
        if (draftListing.extracted) {
          draftListing.extracted.forEach((item) => push(item?.value))
        }
        if ((draftListing as any)?.photos) {
          push((draftListing as any).photos)
        }
        const canonicalImages = (draftListing as any)?.canonicalDraft?.media?.images
        if (Array.isArray(canonicalImages)) {
          canonicalImages.forEach((image) => {
            if (image && typeof image.url === 'string') {
              push(image.url)
            }
          })
        }

        return Array.from(urls)
      }


      const getNumericAdditional = (key: string): number | undefined => {
        const raw = getAdditional(key)
        if (!raw) return undefined
        const cleaned = raw.replace(/[^0-9.\-]/g, '')
        if (!cleaned) return undefined
        const parsed = Number(cleaned)
        return Number.isFinite(parsed) ? parsed : undefined
      }

      const setAdditionalValue = (key: string, label: string, value?: string) => {
        if (!value) return
        if (!mappedProperty.additionalFields) {
          mappedProperty.additionalFields = {}
        }
        mappedProperty.additionalFields[key] = {
          label,
          value,
        }
      }

      const toTrimmedString = (input: unknown): string | undefined => {
        if (input === undefined || input === null) return undefined
        const str = typeof input === 'string' ? input.trim() : String(input).trim()
        return str.length > 0 ? str : undefined
      }

      const getAdditional = (key: string): string | undefined => {
        return draftListing.additionalFields?.[key]?.value as string | undefined
      }

      const toNumericValue = (input: unknown): number | undefined => {
        if (input === undefined || input === null) return undefined
        if (typeof input === 'number' && Number.isFinite(input)) return input
        const cleaned = String(input).replace(/[^0-9.\-]/g, '')
        if (!cleaned) return undefined
        const num = Number(cleaned)
        return Number.isFinite(num) ? num : undefined
      }

      const toBooleanValue = (input: unknown): boolean | undefined => {
        const str = toTrimmedString(input)
        if (!str) return undefined
        if (/^(y|yes|true|1)$/i.test(str)) return true
        if (/^(n|no|false|0)$/i.test(str)) return false
        return undefined
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

      const normalizeStatusValue = (input: unknown): MLSProperty['status'] | undefined => {
        const str = toTrimmedString(input)
        if (!str) return undefined
        const lower = str.toLowerCase()
        if (/(sold|closed|settled|completed)/.test(lower)) return 'sold'
        if (/(pending|contingent|under contract|under agreement|escrow|offer accepted|contract)/.test(lower)) {
          return 'pending'
        }
        if (/(withdrawn|off-market|off market|inactive|temp off|temporary off|hold|cancelled|canceled)/.test(lower)) {
          return 'withdrawn'
        }
        if (/(expired|lapsed)/.test(lower)) return 'expired'
        if (/(draft|coming soon|pre-market|preview)/.test(lower)) return 'draft'
        if (/(active|new listing|listed)/.test(lower) && !/(inactive|off-market|off market)/.test(lower)) {
          return 'active'
        }
        return undefined
      }

      const statusToWorkflowState = (status: MLSProperty['status']): MLSProperty['workflowState'] => {
        switch (status) {
          case 'active':
          case 'pending':
            return 'LIVE'
          case 'sold':
            return 'SOLD'
          default:
            return 'PROPERTY_PENDING'
        }
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

      const normalizedEntries = Array.from(normalizedRecord.entries())

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

      const ensureBoolean = (propertyKey: string, ...candidates: string[]) => {
        if ((mappedProperty as any)[propertyKey] !== undefined) {
          return
        }
        for (const candidate of candidates) {
          const raw = pickValue(candidate)
          const parsed = toBooleanValue(raw)
          if (parsed !== undefined) {
            ;(mappedProperty as any)[propertyKey] = parsed
            return
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

      console.debug('final mapped property', mappedProperty)

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
            const sanitized = sanitizeMLSNumber(value)
            if (sanitized) {
              if (!mappedProperty.mlsNumber || mappedProperty.mlsNumber.length < sanitized.length) {
                mappedProperty.mlsNumber = sanitized
              }
            }
            break
          }
          case 'status': {
            const value = toTrimmedString(rawValue)
            if (value) {
              (mappedProperty as any).sourceStatus = value
              const normalized = normalizeStatusValue(value)
              if (normalized) {
                mappedProperty.status = normalized
                mappedProperty.workflowState = statusToWorkflowState(normalized)
              }
            }
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
          case 'listingtype':
          case 'listingcontracttype':
          case 'listingagreement': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingType = value
            break
          }
          case 'architecturalstyle':
          case 'style': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.architecturalStyle = value
            break
          }
          case 'floorplandescription':
          case 'floorplan':
          case 'floorplannote': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.floorPlanDescription = value
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
          case 'bathroomspartial': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.bathroomsPartial = value
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
          case 'listingdate': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingDate = value
            break
          }
          case 'expirationdate': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.expirationDate = value
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
          case 'parkingfeatures':
          case 'parkingfeature': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.parkingFeatures = value
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
          case 'buyeragentcompensation':
          case 'buyeragentcommission':
          case 'cooperatingbrokercompensation': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.buyerAgentCompensation = value
            break
          }
          case 'specialassessments':
          case 'specialassessment': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) {
              mappedProperty.specialAssessments = value
              mappedProperty.specialAssessment = mappedProperty.specialAssessment ?? value
            }
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
          case 'appointmentphone':
          case 'showingcontactphone':
          case 'apptphone': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.appointmentPhone = value
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
          case 'coverphotourl':
          case 'coverphoto':
          case 'primaryphotourl': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.coverPhotoUrl = value
            break
          }
          case 'virtualtoururl':
          case 'unbrandedvirtualtour':
          case 'virtualtour': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.virtualTourUrl = value
            break
          }
          case 'videourl':
          case 'tourvideo':
          case 'video': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.videoUrl = value
            break
          }
          case 'viewcount':
          case 'views': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.viewCount = value
            break
          }
          case 'leadcount':
          case 'leads': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.leadCount = value
            break
          }
          case 'favoritecount':
          case 'favorites':
          case 'savedcount': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.favoriteCount = value
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
          case 'constructionmaterials':
          case 'construction': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.constructionMaterials = value
            break
          }
          case 'exteriorfinish':
          case 'exteriorwall': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.exteriorFinish = value
            break
          }
          case 'roof':
          case 'rooftype': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.roofType = value
            break
          }
          case 'foundationdetails':
          case 'foundation': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.foundationDetails = value
            break
          }
          case 'foundation': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.foundationDetails = value
            break
          }
          case 'exteriorfeatures':
          case 'exteriorfeature': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.exteriorFeatures = value
            break
          }
          case 'view': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.propertyView = value
            break
          }
          case 'watersource':
          case 'water': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.waterSource = value
            break
          }
          case 'sewer':
          case 'sewersystem': {
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
          case 'floorplantype': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.floorPlanType = value
            break
          }
          case 'masterbathfeatures':
          case 'primarybathfeatures': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.primaryBathFeatures = value
            break
          }
          case 'parkingfeatures':
          case 'parkingdescription': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.parkingFeatures = value
            break
          }
          case 'buyeragentcompensation':
          case 'buyerbrokercompensation':
          case 'buyeragentcompensationpercent': {
            const value = toNumericValue(rawValue)
            if (value !== undefined) mappedProperty.buyerAgentCompensation = value
            else {
              const text = toTrimmedString(rawValue)
              if (text) mappedProperty.buyerAgentCompensation = toNumericValue(text)
            }
            break
          }
          case 'builderproduct':
          case 'builderproductyn': {
            const parsed = toBooleanValue(rawValue)
            if (parsed !== undefined) mappedProperty.builderProductYN = parsed
            break
          }
          case 'newconstruction':
          case 'newconstructionyn': {
            const parsed = toBooleanValue(rawValue)
            if (parsed !== undefined) mappedProperty.newConstructionYN = parsed
            break
          }
          case 'listingdate':
          case 'listdate': {
            const value = extractDateFromSources(mapping.inputField)
            if (value) mappedProperty.listingDate = value
            break
          }
          case 'buildername': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.builderName = value
            break
          }
          case 'listingofficephone':
          case 'officephone': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.officePhone = value
            break
          }
          case 'listingofficeaddress':
          case 'officeaddress': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.officeAddress = value
            break
          }
          case 'listingbrokername':
          case 'listingbroker': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingBroker = value
            break
          }
          case 'listingagentname':
          case 'listagentfull': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingAgentName = value
            break
          }
          case 'listingagentphone': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingAgentPhone = value
            break
          }
          case 'listingagentemail': {
            const value = toTrimmedString(rawValue)
            if (value) mappedProperty.listingAgentEmail = value
            break
          }
          default:
            break
        }
      })

      if (mappedProperty.listPrice == null || mappedProperty.listPrice === 0) {
        const additional = getNumericAdditional('list_price')
        if (additional !== undefined) mappedProperty.listPrice = additional
      }
      if (mappedProperty.originalListPrice == null || mappedProperty.originalListPrice === 0) {
        const additional = getNumericAdditional('original_list_price')
        if (additional !== undefined) mappedProperty.originalListPrice = additional
      }
      if (mappedProperty.listPricePerSqFt == null || mappedProperty.listPricePerSqFt === 0) {
        const additional = getNumericAdditional('list_price_per_sqft')
        if (additional !== undefined) mappedProperty.listPricePerSqFt = additional
        if ((mappedProperty.listPricePerSqFt == null || mappedProperty.listPricePerSqFt === 0) && mappedProperty.listPrice && mappedProperty.livingAreaSqFt) {
          const sqft = Number(mappedProperty.livingAreaSqFt)
          const price = Number(mappedProperty.listPrice)
          if (Number.isFinite(price) && Number.isFinite(sqft) && sqft > 0) {
            mappedProperty.listPricePerSqFt = Number((price / sqft).toFixed(2))
          }
        }
      }
      if (!mappedProperty.bedrooms || mappedProperty.bedrooms === 0) {
        const additional = getNumericAdditional('bedrooms')
        if (additional !== undefined) mappedProperty.bedrooms = additional
      }
      if (!mappedProperty.bathrooms || mappedProperty.bathrooms === 0) {
        const additional = getNumericAdditional('bathrooms')
        if (additional !== undefined) mappedProperty.bathrooms = additional
      }
      if (mappedProperty.bathroomsHalf == null) {
        const additional = getNumericAdditional('half_baths')
        if (additional !== undefined) mappedProperty.bathroomsHalf = additional
      }
      if (mappedProperty.bathroomsTotal == null) {
        const additional = getNumericAdditional('bathrooms_total')
        if (additional !== undefined) mappedProperty.bathroomsTotal = additional
      }
      if (!mappedProperty.livingAreaSqFt || mappedProperty.livingAreaSqFt === 0) {
        const additional = getNumericAdditional('living_area_sqft') ?? getNumericAdditional('living_area')
        if (additional !== undefined) mappedProperty.livingAreaSqFt = additional
      }
      if (!mappedProperty.lotSize || mappedProperty.lotSize === 0) {
        const additional = getNumericAdditional('lot_size_sqft') ?? getNumericAdditional('lot_size')
        if (additional !== undefined) mappedProperty.lotSize = additional
      }
      if (!mappedProperty.lotSizeAcres || mappedProperty.lotSizeAcres === 0) {
        const additional = getNumericAdditional('lot_acres')
        if (additional !== undefined) mappedProperty.lotSizeAcres = additional
      }
      if (!mappedProperty.yearBuilt || mappedProperty.yearBuilt === 0) {
        const additional = getNumericAdditional('year_built')
        if (additional !== undefined) mappedProperty.yearBuilt = additional
      }
      if (mappedProperty.garageSpaces == null) {
        const additional = getNumericAdditional('garage_spaces')
        if (additional !== undefined) mappedProperty.garageSpaces = additional
      }
      if (mappedProperty.stories == null) {
        const additional = getNumericAdditional('stories')
        if (additional !== undefined) mappedProperty.stories = additional
      }
      mappedProperty.streetNumber = mappedProperty.streetNumber || toTrimmedString(getAdditional('street_number'))
      mappedProperty.streetName = mappedProperty.streetName || toTrimmedString(getAdditional('street_name'))
      mappedProperty.streetSuffix = mappedProperty.streetSuffix || toTrimmedString(getAdditional('street_suffix'))
      mappedProperty.city = mappedProperty.city || toTrimmedString(getAdditional('city'))
      mappedProperty.state = mappedProperty.state || toTrimmedString(getAdditional('state'))
      mappedProperty.zipCode = mappedProperty.zipCode || toTrimmedString(getAdditional('zip'))
      mappedProperty.county = mappedProperty.county || toTrimmedString(getAdditional('county'))
      mappedProperty.subdivision = mappedProperty.subdivision || toTrimmedString(getAdditional('subdivision'))
      mappedProperty.parcelID = mappedProperty.parcelID || toTrimmedString(getAdditional('parcel_id') || getAdditional('property_id'))
      mappedProperty.geoArea = mappedProperty.geoArea || toTrimmedString(getAdditional('geo_area'))
      mappedProperty.development = mappedProperty.development || toTrimmedString(getAdditional('development'))
      const listingDateFallback = extractDateFromSources('listing_date', 'listingdate', 'list_date', 'listdate', 'recent', 'recent_date', 'listed')
      if (listingDateFallback && !mappedProperty.listingDate) {
        mappedProperty.listingDate = listingDateFallback
      }
      const expirationDateFallback = extractDateFromSources('expiration_date', 'expirationdate', 'exp_date', 'expdate', 'contract_closing_date', 'contractclosingdate')
      if (expirationDateFallback && !mappedProperty.expirationDate) {
        mappedProperty.expirationDate = expirationDateFallback
      }
      const normalizedListingDate = normalizeIsoDate(mappedProperty.listingDate as string | undefined)
      if (normalizedListingDate) {
        mappedProperty.listingDate = normalizedListingDate
      }
      const normalizedExpirationDate = normalizeIsoDate(mappedProperty.expirationDate as string | undefined)
      if (normalizedExpirationDate) {
        mappedProperty.expirationDate = normalizedExpirationDate
      } else if (typeof mappedProperty.expirationDate === 'string' && !/\d/.test(mappedProperty.expirationDate)) {
        mappedProperty.expirationDate = undefined
      }
      if (mappedProperty.dom == null) {
        const additional = getNumericAdditional('dom')
        if (additional !== undefined) mappedProperty.dom = additional
      }
      if (mappedProperty.cdom == null) {
        const additional = getNumericAdditional('cdom')
        if (additional !== undefined) mappedProperty.cdom = additional
      }
      if (mappedProperty.taxYear == null) {
        const additional = getNumericAdditional('tax_year')
        if (additional !== undefined) mappedProperty.taxYear = additional
      }
      if (mappedProperty.taxes == null) {
        const additional = getNumericAdditional('annual_taxes') ?? getNumericAdditional('taxes')
        if (additional !== undefined) mappedProperty.taxes = additional
      }
      if (mappedProperty.hoaFee == null) {
        const additional = getNumericAdditional('hoa_fee')
        if (additional !== undefined) mappedProperty.hoaFee = additional
      }
      if (mappedProperty.masterHoaFee == null) {
        const additional = getNumericAdditional('master_hoa_fee')
        if (additional !== undefined) mappedProperty.masterHoaFee = additional
      }
      if (mappedProperty.condoFee == null) {
        const additional = getNumericAdditional('condo_fee')
        if (additional !== undefined) mappedProperty.condoFee = additional
      }
      if (mappedProperty.specialAssessment == null) {
        const additional = getNumericAdditional('special_assessment')
        if (additional !== undefined) mappedProperty.specialAssessment = additional
      }
      if (mappedProperty.otherFee == null) {
        const additional = getNumericAdditional('other_fee')
        if (additional !== undefined) mappedProperty.otherFee = additional
      }
      if (mappedProperty.landLease == null) {
        const additional = getNumericAdditional('land_lease')
        if (additional !== undefined) mappedProperty.landLease = additional
      }
      if (mappedProperty.mandatoryClubFee == null) {
        const additional = getNumericAdditional('mandatory_club_fee')
        if (additional !== undefined) mappedProperty.mandatoryClubFee = additional
      }
      if (mappedProperty.recreationLeaseFee == null) {
        const additional = getNumericAdditional('recreation_lease_fee')
        if (additional !== undefined) mappedProperty.recreationLeaseFee = additional
      }
      if (mappedProperty.totalAnnualRecurringFees == null) {
        const additional = getNumericAdditional('total_annual_recurring_fees')
        if (additional !== undefined) mappedProperty.totalAnnualRecurringFees = additional
      }
      if (mappedProperty.totalOneTimeFees == null) {
        const additional = getNumericAdditional('total_one_time_fees')
        if (additional !== undefined) mappedProperty.totalOneTimeFees = additional
      }
      if (mappedProperty.totalAreaSqFt == null) {
        const additional =
          getNumericAdditional('total_area_sq_ft') ??
          getNumericAdditional('total_area') ??
          getNumericAdditional('total_approx_sqft')
        if (additional !== undefined) mappedProperty.totalAreaSqFt = additional
      }
      if (!mappedProperty.floorPlanType) {
        const additional =
          getAdditional('floor_plan_type') ??
          getAdditional('floorplan_type') ??
          getAdditional('floor_plan')
        if (additional) mappedProperty.floorPlanType = additional
      }
      if (!mappedProperty.primaryBathFeatures) {
        const additional =
          getAdditional('primary_bath_features') ??
          getAdditional('master_bath_features') ??
          getAdditional('primarybathfeatures')
        if (additional) mappedProperty.primaryBathFeatures = additional
      }
      if (!mappedProperty.primarySuite) {
        const suiteAdditional = getAdditional('primary_suite') ?? getAdditional('primary_bedroom_features')
        if (suiteAdditional) mappedProperty.primarySuite = suiteAdditional
      }
      if (!mappedProperty.kitchenFeatures) {
        const kitchenAdditional = getAdditional('kitchen_features_text') ?? getAdditional('kitchen_features')
        if (kitchenAdditional) mappedProperty.kitchenFeatures = kitchenAdditional
      }
      if (!mappedProperty.parkingFeatures) {
        const parkingAdditional = getAdditional('parking_features') ?? getAdditional('parking')
        if (parkingAdditional) mappedProperty.parkingFeatures = parkingAdditional
      }
      if (!mappedProperty.roadSurfaceType) {
        const roadAdditional =
          getAdditional('road_surface_type') ?? getAdditional('road_type') ?? getAdditional('road_surface')
        if (roadAdditional) mappedProperty.roadSurfaceType = roadAdditional
      }
      if (!mappedProperty.roadResponsibility) {
        const roadRespAdditional = getAdditional('road_responsibility') ?? getAdditional('road_maintenance')
        if (roadRespAdditional) mappedProperty.roadResponsibility = roadRespAdditional
      }
      if (!mappedProperty.builderName) {
        const builderAdditional = getAdditional('builder_name') ?? getAdditional('builder')
        if (builderAdditional) mappedProperty.builderName = builderAdditional
      }
      if (mappedProperty.builderProductYN === undefined) {
        const builderProductAdditional =
          getAdditional('builder_product_yn') ?? getAdditional('builder_product') ?? getAdditional('builder_product_flag')
        const parsed = toBooleanValue(builderProductAdditional)
        if (parsed !== undefined) mappedProperty.builderProductYN = parsed
      }
      if (mappedProperty.newConstructionYN === undefined) {
        const newConstructionAdditional =
          getAdditional('new_construction_yn') ?? getAdditional('new_construction') ?? getAdditional('is_new_construction')
        const parsed = toBooleanValue(newConstructionAdditional)
        if (parsed !== undefined) mappedProperty.newConstructionYN = parsed
      }
      if (mappedProperty.associationYN === undefined) {
        const associationAdditional =
          getAdditional('association_yn') ?? getAdditional('association') ?? getAdditional('hoa_mandatory')
        const parsed = toBooleanValue(associationAdditional)
        if (parsed !== undefined) mappedProperty.associationYN = parsed
      }
      if (mappedProperty.buyerAgentCompensation == null) {
        const compAdditional =
          getNumericAdditional('buyer_agent_compensation') ??
          getNumericAdditional('buyer_broker_compensation') ??
          getNumericAdditional('buyer_agent_percent')
        if (compAdditional !== undefined) mappedProperty.buyerAgentCompensation = compAdditional
      }
      if (!mappedProperty.terms) {
        const termsAdditional =
          getAdditional('terms_considered') ??
          getAdditional('financing_terms') ??
          getAdditional('financing_available') ??
          getAdditional('terms')
        if (termsAdditional) mappedProperty.terms = termsAdditional
      }
      if (!mappedProperty.possession) {
        const possessionAdditional =
          getAdditional('possession') ?? getAdditional('availability') ?? getAdditional('possession_details')
        if (possessionAdditional) mappedProperty.possession = possessionAdditional
      }
      if (!mappedProperty.approval) {
        const approvalAdditional = getAdditional('approval') ?? getAdditional('approval_requirements')
        if (approvalAdditional) mappedProperty.approval = approvalAdditional
      }
      if (!mappedProperty.taxDistrict) {
        const districtAdditional = getAdditional('tax_district') ?? getAdditional('tax_area')
        if (districtAdditional) mappedProperty.taxDistrict = districtAdditional
      }
      if (!mappedProperty.taxDistrictType) {
        const districtTypeAdditional =
          getAdditional('tax_district_type') ?? getAdditional('tax_district_class') ?? getAdditional('tax_district')
        if (districtTypeAdditional) mappedProperty.taxDistrictType = districtTypeAdditional
      }
      if (!mappedProperty.listingBroker) {
        const brokerAdditional =
          getAdditional('listing_broker') ?? getAdditional('listing_office_name') ?? getAdditional('list_office_name')
        if (brokerAdditional) mappedProperty.listingBroker = brokerAdditional
      }
      if (!mappedProperty.listingAgentName) {
        const agentAdditional =
          getAdditional('listing_agent_name') ?? getAdditional('list_agent_full_name') ?? getAdditional('agent_name')
        if (agentAdditional) mappedProperty.listingAgentName = agentAdditional
      }
      if (!mappedProperty.listingAgentLicense) {
        const agentLicenseAdditional =
          getAdditional('listing_agent_license') ?? getAdditional('list_agent_license') ?? getAdditional('agent_license')
        if (agentLicenseAdditional) mappedProperty.listingAgentLicense = agentLicenseAdditional
      }
      if (!mappedProperty.listingAgentPhone) {
        const agentPhoneAdditional =
          getAdditional('listing_agent_phone') ?? getAdditional('list_agent_phone') ?? getAdditional('agent_phone')
        if (agentPhoneAdditional) mappedProperty.listingAgentPhone = agentPhoneAdditional
      }
      if (!mappedProperty.officeAddress) {
        const officeAddressAdditional =
          getAdditional('office_address') ?? getAdditional('listing_office_address') ?? getAdditional('list_office_address')
        if (officeAddressAdditional) mappedProperty.officeAddress = officeAddressAdditional
      }
      if (mappedProperty.status === 'draft') {
        mappedProperty.status = undefined
      }
      if (mappedProperty.listingDate === TODAY_ISO_DATE) {
        mappedProperty.listingDate = undefined
      }
      if (mappedProperty.approval && /application/i.test(mappedProperty.approval) && /interview/i.test(mappedProperty.approval)) {
        mappedProperty.approval = undefined
      }

      mappedProperty.statusType = mappedProperty.statusType || toTrimmedString(getAdditional('status_type'))
      mappedProperty.propertyType = mappedProperty.propertyType || normalizePropertyTypeValue(getAdditional('property_type')) || toTrimmedString(getAdditional('property_class')) || mappedProperty.propertyType

      // Fallbacks: hydrate critical fields even if the fuzzy mapping used aliases
      ensureString('mlsNumber', 'mlsnumber', 'mls', 'mlsid', 'mls#', 'id')
      ensureNumber('listPrice', 'listprice', 'price', 'askingprice')
      ensureNumber('originalListPrice', 'originallistprice', 'originalprice', 'previousprice', 'priceprevious')
      ensureString('propertyType', 'propertytype', 'propertycategory', 'propertyclass', 'type')
      ensureString('propertySubType', 'propertysubtype', 'subtype', 'statustype', 'buildingdesign', 'ownership')
      ensureString('architecturalStyle', 'architecturalstyle', 'style')
      ensureString('status', 'status', 'listingstatus', 'statuspublic', 'currentstatus', 'mlsstatus', 'statusremarks')
      ensureNumber('yearBuilt', 'yearbuilt', 'yrbuilt', 'built')
      ensureNumber('livingAreaSqFt', 'livingareasqft', 'livingarea', 'sqft', 'livingsqft', 'buildingareatotal', 'totalsqft')
      ensureNumber('totalAreaSqFt', 'totalareasqft', 'totalarea', 'totalsqft', 'totalunderroofsqft', 'buildingareatotal', 'grossareaunderroof')
      ensureNumber('bedrooms', 'bedroomstotal', 'bedrooms', 'beds')
      ensureNumber('bathrooms', 'bathroomstotal', 'bathrooms', 'baths', 'bathroomsfull')
      ensureNumber('bathroomsHalf', 'bathroomshalf', 'bathshalf', 'halfbaths')
      ensureNumber('bathroomsThreeQuarter', 'bathroomsthreequarter', 'threequarterbaths')
      ensureNumber('bathroomsPartial', 'bathroomspartial', 'partialbaths')
      ensureNumber('stories', 'stories', 'storiestotal')
      ensureNumber('listPricePerSqFt', 'listpricepersqft', 'list price per sqft', 'list_price_per_sqft')
      ensureString('statusType', 'statustype')
      ensureString('listingType', 'listingtype', 'listingcontracttype', 'listingagreement')
      ensureString('floorPlanDescription', 'floorplandescription', 'floorplan', 'floorplannote')
      ensureString('floorPlanType', 'floorplantype', 'floorplanstyle', 'floorplanname')
      ensureString('listingDate', 'listingdate', 'listdate', 'activationdate')
      ensureString('streetNumber', 'streetnumber', 'street_no', 'stnumber')
      ensureString('streetName', 'streetname', 'street', 'streetline')
      ensureString('streetSuffix', 'streetsuffix', 'suffix')
      ensureString('city', 'city', 'town', 'municipality')
      ensureString('state', 'state', 'stateorprovince', 'province')
      ensureString('zipCode', 'zipcode', 'postalcode', 'zip')
      ensureString('county', 'county', 'countyorparish')
      ensureString('subdivision', 'subdivision', 'subdivisionname', 'neighborhood', 'development')
      ensureString('parcelID', 'parcelid', 'apn', 'strap', 'parcel', 'propertyid')
      ensureString('builderName', 'buildername', 'builder')
      ensureNumber('latitude', 'latitude', 'lat')
      ensureNumber('longitude', 'longitude', 'long', 'lng')
      ensureNumber('lotSize', 'lotsizesqft', 'lotsize', 'lotsquarefeet', 'lot_size_sqft', 'lotSizeSqFt')
      ensureNumber('lotSizeAcres', 'lotsizeacres', 'acres', 'lot_acres', 'lotSizeAcres')
      ensureNumber('garageSpaces', 'garagespaces', 'garage')
      ensureString('garageType', 'garagetype')
      ensureString('parkingFeatures', 'parkingfeatures', 'parking')
      ensureString('parkingFeatures', 'parkingdescription', 'parkinginfo', 'parkingspecial', 'parking')
      ensureBoolean('builderProductYN', 'builderproductyn', 'builderproduct', 'builderproductflag')
      ensureBoolean('newConstructionYN', 'newconstructionyn', 'newconstruction', 'isnewconstruction', 'newconstructionflag')
      ensureBoolean('associationYN', 'associationyn', 'association', 'hoamandatory', 'mandatoryassociation')
      ensureString('builderName', 'buildername', 'builder')
      ensureNumber('taxes', 'taxesannual', 'taxamount', 'taxes', 'annualtaxes')
      ensureNumber('taxYear', 'taxyear')
      ensureNumber('hoaFee', 'associationfee', 'hoafee', 'hoa')
      ensureNumber('specialAssessments', 'specialassessments', 'specialassessment', 'special_assessment')
      ensureNumber('buyerAgentCompensation', 'buyeragentcompensation', 'buyeragentcommission', 'cooperatingbrokercompensation')
      ensureNumber('dom', 'dom')
      ensureNumber('cdom', 'cdom')
      ensureString('geoArea', 'geoarea', 'geo_area')
      ensureString('development', 'development')
      ensureString('propertyId', 'propertyid', 'property_id')
      ensureString('communityType', 'communitytype')
      ensureString('golfType', 'golftype')
      ensureString('roadSurfaceType', 'roadsurfacetype', 'roadtype', 'road', 'accessroad', 'roadresponsibility')
      ensureString('roadResponsibility', 'roadresponsibility', 'roadmaintenance')
      ensureString('rearExposure', 'rearexposure', 'rear_exposure')
      ensureString('lotDescription', 'lotdescription', 'lot_description')
      ensureString('lotDimensions', 'lotdimensions', 'lot_dimensions')
      ensureString('water', 'water')
      ensureString('sewer', 'sewer')
      ensureString('irrigation', 'irrigation')
      ensureString('boatDockInfo', 'boatdockinfo', 'boat/dock info')
      ensureString('gulfAccess', 'gulfaccess', 'gulf_access')
      ensureString('canalWidth', 'canalwidth', 'canal_width')
      ensureString('listingAgentName', 'listingagentname', 'listingagentfullname', 'agentname')
      ensureString('listingAgentName', 'listagentfullname', 'listagentname')
      ensureString('listingAgentLicense', 'listingagentlicense', 'agentlicense')
      ensureString('listingAgentLicense', 'listagentlicense')
      ensureString('listingAgentPhone', 'listingagentphone', 'agentphone')
      ensureString('listingAgentPhone', 'listagentphone', 'agentcellphone', 'agentprimaryphone')
      ensureString('listingAgentEmail', 'listingagentemail', 'agentemail')
      ensureString('appointmentPhone', 'appointmentphone', 'apptphone', 'showingcontactphone')
      ensureString('brokerage', 'listingofficename', 'brokerage', 'office')
      ensureString('brokerage', 'listofficename')
      ensureString('brokerageLicense', 'listingofficelicense', 'brokeragelicense', 'officelicense')
      ensureString('listingBroker', 'listingbroker', 'listingoffice', 'listoffice', 'listofficename')
      ensureString('officePhone', 'listingofficephone', 'officephone', 'listofficephone')
      ensureString('officeAddress', 'officeaddress', 'listingofficeaddress', 'listofficeaddress')
      ensureString('officeAddress', 'officeaddress', 'listingofficeaddress', 'listofficeaddress')
      ensureString('ownerName', 'ownername', 'owner_name')
      ensureString('ownerPhone', 'ownerphone', 'owner_phone')
      ensureString('ownerEmail', 'owneremail', 'owner_email')
      ensureStringArray('photos', 'photourls', 'photos', 'imageurls', 'images')
      ensureString('publicRemarks', 'publicremarks', 'remarks', 'description', 'publicdescription')
      ensureString('brokerRemarks', 'brokerremarks', 'privateremarks')
      ensureString('showingInstructions', 'showinginstructions')
      ensureString('flooring', 'flooring')
      ensureString('poolFeatures', 'poolfeatures', 'pool', 'featurepool')
      ensureString('fireplaceFeatures', 'fireplacefeatures')
      ensureString('kitchenFeatures', 'kitchenfeatures')
      ensureString('primarySuite', 'primarysuite')
      ensureString('primaryBathFeatures', 'primarybathfeatures', 'masterbathfeatures', 'masterbath')
      ensureString('laundryFeatures', 'laundryfeatures', 'laundry')
      ensureString('interiorFeatures', 'interiorfeatures', 'interior')
      ensureString('appliances', 'appliances')
      ensureString('constructionMaterials', 'constructionmaterials', 'construction')
      ensureString('roofType', 'roof')
      ensureString('foundationDetails', 'foundationdetails', 'foundation')
      ensureString('exteriorFinish', 'exteriorfinish', 'exteriorwall')
      ensureString('exteriorFeatures', 'exteriorfeatures')
      ensureString('propertyView', 'view')
      ensureString('waterSource', 'watersource')
      ensureString('sewerSystem', 'sewer', 'sewersystem', 'septic')
      ensureString('heatingType', 'heating', 'heatingtype')
      ensureString('coolingType', 'cooling', 'coolingtype')
      ensureNumber('masterHoaFee', 'masterhoafee', 'master_hoa_fee')
      ensureNumber('condoFee', 'condofee', 'condo_fee')
      ensureNumber('specialAssessment', 'specialassessment', 'specassessment', 'special_assessment')
      ensureNumber('otherFee', 'otherfee', 'other_fee')
      ensureNumber('landLease', 'landlease', 'land_lease')
      ensureNumber('mandatoryClubFee', 'mandatoryclubfee', 'mandatory_club_fee')
      ensureNumber('recreationLeaseFee', 'recleeasefee', 'recleasefee', 'rec_lease_fee')
      ensureNumber('totalAnnualRecurringFees', 'totalannualrecurringfees')
      ensureNumber('totalOneTimeFees', 'totalonetimefees')
      ensureString('terms', 'terms', 'termsconsidered', 'financingterms', 'financingavailable', 'financing')
      ensureString('possession', 'possession', 'availability', 'possessiondetails', 'possessionnotes')
      ensureString('approval', 'approval', 'approvalrequirements', 'approvalnotes')
      ensureString('taxDistrict', 'taxdistrict', 'taxarea', 'taxdistrictofficial')
      ensureString('taxDistrictType', 'taxdistricttype', 'taxdistricttype', 'taxdistrictclass', 'taxdistrict')
      ensureString('taxDescription', 'taxdescription', 'tax_desc')

      if (mappedProperty.status && !mappedProperty.workflowState) {
        const normalized = normalizeStatusValue(mappedProperty.status)
        if (normalized) {
          mappedProperty.status = normalized
          mappedProperty.workflowState = statusToWorkflowState(normalized)
        }
      }

      if (mappedProperty.newConstructionYN === undefined && typeof mappedProperty.yearBuilt === 'number') {
        const currentYear = new Date().getFullYear()
        if (mappedProperty.yearBuilt >= currentYear - 1) {
          mappedProperty.newConstructionYN = true
        }
      }

      if (mappedProperty.builderProductYN === undefined && mappedProperty.builderName) {
        mappedProperty.builderProductYN = true
      }

      if (mappedProperty.propertyView) {
        const rawView = mappedProperty.propertyView.trim()
        if (/^none\/?other$/i.test(rawView)) {
          setAdditionalValue('view_raw', 'Original View', rawView)
          mappedProperty.propertyView = 'None'
        } else if (/^none$/i.test(rawView)) {
          mappedProperty.propertyView = 'None'
        }
      }

      if (mappedProperty.roadSurfaceType) {
        const rawRoad = mappedProperty.roadSurfaceType.trim()
        if (/^access road$/i.test(rawRoad)) {
          setAdditionalValue('road_surface_raw', 'Original Road Surface', rawRoad)
          mappedProperty.roadSurfaceType = 'Paved'
        }
      }

      if (mappedProperty.terms) {
        const rawTerms = mappedProperty.terms.trim()
        if (/buyer\s*finance\s*\/\s*cash/i.test(rawTerms)) {
          setAdditionalValue('terms_raw', 'Original Terms', rawTerms)
          mappedProperty.terms = 'Cash, Conventional, FHA, VA'
        }
      }

      if (mappedProperty.approval) {
        if (/^none$/i.test(mappedProperty.approval.trim())) {
          mappedProperty.approval = 'None'
        }
      }

      if (mappedProperty.taxDistrictType) {
        const trimmed = mappedProperty.taxDistrictType.trim()
        if (/^not applicable$/i.test(trimmed)) {
          mappedProperty.taxDistrictType = 'Not Applicable'
        }
      }
      ensureString('terms', 'terms')
      ensureString('possession', 'possession')
      ensureString('approval', 'approval')
      ensureString('management', 'management')
      ensureString('officeCode', 'officecode')
      ensureString('officeName', 'officename')
      ensureString('officePhone', 'officephone', 'office ph')
      ensureString('officeAddress', 'officeaddress')
      ensureString('listingAgentMlsId', 'agentid')
      ensureString('listingAgentFax', 'agentfax')
      ensureString('appointmentRequired', 'appointmentrequired', 'appointment req.', 'appointment req')
      ensureString('targetMarketing', 'targetmarketing')
      ensureString('internetSites', 'internetsites')
      ensureString('listingOnInternet', 'listingoninternet')
      ensureString('addressOnInternet', 'addressoninternet')
      ensureString('blogging', 'blogging')
      ensureString('avm', 'avm')
      ensureString('virtualTourUrl', 'virtualtoururl', 'virtualtour', 'toururl', 'unbrandedvirtualtour')
      ensureString('videoUrl', 'videourl', 'tourvideo', 'video')
      ensureString('coverPhotoUrl', 'coverphotourl', 'coverphoto', 'primaryphotourl')
      ensureNumber('viewCount', 'viewcount', 'views')
      ensureNumber('leadCount', 'leadcount', 'leads')
      ensureNumber('favoriteCount', 'favoritecount', 'favorites', 'savedcount')
      ensureString('listingBroker', 'listingbroker')
      ensureString('legalDescription', 'legaldescription', 'legal desc')
      ensureString('sectionTownRange', 'sectownrng', 'sec/town/rng')
      ensureString('auction', 'auction')
      ensureString('foreclosed', 'foreclosed', 'foreclosed (reo)')
      ensureString('shortSale', 'shortsale', 'potential short sale')
      mappedProperty.additionalFields = mappedProperty.additionalFields || (draftListing.additionalFields as typeof mappedProperty.additionalFields)
      if (!mappedProperty.sourceExtractedFields && draftListing.extracted) {
        mappedProperty.sourceExtractedFields = draftListing.extracted as typeof mappedProperty.sourceExtractedFields
      }
      if (!mappedProperty.sourceMatches && draftListing.matches) {
        mappedProperty.sourceMatches = draftListing.matches as typeof mappedProperty.sourceMatches
      }

      const assignStringFromAdditional = (key: keyof MLSProperty, fieldKey: string) => {
        const current = toTrimmedString((mappedProperty as any)[key])
        if (!current) {
          const value = toTrimmedString(getAdditional(fieldKey))
          if (value) (mappedProperty as any)[key] = value
        }
      }

      const assignNumberFromAdditional = (key: keyof MLSProperty, ...fieldKeys: string[]) => {
        const current = (mappedProperty as any)[key]
        if (current == null || current === 0) {
          for (const field of fieldKeys) {
            const value = getNumericAdditional(field)
            if (value !== undefined) {
              (mappedProperty as any)[key] = value
              break
            }
          }
        }
      }

      assignStringFromAdditional('geoArea', 'geo_area')
      assignStringFromAdditional('development', 'development')
      assignStringFromAdditional('propertyId', 'property_id')
      assignStringFromAdditional('statusType', 'status_type')
      assignStringFromAdditional('listingType', 'listing_type')
      assignStringFromAdditional('floorPlanDescription', 'floor_plan_description')
      assignStringFromAdditional('floorPlanType', 'floor_plan_type')
      assignStringFromAdditional('subdivision', 'subdivision')
      assignStringFromAdditional('county', 'county')
      assignStringFromAdditional('parkingFeatures', 'parking_features')
      assignStringFromAdditional('primarySuite', 'primary_suite')
      assignStringFromAdditional('primaryBathFeatures', 'primary_bath_features')
      assignStringFromAdditional('exteriorFinish', 'exterior_finish')
      assignStringFromAdditional('builderName', 'builder_name')
      assignStringFromAdditional('listingBroker', 'listing_broker')
      assignStringFromAdditional('listingAgentName', 'listing_agent_name')
      assignStringFromAdditional('listingAgentLicense', 'listing_agent_license')
      assignStringFromAdditional('listingAgentPhone', 'listing_agent_phone')
      assignStringFromAdditional('officeAddress', 'office_address')
      assignStringFromAdditional('terms', 'terms_considered')
      assignStringFromAdditional('possession', 'possession')
      assignStringFromAdditional('approval', 'approval')
      assignStringFromAdditional('taxDistrict', 'tax_district')
      assignStringFromAdditional('taxDistrictType', 'tax_district_type')
      assignStringFromAdditional('virtualTourUrl', 'virtual_tour_url')
      assignStringFromAdditional('videoUrl', 'video_url')
      assignNumberFromAdditional('dom', 'dom')
      assignNumberFromAdditional('cdom', 'cdom')
      assignNumberFromAdditional('taxes', 'taxes', 'annual_taxes')
      assignNumberFromAdditional('taxYear', 'tax_year')
      assignNumberFromAdditional('hoaFee', 'hoa_fee')
      assignNumberFromAdditional('masterHoaFee', 'master_hoa_fee')
      assignNumberFromAdditional('condoFee', 'condo_fee')
      assignNumberFromAdditional('buyerAgentCompensation', 'buyer_agent_compensation', 'buyer_agent_percent')
      assignNumberFromAdditional('specialAssessment', 'special_assessment')
      assignNumberFromAdditional('specialAssessments', 'special_assessments', 'special_assessment')
      assignNumberFromAdditional('otherFee', 'other_fee')
      assignNumberFromAdditional('landLease', 'land_lease')
      assignNumberFromAdditional('mandatoryClubFee', 'mandatory_club_fee')
      assignNumberFromAdditional('recreationLeaseFee', 'recreation_lease_fee')
      assignNumberFromAdditional('totalAnnualRecurringFees', 'total_annual_recurring_fees')
      assignNumberFromAdditional('totalOneTimeFees', 'total_one_time_fees')
      assignNumberFromAdditional('viewCount', 'view_count')
      assignNumberFromAdditional('leadCount', 'lead_count')
      assignNumberFromAdditional('favoriteCount', 'favorite_count')
      ensureNumber('otherFee', 'otherfee', 'other_fee')
      ensureNumber('landLease', 'landlease', 'land_lease')
      ensureNumber('mandatoryClubFee', 'mandatoryclubfee', 'mandatory_club_fee')
      ensureNumber('recreationLeaseFee', 'recleeasefee', 'recleasefee', 'rec_lease_fee')
      ensureNumber('totalAnnualRecurringFees', 'totalannualrecurringfees')
      ensureNumber('totalOneTimeFees', 'totalonetimefees')
      ensureString('taxDescription', 'taxdescription', 'tax_desc')
      ensureString('terms', 'terms')
      ensureString('possession', 'possession')
      ensureString('approval', 'approval')
      ensureString('management', 'management')
      ensureString('officeCode', 'officecode')
      ensureString('officeName', 'officename')
      ensureString('officePhone', 'officephone', 'office ph')
      ensureString('officeAddress', 'officeaddress')
      ensureString('listingAgentMlsId', 'agentid')
      ensureString('listingAgentFax', 'agentfax')
      ensureString('appointmentRequired', 'appointmentrequired', 'appointment req.', 'appointment req')
      ensureString('targetMarketing', 'targetmarketing')
      ensureString('internetSites', 'internetsites')
      ensureString('listingOnInternet', 'listingoninternet')
      ensureString('addressOnInternet', 'addressoninternet')
      ensureString('blogging', 'blogging')
      ensureString('avm', 'avm')
      ensureString('listingBroker', 'listingbroker')
      ensureString('legalDescription', 'legaldescription', 'legal desc')
      ensureString('sectionTownRange', 'sectownrng', 'sec/town/rng')
      ensureString('auction', 'auction')
      ensureString('foreclosed', 'foreclosed', 'foreclosed (reo)')
      ensureString('shortSale', 'shortsale', 'potential short sale')
      const propertyCategoryValue = toTrimmedString(pickValue('propertycategory', 'propertytype', 'type'))
      if (propertyCategoryValue && !toTrimmedString(mappedProperty.propertyType)) {
        mappedProperty.propertyType = propertyCategoryValue
      }
      if (propertyCategoryValue) {
        ;(mappedProperty as any).PropertyCategory = propertyCategoryValue
      }

      if (!mappedProperty.status) {
        const statusText = toTrimmedString(
          pickValue('status', 'listingstatus', 'statuspublic', 'currentstatus', 'mlsstatus', 'statusremarks')
        )
        if (statusText && !(mappedProperty as any).sourceStatus) {
          (mappedProperty as any).sourceStatus = statusText
        }
        const normalized = normalizeStatusValue(statusText)
        if (normalized) {
          mappedProperty.status = normalized
          mappedProperty.workflowState = statusToWorkflowState(normalized)
        }
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

      const sanitizedMLSNumber = sanitizeMLSNumber(mappedProperty.mlsNumber)
      if (sanitizedMLSNumber) {
        mappedProperty.mlsNumber = sanitizedMLSNumber
      } else {
        const fallbackMLS = findMLSFromSources()
        if (fallbackMLS) {
          mappedProperty.mlsNumber = fallbackMLS
        }
      }

      // Ensure required fields have defaults
      const finalStatus = mappedProperty.status ?? 'draft'
      const finalWorkflowState =
        mappedProperty.workflowState ?? statusToWorkflowState(finalStatus)

      const { subtype: cleanedSubType, pets } = splitPetInfoFromSubType(mappedProperty.propertySubType)
      mappedProperty.propertySubType = cleanedSubType

      if (mappedProperty.waterSource && /waterfront/i.test(mappedProperty.waterSource)) {
        const cleanedWaterfront = mappedProperty.waterSource.replace(/No Waterfront Descrip\./i, 'No Waterfront').trim()
        mappedProperty.water = mappedProperty.water || cleanedWaterfront
        mappedProperty.waterSource = undefined
      }

      if (mappedProperty.lotSizeAcres && mappedProperty.lotSizeAcres > 10 && mappedProperty.lotSize) {
        const acres = mappedProperty.lotSize / 43560
        if (acres > 0) {
          mappedProperty.lotSizeAcres = Number(acres.toFixed(3))
        }
      }

      if (!mappedProperty.listPricePerSqFt && mappedProperty.listPrice && mappedProperty.livingAreaSqFt) {
        const sqft = Number(mappedProperty.livingAreaSqFt)
        const price = Number(mappedProperty.listPrice)
        if (Number.isFinite(price) && Number.isFinite(sqft) && sqft > 0) {
          mappedProperty.listPricePerSqFt = Number((price / sqft).toFixed(2))
        }
      }

      if (mappedProperty.listPricePerSqFt && mappedProperty.listPricePerSqFt > 5000 && mappedProperty.listPrice && mappedProperty.livingAreaSqFt) {
        const sqft = Number(mappedProperty.livingAreaSqFt)
        const price = Number(mappedProperty.listPrice)
        if (Number.isFinite(price) && Number.isFinite(sqft) && sqft > 0) {
          mappedProperty.listPricePerSqFt = Number((price / sqft).toFixed(2))
        }
      }

      if (mappedProperty.flooring && /golf type/i.test(mappedProperty.flooring)) {
        const [flooringValue, golfInfo] = mappedProperty.flooring.split(/golf type/i)
        if (flooringValue) {
          mappedProperty.flooring = flooringValue.replace(/[,;:\s]+$/g, '').trim()
        }
        const trimmedGolf = golfInfo?.replace(/^[^a-z0-9]+/i, '').trim()
        if (trimmedGolf) {
          mappedProperty.golfType = mappedProperty.golfType || `Golf Type ${trimmedGolf}`
        }
      }

      if (mappedProperty.brokerage) {
        const cleanedBrokerage = mappedProperty.brokerage.replace(/\bCounty Permit #.*$/i, '').trim()
        mappedProperty.brokerage = cleanedBrokerage || mappedProperty.brokerage
      }

      if (mappedProperty.canalWidth) {
        const waterMatch = mappedProperty.canalWidth.match(/Water:\s*([^,;]+)/i)
        if (waterMatch) {
          const source = waterMatch[1]?.trim()
          if (source && !mappedProperty.waterSource) {
            mappedProperty.waterSource = source
          }
          mappedProperty.canalWidth = mappedProperty.canalWidth.replace(/Water:\s*[^,;]+/i, '').trim()
        }
      }

      if (mappedProperty.water) {
        const waterSegments = parseWaterSegments(mappedProperty.water)
        const waterfront = waterSegments.front || waterSegments.waterfront || waterSegments.waterfront
        if (waterfront) {
          mappedProperty.water = waterfront
        }
        const waterDescription = waterSegments.description || waterSegments['descrip'] || waterSegments['descrip.']
        if (waterDescription && !mappedProperty.waterSource) {
          mappedProperty.waterSource = waterDescription
        }
        const waterSourceFromWater = waterSegments.water
        if (waterSourceFromWater && !mappedProperty.waterSource) {
          mappedProperty.waterSource = waterSourceFromWater
        }
      }

      if (mappedProperty.waterSource) {
        const waterSourceSegments = parseWaterSegments(mappedProperty.waterSource)
        const normalizedSource = waterSourceSegments.water || waterSourceSegments.source
        const waterfront = waterSourceSegments.front || waterSourceSegments.waterfront
        if (normalizedSource) {
          mappedProperty.waterSource = normalizedSource
        }
        if (waterfront && !mappedProperty.water) {
          mappedProperty.water = waterfront
        }
      }

      if ((!mappedProperty.waterSource || mappedProperty.waterSource.length === 0) && mappedProperty.canalWidth) {
        const waterMatch = mappedProperty.canalWidth.match(/Water:\s*([^,;]+)/i)
        if (waterMatch) {
          const source = waterMatch[1]?.trim()
          if (source) {
            mappedProperty.waterSource = source
          }
        }
      }

      if (!mappedProperty.photos || mappedProperty.photos.length === 0) {
        const photoUrls = collectPhotoUrls()
        if (photoUrls.length > 0) {
          mappedProperty.photos = photoUrls.slice(0, MAX_PROPERTY_PHOTOS)
          if (!mappedProperty.coverPhotoUrl) {
            mappedProperty.coverPhotoUrl = photoUrls[0]
          }
        }
      }

    const sourceMatches = draftListing.matches?.map((match) => ({
      canonical: match?.canonical ?? '',
      label: match?.raw?.label ?? undefined,
      score: match?.score ?? undefined
    }))

    const sourceExtracted = draftListing.extracted
      ?.map((item) => {
        const value =
          typeof item.value === 'string'
            ? item.value.trim()
            : item.value !== undefined && item.value !== null
              ? String(item.value).trim()
              : ''
        if (!value) {
          return null
        }
        return {
          label: item.label ?? undefined,
          value,
          section: item.section ?? undefined
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    let combinedAdditionalFields = mergeAdditionalFields(
      mappedProperty.additionalFields as Record<string, AdditionalField> | undefined,
      draftListing.additionalFields
    )

    if (pets) {
      combinedAdditionalFields = {
        ...(combinedAdditionalFields ?? {}),
        pets_allowed: {
          label: 'Pets Allowed',
          value: pets,
        },
      }
    }

    if (combinedAdditionalFields) {
      mappedProperty.additionalFields = combinedAdditionalFields;
      if (typeof window !== 'undefined') {
        ;(window as any).__lastAdditionalFields = combinedAdditionalFields
      }
    }

    if (typeof window !== 'undefined') {
      ;(window as any).__lastNormalizedRecord = Array.from(normalizedRecord.entries())
      ;(window as any).__lastMappedProperty = mappedProperty
    }

    const combinedSourceExtracted = mappedProperty.sourceExtractedFields && mappedProperty.sourceExtractedFields.length > 0
      ? mappedProperty.sourceExtractedFields
      : sourceExtracted

    const combinedSourceMatches = mappedProperty.sourceMatches && mappedProperty.sourceMatches.length > 0
      ? mappedProperty.sourceMatches
      : sourceMatches

    return {
      id: mappedProperty.id || `draft_${Date.now()}_${index}`,
      mlsNumber: mappedProperty.mlsNumber || '',
      status: finalStatus,
      workflowState: finalWorkflowState,
        listingDate: mappedProperty.listingDate,
        expirationDate: mappedProperty.expirationDate,
        listPrice: mappedProperty.listPrice || 0,
        originalListPrice: mappedProperty.originalListPrice,
        listingType: mappedProperty.listingType,
        propertyType: mappedProperty.propertyType || '',
        propertySubType: mappedProperty.propertySubType,
        architecturalStyle: mappedProperty.architecturalStyle,
        floorPlanDescription: mappedProperty.floorPlanDescription ?? mappedProperty.publicRemarks,
        floorPlanType: mappedProperty.floorPlanType,
        yearBuilt: mappedProperty.yearBuilt || 0,
        newConstructionYN: mappedProperty.newConstructionYN,
        builderProductYN: mappedProperty.builderProductYN,
        builderName: mappedProperty.builderName,
        livingAreaSqFt: mappedProperty.livingAreaSqFt || 0,
        totalAreaSqFt: mappedProperty.totalAreaSqFt,
        bedrooms: mappedProperty.bedrooms || 0,
        bathrooms: mappedProperty.bathrooms || 0,
        bathroomsTotal:
          mappedProperty.bathroomsTotal !== undefined
            ? mappedProperty.bathroomsTotal
            : (() => {
                const full = typeof mappedProperty.bathrooms === 'number' ? mappedProperty.bathrooms : 0
                const half = typeof mappedProperty.bathroomsHalf === 'number' ? mappedProperty.bathroomsHalf : 0
                const total = full + half * 0.5
                return total > 0 ? parseFloat(total.toFixed(1)) : undefined
              })(),
        bathroomsHalf: mappedProperty.bathroomsHalf,
        bathroomsPartial: mappedProperty.bathroomsPartial,
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
        carportSpaces: mappedProperty.carportSpaces,
        taxes: mappedProperty.taxes,
        taxYear: mappedProperty.taxYear,
        hoaFee: mappedProperty.hoaFee,
        hoaFeeFrequency: mappedProperty.hoaFeeFrequency,
        buyerAgentCompensation: mappedProperty.buyerAgentCompensation,
        listingAgentName: mappedProperty.listingAgentName || '',
        listingAgentLicense: mappedProperty.listingAgentLicense || '',
        listingAgentPhone: mappedProperty.listingAgentPhone || '',
        listingAgentEmail: mappedProperty.listingAgentEmail,
        brokerage: mappedProperty.brokerage || '',
        brokerageLicense: mappedProperty.brokerageLicense,
        photos: mappedProperty.photos || [],
        coverPhotoUrl: mappedProperty.coverPhotoUrl,
        publicRemarks: mappedProperty.publicRemarks ?? mappedProperty.floorPlanDescription,
        brokerRemarks: mappedProperty.brokerRemarks,
        showingInstructions: mappedProperty.showingInstructions,
        virtualTourUrl: mappedProperty.virtualTourUrl,
        videoUrl: mappedProperty.videoUrl,
        // Feature fields
        flooring: mappedProperty.flooring,
        poolFeatures: mappedProperty.poolFeatures,
        fireplaceFeatures: mappedProperty.fireplaceFeatures,
        kitchenFeatures: mappedProperty.kitchenFeatures,
        primarySuite: mappedProperty.primarySuite,
        primaryBathFeatures: mappedProperty.primaryBathFeatures,
        laundryFeatures: mappedProperty.laundryFeatures,
        interiorFeatures: (mappedProperty as any).interiorFeatures,
        appliances: (mappedProperty as any).appliances,
        parkingFeatures: mappedProperty.parkingFeatures,
        stormProtection: mappedProperty.stormProtection,
        constructionMaterials: mappedProperty.constructionMaterials,
        roofType: mappedProperty.roofType,
        foundationDetails: mappedProperty.foundationDetails,
        exteriorFinish: mappedProperty.exteriorFinish,
        exteriorFeatures: mappedProperty.exteriorFeatures,
        windowFeatures: mappedProperty.windowFeatures,
        propertyView: mappedProperty.propertyView,
        waterSource: mappedProperty.waterSource,
        sewer: mappedProperty.sewer ?? mappedProperty.sewerSystem,
        sewerSystem: mappedProperty.sewerSystem,
      heatingType: mappedProperty.heatingType,
      coolingType: mappedProperty.coolingType,
      pool: mappedProperty.pool,
      fireplace: mappedProperty.fireplace,
      createdAt: mappedProperty.createdAt || new Date().toISOString(),
      lastModified: mappedProperty.lastModified || new Date().toISOString(),
      completionPercentage: mappedProperty.completionPercentage || 0,
      validationErrors: mappedProperty.validationErrors || [],
      validationWarnings: mappedProperty.validationWarnings || [],
      publishedAt: mappedProperty.publishedAt,
      closedAt: mappedProperty.closedAt,
      viewCount: mappedProperty.viewCount,
      leadCount: mappedProperty.leadCount,
      favoriteCount: mappedProperty.favoriteCount,
      listPricePerSqFt:
        mappedProperty.listPricePerSqFt !== undefined
          ? mappedProperty.listPricePerSqFt
          : mappedProperty.livingAreaSqFt && mappedProperty.livingAreaSqFt > 0
              ? parseFloat(((mappedProperty.listPrice || 0) / mappedProperty.livingAreaSqFt).toFixed(2))
              : undefined,
      statusType: mappedProperty.statusType,
      geoArea: mappedProperty.geoArea,
      development: mappedProperty.development,
      propertyId: mappedProperty.propertyId,
      dom: mappedProperty.dom,
      cdom: mappedProperty.cdom,
      domSource: mappedProperty.domSource,
      cdomSource: mappedProperty.cdomSource,
      communityType: mappedProperty.communityType,
      golfType: mappedProperty.golfType,
      gulfAccess: mappedProperty.gulfAccess,
      canalWidth: mappedProperty.canalWidth,
      rearExposure: mappedProperty.rearExposure,
      lotDescription: mappedProperty.lotDescription,
      lotDimensions: mappedProperty.lotDimensions,
      roadResponsibility: mappedProperty.roadResponsibility,
      roadSurfaceType: mappedProperty.roadSurfaceType,
      accessType: mappedProperty.accessType,
      directions: mappedProperty.directions,
      water: mappedProperty.water,
      irrigation: mappedProperty.irrigation,
      boatDockInfo: mappedProperty.boatDockInfo,
      taxDistrict: mappedProperty.taxDistrict,
      taxDistrictType: mappedProperty.taxDistrictType,
      taxDescription: mappedProperty.taxDescription,
      terms: mappedProperty.terms,
      possession: mappedProperty.possession,
      approval: mappedProperty.approval,
      ownership: mappedProperty.ownership,
      petsAllowed: mappedProperty.petsAllowed,
      masterHoaFee: mappedProperty.masterHoaFee,
      masterHoaFeeFrequency: mappedProperty.masterHoaFeeFrequency,
      associationYN: mappedProperty.associationYN,
      condoFee: mappedProperty.condoFee,
      specialAssessments: mappedProperty.specialAssessments ?? mappedProperty.specialAssessment,
      specialAssessment: mappedProperty.specialAssessment,
      otherFee: mappedProperty.otherFee,
      landLease: mappedProperty.landLease,
      mandatoryClubFee: mappedProperty.mandatoryClubFee,
      recreationLeaseFee: mappedProperty.recreationLeaseFee,
      totalAnnualRecurringFees: mappedProperty.totalAnnualRecurringFees,
      totalOneTimeFees: mappedProperty.totalOneTimeFees,
      officeCode: mappedProperty.officeCode,
      officeName: mappedProperty.officeName,
      officePhone: mappedProperty.officePhone,
      officeAddress: mappedProperty.officeAddress,
      listingAgentMlsId: mappedProperty.listingAgentMlsId,
      listingAgentFax: mappedProperty.listingAgentFax,
      appointmentRequired: mappedProperty.appointmentRequired,
      appointmentPhone: mappedProperty.appointmentPhone,
      listingBroker: mappedProperty.listingBroker,
      legalDescription: mappedProperty.legalDescription,
      sectionTownRange: mappedProperty.sectionTownRange,
      elementarySchool: mappedProperty.elementarySchool,
      middleSchool: mappedProperty.middleSchool,
      highSchool: mappedProperty.highSchool,
      rooms: mappedProperty.rooms,
      mlsCompliant: mappedProperty.mlsCompliant,
      fileName: mappedProperty.fileName,
      fieldMatches: mappedProperty.fieldMatches,
      isFeatured: mappedProperty.isFeatured,
      additionalFields: combinedAdditionalFields,
      sourceExtractedFields: combinedSourceExtracted,
      sourceMatches: combinedSourceMatches,
      ownerName: mappedProperty.ownerName,
      ownerPhone: mappedProperty.ownerPhone,
      ownerEmail: mappedProperty.ownerEmail
    } as MLSProperty
  })

    console.log('🔄 Converted properties with enhanced fields:', convertedProperties)
    if (convertedProperties.length > 0) {
      console.log('🧾 First converted property preview:', {
        propertyType: convertedProperties[0].propertyType,
        propertySubType: convertedProperties[0].propertySubType,
        status: convertedProperties[0].status,
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
        const updates = duplicates.filter((dup) => dup.reason === 'existing')
        const skipped = duplicates.filter((dup) => dup.reason === 'batch_duplicate')

        if (updates.length > 0) {
          const updateDetails = updates
            .map((dup) => {
              const identifier = dup.mlsNumber && dup.mlsNumber.trim().length > 0
                ? `MLS ${dup.mlsNumber}`
                : dup.address || 'Listing'
              return `${identifier} (updated existing listing)`
            })
            .join(', ')

          toast({
            title: updates.length === 1 ? 'Existing listing updated' : 'Existing listings updated',
            description: updateDetails,
            variant: 'info',
          })
        }

        if (skipped.length > 0) {
          const duplicateDetails = skipped
          .map((dup) => {
            const identifier = dup.mlsNumber && dup.mlsNumber.trim().length > 0
              ? `MLS ${dup.mlsNumber}`
              : dup.address || 'Listing'
            return `${identifier} (duplicate in upload file)`
          })
          .join(', ')

        toast({
          title: 'Duplicate listings skipped',
          description: duplicateDetails,
          variant: 'destructive',
        })
        }
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
    setEditingProperty((previous) => {
      if (!previous) {
        return previous
      }

      const next: MLSProperty = {
        ...previous,
        [field]: value,
      }

      if (field === 'publicRemarks') {
        next.floorPlanDescription = value
      }

      if (field === 'listPrice' || field === 'livingAreaSqFt') {
        const listPrice = typeof next.listPrice === 'number' ? next.listPrice : Number(next.listPrice) || 0
        const livingArea =
          typeof next.livingAreaSqFt === 'number' ? next.livingAreaSqFt : Number(next.livingAreaSqFt) || 0
        if (livingArea > 0) {
          const computed = listPrice / livingArea
          next.listPricePerSqFt = Number.isFinite(computed) ? parseFloat(computed.toFixed(2)) : undefined
        } else {
          next.listPricePerSqFt = undefined
        }
      }

      if (field === 'bathrooms' || field === 'bathroomsHalf') {
        const fullBaths = typeof next.bathrooms === 'number' && !Number.isNaN(next.bathrooms) ? next.bathrooms : 0
        const halfBaths =
          typeof next.bathroomsHalf === 'number' && !Number.isNaN(next.bathroomsHalf) ? next.bathroomsHalf : 0
        const total = fullBaths + halfBaths * 0.5
        next.bathroomsTotal = total > 0 ? parseFloat(total.toFixed(1)) : undefined
      }

      if (field === 'garageType' && typeof value === 'string') {
        if (value.toLowerCase().includes('carport')) {
          next.garageSpaces = 0
        }
      }

      if (field === 'carportSpaces') {
        const numeric = typeof value === 'number' ? value : Number(value)
        if (
          numeric !== undefined &&
          !Number.isNaN(numeric) &&
          numeric > 0 &&
          typeof next.garageType === 'string' &&
          next.garageType.toLowerCase().includes('carport')
        ) {
          next.garageSpaces = 0
        }
      }

      if (field === 'status' && value) {
        const normalizedStatus = value as MLSProperty['status']
        if (normalizedStatus === 'active' || normalizedStatus === 'pending') {
          next.workflowState = 'LIVE'
        } else if (normalizedStatus === 'sold') {
          next.workflowState = 'SOLD'
        } else if (!next.workflowState || next.workflowState !== 'PROPERTY_PENDING') {
          next.workflowState = 'PROPERTY_PENDING'
        }
      }

      return next
    })
  }

  const listPricePerSqFtDisplay = editingProperty
    ? (() => {
        if (typeof editingProperty.listPricePerSqFt === 'number' && Number.isFinite(editingProperty.listPricePerSqFt)) {
          return editingProperty.listPricePerSqFt.toFixed(2)
        }
        if (editingProperty.livingAreaSqFt && editingProperty.livingAreaSqFt > 0) {
          const computed = editingProperty.listPrice / editingProperty.livingAreaSqFt
          if (Number.isFinite(computed)) {
            return computed.toFixed(2)
          }
        }
        return ''
      })()
    : ''

  const bathroomsTotalValue = editingProperty ? computeBathroomsTotal(editingProperty) : undefined
  const bathroomsTotalDisplay =
    bathroomsTotalValue === undefined
      ? ''
      : Number.isInteger(bathroomsTotalValue)
        ? bathroomsTotalValue.toString()
        : bathroomsTotalValue.toFixed(1)

  const handleAddRoom = () => {
    setEditingProperty((prev) => {
      if (!prev) return prev
      const rooms = Array.isArray(prev.rooms) ? [...prev.rooms] : []
      rooms.push({ name: '', level: '', length: undefined, width: undefined, dimensions: '' })
      return { ...prev, rooms }
    })
  }

  const handleRoomChange = (index: number, key: keyof MLSRoom, value: string | number | undefined) => {
    setEditingProperty((prev) => {
      if (!prev) return prev
      const rooms = Array.isArray(prev.rooms) ? [...prev.rooms] : []
      const existing: MLSRoom = { ...(rooms[index] || {}) }
      ;(existing as Record<string, unknown>)[key] = value
      rooms[index] = existing
      return { ...prev, rooms }
    })
  }

  const handleRemoveRoom = (index: number) => {
    setEditingProperty((prev) => {
      if (!prev) return prev
      const rooms = Array.isArray(prev.rooms) ? [...prev.rooms] : []
      rooms.splice(index, 1)
      return { ...prev, rooms }
    })
  }

  const updateAdditionalField = (fieldKey: string, value: string) => {
    setEditingProperty((prev) => {
      if (!prev) return prev
      const existingFields = prev.additionalFields ? { ...prev.additionalFields } : {}
      const currentField = existingFields[fieldKey]
      existingFields[fieldKey] = currentField
        ? { ...currentField, value }
        : {
            label: fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
            value,
          }
      return {
        ...prev,
        additionalFields: existingFields,
      }
    })
  }

  const renderAdditionalFieldInput = (key: string, field?: AdditionalField | null) => {
    if (!field) return null
    const label = field.label && field.label.trim().length > 0 ? field.label : key
    const value = field.value ?? ''
    const normalizedLabel = label.toLowerCase()
    const useTextarea =
      value.length > 80 ||
      /description|remarks|directions|instructions|comment|notes|disclosure/.test(normalizedLabel)
    const inputId = `additional-${key}`
    if (useTextarea) {
      const rows = value.length > 160 ? 6 : value.length > 80 ? 4 : 3
      return (
        <div key={key}>
          <Label htmlFor={inputId}>{label}</Label>
          <Textarea
            id={inputId}
            value={value}
            onChange={(e) => updateAdditionalField(key, e.target.value)}
            rows={rows}
          />
        </div>
      )
    }

    return (
      <div key={key}>
        <Label htmlFor={inputId}>{label}</Label>
        <Input
          id={inputId}
          value={value}
          onChange={(e) => updateAdditionalField(key, e.target.value)}
        />
      </div>
    )
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Draft Listings</h1>
          <p className="text-gray-600">
            Manage your property listings in progress ({filteredDraftListings.length} of {draftListings.length} drafts)
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowFiltersDialog(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filter
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2">{activeFilterCount}</Badge>
            )}
          </Button>
          <Button onClick={() => setShowBulkUpload(true)} className="bg-blue-600 hover:bg-blue-700">
            <Upload className="w-4 h-4 mr-2" />
            Upload Listings
          </Button>
          <Button onClick={openNewDraftDialog}>
            <Plus className="w-4 h-4 mr-2" />
            New Draft
          </Button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {filteredDraftListings.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
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
        </div>
      )}

      {/* Draft listings grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDraftListings.map((draft) => {
          const errors = validateProperty(draft)
          const canPublish = errors.length === 0
          const isPublishing = publishingId === draft.id
          
          return (
            <Card key={draft.id} className={`hover:shadow-lg transition-shadow ${selectedListings.includes(draft.id) ? 'ring-2 ring-blue-500' : ''}`}>
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
              <TabsList className="grid w-full grid-cols-7">
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
                <TabsTrigger value="additional" className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Additional
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
                    <Label htmlFor="mlsNumber">MLS Number</Label>
                    <Input
                      id="mlsNumber"
                      value={editingProperty.mlsNumber || ''}
                      onChange={(e) => updateEditingProperty('mlsNumber', e.target.value)}
                      placeholder="e.g., 123456789"
                    />
                  </div>
                  <div>
                    <Label htmlFor="listingType">Listing Type</Label>
                    <Input
                      id="listingType"
                      value={editingProperty.listingType || ''}
                      onChange={(e) => updateEditingProperty('listingType', e.target.value)}
                      placeholder="e.g., Exclusive Right, Open Listing"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="originalListPrice">Original List Price</Label>
                    <Input
                      id="originalListPrice"
                      type="number"
                      value={editingProperty.originalListPrice ?? ''}
                      onChange={(e) =>
                        updateEditingProperty(
                          'originalListPrice',
                          e.target.value === '' ? undefined : parseFloat(e.target.value)
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="listPricePerSqFt">Price per Sq Ft (computed)</Label>
                    <Input
                      id="listPricePerSqFt"
                      value={listPricePerSqFtDisplay}
                      readOnly
                      placeholder="Computed from list price and living area"
                    />
                  </div>
                  <div>
                    <Label htmlFor="floorPlanType">Floor Plan Type</Label>
                    <Input
                      id="floorPlanType"
                      value={editingProperty.floorPlanType || ''}
                      onChange={(e) => updateEditingProperty('floorPlanType', e.target.value)}
                      placeholder="e.g., Split Bedroom, Great Room"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="propertySubType">Sub Type</Label>
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
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={editingProperty.status}
                      onValueChange={(value) => updateEditingProperty('status', value as MLSProperty['status'])}
                    >
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="sold">Sold</SelectItem>
                        <SelectItem value="withdrawn">Withdrawn</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="publicRemarks">Property Description / Public Remarks</Label>
                  <Textarea
                    id="publicRemarks"
                    value={editingProperty.publicRemarks ?? editingProperty.floorPlanDescription ?? ''}
                    onChange={(e) => updateEditingProperty('publicRemarks', e.target.value)}
                    rows={4}
                    placeholder="Narrative description pulled from MLS Public Remarks"
                  />
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

                <div>
                  <Label htmlFor="bathroomsTotal">Bathrooms Total (computed)</Label>
                  <Input
                    id="bathroomsTotal"
                    value={bathroomsTotalDisplay}
                    readOnly
                    placeholder="Auto-calculated as Full + (Half × 0.5)"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                  <div>
                    <Label htmlFor="totalAreaSqFt">Total Area (sq ft)</Label>
                    <Input
                      id="totalAreaSqFt"
                      type="number"
                      value={editingProperty.totalAreaSqFt ?? ''}
                      onChange={(e) =>
                        updateEditingProperty(
                          'totalAreaSqFt',
                          e.target.value === '' ? undefined : parseInt(e.target.value) || 0
                        )
                      }
                      placeholder="Overall under-roof square footage"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="builderProductYN">Builder Product</Label>
                    <Select
                      value={
                        editingProperty.builderProductYN === undefined
                          ? 'not_specified'
                          : editingProperty.builderProductYN
                          ? 'yes'
                          : 'no'
                      }
                      onValueChange={(value) =>
                        updateEditingProperty(
                          'builderProductYN',
                          value === 'yes' ? true : value === 'no' ? false : undefined
                        )
                      }
                    >
                      <SelectTrigger id="builderProductYN">
                        <SelectValue placeholder="Select Yes/No" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="not_specified">Not Specified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="builderName">Builder Name</Label>
                    <Input
                      id="builderName"
                      value={editingProperty.builderName || ''}
                      onChange={(e) => updateEditingProperty('builderName', e.target.value)}
                      placeholder="e.g., ABC Homes"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newConstructionYN">New Construction</Label>
                    <Select
                      value={
                        editingProperty.newConstructionYN === undefined
                          ? 'not_specified'
                          : editingProperty.newConstructionYN
                          ? 'yes'
                          : 'no'
                      }
                      onValueChange={(value) =>
                        updateEditingProperty(
                          'newConstructionYN',
                          value === 'yes' ? true : value === 'no' ? false : undefined
                        )
                      }
                    >
                      <SelectTrigger id="newConstructionYN">
                        <SelectValue placeholder="Select Yes/No" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="not_specified">Not Specified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dom">Days on Market (DOM)</Label>
                    <Input
                      id="dom"
                      type="number"
                      value={editingProperty.dom ?? ''}
                      readOnly
                      placeholder="MLS supplied"
                    />
                    {editingProperty?.domSource && (
                      <p className="text-xs text-muted-foreground mt-1">Source: {editingProperty.domSource}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="cdom">Cumulative DOM</Label>
                    <Input
                      id="cdom"
                      type="number"
                      value={editingProperty.cdom ?? ''}
                      readOnly
                      placeholder="MLS supplied"
                    />
                    {editingProperty?.cdomSource && (
                      <p className="text-xs text-muted-foreground mt-1">Source: {editingProperty.cdomSource}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="listingDate">Listing Date</Label>
                    <Input
                      id="listingDate"
                      type="date"
                      value={editingProperty.listingDate || ''}
                      onChange={(e) =>
                        updateEditingProperty('listingDate', e.target.value === '' ? undefined : e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="expirationDate">Expiration Date</Label>
                    <Input
                      id="expirationDate"
                      type="date"
                      value={editingProperty.expirationDate || ''}
                      onChange={(e) =>
                        updateEditingProperty('expirationDate', e.target.value === '' ? undefined : e.target.value)
                      }
                    />
                  </div>
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

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="geoArea">Geo Area / Area</Label>
                    <Input
                      id="geoArea"
                      value={editingProperty.geoArea || ''}
                      onChange={(e) => updateEditingProperty('geoArea', e.target.value)}
                      placeholder="MLS geographic area"
                    />
                  </div>
                  <div>
                    <Label htmlFor="development">Development</Label>
                    <Input
                      id="development"
                      value={editingProperty.development || ''}
                      onChange={(e) => updateEditingProperty('development', e.target.value)}
                      placeholder="Community or development name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sectionTownRange">Section/Township/Range</Label>
                    <Input
                      id="sectionTownRange"
                      value={editingProperty.sectionTownRange || ''}
                      onChange={(e) => updateEditingProperty('sectionTownRange', e.target.value)}
                      placeholder="Section-Township-Range"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="lotSize">Lot Size (sq ft) *</Label>
                    <Input
                      id="lotSize"
                      type="number"
                      value={editingProperty.lotSize || ''}
                      onChange={(e) => updateEditingProperty('lotSize', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lotSizeAcres">Lot Size (acres)</Label>
                    <Input
                      id="lotSizeAcres"
                      type="number"
                      value={editingProperty.lotSizeAcres ?? ''}
                      onChange={(e) =>
                        updateEditingProperty(
                          'lotSizeAcres',
                          e.target.value === '' ? undefined : parseFloat(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="lotDimensions">Lot Dimensions</Label>
                  <Input
                    id="lotDimensions"
                    value={editingProperty.lotDimensions || ''}
                    onChange={(e) => updateEditingProperty('lotDimensions', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="lotDescription">Lot Description / Features</Label>
                  <Textarea
                    id="lotDescription"
                    value={editingProperty.lotDescription || ''}
                    onChange={(e) => updateEditingProperty('lotDescription', e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="elementarySchool">Elementary School</Label>
                    <Input
                      id="elementarySchool"
                      value={editingProperty.elementarySchool || ''}
                      onChange={(e) => updateEditingProperty('elementarySchool', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="middleSchool">Middle School</Label>
                    <Input
                      id="middleSchool"
                      value={editingProperty.middleSchool || ''}
                      onChange={(e) => updateEditingProperty('middleSchool', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="highSchool">High School</Label>
                    <Input
                      id="highSchool"
                      value={editingProperty.highSchool || ''}
                      onChange={(e) => updateEditingProperty('highSchool', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="legalDescription">Legal Description</Label>
                  <Textarea
                    id="legalDescription"
                    value={editingProperty.legalDescription || ''}
                    onChange={(e) => updateEditingProperty('legalDescription', e.target.value)}
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="directions">Driving Directions</Label>
                  <Textarea
                    id="directions"
                    value={editingProperty.directions || ''}
                    onChange={(e) => updateEditingProperty('directions', e.target.value)}
                    rows={3}
                    placeholder="Driving directions as published in MLS"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="roadSurfaceType">Road Surface</Label>
                    <Input
                      id="roadSurfaceType"
                      value={editingProperty.roadSurfaceType || ''}
                      onChange={(e) => updateEditingProperty('roadSurfaceType', e.target.value)}
                      placeholder="e.g., Paved, Gravel"
                    />
                  </div>
                  <div>
                    <Label htmlFor="roadResponsibility">Road Responsibility</Label>
                    <Input
                      id="roadResponsibility"
                      value={editingProperty.roadResponsibility || ''}
                      onChange={(e) => updateEditingProperty('roadResponsibility', e.target.value)}
                      placeholder="e.g., Private Maintained"
                    />
                  </div>
                  <div>
                    <Label htmlFor="accessType">Access Type</Label>
                    <Input
                      id="accessType"
                      value={editingProperty.accessType || ''}
                      onChange={(e) => updateEditingProperty('accessType', e.target.value)}
                      placeholder="e.g., Private Road, Easement"
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

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Rooms &amp; Dimensions</Label>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddRoom}>
                      <Plus className="w-3 h-3 mr-1" /> Add Room
                    </Button>
                  </div>
                  {(editingProperty.rooms && editingProperty.rooms.length > 0) ? (
                    <div className="space-y-3">
                      {editingProperty.rooms.map((room, index) => (
                        <div key={`room-${index}`} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                          <div>
                            <Label htmlFor={`room-name-${index}`}>Type</Label>
                            <Input
                              id={`room-name-${index}`}
                              value={room?.name || ''}
                              onChange={(e) => handleRoomChange(index, 'name', e.target.value)}
                              placeholder="e.g., Primary Bedroom"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`room-level-${index}`}>Level</Label>
                            <Input
                              id={`room-level-${index}`}
                              value={room?.level || ''}
                              onChange={(e) => handleRoomChange(index, 'level', e.target.value)}
                              placeholder="e.g., First"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`room-length-${index}`}>Length (ft)</Label>
                            <Input
                              id={`room-length-${index}`}
                              type="number"
                              step="0.1"
                              value={room?.length ?? ''}
                              onChange={(e) =>
                                handleRoomChange(
                                  index,
                                  'length',
                                  e.target.value === '' ? undefined : parseFloat(e.target.value)
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`room-width-${index}`}>Width (ft)</Label>
                            <Input
                              id={`room-width-${index}`}
                              type="number"
                              step="0.1"
                              value={room?.width ?? ''}
                              onChange={(e) =>
                                handleRoomChange(
                                  index,
                                  'width',
                                  e.target.value === '' ? undefined : parseFloat(e.target.value)
                                )
                              }
                            />
                          </div>
                          <div className="md:col-span-1">
                            <Label htmlFor={`room-dimensions-${index}`}>Dimensions</Label>
                            <Input
                              id={`room-dimensions-${index}`}
                              value={room?.dimensions || ''}
                              onChange={(e) => handleRoomChange(index, 'dimensions', e.target.value)}
                              placeholder="e.g., 12 x 14"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="md:justify-self-end"
                            onClick={() => handleRemoveRoom(index)}
                            aria-label={`Remove room ${index + 1}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No rooms added yet. Use “Add Room” to capture room types and dimensions.</p>
                  )}
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
                      value={editingProperty.garageSpaces ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                        const normalized = raw === undefined || Number.isNaN(raw) ? undefined : raw
                        updateEditingProperty('garageSpaces', normalized)
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="carportSpaces">Carport Spaces</Label>
                    <Input
                      id="carportSpaces"
                      type="number"
                      value={editingProperty.carportSpaces ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                        const normalized = raw === undefined || Number.isNaN(raw) ? undefined : raw
                        updateEditingProperty('carportSpaces', normalized)
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="garageType">Garage/Carport Type</Label>
                    <Input
                      id="garageType"
                      value={editingProperty.garageType || ''}
                      onChange={(e) => updateEditingProperty('garageType', e.target.value)}
                      placeholder="e.g., Attached, Detached, Carport"
                    />
                  </div>
                  <div>
                    <Label htmlFor="parkingFeatures">Parking Features</Label>
                    <Input
                      id="parkingFeatures"
                      value={editingProperty.parkingFeatures || ''}
                      onChange={(e) => updateEditingProperty('parkingFeatures', e.target.value)}
                      placeholder="e.g., Circular Driveway, EV Charging, Driveway Pavers"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="flooring">Flooring</Label>
                    <Input
                      id="flooring"
                      value={editingProperty.flooring || ''}
                      onChange={(e) => updateEditingProperty('flooring', e.target.value)}
                      placeholder="e.g., Hardwood, Tile, Luxury Vinyl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="stormProtection">Storm Protection</Label>
                    <Input
                      id="stormProtection"
                      value={editingProperty.stormProtection || ''}
                      onChange={(e) => updateEditingProperty('stormProtection', e.target.value)}
                      placeholder="e.g., Impact Resistant Doors/Windows"
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

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                    <Label htmlFor="primarySuite">Primary Bedroom/Bath Features</Label>
                    <Input
                      id="primarySuite"
                      value={editingProperty.primarySuite || ''}
                      onChange={(e) => updateEditingProperty('primarySuite', e.target.value)}
                      placeholder="e.g., Walk-in Closet, En-suite Bath"
                    />
                  </div>
                  <div>
                    <Label htmlFor="primaryBathFeatures">Primary Bath Features</Label>
                    <Input
                      id="primaryBathFeatures"
                      value={editingProperty.primaryBathFeatures || ''}
                      onChange={(e) => updateEditingProperty('primaryBathFeatures', e.target.value)}
                      placeholder="e.g., Dual Sinks, Garden Tub"
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
                    <Label htmlFor="exteriorFinish">Exterior Finish</Label>
                    <Input
                      id="exteriorFinish"
                      value={editingProperty.exteriorFinish || ''}
                      onChange={(e) => updateEditingProperty('exteriorFinish', e.target.value)}
                      placeholder="e.g., Stucco, Hardie Board"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                    <Label htmlFor="windowFeatures">Window Features</Label>
                    <Input
                      id="windowFeatures"
                      value={editingProperty.windowFeatures || ''}
                      onChange={(e) => updateEditingProperty('windowFeatures', e.target.value)}
                      placeholder="e.g., Impact Resistant Windows, Double Pane"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="propertyView">View</Label>
                    <Input
                      id="propertyView"
                      value={editingProperty.propertyView || ''}
                      onChange={(e) => updateEditingProperty('propertyView', e.target.value)}
                      placeholder="e.g., None, Preserve, Lake"
                    />
                  </div>
                  <div>
                    <Label htmlFor="communityType">Community Type</Label>
                    <Input
                      id="communityType"
                      value={editingProperty.communityType || ''}
                      onChange={(e) => updateEditingProperty('communityType', e.target.value)}
                      placeholder="e.g., Gated, Non-Gated"
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
                    <Label htmlFor="sewer">Sewer</Label>
                    <Input
                      id="sewer"
                      value={editingProperty.sewer || ''}
                      onChange={(e) => updateEditingProperty('sewer', e.target.value)}
                      placeholder="e.g., Septic, Public Sewer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="heatingType">Heating</Label>
                    <Input
                      id="heatingType"
                      value={editingProperty.heatingType || ''}
                      onChange={(e) => updateEditingProperty('heatingType', e.target.value)}
                      placeholder="e.g., Forced Air, Radiant, Heat Pump"
                    />
                  </div>
                  <div>
                    <Label htmlFor="coolingType">Cooling</Label>
                    <Input
                      id="coolingType"
                      value={editingProperty.coolingType || ''}
                      onChange={(e) => updateEditingProperty('coolingType', e.target.value)}
                      placeholder="e.g., Central Air, Window Units, None"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="irrigation">Irrigation</Label>
                  <Input
                    id="irrigation"
                    value={editingProperty.irrigation || ''}
                    onChange={(e) => updateEditingProperty('irrigation', e.target.value)}
                    placeholder="e.g., Central, Reclaimed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="pool"
                      checked={!!editingProperty.pool}
                      onCheckedChange={(checked) => updateEditingProperty('pool', checked === true)}
                    />
                    <Label htmlFor="pool">Pool</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fireplace"
                      checked={!!editingProperty.fireplace}
                      onCheckedChange={(checked) => updateEditingProperty('fireplace', checked === true)}
                    />
                    <Label htmlFor="fireplace">Fireplace</Label>
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
                      onChange={(e) => updateEditingProperty('taxes', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="taxYear">Tax Year</Label>
                    <Input
                      id="taxYear"
                      type="number"
                      value={editingProperty.taxYear || ''}
                      onChange={(e) => updateEditingProperty('taxYear', e.target.value === '' ? undefined : parseInt(e.target.value))}
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
                      onChange={(e) => updateEditingProperty('hoaFee', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="masterHoaFee">Master HOA Fee</Label>
                    <Input
                      id="masterHoaFee"
                      type="number"
                      value={editingProperty.masterHoaFee ?? ''}
                      onChange={(e) =>
                        updateEditingProperty(
                          'masterHoaFee',
                          e.target.value === '' ? undefined : parseFloat(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="hoaFeeFrequency">HOA Fee Frequency</Label>
                    <Select
                      value={editingProperty.hoaFeeFrequency ?? 'not_specified'}
                      onValueChange={(value) =>
                        updateEditingProperty('hoaFeeFrequency', value === 'not_specified' ? undefined : value)
                      }
                    >
                      <SelectTrigger id="hoaFeeFrequency">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_specified">Not Specified</SelectItem>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                        <SelectItem value="Quarterly">Quarterly</SelectItem>
                        <SelectItem value="Semi-Annually">Semi-Annually</SelectItem>
                        <SelectItem value="Annually">Annually</SelectItem>
                        <SelectItem value="Weekly">Weekly</SelectItem>
                        <SelectItem value="Daily">Daily</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="masterHoaFeeFrequency">Master HOA Fee Frequency</Label>
                    <Select
                      value={editingProperty.masterHoaFeeFrequency ?? 'not_specified'}
                      onValueChange={(value) =>
                        updateEditingProperty('masterHoaFeeFrequency', value === 'not_specified' ? undefined : value)
                      }
                    >
                      <SelectTrigger id="masterHoaFeeFrequency">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_specified">Not Specified</SelectItem>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                        <SelectItem value="Quarterly">Quarterly</SelectItem>
                        <SelectItem value="Semi-Annually">Semi-Annually</SelectItem>
                        <SelectItem value="Annually">Annually</SelectItem>
                        <SelectItem value="Weekly">Weekly</SelectItem>
                        <SelectItem value="Daily">Daily</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="associationYN">Association Mandatory?</Label>
                    <Select
                      value={
                        editingProperty.associationYN === undefined
                          ? 'not_specified'
                          : editingProperty.associationYN
                          ? 'yes'
                          : 'no'
                      }
                      onValueChange={(value) =>
                        updateEditingProperty(
                          'associationYN',
                          value === 'not_specified' ? undefined : value === 'yes'
                        )
                      }
                    >
                      <SelectTrigger id="associationYN">
                        <SelectValue placeholder="Select Yes/No" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_specified">Not Specified</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="condoFee">Condo Fee</Label>
                    <Input
                      id="condoFee"
                      type="number"
                      value={editingProperty.condoFee ?? ''}
                      onChange={(e) =>
                        updateEditingProperty('condoFee', e.target.value === '' ? undefined : parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="buyerAgentCompensation">Buyer Agent Compensation (%)</Label>
                    <Input
                      id="buyerAgentCompensation"
                      type="number"
                      step="0.1"
                      value={editingProperty.buyerAgentCompensation || ''}
                      onChange={(e) =>
                        updateEditingProperty(
                          'buyerAgentCompensation',
                          e.target.value === '' ? undefined : parseFloat(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="specialAssessments">Special Assessment</Label>
                    <Input
                      id="specialAssessments"
                      type="number"
                      value={
                        editingProperty.specialAssessments ??
                        editingProperty.specialAssessment ??
                        ''
                      }
                      onChange={(e) => {
                        const value = e.target.value === '' ? undefined : parseFloat(e.target.value)
                        updateEditingProperty('specialAssessments', value)
                        updateEditingProperty('specialAssessment', value)
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="otherFee">Other Fee</Label>
                    <Input
                      id="otherFee"
                      type="number"
                      value={editingProperty.otherFee ?? ''}
                      onChange={(e) =>
                        updateEditingProperty('otherFee', e.target.value === '' ? undefined : parseFloat(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="landLease">Land Lease</Label>
                    <Input
                      id="landLease"
                      type="number"
                      value={editingProperty.landLease ?? ''}
                      onChange={(e) =>
                        updateEditingProperty('landLease', e.target.value === '' ? undefined : parseFloat(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="mandatoryClubFee">Mandatory Club Fee</Label>
                    <Input
                      id="mandatoryClubFee"
                      type="number"
                      value={editingProperty.mandatoryClubFee ?? ''}
                      onChange={(e) =>
                        updateEditingProperty(
                          'mandatoryClubFee',
                          e.target.value === '' ? undefined : parseFloat(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="recreationLeaseFee">Recreation Lease Fee</Label>
                    <Input
                      id="recreationLeaseFee"
                      type="number"
                      value={editingProperty.recreationLeaseFee ?? ''}
                      onChange={(e) =>
                        updateEditingProperty(
                          'recreationLeaseFee',
                          e.target.value === '' ? undefined : parseFloat(e.target.value)
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="totalAnnualRecurringFees">Total Annual Recurring Fees</Label>
                    <Input
                      id="totalAnnualRecurringFees"
                      type="number"
                      value={editingProperty.totalAnnualRecurringFees ?? ''}
                      onChange={(e) =>
                        updateEditingProperty(
                          'totalAnnualRecurringFees',
                          e.target.value === '' ? undefined : parseFloat(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="totalOneTimeFees">Total One-Time Fees</Label>
                    <Input
                      id="totalOneTimeFees"
                      type="number"
                      value={editingProperty.totalOneTimeFees ?? ''}
                      onChange={(e) =>
                        updateEditingProperty(
                          'totalOneTimeFees',
                          e.target.value === '' ? undefined : parseFloat(e.target.value)
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="taxDistrict">Tax District</Label>
                    <Input
                      id="taxDistrict"
                      value={editingProperty.taxDistrict || ''}
                      onChange={(e) => updateEditingProperty('taxDistrict', e.target.value)}
                      placeholder="e.g., Lee County"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="taxDistrictType">Tax District Type</Label>
                    <Input
                      id="taxDistrictType"
                      value={editingProperty.taxDistrictType || ''}
                      onChange={(e) => updateEditingProperty('taxDistrictType', e.target.value)}
                      placeholder="e.g., Municipal, Special"
                    />
                  </div>
                  <div>
                    <Label htmlFor="taxDescription">Tax Description</Label>
                    <Textarea
                      id="taxDescription"
                      value={editingProperty.taxDescription || ''}
                      onChange={(e) => updateEditingProperty('taxDescription', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="terms">Terms</Label>
                    <Input
                      id="terms"
                      value={editingProperty.terms || ''}
                      onChange={(e) => updateEditingProperty('terms', e.target.value)}
                      placeholder="e.g., Cash, FHA, VA"
                    />
                  </div>
                  <div>
                    <Label htmlFor="possession">Possession</Label>
                    <Input
                      id="possession"
                      value={editingProperty.possession || ''}
                      onChange={(e) => updateEditingProperty('possession', e.target.value)}
                      placeholder="e.g., At Closing, Lease Back"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="approval">Approval</Label>
                    <Input
                      id="approval"
                      value={editingProperty.approval || ''}
                      onChange={(e) => updateEditingProperty('approval', e.target.value)}
                      placeholder="e.g., Application, Interview"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ownership">Ownership</Label>
                    <Input
                      id="ownership"
                      value={editingProperty.ownership || ''}
                      onChange={(e) => updateEditingProperty('ownership', e.target.value)}
                      placeholder="e.g., Single Family"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="petsAllowed">Pets Allowed</Label>
                  <Input
                    id="petsAllowed"
                    value={editingProperty.petsAllowed || ''}
                    onChange={(e) => updateEditingProperty('petsAllowed', e.target.value)}
                    placeholder="e.g., Not Allowed, With Approval"
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="listingBroker">Listing Broker</Label>
                    <Input
                      id="listingBroker"
                      value={editingProperty.listingBroker || ''}
                      onChange={(e) => updateEditingProperty('listingBroker', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="listingAgentMlsId">Agent MLS ID</Label>
                    <Input
                      id="listingAgentMlsId"
                      value={editingProperty.listingAgentMlsId || ''}
                      onChange={(e) => updateEditingProperty('listingAgentMlsId', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="listingAgentFax">Agent Fax</Label>
                    <Input
                      id="listingAgentFax"
                      value={editingProperty.listingAgentFax || ''}
                      onChange={(e) => updateEditingProperty('listingAgentFax', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="appointmentRequired">Appointment Required</Label>
                    <Input
                      id="appointmentRequired"
                      value={editingProperty.appointmentRequired || ''}
                      onChange={(e) => updateEditingProperty('appointmentRequired', e.target.value)}
                      placeholder="e.g., Yes, No"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="appointmentPhone">Appointment Phone</Label>
                  <Input
                    id="appointmentPhone"
                    value={editingProperty.appointmentPhone || ''}
                    onChange={(e) => updateEditingProperty('appointmentPhone', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="auction">Auction</Label>
                  <Input
                    id="auction"
                    value={editingProperty.auction || ''}
                    onChange={(e) => updateEditingProperty('auction', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="foreclosed">Foreclosed</Label>
                    <Input
                      id="foreclosed"
                      value={editingProperty.foreclosed || ''}
                      onChange={(e) => updateEditingProperty('foreclosed', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shortSale">Short Sale</Label>
                    <Input
                      id="shortSale"
                      value={editingProperty.shortSale || ''}
                      onChange={(e) => updateEditingProperty('shortSale', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="officeCode">Office Code</Label>
                    <Input
                      id="officeCode"
                      value={editingProperty.officeCode || ''}
                      onChange={(e) => updateEditingProperty('officeCode', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="officeName">Office Name</Label>
                    <Input
                      id="officeName"
                      value={editingProperty.officeName || ''}
                      onChange={(e) => updateEditingProperty('officeName', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="officePhone">Office Phone</Label>
                    <Input
                      id="officePhone"
                      value={editingProperty.officePhone || ''}
                      onChange={(e) => updateEditingProperty('officePhone', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <Label htmlFor="officeAddress">Office Address</Label>
                    <Textarea
                      id="officeAddress"
                      value={editingProperty.officeAddress || ''}
                      onChange={(e) => updateEditingProperty('officeAddress', e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="ownerName">Owner Name</Label>
                    <Input
                      id="ownerName"
                      value={editingProperty.ownerName || ''}
                      onChange={(e) => updateEditingProperty('ownerName', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ownerPhone">Owner Phone</Label>
                    <Input
                      id="ownerPhone"
                      value={editingProperty.ownerPhone || ''}
                      onChange={(e) => updateEditingProperty('ownerPhone', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ownerEmail">Owner Email</Label>
                    <Input
                      id="ownerEmail"
                      type="email"
                      value={editingProperty.ownerEmail || ''}
                      onChange={(e) => updateEditingProperty('ownerEmail', e.target.value)}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Additional Fields Tab */}
              <TabsContent value="additional" className="space-y-6">
                {(() => {
                  const additionalEntries = Object.entries(editingProperty.additionalFields ?? {})
                  if (additionalEntries.length === 0) {
                    return (
                      <Alert variant="outline">
                        <AlertDescription>
                          No additional MLS fields are available for this draft. Upload a richer MLS export to populate extended attributes.
                        </AlertDescription>
                      </Alert>
                    )
                  }

                  const sectionMap = new Map<string, Array<[string, AdditionalField]>>()
                  additionalEntries.forEach(([key, field]) => {
                    if (!field) return
                    const sectionName =
                      field.section && field.section.trim().length > 0 ? field.section.trim() : 'General'
                    if (!sectionMap.has(sectionName)) {
                      sectionMap.set(sectionName, [])
                    }
                    sectionMap.get(sectionName)!.push([key, field])
                  })

                  return Array.from(sectionMap.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([sectionName, fields]) => (
                      <div key={sectionName} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-700">{sectionName}</h3>
                          <Badge variant="outline">{fields.length}</Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {fields
                            .sort((a, b) => {
                              const labelA = a[1]?.label || a[0]
                              const labelB = b[1]?.label || b[0]
                              return labelA.localeCompare(labelB)
                            })
                            .map(([key, field]) => renderAdditionalFieldInput(key, field))}
                        </div>
                      </div>
                    ))
                })()}
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
                  <Label htmlFor="brokerRemarks">Broker Remarks (Private)</Label>
                  <Textarea
                    id="brokerRemarks"
                    value={editingProperty.brokerRemarks || ''}
                    onChange={(e) => updateEditingProperty('brokerRemarks', e.target.value)}
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="coverPhotoUrl">Cover Photo URL</Label>
                  <Input
                    id="coverPhotoUrl"
                    type="url"
                    value={editingProperty.coverPhotoUrl || ''}
                    onChange={(e) => updateEditingProperty('coverPhotoUrl', e.target.value || undefined)}
                    placeholder="https://example.com/your-cover-photo.jpg"
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
