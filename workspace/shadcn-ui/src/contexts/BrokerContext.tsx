import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { MLSProperty, ValidationError } from '@/types/MLSProperty'
import { MAX_PROPERTY_PHOTOS } from '@/constants/photoRequirements'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchBrokerProperties,
  promoteDraftProperty,
  publishBrokerProperty,
  unpublishBrokerProperty,
  closeBrokerProperty,
  updateBrokerProperty,
  deleteBrokerProperty,
  type BrokerPropertyRow,
  type PromoteDraftPayload,
} from '@/lib/api/properties'
import {
  createTeamMember as createTeamMemberApi,
  deleteTeamMember as deleteTeamMemberApi,
  listTeamMembers,
  updateTeamMemberApi,
  type TeamMemberRecord
} from '@/lib/api/hatch'

// Types for the broker context
interface Lead {
  id: string
  name: string
  email: string
  phone: string
  propertyId: string
  status: 'new' | 'contacted' | 'qualified' | 'closed'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  source: string
  createdAt: string
  notes?: string
  budget?: number
  score?: number
}

interface TeamMember {
  id: string
  tenantId: string
  orgId?: string
  name: string
  email: string
  phone?: string
  role: string
  status: 'active' | 'inactive' | 'pending'
  experienceYears?: number
  rating: number
  totalSales: number
  dealsInProgress: number
  openLeads: number
  responseTimeHours: number
  joinedAt: string
  lastActiveAt: string
  notes?: string
}

interface TeamSummary {
  totalMembers: number
  activeMembers: number
  inactiveMembers: number
  pendingMembers: number
  averageRating: number
  totalSales: number
}

interface TeamPerformance {
  name: string
  role: string
  status: TeamMember['status']
  rating: number
  totalSales: number
  dealsInProgress: number
  openLeads: number
  responseTimeHours: number
  experienceYears?: number
  joinedAt: string
  lastActiveAt: string
  notes?: string
}

type CreateTeamMemberInput = {
  name: string
  email: string
  phone?: string
  role: string
  status?: TeamMember['status']
  experienceYears?: number
  rating?: number
  totalSales?: number
  dealsInProgress?: number
  openLeads?: number
  responseTimeHours?: number
  notes?: string
}

interface DuplicateDraftNotice {
  mlsNumber?: string
  address?: string
  fileName?: string
  reason: 'existing' | 'batch_duplicate'
}

interface DraftImportWarnings {
  timeouts?: number
  failures?: number
}

interface DraftImportResult {
  created: MLSProperty[]
  duplicates: DuplicateDraftNotice[]
  warnings?: DraftImportWarnings
}

interface Property {
  id: string
  title: string
  address: string
  price: number
  status: 'active' | 'pending' | 'sold' | 'draft'
  type: 'residential' | 'commercial' | 'land'
  bedrooms: number
  bathrooms: number
  sqft: number
  listingDate: string
  images?: string[]
  description?: string
  agentId: string
  leadCount: number
  viewCount: number
  favoriteCount: number
}

interface BrokerContextType {
  // Properties
  properties: MLSProperty[]
  draftProperties: MLSProperty[]
  addProperty: (property: Property) => Promise<MLSProperty | null>
  updateProperty: (id: string, updates: Partial<MLSProperty>) => Promise<MLSProperty | null>
  deleteProperty: (id: string) => Promise<void>
  publishDraftProperty: (id: string) => Promise<MLSProperty>
  unpublishProperty: (id: string) => Promise<MLSProperty | null>
  updatePropertyStatus: (id: string, status: MLSProperty['status']) => Promise<MLSProperty | null>
  featureProperty: (id: string, isFeatured?: boolean) => void
  addDraftProperties: (draftListings: Record<string, unknown>[]) => Promise<DraftImportResult>
  getDraftProperties: () => MLSProperty[]
  
  // Leads
  leads: Lead[]
  addLead: (lead: Omit<Lead, 'id' | 'createdAt'>) => void
  updateLead: (id: string, updates: Partial<Lead>) => void
  deleteLead: (id: string) => void
  
  // Team
  teamMembers: TeamMember[]
  teamMembersLoading: boolean
  teamMembersError: string | null
  refreshTeamMembers: () => Promise<void>
  addTeamMember: (member: CreateTeamMemberInput) => Promise<TeamMember>
  updateTeamMember: (id: string, updates: Partial<TeamMember>) => Promise<TeamMember>
  removeTeamMember: (id: string) => Promise<void>
  getTeamSummary: () => TeamSummary
  getMemberPerformance: (id: string) => TeamPerformance | null

  // Analytics
  getAnalytics: () => {
    totalProperties: number
    activeProperties: number
    totalLeads: number
    newLeads: number
    conversionRate: number
  }
}

const BrokerContext = createContext<BrokerContextType | undefined>(undefined)

// Storage keys with size limits
const STORAGE_KEYS = {
  properties: 'broker_properties_demo_broker_1',
  draftProperties: 'broker_draft_properties_demo_broker_1',
  leads: 'broker_leads_demo_broker_1',
  teamMembers: 'broker_team_members_demo_broker_1'
}

// Storage size limits (in characters)
const STORAGE_LIMITS = {
  properties: 500000, // ~500KB
  draftProperties: 1000000, // ~1MB
  leads: 200000, // ~200KB
  teamMembers: 200000
}

const FALLBACK_DEMO_USER_ID = 'demo_broker_1'
const FALLBACK_DEMO_FIRM_ID = '550e8400-e29b-41d4-a716-446655440001'
const FALLBACK_TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'

// Helper function to safely store data with size checks
const safeSetItem = (key: string, data: Record<string, unknown>[], limit: number) => {
  try {
    const jsonString = JSON.stringify(data)
    
    // Check if data exceeds limit
    if (jsonString.length > limit) {
      console.warn(`Data for ${key} exceeds size limit. Truncating...`)
      
      // If it's an array, keep only the most recent items
      if (Array.isArray(data)) {
        const truncatedData = data.slice(-Math.floor(data.length * 0.7)) // Keep 70% of most recent items
        const truncatedString = JSON.stringify(truncatedData)
        
        if (truncatedString.length <= limit) {
          localStorage.setItem(key, truncatedString)
          console.log(`Truncated ${key} from ${data.length} to ${truncatedData.length} items`)
          return
        }
      }
      
      // If still too large, clear the storage
      console.warn(`Unable to store ${key} - clearing storage`)
      localStorage.removeItem(key)
      return
    }
    
    localStorage.setItem(key, jsonString)
  } catch (error) {
    if (error instanceof DOMException && error.code === 22) {
      console.error(`QuotaExceededError for ${key}. Clearing storage...`)
      localStorage.removeItem(key)
      
      // Try to clear other broker data to free up space
      Object.values(STORAGE_KEYS).forEach(storageKey => {
        if (storageKey !== key) {
          try {
            const existingData = localStorage.getItem(storageKey)
            if (existingData) {
              const parsed = JSON.parse(existingData)
              if (Array.isArray(parsed) && parsed.length > 10) {
                // Keep only 10 most recent items
                const reduced = parsed.slice(-10)
                localStorage.setItem(storageKey, JSON.stringify(reduced))
                console.log(`Reduced ${storageKey} to 10 items to free space`)
              }
            }
          } catch (cleanupError) {
            console.error(`Error cleaning up ${storageKey}:`, cleanupError)
            localStorage.removeItem(storageKey)
          }
        }
      })
    } else {
      console.error(`Error storing ${key}:`, error)
    }
  }
}

// Helper function to safely get data
const safeGetItem = (key: string, defaultValue: Record<string, unknown>[] = []) => {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch (error) {
    console.error(`Error parsing ${key}:`, error)
    localStorage.removeItem(key)
    return defaultValue
  }
}

// Helper function to safely process PhotoURLs and prevent phantom photos
const safeProcessPhotos = (photoData: unknown): string[] => {
  if (!photoData) return []
  
  if (Array.isArray(photoData)) {
    // If it's already an array, filter out empty/invalid URLs
    const cleaned = photoData
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      .map(url => url.trim())
      .filter(url => /^https?:\/\//i.test(url))
      .filter(url => !/example\.com/i.test(url))
    return Array.from(new Set(cleaned)).slice(0, MAX_PROPERTY_PHOTOS) // Limit to max unique photos
  }
  
  if (typeof photoData === 'string') {
    // If it's a string, split by semicolon and filter
    const cleaned = photoData
      .split(/[;,\n]/)
      .map(url => url.trim())
      .filter(url => url.length > 0 && url.startsWith('http')) // Only valid HTTP URLs
      .filter(url => !/example\.com/i.test(url))
    return Array.from(new Set(cleaned)).slice(0, MAX_PROPERTY_PHOTOS) // Limit to max unique photos
  }

  return []
}

const normaliseTeamMemberRecord = (record: TeamMemberRecord): TeamMember => ({
  id: record.id,
  tenantId: record.tenantId,
  orgId: record.orgId ?? undefined,
  name: record.name,
  email: record.email,
  phone: record.phone ?? undefined,
  role: record.role,
  status: record.status,
  experienceYears: record.experienceYears ?? undefined,
  rating: Number(record.rating ?? 0),
  totalSales: Number(record.totalSales ?? 0),
  dealsInProgress: Number(record.dealsInProgress ?? 0),
  openLeads: Number(record.openLeads ?? 0),
  responseTimeHours: Number(record.responseTimeHours ?? 0),
  joinedAt: record.joinedAt,
  lastActiveAt: record.lastActiveAt,
  notes: record.notes ?? undefined
})

const normalizeIdentifierValue = (value: unknown) => {
  if (value === undefined || value === null) {
    return ''
  }
  return String(value).trim().toLowerCase()
}

const buildListingIdentifier = (property: Partial<MLSProperty>): string | null => {
  const mls = normalizeIdentifierValue(property.mlsNumber)
  if (mls) {
    return `mls:${mls}`
  }

  const streetNumber = normalizeIdentifierValue(property.streetNumber)
  const streetName = normalizeIdentifierValue(property.streetName)
  const streetSuffix = normalizeIdentifierValue(property.streetSuffix)
  const city = normalizeIdentifierValue(property.city)
  const stateCode = normalizeIdentifierValue(property.state)
  const zip = normalizeIdentifierValue(property.zipCode)

  if (streetName && city && stateCode) {
    const streetSegments = [streetNumber, streetName, streetSuffix].filter(Boolean)
    const street = streetSegments.join(' ').replace(/\s+/g, ' ').trim()
    return `addr:${street}|${city}|${stateCode}|${zip}`
  }

  return null
}

const normalizePropertyType = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined
  const str = typeof value === 'string' ? value.trim() : String(value).trim()
  if (!str) return undefined
  const lower = str.toLowerCase()
  if (/(residential|single|condo|town|multi|duplex|villa|mobile|manufactured)/.test(lower)) return 'residential'
  if (/(commercial|office|retail|industrial|warehouse|mixed use|mixed-use)/.test(lower)) return 'commercial'
  if (/(land|lot|acre|parcel|farm|agricultural)/.test(lower)) return 'land'
  if (/(rental|lease|rent)/.test(lower)) return 'rental'
  return undefined
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const computeCompletionPercentage = (row: BrokerPropertyRow): number => {
  const checks: Array<string | number | null | undefined> = [
    row.street_number,
    row.street_name,
    row.city,
    row.state_code,
    row.zip_code,
    row.list_price,
    row.bedrooms_total,
    row.bathrooms_full ?? row.bathrooms_total,
    row.living_area_sq_ft,
    row.latitude,
    row.longitude,
  ]

  const filled = checks.reduce((total, value) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value !== 0 ? total + 1 : total
    }
    if (typeof value === 'string') {
      return value.trim().length > 0 ? total + 1 : total
    }
    return total
  }, 0)

  const photoBonus = Array.isArray(row.photos) && row.photos.length >= 5 ? 1 : 0
  const denominator = checks.length + 1

  return Math.round(((filled + photoBonus) / denominator) * 100)
}

const extractValidationErrors = (summary: unknown): ValidationError[] | undefined => {
  if (!summary || typeof summary !== 'object') {
    return undefined
  }

  const reasons = (summary as { reasons?: Record<string, unknown> }).reasons
  if (!reasons || typeof reasons !== 'object') {
    return undefined
  }

  return Object.entries(reasons).map(([field, code]) => ({
    field,
    message: String(code),
    severity: 'error' as const,
  }))
}

const toMLSStatus = (value?: string | null): MLSProperty['status'] | undefined => {
  switch ((value ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'active':
      return 'active'
    case 'pending':
      return 'pending'
    case 'sold':
      return 'sold'
    case 'withdrawn':
      return 'withdrawn'
    case 'expired':
      return 'expired'
    default:
      return undefined
  }
}

const mapRowToMLSProperty = (row: BrokerPropertyRow): MLSProperty => {
  const photos = Array.isArray(row.photos) ? row.photos : []
  const bathroomsFull = Number(row.bathrooms_full ?? row.bathrooms_total ?? 0)

  const normalizedStatus = toMLSStatus(row.status)
  let derivedStatus: MLSProperty['status']

  switch (row.state) {
    case 'LIVE':
      if (normalizedStatus && normalizedStatus !== 'draft') {
        derivedStatus = normalizedStatus
      } else {
        derivedStatus = 'active'
      }
      break
    case 'SOLD':
      derivedStatus = 'sold'
      break
    case 'PROPERTY_PENDING':
      derivedStatus = normalizedStatus ?? 'draft'
      break
    default:
      derivedStatus = normalizedStatus ?? 'draft'
      break
  }

  return {
    id: row.id,
    mlsNumber: row.mls_number ?? undefined,
    status: derivedStatus,
    workflowState: row.state ?? 'PROPERTY_PENDING',
    listPrice: Number(row.list_price ?? 0),
    originalListPrice: row.original_list_price ?? undefined,
    propertyType: row.property_type ?? 'residential',
    propertySubType: row.property_sub_type ?? undefined,
    architecturalStyle: row.architectural_style ?? undefined,
    yearBuilt: Number(row.year_built ?? 0),
    livingAreaSqFt: Number(row.living_area_sq_ft ?? 0),
    bedrooms: Number(row.bedrooms_total ?? 0),
    bathrooms: bathroomsFull,
    bathroomsHalf: row.bathrooms_half ?? undefined,
    bathroomsPartial: undefined,
    bathroomsTotal: row.bathrooms_total ?? undefined,
    stories: undefined,
    streetNumber: row.street_number ?? '',
    streetName: row.street_name ?? '',
    streetSuffix: row.street_suffix ?? '',
    city: row.city ?? '',
    state: row.state_code ?? '',
    zipCode: row.zip_code ?? '',
    county: row.county ?? '',
    subdivision: row.subdivision ?? undefined,
    parcelID: row.parcel_id ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    lotSize: Number(row.lot_size_sq_ft ?? 0),
    lotSizeAcres: row.lot_size_acres ?? undefined,
    garageSpaces: row.garage_spaces ?? undefined,
    garageType: row.garage_type ?? undefined,
    flooring: row.flooring ?? undefined,
    poolFeatures: row.pool_features ?? undefined,
    fireplaceFeatures: row.fireplace_features ?? undefined,
    kitchenFeatures: row.kitchen_features ?? undefined,
    primarySuite: row.primary_suite ?? undefined,
    laundryFeatures: row.laundry_features ?? undefined,
    interiorFeatures: row.interior_features ?? undefined,
    appliances: row.appliances ?? undefined,
    constructionMaterials: row.construction_materials ?? undefined,
    roofType: row.roof_type ?? undefined,
    foundationDetails: row.foundation_details ?? undefined,
    exteriorFeatures: row.exterior_features ?? undefined,
    propertyView: row.property_view ?? undefined,
    waterSource: row.water_source ?? undefined,
    sewerSystem: row.sewer_system ?? undefined,
    heatingType: row.heating ?? undefined,
    coolingType: row.cooling ?? undefined,
    pool: undefined,
    fireplace: undefined,
    taxes: row.taxes ?? undefined,
    taxYear: undefined,
    hoaFee: undefined,
    buyerAgentCompensation: undefined,
    specialAssessments: undefined,
    listingAgentName: row.listing_agent_name ?? '',
    listingAgentLicense: row.listing_agent_license ?? '',
    listingAgentPhone: row.listing_agent_phone ?? '',
    listingAgentEmail: row.listing_agent_email ?? undefined,
    brokerage: row.listing_office_name ?? '',
    brokerageLicense: row.listing_office_license ?? undefined,
    showingInstructions: row.showing_instructions ?? undefined,
    photos,
    coverPhotoUrl: row.cover_photo_url ?? photos[0] ?? undefined,
    publicRemarks: row.public_remarks ?? undefined,
    brokerRemarks: row.private_remarks ?? undefined,
    virtualTourUrl: undefined,
    videoUrl: undefined,
    createdAt: row.created_at,
    lastModified: row.updated_at,
    completionPercentage: computeCompletionPercentage(row),
    validationErrors: extractValidationErrors(row.validation_summary as Record<string, unknown>),
    publishedAt: row.published_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
  }
}

const hasText = (value?: string | null) => Boolean(value && value.trim().length > 0)

const STATUS_STATE_MAP: Record<MLSProperty['status'], MLSProperty['workflowState']> = {
  draft: 'PROPERTY_PENDING',
  active: 'LIVE',
  pending: 'LIVE',
  sold: 'SOLD',
  withdrawn: 'PROPERTY_PENDING',
  expired: 'PROPERTY_PENDING',
}

const mergePropertyMetadata = (incoming: MLSProperty, cached?: MLSProperty): MLSProperty => {
  const base: MLSProperty = {
    ...incoming,
    isFeatured: incoming.isFeatured ?? false,
  }

  if (!cached) {
    return base
  }

  return {
    ...base,
    listingAgentName: hasText(base.listingAgentName) ? base.listingAgentName : cached.listingAgentName,
    listingAgentPhone: hasText(base.listingAgentPhone) ? base.listingAgentPhone : cached.listingAgentPhone,
    brokerage: hasText(base.brokerage) ? base.brokerage : cached.brokerage,
    listingAgentEmail: hasText(base.listingAgentEmail) ? base.listingAgentEmail : cached.listingAgentEmail,
    brokerageLicense: hasText(base.brokerageLicense) ? base.brokerageLicense : cached.brokerageLicense,
    isFeatured: cached.isFeatured ?? base.isFeatured,
  }
}

const getSortTimestamp = (property: MLSProperty) => {
  const sources = [property.publishedAt, property.lastModified, property.createdAt]
  for (const value of sources) {
    if (value) {
      const timestamp = Date.parse(value)
      if (!Number.isNaN(timestamp)) {
        return timestamp
      }
    }
  }
  return 0
}

const orderProperties = (properties: MLSProperty[]) =>
  [...properties].sort((a, b) => {
    const aFeatured = a.isFeatured ? 1 : 0
    const bFeatured = b.isFeatured ? 1 : 0
    if (aFeatured !== bFeatured) {
      return bFeatured - aFeatured
    }
    return getSortTimestamp(b) - getSortTimestamp(a)
  })

const MLS_TO_API_FIELD_MAP: Record<string, string> = {
  mlsNumber: 'mlsNumber',
  listPrice: 'listPrice',
  originalListPrice: 'originalListPrice',
  propertyType: 'propertyType',
  propertySubType: 'propertySubType',
  architecturalStyle: 'architecturalStyle',
  yearBuilt: 'yearBuilt',
  livingAreaSqFt: 'livingAreaSqFt',
  bedrooms: 'bedroomsTotal',
  bathrooms: 'bathroomsFull',
  bathroomsTotal: 'bathroomsTotal',
  bathroomsHalf: 'bathroomsHalf',
  streetNumber: 'streetNumber',
  streetName: 'streetName',
  streetSuffix: 'streetSuffix',
  city: 'city',
  state: 'stateCode',
  zipCode: 'zipCode',
  county: 'county',
  parcelID: 'parcelId',
  latitude: 'latitude',
  longitude: 'longitude',
  lotSize: 'lotSizeSqFt',
  lotSizeAcres: 'lotSizeAcres',
  garageSpaces: 'garageSpaces',
  garageType: 'garageType',
  publicRemarks: 'publicRemarks',
  brokerRemarks: 'privateRemarks',
  showingInstructions: 'showingInstructions',
  photos: 'photos',
  coverPhotoUrl: 'coverPhotoUrl',
  listingAgentName: 'listingAgentName',
  listingAgentLicense: 'listingAgentLicense',
  listingAgentPhone: 'listingAgentPhone',
  listingAgentEmail: 'listingAgentEmail',
  brokerage: 'listingOfficeName',
  brokerageLicense: 'listingOfficeLicense',
  heatingType: 'heating',
  coolingType: 'cooling',
  parkingFeatures: 'parkingFeatures',
  appliances: 'appliances',
  laundryFeatures: 'laundryFeatures',
  constructionMaterials: 'constructionMaterials',
  foundationDetails: 'foundationDetails',
  exteriorFeatures: 'exteriorFeatures',
  interiorFeatures: 'interiorFeatures',
  poolFeatures: 'poolFeatures',
  flooring: 'flooring',
  fireplaceFeatures: 'fireplaceFeatures',
  kitchenFeatures: 'kitchenFeatures',
  primarySuite: 'primarySuite',
  roofType: 'roofType',
  propertyView: 'propertyView',
  waterSource: 'waterSource',
  sewerSystem: 'sewerSystem',
  taxes: 'taxes',
  subdivision: 'subdivision',
  ownerName: 'ownerName',
  ownerEmail: 'ownerEmail',
  ownerPhone: 'ownerPhone',
  workflowState: 'state',
  status: 'status',
  publishedAt: 'published_at',
  closedAt: 'closed_at',
  slug: 'slug',
}

const mapMLSUpdatesToApiPayload = (updates: Partial<MLSProperty>): Record<string, unknown> => {
  const payload: Record<string, unknown> = {}

  for (const [mlsKey, apiKey] of Object.entries(MLS_TO_API_FIELD_MAP)) {
    const value = (updates as Record<string, unknown>)[mlsKey]
    if (value !== undefined) {
      payload[apiKey] = value
    }
  }

  if (
    (updates.streetNumber !== undefined ||
      updates.streetName !== undefined ||
      updates.streetSuffix !== undefined) &&
    !payload.addressLine
  ) {
    const addressParts = [updates.streetNumber, updates.streetName, updates.streetSuffix]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)

    if (addressParts.length > 0) {
      payload.addressLine = addressParts.join(' ')
    }
  }

  if (updates.zipCode && !payload.zipCode) {
    payload.zipCode = updates.zipCode
  }

  if (updates.state && !payload.stateCode) {
    payload.stateCode = updates.state
  }

  return payload
}

const buildPromotePayloadFromMLS = (
  property: MLSProperty,
  firmId: string,
  agentId?: string,
  source: 'bulk_upload' | 'manual' | 'mls' = 'bulk_upload',
  fileName?: string
): PromoteDraftPayload => {
  const propertyPayload = mapMLSUpdatesToApiPayload(property)

  if (!propertyPayload.addressLine) {
    const addressParts = [property.streetNumber, property.streetName, property.streetSuffix]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
    if (addressParts.length > 0) {
      propertyPayload.addressLine = addressParts.join(' ')
    }
  }

  if (property.photos && property.photos.length > 0) {
    propertyPayload.photos = property.photos
  }

  if (!propertyPayload.coverPhotoUrl && property.photos && property.photos.length > 0) {
    propertyPayload.coverPhotoUrl = property.photos[0]
  }

  propertyPayload.mlsNumber = property.mlsNumber
  propertyPayload.status = property.status
  propertyPayload.propertyType = property.propertyType
  propertyPayload.propertySubType = property.propertySubType

  const draftId = isUuid(property.id) ? property.id : undefined

  return {
    draftId,
    firmId,
    agentId,
    source,
    fileName,
    property: propertyPayload,
    validationSummary: undefined,
    isTest: false,
  }
}

export function BrokerProvider({ children }: { children: React.ReactNode }) {
  const { user, activeOrgId } = useAuth()
  const fallbackTenantId = FALLBACK_TENANT_ID

  const demoOptions = useMemo(() => {
    const maybeUser = user as (typeof user & { tenantId?: string; firmId?: string }) | null
    return {
      demoUserId: user?.id ?? FALLBACK_DEMO_USER_ID,
      demoFirmId: maybeUser?.firmId ?? FALLBACK_DEMO_FIRM_ID,
      tenantId: maybeUser?.tenantId ?? fallbackTenantId,
      orgId: activeOrgId ?? null
    }
  }, [user, activeOrgId, fallbackTenantId])

  // Initialize state with cached data for offline resilience
  const [properties, setProperties] = useState<MLSProperty[]>(() => {
    const cached = safeGetItem(STORAGE_KEYS.properties, []) as MLSProperty[]
    return orderProperties(cached.map((property) => mergePropertyMetadata(property)))
  })
  const [propertiesLoading, setPropertiesLoading] = useState<boolean>(false)
  const [propertiesError, setPropertiesError] = useState<string | null>(null)
  const [defaultFirmId, setDefaultFirmId] = useState<string | null>(null)
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null)

  const draftProperties = useMemo(
    () => properties.filter((property) => property.workflowState !== 'LIVE'),
    [properties]
  )

  const [leads, setLeads] = useState<Lead[]>(() =>
    (safeGetItem(STORAGE_KEYS.leads, []) as Lead[])
  )

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    const cached = safeGetItem(STORAGE_KEYS.teamMembers, []) as Partial<TeamMember>[]
    return cached.map((member) => ({
      id: member.id ?? `member_${Math.random().toString(36).slice(2, 10)}`,
      tenantId: member.tenantId ?? FALLBACK_TENANT_ID,
      orgId: member.orgId,
      name: member.name ?? 'Unnamed agent',
      email: member.email ?? 'unknown@example.com',
      phone: member.phone,
      role: member.role ?? 'Agent',
      status: member.status ?? 'active',
      experienceYears: member.experienceYears ?? undefined,
      rating: member.rating ?? 0,
      totalSales: member.totalSales ?? 0,
      dealsInProgress: member.dealsInProgress ?? 0,
      openLeads: member.openLeads ?? 0,
      responseTimeHours: member.responseTimeHours ?? 0,
      joinedAt: member.joinedAt ?? new Date().toISOString(),
      lastActiveAt: member.lastActiveAt ?? new Date().toISOString(),
      notes: member.notes
    }))
  })
  const [teamMembersLoading, setTeamMembersLoading] = useState(false)
  const [teamMembersError, setTeamMembersError] = useState<string | null>(null)

  const loadPropertiesFromApi = useCallback(async () => {
    try {
      setPropertiesLoading(true)
      setPropertiesError(null)
      const rows = await fetchBrokerProperties()
      const mappedRows = rows.map(mapRowToMLSProperty)

      const cachedProperties = safeGetItem(STORAGE_KEYS.properties, []) as MLSProperty[]
      const cachedById = new Map(cachedProperties.map((property) => [property.id, property]))

      const merged = mappedRows.map((property) => mergePropertyMetadata(property, cachedById.get(property.id)))
      const ordered = orderProperties(merged)

      setProperties(ordered)
      if (rows.length > 0) {
        const firmFromRow = rows[0].firm_id
        const agentFromRow = rows[0].agent_id

        if (isUuid(firmFromRow)) {
          setDefaultFirmId(firmFromRow)
        } else if (isUuid(demoOptions.demoFirmId)) {
          setDefaultFirmId(demoOptions.demoFirmId)
        }

        if (isUuid(agentFromRow)) {
          setDefaultAgentId(agentFromRow)
        }
      }
      safeSetItem(
        STORAGE_KEYS.properties,
        ordered as unknown as Record<string, unknown>[],
        STORAGE_LIMITS.properties
      )
      const draftsCache = ordered
        .filter((property) => property.workflowState !== 'LIVE')
        .map((property) => property as unknown as Record<string, unknown>)
      safeSetItem(STORAGE_KEYS.draftProperties, draftsCache, STORAGE_LIMITS.draftProperties)
    } catch (error) {
      console.error('Failed to load broker properties', error)
      setPropertiesError(error instanceof Error ? error.message : 'failed_to_load')
    } finally {
      setPropertiesLoading(false)
    }
  }, [demoOptions])

  useEffect(() => {
    void loadPropertiesFromApi()
  }, [loadPropertiesFromApi])

  // Save to localStorage whenever state changes
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.properties, properties, STORAGE_LIMITS.properties)
  }, [properties])

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.draftProperties, draftProperties, STORAGE_LIMITS.draftProperties)
  }, [draftProperties])

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.leads, leads, STORAGE_LIMITS.leads)
  }, [leads])

  useEffect(() => {
    safeSetItem(
      STORAGE_KEYS.teamMembers,
      teamMembers as unknown as Record<string, unknown>[],
      STORAGE_LIMITS.teamMembers
    )
  }, [teamMembers])

  const loadTeamMembers = useCallback(async () => {
    if (!demoOptions.tenantId) return
    setTeamMembersLoading(true)
    setTeamMembersError(null)
    try {
      const rows = await listTeamMembers(demoOptions.tenantId)
      const mapped = rows.map(normaliseTeamMemberRecord)
      setTeamMembers(mapped)
    } catch (error) {
      console.error('Failed to load team members', error)
      setTeamMembersError(error instanceof Error ? error.message : 'failed_to_load_team_members')
    } finally {
      setTeamMembersLoading(false)
    }
  }, [demoOptions.tenantId])

  useEffect(() => {
    void loadTeamMembers()
  }, [loadTeamMembers])

  // Property management functions
  const addProperty = useCallback(
    async (property: Property): Promise<MLSProperty | null> => {
      if (!demoOptions.demoFirmId) {
        setPropertiesError('firm_required')
        return null
      }

      const now = new Date().toISOString()
      const addressSegments = property.address.split(',')
      const city = addressSegments[1]?.trim() ?? ''
      const stateZip = addressSegments[2]?.trim().split(' ') ?? []
      const state = stateZip[0] ?? ''
      const zip = stateZip[1] ?? ''
      const [streetNumber, ...restStreet] = addressSegments[0]?.trim().split(' ') ?? []
      const streetName = restStreet.slice(0, Math.max(restStreet.length - 1, 0)).join(' ')
      const streetSuffix = restStreet[restStreet.length - 1] ?? ''

      const baseMLS: MLSProperty = {
        id: property.id ?? `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        mlsNumber: undefined,
        status: property.status ?? 'draft',
        workflowState: 'PROPERTY_PENDING',
        listPrice: property.price,
        originalListPrice: undefined,
        propertyType: property.type,
        propertySubType: undefined,
        architecturalStyle: undefined,
        yearBuilt: Number(property.listingDate?.slice?.(0, 4) ?? 0),
        livingAreaSqFt: property.sqft ?? 0,
        bedrooms: property.bedrooms ?? 0,
        bathrooms: property.bathrooms ?? 0,
        bathroomsHalf: undefined,
        bathroomsPartial: undefined,
        bathroomsTotal: property.bathrooms ?? undefined,
        stories: undefined,
        streetNumber: streetNumber ?? '',
        streetName: streetName || property.address,
        streetSuffix: streetSuffix ?? '',
        city,
        state,
        zipCode: zip,
        county: '',
        subdivision: undefined,
        parcelID: undefined,
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
        pool: undefined,
        fireplace: undefined,
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
        photos: property.images ?? [],
        coverPhotoUrl: property.images?.[0],
        publicRemarks: property.description,
        brokerRemarks: undefined,
        virtualTourUrl: undefined,
        videoUrl: undefined,
        createdAt: now,
        lastModified: now,
        completionPercentage: 0,
        validationErrors: undefined,
        publishedAt: undefined,
        closedAt: undefined,
      }

      try {
        const payload = buildPromotePayloadFromMLS(
          baseMLS,
          (defaultFirmId && isUuid(defaultFirmId)) ? defaultFirmId : FALLBACK_DEMO_FIRM_ID,
          (defaultAgentId && isUuid(defaultAgentId)) ? defaultAgentId : undefined,
          'manual'
        )
        const row = await promoteDraftProperty(payload)
        const mappedRaw = mapRowToMLSProperty(row)
        const mapped =
          mappedRaw.workflowState === 'LIVE' && mappedRaw.status === 'draft'
            ? { ...mappedRaw, status: 'active' }
            : mappedRaw
        let mergedProperty = mergePropertyMetadata(mapped)
        setProperties((prev) => {
          const cached = prev.find((p) => p.id === mapped.id)
          mergedProperty = mergePropertyMetadata(mapped, cached)
          const updated = orderProperties([
            mergedProperty,
            ...prev.filter((p) => p.id !== mergedProperty.id),
          ])
          safeSetItem(
            STORAGE_KEYS.properties,
            updated as unknown as Record<string, unknown>[],
            STORAGE_LIMITS.properties
          )
          return updated
        })
        return mergedProperty
      } catch (error) {
        console.error('Failed to add property', error)
        setPropertiesError(error instanceof Error ? error.message : 'add_failed')
        return null
      }
    },
    [demoOptions, defaultFirmId, defaultAgentId]
  )

  const updateProperty = useCallback(
    async (id: string, updates: Partial<MLSProperty>): Promise<MLSProperty | null> => {
      const payload = mapMLSUpdatesToApiPayload(updates)
      if (Object.keys(payload).length === 0) {
        return null
      }

      try {
        const row = await updateBrokerProperty(id, payload)
        const mappedRaw = mapRowToMLSProperty(row)
        const mapped =
          mappedRaw.workflowState === 'LIVE' && mappedRaw.status === 'draft'
            ? { ...mappedRaw, status: 'active' }
            : mappedRaw
        let mergedProperty = mergePropertyMetadata(mapped)
        setProperties((prev) => {
          const cached = prev.find((prop) => prop.id === mapped.id)
          mergedProperty = mergePropertyMetadata(mapped, cached)
          const reordered = orderProperties(
            prev.map((prop) => (prop.id === mergedProperty.id ? mergedProperty : prop))
          )
          safeSetItem(
            STORAGE_KEYS.properties,
            reordered as unknown as Record<string, unknown>[],
            STORAGE_LIMITS.properties
          )
          return reordered
        })
        return mergedProperty
      } catch (error) {
        console.error('Failed to update property', error)
        setPropertiesError(error instanceof Error ? error.message : 'update_failed')
        return null
      }
    },
    [demoOptions]
  )

  const deleteProperty = useCallback(async (id: string): Promise<void> => {
    const serverBacked = isUuid(id)

    if (serverBacked) {
      try {
        await deleteBrokerProperty(id)
      } catch (error) {
        const err = error as Error & { status?: number }
        const message = err?.message ?? ''
        const status = err?.status
        const isNotFound = message === 'not_found' || status === 404

        if (isNotFound) {
          console.warn('Property not found remotely. Removing from local state only.', {
            propertyId: id,
          })
        } else if (message === 'property_fetch_failed') {
          console.warn('Property fetch failed during delete; treating as local-only draft.', {
            propertyId: id,
          })
        } else {
          console.error('Failed to delete property', error)
          setPropertiesError(error instanceof Error ? error.message : 'delete_failed')
          throw error
        }
      }
    } else {
      console.debug('Skipping remote delete for local-only draft', { propertyId: id })
    }

    setProperties((prev) => {
      const filtered = prev.filter((prop) => prop.id !== id)
      const reordered = orderProperties(filtered)
      safeSetItem(
        STORAGE_KEYS.properties,
        reordered as unknown as Record<string, unknown>[],
        STORAGE_LIMITS.properties
      )
      return reordered
    })
  }, [])

  const publishDraftProperty = useCallback(
    async (id: string): Promise<MLSProperty> => {
      try {
        const row = await publishBrokerProperty(id)
        const mappedRaw = mapRowToMLSProperty(row)
        const mapped =
          mappedRaw.workflowState === 'LIVE' && mappedRaw.status === 'draft'
            ? { ...mappedRaw, status: 'active' }
            : mappedRaw
        let mergedProperty = mergePropertyMetadata(mapped)
        setProperties((prev) => {
          const cached = prev.find((prop) => prop.id === mapped.id)
          mergedProperty = mergePropertyMetadata(mapped, cached)
          const reordered = orderProperties(
            prev.map((prop) => (prop.id === mergedProperty.id ? mergedProperty : prop))
          )
          safeSetItem(
            STORAGE_KEYS.properties,
            reordered as unknown as Record<string, unknown>[],
            STORAGE_LIMITS.properties
          )
          return reordered
        })
        return mergedProperty
      } catch (error) {
        console.error('Failed to publish property', error)
        setPropertiesError(error instanceof Error ? error.message : 'publish_failed')
        throw error
      }
    },
    [demoOptions]
  )

  const unpublishProperty = useCallback(
    async (id: string): Promise<MLSProperty | null> => {
      try {
        const row = await unpublishBrokerProperty(id)
        const mapped = mapRowToMLSProperty(row)
        let mergedProperty = mergePropertyMetadata(mapped)
        setProperties((prev) => {
          const cached = prev.find((prop) => prop.id === mapped.id)
          mergedProperty = mergePropertyMetadata(mapped, cached)
          const reordered = orderProperties(
            prev.map((prop) => (prop.id === mergedProperty.id ? mergedProperty : prop))
          )
          safeSetItem(
            STORAGE_KEYS.properties,
            reordered as unknown as Record<string, unknown>[],
            STORAGE_LIMITS.properties
          )
          return reordered
        })
        return mergedProperty
      } catch (error) {
        console.error('Failed to unpublish property', error)
        setPropertiesError(error instanceof Error ? error.message : 'unpublish_failed')
        return null
      }
    },
    []
  )

  const updatePropertyStatus = useCallback(
    async (id: string, status: MLSProperty['status']): Promise<MLSProperty | null> => {
      const existing = properties.find((prop) => prop.id === id)

      try {
        const workflowState = STATUS_STATE_MAP[status]
        const payload: Partial<MLSProperty> = {
          status,
          closedAt: status === 'sold' ? new Date().toISOString() : null,
        }

        if (workflowState) {
          payload.workflowState = workflowState
        }

        if (workflowState === 'LIVE') {
          payload.publishedAt = existing?.publishedAt ?? new Date().toISOString()
        } else if (workflowState === 'PROPERTY_PENDING') {
          payload.publishedAt = null
        }

        return await updateProperty(id, payload)
      } catch (error) {
        console.error('Failed to update property status', error)
        const err = error as Error & { message?: string }
        if (err?.message === 'not_found') {
          setProperties((prev) => {
            const next = prev.filter((prop) => prop.id !== id)
            safeSetItem(
              STORAGE_KEYS.properties,
              next as unknown as Record<string, unknown>[],
              STORAGE_LIMITS.properties
            )
            return next
          })
        }
        setPropertiesError(error instanceof Error ? error.message : 'status_update_failed')
        return null
      }
    },
    [properties, updateProperty]
  )

  const featureProperty = useCallback((id: string, isFeatured = true) => {
    setProperties((prev) => {
      const updated = prev.map((prop) =>
        prop.id === id ? { ...prop, isFeatured } : prop
      )
      const reordered = orderProperties(updated)
      safeSetItem(
        STORAGE_KEYS.properties,
        reordered as unknown as Record<string, unknown>[],
        STORAGE_LIMITS.properties
      )
      return reordered
    })
  }, [])

  // FIXED: Properly map CSV data to MLSProperty structure with safe photo processing
  const addDraftProperties = useCallback(
    async (draftListings: Record<string, unknown>[]): Promise<DraftImportResult> => {
    console.log('🏠 BrokerContext: Adding draft properties:', draftListings)

    const newDraftProperties = draftListings.map(draft => {
      console.log('📋 Processing draft listing:', draft)
      
      // Extract data from mappedData or originalData
      const data = (draft.mappedData as Record<string, unknown>) || (draft.originalData as Record<string, unknown>) || draft
      console.log('📊 Extracted data:', data)
      
      // CRITICAL FIX: Safely process photos to prevent phantom entries
      const processedPhotos = safeProcessPhotos(data.PhotoURLs || data.photos)
      console.log('📸 Processed photos:', processedPhotos.length, 'photos')
      console.log('📸 Processed photos list:', processedPhotos)

      const normalizeString = (value: unknown) => {
        if (value === undefined || value === null) return ''
        return typeof value === 'string' ? value.trim() : String(value).trim()
      }

      const parseCoordinate = (value: unknown) => {
        if (value === undefined || value === null) return undefined
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : undefined
        }
        if (typeof value === 'string') {
          const cleaned = value.trim()
          if (!cleaned) {
            return undefined
          }
          const numeric = Number(cleaned)
          return Number.isFinite(numeric) ? numeric : undefined
        }
        return undefined
      }

      const normalizedMLS = normalizeString((data as any).mlsNumber ?? (data as any).MLSNumber ?? (data as any).MLS ?? (data as any).mls)
      
      // Create properly mapped MLSProperty
      const rawPropertyType = normalizeString(
        (data as any).PropertyType ?? data.PropertyType ?? data.propertyType ?? (data as any)?.type
      )
      const rawPropertyCategory = normalizeString((data as any).PropertyCategory ?? data.PropertyCategory)

      const normalizedArchitecturalStyle = normalizeString((data as any).ArchitecturalStyle ?? data.ArchitecturalStyle ?? (data as any)?.architecturalStyle)
      const normalizedGarageType = normalizeString((data as any).GarageType ?? data.GarageType ?? (data as any)?.garageType)
      const normalizedLaundry = normalizeString((data as any).LaundryFeatures ?? data.LaundryFeatures ?? (data as any)?.Laundry ?? data.laundryFeatures)
      const normalizedConstruction = normalizeString((data as any).ConstructionMaterials ?? data.ConstructionMaterials ?? (data as any)?.Construction ?? data.constructionMaterials)
      const normalizedFoundation = normalizeString((data as any).FoundationDetails ?? data.FoundationDetails ?? (data as any)?.Foundation ?? data.foundationDetails)

      const mlsProperty: MLSProperty = {
        // Core identification
        id: (draft.id as string) || `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentId: undefined,
        
        // Status and visibility
        status: (draft.status as 'active' | 'pending' | 'sold' | 'draft') || 'draft',
        visibility: 'public',

        mlsNumber: normalizedMLS || undefined,
        
        // CRITICAL: Map imported CSV data to MLSProperty fields
        // Price information
        listPrice: parseFloat(String(data.ListPrice || data.listPrice || data.price || '0')) || 0,
        originalListPrice: parseFloat(String(data.OriginalListPrice || data.originalListPrice || '0')) || undefined,
        
        // Location information - map from CSV fields
        streetNumber: String(data.StreetNumber || data.streetNumber || ''),
        streetName: String(data.StreetName || data.streetName || ''),
        streetSuffix: String(data.StreetSuffix || data.streetSuffix || ''),
        city: String(data.City || data.city || ''),
        state: String(data.State || data.state || data.StateOrProvince || ''),
        zipCode: String(data.ZIP || data.zipCode || data.PostalCode || ''),
        county: String(data.County || data.county || ''),
        subdivision: String(data.Subdivision || data.subdivision || data.SubdivisionName || ''),
        parcelID: String(data.ParcelID || data.parcelID || (data as any)?.parcelId || ''),
        latitude: parseCoordinate(
          (data as any).Latitude ??
          data.Latitude ??
          data.latitude ??
          (data as any).lat ??
          (data as any).LATITUDE
        ),
        longitude: parseCoordinate(
          (data as any).Longitude ??
          data.Longitude ??
          data.longitude ??
          (data as any).lng ??
          (data as any).LONGITUDE
        ),

        // Property details
        propertyType: normalizePropertyType(
          data.PropertyType ||
          data.propertyType ||
          (data as any)?.type ||
          data.PropertyCategory
        ) || 'residential',
        propertySubType: String(
          data.PropertySubtype ||
          data.propertySubType ||
          data.PropertySubType ||
          rawPropertyType ||
          rawPropertyCategory ||
          ''
        ),
        architecturalStyle: normalizedArchitecturalStyle || undefined,
        bedrooms: parseInt(String(data.BedroomsTotal || data.bedrooms || data.Bedrooms || '0')) || 0,
        bathrooms: parseFloat(String(data.BathroomsTotal || data.bathrooms || data.Bathrooms || '0')) || 0,
        bathroomsFull: parseInt(String(data.BathroomsFull || data.bathroomsFull || '0')) || undefined,
        bathroomsHalf: parseInt(String(data.BathroomsHalf || data.bathroomsHalf || '0')) || undefined,
        bathroomsTotal: parseFloat(String(data.BathroomsTotal || data.bathroomsTotal || '0')) || undefined,
        lotSizeAcres: parseFloat(String(data.LotSizeAcres || data.lotSizeAcres || data.Acres || '0')) || undefined,
        livingAreaSqFt: parseInt(String(data.LivingAreaSqFt || data.livingAreaSqFt || data.LivingArea || data.sqft || '0')) || 0,
        lotSize: parseInt(String(data.LotSizeSqFt || data.lotSize || data.LotSize || '0')) || undefined,
        yearBuilt: parseInt(String(data.YearBuilt || data.yearBuilt || '0')) || 0,

        // Building features
        garageSpaces: parseInt(String(data.GarageSpaces || data.garageSpaces || '0')) || undefined,
        stories: parseInt(String(data.Stories || data.stories || '0')) || undefined,
        pool: Boolean(data.Pool),

        // Utilities and systems
        heatingType: String(data.Heating || data.heatingType || data.HeatingType || ''),
        coolingType: String(data.Cooling || data.coolingType || data.CoolingType || ''),
        flooring: String(data.Flooring || data.flooring || ''),
        poolFeatures: String(data.PoolFeatures || data.poolFeatures || data.FeaturePool || data.Pool || ''),
        garageType: normalizedGarageType || undefined,
        fireplaceFeatures: String(data.FireplaceFeatures || data.fireplaceFeatures || ''),
        kitchenFeatures: String(data.KitchenFeatures || data.kitchenFeatures || ''),
        primarySuite: String(data.PrimarySuite || data.primarySuite || ''),
        laundryFeatures: normalizedLaundry || undefined,
        interiorFeatures: String(data.InteriorFeatures || data.interiorFeatures || ''),
        appliances: String(data.Appliances || data.appliances || ''),
        constructionMaterials: normalizedConstruction || undefined,
        roofType: String(data.Roof || data.roofType || data.RoofType || ''),
        foundationDetails: normalizedFoundation || undefined,
        exteriorFeatures: String(data.ExteriorFeatures || data.exteriorFeatures || ''),
        propertyView: String(data.View || data.propertyView || ''),
        waterSource: String(data.WaterSource || data.waterSource || ''),
        sewerSystem: String(data.Sewer || data.sewerSystem || data.SewerSystem || ''),

        // Financial information
        taxes: parseFloat(String(data.TaxesAnnual || data.taxes || data.Taxes || '0')) || undefined,
        taxYear: parseInt(String(data.TaxYear || data.taxYear || '0')) || undefined,

        // Agent information - map from CSV fields
        listingAgentName: String(data.ListingAgentName || data.listingAgentName || data.ListingAgentFullName || ''),
        listingAgentLicense: String(data.ListingAgentLicense || data.listingAgentLicense || ''),
        listingAgentPhone: String(data.ListingAgentPhone || data.listingAgentPhone || ''),
        listingAgentEmail: String(data.ListingAgentEmail || data.listingAgentEmail || ''),
        brokerage: String(data.ListingOfficeName || data.brokerage || data.ListingOffice || ''),
        brokerageLicense: String(data.ListingOfficeLicense || data.brokerageLicense || (data as any)?.BrokerageLicense || ''),

        // Marketing information
        publicRemarks: String(data.PublicRemarks || data.publicRemarks || data.description || ''),
        brokerRemarks: String(data.BrokerRemarks || data.brokerRemarks || ''),
        showingInstructions: String(data.ShowingInstructions || data.showingInstructions || ''),
        
        // Media - FIXED: Use safely processed photos
        photos: processedPhotos,
        virtualTourUrl: String(data.VirtualTourURL || data.virtualTourUrl || ''),
        
        // Dates
        listingDate: String(data.ListingDate || data.listingDate || new Date().toISOString().split('T')[0]),
        expirationDate: String(data.ExpirationDate || data.expirationDate || ''),
        
        // Initialize counters for published properties
        leadCount: 0,
        viewCount: 0,
        favoriteCount: 0,
        
        // Validation and completion tracking
        validationErrors: (draft.validationErrors as Array<{ field: string; message: string; severity: 'error' | 'warning' }>) || [],
        validationWarnings: (draft.validationWarnings as Array<{ field: string; message: string; severity: 'error' | 'warning' }>) || [],
        completionPercentage: (draft.completionPercentage as number) || 0,
        mlsCompliant: (draft.mlsCompliant as boolean) || false,
        
        // Additional tracking
        fileName: String(draft.fileName || ''),
        fieldMatches: (draft.fieldMatches as Record<string, unknown>) || {},
        lastModified: new Date().toISOString()
      }

      console.log('🧾 MLSProperty feature summary:', {
        id: mlsProperty.id,
        propertyType: mlsProperty.propertyType,
        propertySubType: mlsProperty.propertySubType,
        parcelID: mlsProperty.parcelID,
        appliances: mlsProperty.appliances,
        flooring: mlsProperty.flooring,
        poolFeatures: mlsProperty.poolFeatures,
        exteriorFeatures: mlsProperty.exteriorFeatures,
        kitchenFeatures: mlsProperty.kitchenFeatures,
        laundryFeatures: mlsProperty.laundryFeatures,
        garageType: mlsProperty.garageType,
        architecturalStyle: mlsProperty.architecturalStyle,
        constructionMaterials: mlsProperty.constructionMaterials,
        foundationDetails: mlsProperty.foundationDetails,
        lotSizeAcres: mlsProperty.lotSizeAcres
      })

      console.log('✅ Created MLSProperty:', mlsProperty)
      return mlsProperty
    })

    console.log('📦 Final draft properties to add:', newDraftProperties)

    const knownIdentifiers = new Set<string>()
    properties.forEach((property) => {
      const identifier = buildListingIdentifier(property)
      if (identifier) {
        knownIdentifiers.add(identifier)
      }
    })

    const batchIdentifiers = new Set<string>()
    const duplicateDrafts: DuplicateDraftNotice[] = []

    const uniqueDraftProperties = newDraftProperties.filter((draftProperty) => {
      const identifier = buildListingIdentifier(draftProperty)
      if (!identifier) {
        return true
      }

      if (knownIdentifiers.has(identifier)) {
        duplicateDrafts.push({
          mlsNumber: draftProperty.mlsNumber,
          address: [draftProperty.streetNumber, draftProperty.streetName, draftProperty.streetSuffix]
            .filter(Boolean)
            .join(' ')
            .trim(),
          fileName: (draftProperty as any).fileName as string | undefined,
          reason: 'existing',
        })
        return false
      }

      if (batchIdentifiers.has(identifier)) {
        duplicateDrafts.push({
          mlsNumber: draftProperty.mlsNumber,
          address: [draftProperty.streetNumber, draftProperty.streetName, draftProperty.streetSuffix]
            .filter(Boolean)
            .join(' ')
            .trim(),
          fileName: (draftProperty as any).fileName as string | undefined,
          reason: 'batch_duplicate',
        })
        return false
      }

      batchIdentifiers.add(identifier)
      knownIdentifiers.add(identifier)
      return true
    })

    if (duplicateDrafts.length > 0) {
      console.warn('🚫 Duplicate draft listings detected and skipped:', duplicateDrafts)
    }

    const PROMOTE_TIMEOUT_MS = 15000
    const PROMOTE_TIMEOUT_TOKEN = Symbol('promote-timeout')
    let promoteTimeoutCount = 0
    let promoteFailureCount = 0

    const promoted: MLSProperty[] = []

    for (const draftProperty of uniqueDraftProperties) {
      if (!demoOptions.demoFirmId) {
        promoted.push(draftProperty)
        continue
      }

      const payload = buildPromotePayloadFromMLS(
        draftProperty,
        (defaultFirmId && isUuid(defaultFirmId)) ? defaultFirmId : FALLBACK_DEMO_FIRM_ID,
        (defaultAgentId && isUuid(defaultAgentId)) ? defaultAgentId : undefined,
        'bulk_upload',
        (draftProperty as any).fileName as string | undefined
      )

      const propertyPayload = payload.property as Record<string, unknown> | undefined
      const photos = Array.isArray(propertyPayload?.photos as string[] | undefined)
        ? ((propertyPayload?.photos as string[]) ?? [])
        : []
      const addressBits = [
        propertyPayload?.street_number ?? propertyPayload?.streetNumber,
        propertyPayload?.street_name ?? propertyPayload?.streetName,
        propertyPayload?.city,
      ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0)

      console.log('🚀 Promoting draft property via Supabase', {
        id: draftProperty.id,
        firmId: payload.firmId,
        hasPhotos: photos.length > 0,
        addressPreview: addressBits.join(' '),
      })

      const promotionStart = performance.now()

      const promotionPromise = promoteDraftProperty(payload)
        .then((row) => mapRowToMLSProperty(row))
        .catch((error) => {
          promoteFailureCount += 1
          console.error('Failed to promote draft property', error)
          setPropertiesError(error instanceof Error ? error.message : 'promote_failed')
          return null
        })

      const result = await Promise.race([
        promotionPromise,
        new Promise<typeof PROMOTE_TIMEOUT_TOKEN>((resolve) =>
          setTimeout(() => resolve(PROMOTE_TIMEOUT_TOKEN), PROMOTE_TIMEOUT_MS)
        ),
      ])

      if (result === PROMOTE_TIMEOUT_TOKEN || result === null) {
        if (result === PROMOTE_TIMEOUT_TOKEN) {
          promoteTimeoutCount += 1
          console.warn('Promotion timed out for draft property', {
            id: draftProperty.id,
            fileName: (draftProperty as { fileName?: string } | undefined)?.fileName,
            durationMs: Math.round(performance.now() - promotionStart),
          })
        }
        promoted.push(draftProperty)
        continue
      }

      console.log('✅ Supabase promotion completed', {
        id: draftProperty.id,
        durationMs: Math.round(performance.now() - promotionStart),
      })

      promoted.push(result as MLSProperty)
    }

    const normalizedPromoted = promoted.map((prop) =>
      prop.workflowState === 'LIVE' && prop.status === 'draft'
        ? { ...prop, status: 'active' as MLSProperty['status'] }
        : prop
    )

    setProperties((prev) => {
      const mergedPromoted = normalizedPromoted.map((prop) =>
        mergePropertyMetadata(prop, prev.find((p) => p.id === prop.id))
      )
      const promotedIds = new Set(mergedPromoted.map((prop) => prop.id))
      const combined = [...mergedPromoted, ...prev.filter((prop) => !promotedIds.has(prop.id))]
      const reordered = orderProperties(combined)
      safeSetItem(
        STORAGE_KEYS.properties,
        reordered as unknown as Record<string, unknown>[],
        STORAGE_LIMITS.properties
      )
      return reordered
    })

    const warnings: DraftImportWarnings | undefined =
      promoteTimeoutCount > 0 || promoteFailureCount > 0
        ? {
            ...(promoteTimeoutCount > 0 ? { timeouts: promoteTimeoutCount } : {}),
            ...(promoteFailureCount > 0 ? { failures: promoteFailureCount } : {}),
          }
        : undefined

    return {
      created: normalizedPromoted,
      duplicates: duplicateDrafts,
      warnings,
    }
  }, [demoOptions, defaultFirmId, defaultAgentId, properties])

  const getDraftProperties = () => draftProperties

  // Lead management functions
  const addLead = (leadData: Omit<Lead, 'id' | 'createdAt'>) => {
    const newLead: Lead = {
      ...leadData,
      id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString()
    }
    setLeads(prev => [newLead, ...prev])
  }

  const updateLead = (id: string, updates: Partial<Lead>) => {
    setLeads(prev => prev.map(lead => 
      lead.id === id ? { ...lead, ...updates } : lead
    ))
  }

  const deleteLead = (id: string) => {
    setLeads(prev => prev.filter(lead => lead.id !== id))
  }

  const addTeamMember = useCallback(async (payload: CreateTeamMemberInput) => {
    if (!demoOptions.tenantId) {
      throw new Error('tenant_id_required')
    }

    const record = await createTeamMemberApi({
      tenantId: demoOptions.tenantId,
      orgId: demoOptions.orgId ?? undefined,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      role: payload.role,
      status: payload.status,
      experienceYears: payload.experienceYears,
      rating: payload.rating,
      totalSales: payload.totalSales,
      dealsInProgress: payload.dealsInProgress,
      openLeads: payload.openLeads,
      responseTimeHours: payload.responseTimeHours,
      notes: payload.notes
    })

    const member = normaliseTeamMemberRecord(record)
    setTeamMembers((prev) => [...prev, member])
    return member
  }, [demoOptions.orgId, demoOptions.tenantId])

  const updateTeamMember = useCallback(async (id: string, updates: Partial<TeamMember>) => {
    const payload: Record<string, unknown> = {}
    if (updates.name !== undefined) payload.name = updates.name
    if (updates.email !== undefined) payload.email = updates.email
    if (updates.phone !== undefined) payload.phone = updates.phone
    if (updates.role !== undefined) payload.role = updates.role
    if (updates.status !== undefined) payload.status = updates.status
    if (updates.experienceYears !== undefined) payload.experienceYears = updates.experienceYears
    if (updates.rating !== undefined) payload.rating = updates.rating
    if (updates.totalSales !== undefined) payload.totalSales = updates.totalSales
    if (updates.dealsInProgress !== undefined) payload.dealsInProgress = updates.dealsInProgress
    if (updates.openLeads !== undefined) payload.openLeads = updates.openLeads
    if (updates.responseTimeHours !== undefined) payload.responseTimeHours = updates.responseTimeHours
    if (updates.notes !== undefined) payload.notes = updates.notes
    if (updates.joinedAt !== undefined) payload.joinedAt = updates.joinedAt
    if (updates.lastActiveAt !== undefined) payload.lastActiveAt = updates.lastActiveAt

    const record = await updateTeamMemberApi(id, {
      ...(demoOptions.tenantId ? { tenantId: demoOptions.tenantId } : {}),
      ...payload
    })

    const member = normaliseTeamMemberRecord(record)
    setTeamMembers((prev) => prev.map((item) => (item.id === id ? member : item)))
    return member
  }, [demoOptions.tenantId])

  const removeTeamMember = useCallback(async (id: string) => {
    await deleteTeamMemberApi(id)
    setTeamMembers((prev) => prev.filter((member) => member.id !== id))
  }, [])

  const getTeamSummary = useCallback((): TeamSummary => {
    if (teamMembers.length === 0) {
      return {
        totalMembers: 0,
        activeMembers: 0,
        inactiveMembers: 0,
        pendingMembers: 0,
        averageRating: 0,
        totalSales: 0
      }
    }

    const totals = teamMembers.reduce(
      (acc, member) => {
        acc.totalSales += member.totalSales
        acc.averageRating += member.rating
        if (member.status === 'active') acc.activeMembers += 1
        if (member.status === 'inactive') acc.inactiveMembers += 1
        if (member.status === 'pending') acc.pendingMembers += 1
        return acc
      },
      { totalSales: 0, averageRating: 0, activeMembers: 0, inactiveMembers: 0, pendingMembers: 0 }
    )

    return {
      totalMembers: teamMembers.length,
      activeMembers: totals.activeMembers,
      inactiveMembers: totals.inactiveMembers,
      pendingMembers: totals.pendingMembers,
      averageRating: Number((totals.averageRating / teamMembers.length).toFixed(2)) || 0,
      totalSales: totals.totalSales
    }
  }, [teamMembers])

  const getMemberPerformance = useCallback((id: string): TeamPerformance | null => {
    const member = teamMembers.find((item) => item.id === id)
    if (!member) return null

    return {
      name: member.name,
      role: member.role,
      status: member.status,
      rating: member.rating,
      totalSales: member.totalSales,
      dealsInProgress: member.dealsInProgress,
      openLeads: member.openLeads,
      responseTimeHours: member.responseTimeHours,
      experienceYears: member.experienceYears,
      joinedAt: member.joinedAt,
      lastActiveAt: member.lastActiveAt,
      notes: member.notes ?? undefined
    }
  }, [teamMembers])

  // Analytics function
  const getAnalytics = () => {
    const totalProperties = properties.length
    const activeProperties = properties.filter(p => p.status === 'active').length
    const totalLeads = leads.length
    const newLeads = leads.filter(l => l.status === 'new').length
    const closedLeads = leads.filter(l => l.status === 'closed').length
    const conversionRate = totalLeads > 0 ? (closedLeads / totalLeads) * 100 : 0

    return {
      totalProperties,
      activeProperties,
      totalLeads,
      newLeads,
      conversionRate
    }
  }

  const contextValue: BrokerContextType = {
    properties,
    draftProperties,
    addProperty,
    updateProperty,
    deleteProperty,
    publishDraftProperty,
    unpublishProperty,
    updatePropertyStatus,
    featureProperty,
    addDraftProperties,
    getDraftProperties,
    leads,
    addLead,
    updateLead,
    deleteLead,
    teamMembers,
    teamMembersLoading,
    teamMembersError,
    refreshTeamMembers: loadTeamMembers,
    addTeamMember,
    updateTeamMember,
    removeTeamMember,
    getTeamSummary,
    getMemberPerformance,
    getAnalytics
  }

  return (
    <BrokerContext.Provider value={contextValue}>
      {children}
    </BrokerContext.Provider>
  )
}

export function useBroker() {
  const context = useContext(BrokerContext)
  if (context === undefined) {
    throw new Error('useBroker must be used within a BrokerProvider')
  }
  return context
}

export type { TeamMember, TeamPerformance, TeamSummary }
