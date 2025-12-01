import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { MLSProperty, ValidationError, type MLSPropertyAdditionalField } from '@/types/MLSProperty'
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
import type { Lead } from '@/types'

// Types for the broker context
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
  agents: TeamMember[]
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
  teamMembers: 'broker_team_members_demo_broker_1',
  deletedPropertyIds: 'broker_deleted_property_ids'
}

// Storage size limits (in characters)
const STORAGE_LIMITS = {
  properties: 500000, // ~500KB
  draftProperties: 1000000, // ~1MB
  leads: 200000, // ~200KB
  teamMembers: 200000,
  deletedPropertyIds: 10000
}

const FALLBACK_DEMO_USER_ID = 'demo_broker_1'
const FALLBACK_DEMO_FIRM_ID = '550e8400-e29b-41d4-a716-446655440001'
const FALLBACK_TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'

const trimArrayForCache = <T,>(value: T[] | undefined, max = 50) =>
  Array.isArray(value) ? value.slice(0, max) : value

const compactMLSPropertyForCache = (property: MLSProperty): MLSProperty => {
  const compacted: MLSProperty = {
    ...property,
    photos: Array.isArray(property.photos)
      ? property.photos.slice(0, MAX_PROPERTY_PHOTOS)
      : property.photos,
    validationErrors: trimArrayForCache(property.validationErrors, 50),
    validationWarnings: trimArrayForCache(property.validationWarnings, 50),
    sourceExtractedFields: trimArrayForCache(property.sourceExtractedFields, 50),
    sourceMatches: trimArrayForCache(property.sourceMatches, 50),
  }

  if (property.additionalFields) {
    const limitedAdditional = Object.fromEntries(
      Object.entries(property.additionalFields).slice(0, 50)
    ) as Record<string, MLSPropertyAdditionalField>
    compacted.additionalFields = limitedAdditional
  }

  return compacted
}

const CACHE_COMPACTORS: Partial<Record<string, (value: unknown) => unknown>> = {
  [STORAGE_KEYS.properties]: (value) => compactMLSPropertyForCache(value as MLSProperty),
  [STORAGE_KEYS.draftProperties]: (value) => compactMLSPropertyForCache(value as MLSProperty),
}

// Helper function to safely store data with size checks
const safeSetItem = <T,>(key: string, data: T[], limit: number) => {
  try {
    const jsonString = JSON.stringify(data)
    const compactor = Array.isArray(data) ? CACHE_COMPACTORS[key] : undefined
    
    // Check if data exceeds limit
    if (jsonString.length > limit) {
      if (compactor && Array.isArray(data)) {
        const compactedData = data.map((item) => compactor(item) as T)
        const compactedString = JSON.stringify(compactedData)
        
        if (compactedString.length <= limit) {
          localStorage.setItem(key, compactedString)
          console.warn(`Data for ${key} exceeded size limit. Stored compacted cache.`)
          return
        }
      }

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
const safeGetItem = <T,>(key: string, defaultValue: T[] = []) => {
  try {
    const item = localStorage.getItem(key)
    return item ? (JSON.parse(item) as T[]) : defaultValue
  } catch (error) {
    console.error(`Error parsing ${key}:`, error)
    localStorage.removeItem(key)
    return defaultValue
  }
}

const getDeletedPropertyIds = (): Set<string> => {
  const storedIds = safeGetItem<string>(STORAGE_KEYS.deletedPropertyIds, [])
  return new Set(storedIds)
}

const persistDeletedPropertyIds = (ids: Set<string>) => {
  safeSetItem(
    STORAGE_KEYS.deletedPropertyIds,
    Array.from(ids),
    STORAGE_LIMITS.deletedPropertyIds
  )
}

const markPropertyAsDeleted = (id: string) => {
  const ids = getDeletedPropertyIds()
  if (!ids.has(id)) {
    ids.add(id)
    persistDeletedPropertyIds(ids)
  }
}

const unmarkPropertyDeletion = (id: string) => {
  const ids = getDeletedPropertyIds()
  if (ids.delete(id)) {
    persistDeletedPropertyIds(ids)
  }
}

const filterDeletedProperties = <T extends MLSProperty>(list: T[]): T[] => {
  const ids = getDeletedPropertyIds()
  if (ids.size === 0) {
    return list
  }
  return list.filter((item) => !ids.has(item.id))
}

const orderAndFilterProperties = (list: MLSProperty[]) => orderProperties(filterDeletedProperties(list))

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

  const filled = checks.reduce<number>((total, value) => {
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

  const rawRow = row as Record<string, unknown>

  const pickString = (key: string): string | undefined => {
    const value = rawRow[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }
    return undefined
  }

  const pickNumber = (key: string): number | undefined => {
    const value = rawRow[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return undefined
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }

  const pickRecord = (key: string): Record<string, unknown> | undefined => {
    const value = rawRow[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    return undefined
  }

  const pickArray = (key: string): unknown[] | undefined => {
    const value = rawRow[key]
    if (Array.isArray(value)) {
      return value as unknown[]
    }
    return undefined
  }

  const additionalFieldsRecord = pickRecord('additional_fields')
  const additionalFields = additionalFieldsRecord
    ? (additionalFieldsRecord as Record<string, MLSPropertyAdditionalField>)
    : undefined
  const sourceExtractedArray = pickArray('source_extracted')
  const sourceExtracted = sourceExtractedArray
    ? (sourceExtractedArray as MLSProperty['sourceExtractedFields'])
    : undefined
  const sourceMatchesArray = pickArray('source_matches')
  const sourceMatches = sourceMatchesArray
    ? (sourceMatchesArray as MLSProperty['sourceMatches'])
    : undefined

  return {
    id: row.id,
    mlsNumber: row.mls_number ?? undefined,
    status: derivedStatus,
    workflowState: row.state ?? 'PROPERTY_PENDING',
    listPrice: Number(row.list_price ?? 0),
    listPricePerSqFt: pickNumber('list_price_per_sqft'),
    originalListPrice: row.original_list_price ?? undefined,
    propertyType: row.property_type ?? 'residential',
    propertySubType: row.property_sub_type ?? undefined,
    statusType: pickString('status_type'),
    architecturalStyle: row.architectural_style ?? undefined,
    geoArea: pickString('geo_area'),
    development: pickString('development'),
    propertyId: pickString('property_id'),
    dom: pickNumber('dom'),
    cdom: pickNumber('cdom'),
    communityType: pickString('community_type'),
    golfType: pickString('golf_type'),
    gulfAccess: pickString('gulf_access'),
    canalWidth: pickString('canal_width'),
    rearExposure: pickString('rear_exposure'),
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
    lotDescription: pickString('lot_description'),
    lotDimensions: pickString('lot_dimensions'),
    waterSource: pickString('water_source'),
    water: pickString('water'),
    sewerSystem: pickString('sewer_system'),
    sewer: pickString('sewer'),
    irrigation: pickString('irrigation'),
    boatDockInfo: pickString('boat_dock_info'),
    garageSpaces: row.garage_spaces ?? undefined,
    garageType: pickString('garage_type') ?? row.garage_type ?? undefined,
    flooring: pickString('flooring') ?? row.flooring ?? undefined,
    poolFeatures: pickString('pool_features') ?? row.pool_features ?? undefined,
    fireplaceFeatures: pickString('fireplace_features') ?? row.fireplace_features ?? undefined,
    kitchenFeatures: pickString('kitchen_features') ?? row.kitchen_features ?? undefined,
    primarySuite: pickString('primary_suite') ?? row.primary_suite ?? undefined,
    laundryFeatures: pickString('laundry_features') ?? row.laundry_features ?? undefined,
    interiorFeatures: pickString('interior_features') ?? row.interior_features ?? undefined,
    appliances: pickString('appliances') ?? row.appliances ?? undefined,
    constructionMaterials: pickString('construction_materials') ?? row.construction_materials ?? undefined,
    roofType: pickString('roof_type') ?? row.roof_type ?? undefined,
    foundationDetails: pickString('foundation_details') ?? row.foundation_details ?? undefined,
    exteriorFeatures: pickString('exterior_features') ?? row.exterior_features ?? undefined,
    propertyView: pickString('property_view') ?? row.property_view ?? undefined,
    heatingType: row.heating ?? undefined,
    coolingType: row.cooling ?? undefined,
    pool: undefined,
    fireplace: undefined,
    taxes: row.taxes ?? undefined,
    taxYear: pickNumber('tax_year'),
    taxDescription: pickString('tax_description'),
    hoaFee: pickNumber('hoa_fee'),
    masterHoaFee: pickNumber('master_hoa_fee'),
    condoFee: pickNumber('condo_fee'),
    buyerAgentCompensation: undefined,
    specialAssessments: pickNumber('special_assessment'),
    otherFee: pickNumber('other_fee'),
    landLease: pickNumber('land_lease'),
    mandatoryClubFee: pickNumber('mandatory_club_fee'),
    recreationLeaseFee: pickNumber('recreation_lease_fee'),
    totalAnnualRecurringFees: pickNumber('total_annual_recurring_fees'),
    totalOneTimeFees: pickNumber('total_one_time_fees'),
    terms: pickString('terms'),
    possession: pickString('possession'),
    approval: pickString('approval'),
    management: pickString('management'),
    listingAgentName: row.listing_agent_name ?? '',
    listingAgentLicense: row.listing_agent_license ?? '',
    listingAgentPhone: row.listing_agent_phone ?? '',
    listingAgentEmail: row.listing_agent_email ?? undefined,
    brokerage: row.listing_office_name ?? '',
    brokerageLicense: row.listing_office_license ?? undefined,
    listingBroker: pickString('listing_broker'),
    officeCode: pickString('office_code'),
    officeName: pickString('office_name'),
    officePhone: pickString('office_phone'),
    officeAddress: pickString('office_address'),
    listingAgentMlsId: pickString('listing_agent_mls_id'),
    listingAgentFax: pickString('listing_agent_fax'),
    appointmentRequired: pickString('appointment_required'),
    appointmentPhone: pickString('appointment_phone'),
    targetMarketing: pickString('target_marketing'),
    internetSites: pickString('internet_sites'),
    listingOnInternet: pickString('listing_on_internet'),
    addressOnInternet: pickString('address_on_internet'),
    blogging: pickString('blogging'),
    avm: pickString('avm'),
    showingInstructions: row.showing_instructions ?? undefined,
    photos,
    coverPhotoUrl: row.cover_photo_url ?? photos[0] ?? undefined,
    publicRemarks: row.public_remarks ?? undefined,
    brokerRemarks: row.private_remarks ?? undefined,
    legalDescription: pickString('legal_description'),
    sectionTownRange: pickString('section_town_range'),
    ownerName: pickString('owner_name') ?? row.owner_name ?? undefined,
    ownerPhone: pickString('owner_phone') ?? row.owner_phone ?? undefined,
    ownerEmail: pickString('owner_email') ?? row.owner_email ?? undefined,
    virtualTourUrl: undefined,
    videoUrl: undefined,
    createdAt: row.created_at,
    lastModified: row.updated_at,
    completionPercentage: computeCompletionPercentage(row),
    validationErrors: extractValidationErrors(row.validation_summary as Record<string, unknown>),
    publishedAt: row.published_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
    additionalFields,
    sourceExtractedFields: sourceExtracted,
    sourceMatches,
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

type AdditionalFieldRecord = Record<string, MLSPropertyAdditionalField>

const mergeAdditionalFieldRecords = (
  primary?: AdditionalFieldRecord,
  secondary?: AdditionalFieldRecord
): AdditionalFieldRecord | undefined => {
  if (!primary && !secondary) {
    return undefined
  }

  const merged = new Map<string, MLSPropertyAdditionalField>()

  const consume = (fields?: AdditionalFieldRecord) => {
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

  const result: AdditionalFieldRecord = {}
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
    ownerName: hasText(base.ownerName) ? base.ownerName : cached.ownerName,
    ownerPhone: hasText(base.ownerPhone) ? base.ownerPhone : cached.ownerPhone,
    ownerEmail: hasText(base.ownerEmail) ? base.ownerEmail : cached.ownerEmail,
    isFeatured: cached.isFeatured ?? base.isFeatured,
    listPricePerSqFt: base.listPricePerSqFt ?? cached.listPricePerSqFt,
    statusType: hasText(base.statusType) ? base.statusType : cached.statusType,
    geoArea: hasText(base.geoArea) ? base.geoArea : cached.geoArea,
    development: hasText(base.development) ? base.development : cached.development,
    propertyId: hasText(base.propertyId) ? base.propertyId : cached.propertyId,
    dom: base.dom ?? cached.dom,
    cdom: base.cdom ?? cached.cdom,
    communityType: hasText(base.communityType) ? base.communityType : cached.communityType,
    golfType: hasText(base.golfType) ? base.golfType : cached.golfType,
    gulfAccess: hasText(base.gulfAccess) ? base.gulfAccess : cached.gulfAccess,
    canalWidth: hasText(base.canalWidth) ? base.canalWidth : cached.canalWidth,
    rearExposure: hasText(base.rearExposure) ? base.rearExposure : cached.rearExposure,
    lotDescription: hasText(base.lotDescription) ? base.lotDescription : cached.lotDescription,
    lotDimensions: hasText(base.lotDimensions) ? base.lotDimensions : cached.lotDimensions,
    water: hasText(base.water) ? base.water : cached.water,
    sewer: hasText(base.sewer) ? base.sewer : cached.sewer,
    irrigation: hasText(base.irrigation) ? base.irrigation : cached.irrigation,
    boatDockInfo: hasText(base.boatDockInfo) ? base.boatDockInfo : cached.boatDockInfo,
    taxDescription: hasText(base.taxDescription) ? base.taxDescription : cached.taxDescription,
    terms: hasText(base.terms) ? base.terms : cached.terms,
    possession: hasText(base.possession) ? base.possession : cached.possession,
    approval: hasText(base.approval) ? base.approval : cached.approval,
    management: hasText(base.management) ? base.management : cached.management,
    masterHoaFee: base.masterHoaFee ?? cached.masterHoaFee,
    condoFee: base.condoFee ?? cached.condoFee,
    specialAssessment: base.specialAssessment ?? cached.specialAssessment,
    otherFee: base.otherFee ?? cached.otherFee,
    landLease: base.landLease ?? cached.landLease,
    mandatoryClubFee: base.mandatoryClubFee ?? cached.mandatoryClubFee,
    recreationLeaseFee: base.recreationLeaseFee ?? cached.recreationLeaseFee,
    totalAnnualRecurringFees: base.totalAnnualRecurringFees ?? cached.totalAnnualRecurringFees,
    totalOneTimeFees: base.totalOneTimeFees ?? cached.totalOneTimeFees,
    officeCode: hasText(base.officeCode) ? base.officeCode : cached.officeCode,
    officeName: hasText(base.officeName) ? base.officeName : cached.officeName,
    officePhone: hasText(base.officePhone) ? base.officePhone : cached.officePhone,
    officeAddress: hasText(base.officeAddress) ? base.officeAddress : cached.officeAddress,
    listingAgentMlsId: hasText(base.listingAgentMlsId) ? base.listingAgentMlsId : cached.listingAgentMlsId,
    listingAgentFax: hasText(base.listingAgentFax) ? base.listingAgentFax : cached.listingAgentFax,
    appointmentRequired: hasText(base.appointmentRequired) ? base.appointmentRequired : cached.appointmentRequired,
    appointmentPhone: hasText(base.appointmentPhone) ? base.appointmentPhone : cached.appointmentPhone,
    targetMarketing: hasText(base.targetMarketing) ? base.targetMarketing : cached.targetMarketing,
    internetSites: hasText(base.internetSites) ? base.internetSites : cached.internetSites,
    listingOnInternet: hasText(base.listingOnInternet) ? base.listingOnInternet : cached.listingOnInternet,
    addressOnInternet: hasText(base.addressOnInternet) ? base.addressOnInternet : cached.addressOnInternet,
    blogging: hasText(base.blogging) ? base.blogging : cached.blogging,
    avm: hasText(base.avm) ? base.avm : cached.avm,
    listingBroker: hasText(base.listingBroker) ? base.listingBroker : cached.listingBroker,
    legalDescription: hasText(base.legalDescription) ? base.legalDescription : cached.legalDescription,
    sectionTownRange: hasText(base.sectionTownRange) ? base.sectionTownRange : cached.sectionTownRange,
    auction: hasText(base.auction) ? base.auction : cached.auction,
    foreclosed: hasText(base.foreclosed) ? base.foreclosed : cached.foreclosed,
    shortSale: hasText(base.shortSale) ? base.shortSale : cached.shortSale,
    additionalFields: mergeAdditionalFieldRecords(base.additionalFields, cached.additionalFields),
    sourceExtractedFields:
      base.sourceExtractedFields && base.sourceExtractedFields.length > 0
        ? base.sourceExtractedFields
        : cached.sourceExtractedFields,
    sourceMatches:
      base.sourceMatches && base.sourceMatches.length > 0
        ? base.sourceMatches
        : cached.sourceMatches,
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
  mlsNumber: 'mls_number',
  listPrice: 'list_price',
  originalListPrice: 'original_list_price',
  propertyType: 'property_type',
  propertySubType: 'property_sub_type',
  architecturalStyle: 'architectural_style',
  yearBuilt: 'year_built',
  livingAreaSqFt: 'living_area_sq_ft',
  totalAreaSqFt: 'total_area_sq_ft',
  bedrooms: 'bedrooms_total',
  bathrooms: 'bathrooms_full',
  bathroomsTotal: 'bathrooms_total',
  bathroomsHalf: 'bathrooms_half',
  streetNumber: 'street_number',
  streetName: 'street_name',
  streetSuffix: 'street_suffix',
  city: 'city',
  state: 'state_code',
  zipCode: 'zip_code',
  county: 'county',
  parcelID: 'parcel_id',
  latitude: 'latitude',
  longitude: 'longitude',
  lotSize: 'lot_size_sq_ft',
  lotSizeAcres: 'lot_size_acres',
  garageSpaces: 'garage_spaces',
  garageType: 'garage_type',
  publicRemarks: 'public_remarks',
  brokerRemarks: 'private_remarks',
  showingInstructions: 'showing_instructions',
  photos: 'photos',
  coverPhotoUrl: 'cover_photo_url',
  listingAgentName: 'listing_agent_name',
  listingAgentLicense: 'listing_agent_license',
  listingAgentPhone: 'listing_agent_phone',
  listingAgentEmail: 'listing_agent_email',
  brokerage: 'listing_office_name',
  brokerageLicense: 'listing_office_license',
  heatingType: 'heating',
  coolingType: 'cooling',
  appliances: 'appliances',
  laundryFeatures: 'laundry_features',
  constructionMaterials: 'construction_materials',
  foundationDetails: 'foundation_details',
  exteriorFinish: 'exterior_finish',
  exteriorFeatures: 'exterior_features',
  interiorFeatures: 'interior_features',
  poolFeatures: 'pool_features',
  flooring: 'flooring',
  fireplaceFeatures: 'fireplace_features',
  kitchenFeatures: 'kitchen_features',
  primarySuite: 'primary_suite',
  primaryBathFeatures: 'primary_bath_features',
  roofType: 'roof_type',
  propertyView: 'property_view',
  waterSource: 'water_source',
  sewerSystem: 'sewer_system',
  listPricePerSqFt: 'list_price_per_sqft',
  statusType: 'status_type',
  geoArea: 'geo_area',
  development: 'development',
  propertyId: 'property_id',
  dom: 'dom',
  cdom: 'cdom',
  communityType: 'community_type',
  golfType: 'golf_type',
  gulfAccess: 'gulf_access',
  canalWidth: 'canal_width',
  rearExposure: 'rear_exposure',
  lotDescription: 'lot_description',
  lotDimensions: 'lot_dimensions',
  water: 'water',
  sewer: 'sewer',
  irrigation: 'irrigation',
  boatDockInfo: 'boat_dock_info',
  parkingFeatures: 'parking_features',
  carportSpaces: 'carport_spaces',
  stormProtection: 'storm_protection',
  windowFeatures: 'window_features',
  builderProductYN: 'builder_product_yn',
  builderName: 'builder_name',
  ownership: 'ownership',
  petsAllowed: 'pets_allowed',
  roadResponsibility: 'road_responsibility',
  roadSurfaceType: 'road_surface_type',
  accessType: 'access_type',
  newConstructionYN: 'new_construction_yn',
  taxes: 'taxes',
  taxDescription: 'tax_description',
  subdivision: 'subdivision',
  terms: 'terms',
  possession: 'possession',
  approval: 'approval',
  management: 'management',
  masterHoaFee: 'master_hoa_fee',
  condoFee: 'condo_fee',
  specialAssessment: 'special_assessment',
  otherFee: 'other_fee',
  landLease: 'land_lease',
  mandatoryClubFee: 'mandatory_club_fee',
  recreationLeaseFee: 'recreation_lease_fee',
  totalAnnualRecurringFees: 'total_annual_recurring_fees',
  totalOneTimeFees: 'total_one_time_fees',
  hoaFeeFrequency: 'hoa_fee_frequency',
  masterHoaFeeFrequency: 'master_hoa_fee_frequency',
  associationYN: 'association_yn',
  taxDistrict: 'tax_district',
  taxDistrictType: 'tax_district_type',
  listingType: 'listing_type',
  listingDate: 'listing_date',
  expirationDate: 'expiration_date',
  floorPlanDescription: 'floor_plan_description',
  floorPlanType: 'floor_plan_type',
  officeCode: 'office_code',
  officeName: 'office_name',
  officePhone: 'office_phone',
  officeAddress: 'office_address',
  listingAgentMlsId: 'listing_agent_mls_id',
  listingAgentFax: 'listing_agent_fax',
  ownerName: 'owner_name',
  ownerEmail: 'owner_email',
  ownerPhone: 'owner_phone',
  directions: 'directions',
  workflowState: 'state',
  status: 'status',
  publishedAt: 'published_at',
  closedAt: 'closed_at',
  slug: 'slug',
  appointmentRequired: 'appointment_required',
  appointmentPhone: 'appointment_phone',
  targetMarketing: 'target_marketing',
  internetSites: 'internet_sites',
  listingOnInternet: 'listing_on_internet',
  addressOnInternet: 'address_on_internet',
  blogging: 'blogging',
  avm: 'avm',
  listingBroker: 'listing_broker',
  legalDescription: 'legal_description',
  sectionTownRange: 'section_town_range',
  elementarySchool: 'elementary_school',
  middleSchool: 'middle_school',
  highSchool: 'high_school',
  rooms: 'rooms',
  domSource: 'dom_source',
  cdomSource: 'cdom_source',
  additionalFields: 'additional_fields',
  sourceExtractedFields: 'source_extracted',
  sourceMatches: 'source_matches'
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

  if (updates.additionalFields) {
    payload.additionalFields = updates.additionalFields
  }

  if (updates.sourceExtractedFields) {
    payload.sourceExtractedFields = updates.sourceExtractedFields
  }

  if (updates.sourceMatches) {
    payload.sourceMatches = updates.sourceMatches
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

  if (property.additionalFields) {
    propertyPayload.additionalFields = property.additionalFields
  }

  if (property.sourceExtractedFields) {
    propertyPayload.sourceExtractedFields = property.sourceExtractedFields
  }

  if (property.sourceMatches) {
    propertyPayload.sourceMatches = property.sourceMatches
  }

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
    const deletedIds = getDeletedPropertyIds()
    const cached = safeGetItem<MLSProperty>(STORAGE_KEYS.properties, []).filter(
      (property) => !deletedIds.has(property.id)
    )
    return orderAndFilterProperties(cached.map((property) => mergePropertyMetadata(property)))
  })
  const [propertiesLoading, setPropertiesLoading] = useState<boolean>(false)
  const [propertiesError, setPropertiesError] = useState<string | null>(null)
  const [defaultFirmId, setDefaultFirmId] = useState<string | null>(null)
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null)

  const draftProperties = useMemo(
    () => properties.filter((property) => property.workflowState !== 'LIVE'),
    [properties]
  )

  const [leads, setLeads] = useState<Lead[]>(() => safeGetItem<Lead>(STORAGE_KEYS.leads, []))

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    const cached = safeGetItem<Partial<TeamMember>>(STORAGE_KEYS.teamMembers, [])
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
      console.debug('broker properties rows', rows.map(r => ({ id: r.id, list_price: r.list_price, bedrooms_total: r.bedrooms_total })))
      const deletedIds = getDeletedPropertyIds()
      const mappedRows = rows
        .map(mapRowToMLSProperty)
        .filter((property) => !deletedIds.has(property.id))

      const cachedProperties = safeGetItem<MLSProperty>(STORAGE_KEYS.properties, []).filter(
        (property) => !deletedIds.has(property.id)
      )
      const cachedById = new Map(cachedProperties.map((property) => [property.id, property]))

      const merged = mappedRows.map((property) => mergePropertyMetadata(property, cachedById.get(property.id)))
      const ordered = orderAndFilterProperties(merged)

      setProperties(ordered)
      if (rows.length > 0) {
        const firstRow = rows[0] as BrokerPropertyRow & { firm_id?: string | null }
        const firmFromRow = typeof firstRow.firm_id === 'string' && firstRow.firm_id
          ? firstRow.firm_id
          : firstRow.org_id
        const agentFromRow = firstRow.agent_id

        if (isUuid(firmFromRow)) {
          setDefaultFirmId(firmFromRow)
        } else if (isUuid(demoOptions.demoFirmId)) {
          setDefaultFirmId(demoOptions.demoFirmId)
        }

        if (isUuid(agentFromRow)) {
          setDefaultAgentId(agentFromRow)
        }
      }
      safeSetItem(STORAGE_KEYS.properties, ordered, STORAGE_LIMITS.properties)
      const draftsCache = ordered.filter((property) => property.workflowState !== 'LIVE')
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
    safeSetItem(STORAGE_KEYS.teamMembers, teamMembers, STORAGE_LIMITS.teamMembers)
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
        const mapped: MLSProperty =
          mappedRaw.workflowState === 'LIVE' && mappedRaw.status === 'draft'
            ? { ...mappedRaw, status: 'active' as MLSProperty['status'] }
            : mappedRaw
        unmarkPropertyDeletion(mapped.id)
        let mergedProperty = mergePropertyMetadata(mapped)
        setProperties((prev) => {
          const cached = prev.find((p) => p.id === mapped.id)
          mergedProperty = mergePropertyMetadata(mapped, cached)
          const updated = orderAndFilterProperties([
            mergedProperty,
            ...prev.filter((p) => p.id !== mergedProperty.id),
          ])
          safeSetItem(STORAGE_KEYS.properties, updated, STORAGE_LIMITS.properties)
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
        const mapped: MLSProperty =
          mappedRaw.workflowState === 'LIVE' && mappedRaw.status === 'draft'
            ? { ...mappedRaw, status: 'active' as MLSProperty['status'] }
            : mappedRaw
        unmarkPropertyDeletion(mapped.id)
        let mergedProperty = mergePropertyMetadata(mapped)
        setProperties((prev) => {
          const cached = prev.find((prop) => prop.id === mapped.id)
          mergedProperty = mergePropertyMetadata(mapped, cached)
          const reordered = orderAndFilterProperties(
            prev.map((prop) => (prop.id === mergedProperty.id ? mergedProperty : prop))
          )
          safeSetItem(STORAGE_KEYS.properties, reordered, STORAGE_LIMITS.properties)
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
      const reordered = orderAndFilterProperties(filtered)
      safeSetItem(STORAGE_KEYS.properties, reordered, STORAGE_LIMITS.properties)
      return reordered
    })
    markPropertyAsDeleted(id)
  }, [])

  const publishDraftProperty = useCallback(
    async (id: string): Promise<MLSProperty> => {
      try {
        const row = await publishBrokerProperty(id)
        const mappedRaw = mapRowToMLSProperty(row)
        const mapped: MLSProperty =
          mappedRaw.workflowState === 'LIVE' && mappedRaw.status === 'draft'
            ? { ...mappedRaw, status: 'active' as MLSProperty['status'] }
            : mappedRaw
        unmarkPropertyDeletion(mapped.id)
        let mergedProperty = mergePropertyMetadata(mapped)
        setProperties((prev) => {
          const cached = prev.find((prop) => prop.id === mapped.id)
          mergedProperty = mergePropertyMetadata(mapped, cached)
          const reordered = orderAndFilterProperties(
            prev.map((prop) => (prop.id === mergedProperty.id ? mergedProperty : prop))
          )
          safeSetItem(STORAGE_KEYS.properties, reordered, STORAGE_LIMITS.properties)
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
        unmarkPropertyDeletion(mapped.id)
        let mergedProperty = mergePropertyMetadata(mapped)
        setProperties((prev) => {
          const cached = prev.find((prop) => prop.id === mapped.id)
          mergedProperty = mergePropertyMetadata(mapped, cached)
          const reordered = orderAndFilterProperties(
            prev.map((prop) => (prop.id === mergedProperty.id ? mergedProperty : prop))
          )
          safeSetItem(STORAGE_KEYS.properties, reordered, STORAGE_LIMITS.properties)
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
            safeSetItem(STORAGE_KEYS.properties, next, STORAGE_LIMITS.properties)
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
      const reordered = orderAndFilterProperties(updated)
      safeSetItem(STORAGE_KEYS.properties, reordered, STORAGE_LIMITS.properties)
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

      const normalizeString = (value: unknown): string => {
        if (value === undefined || value === null) return ''
        return typeof value === 'string' ? value.trim() : String(value).trim()
      }

      const normalizeOptionalString = (value: unknown): string | undefined => {
        const normalized = normalizeString(value)
        return normalized.length > 0 ? normalized : undefined
      }

      const parseNumeric = (value: unknown): number | undefined => {
        if (value === undefined || value === null) return undefined
        const normalized = normalizeString(value).replace(/,/g, '')
        const match = normalized.match(/-?\d+(?:\.\d+)?/)
        if (!match) return undefined
        const parsed = Number(match[0])
        return Number.isFinite(parsed) ? parsed : undefined
      }

      const parseInteger = (value: unknown): number | undefined => {
        const parsed = parseNumeric(value)
        return parsed !== undefined ? Math.round(parsed) : undefined
      }

      const parseCoordinate = (value: unknown): number | undefined => {
        if (value === undefined || value === null) return undefined
        if (typeof value === 'number') {
          return Number.isFinite(value) ? value : undefined
        }
        const cleaned = normalizeString(value)
        if (!cleaned) return undefined
        const numeric = Number(cleaned)
        return Number.isFinite(numeric) ? numeric : undefined
      }

  const parseBoolean = (value: unknown): boolean | undefined => {
    if (value === undefined || value === null) return undefined
    if (typeof value === 'boolean') return value
    const normalized = normalizeString(value).toLowerCase()
    if (!normalized) return undefined
    if (['y', 'yes', 'true', '1', 'included'].includes(normalized)) return true
    if (['n', 'no', 'false', '0', 'not allowed'].includes(normalized)) return false
    return undefined
  }

  const boolToYesNo = (value: boolean | undefined): string | undefined => {
    if (value === undefined) return undefined
    return value ? 'Yes' : 'No'
  }

const sanitizeSystemText = (value?: string | null): string | undefined => {
  if (!value) return undefined
  let result = value.trim()
    if (!result) return undefined

    result = result.replace(/\s+Golf\s+Membership.*$/i, '')
    result = result.replace(/\s+[A-Za-z ]*YN:\s*\w+$/i, '')

    if (/^(front|rear|side)\b/i.test(result)) {
      const parts = result.split(':').map((part) => part.trim()).filter(Boolean)
      if (parts.length > 1) {
        result = parts.slice(1).join(': ')
      }
    }

    result = result.replace(/:\s*None$/i, '')
    result = result.replace(/\s+None$/i, '').trim()
    result = result.replace(/\s{2,}/g, ' ')

    return result || undefined
  }

  const stripAgentInfo = (value?: string | null): string | undefined => {
    if (!value) return undefined
    const cleaned = value.replace(/\s+Agent\b.*$/i, '').trim()
  return cleaned || undefined
}

const extractDate = (value?: string | null): string | undefined => {
  const str = normalizeOptionalString(value)
  if (!str) return undefined
  const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!match) return undefined
  const month = Number(match[1])
  const day = Number(match[2])
  let year = Number(match[3])
  if (Number.isNaN(month) || Number.isNaN(day) || Number.isNaN(year)) {
    return undefined
  }
  if (match[3].length === 2) {
    year = year + 2000
  }
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${year.toString().padStart(4, '0')}-${pad(month)}-${pad(day)}`
}

      const convertIssues = (issues: unknown, fallback: 'error' | 'warning'): ValidationError[] => {
        if (!Array.isArray(issues)) return []
        return (issues as Array<{ field?: string; message?: string; type?: string }>).map((issue) => {
          const type = typeof issue.type === 'string' ? issue.type.toLowerCase() : ''
          const severity: 'error' | 'warning' =
            type === 'required' || type === 'format' || type === 'photos' ? 'error' : fallback
          return {
            field: issue.field ? String(issue.field) : 'general',
            message: issue.message ? String(issue.message) : (issue.type ?? 'Validation issue').toString(),
            severity,
          }
        })
      }


      const getAdditional = (key: string): string | undefined => {
        const raw = draft.additionalFields?.[key]?.value
        return normalizeOptionalString(raw)
      }

      let normalizedMLS = normalizeString((data as any).mlsNumber ?? (data as any).MLSNumber ?? (data as any).MLS ?? (data as any).mls)
      if (!normalizedMLS) {
        normalizedMLS = getAdditional('mls_number') ?? undefined
      }

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
      const statusTypeValue = sanitizeSystemText(normalizeOptionalString(data.StatusType ?? data.statusType ?? getAdditional('status_type')))
      const geoAreaValue = normalizeOptionalString(data.GeoArea ?? data.geoArea ?? getAdditional('geo_area'))
      const developmentValue = normalizeOptionalString(data.Development ?? data.development ?? getAdditional('development'))
      const listPricePerSqFtValue = parseNumeric(data.ListPricePerSqFt ?? data.listPricePerSqFt ?? getAdditional('list_price_per_sqft'))
      const floorPlanDescriptionValue = normalizeOptionalString(data.FloorPlanType ?? data.floorPlanType ?? data.Den ?? getAdditional('floor_plan_type') ?? getAdditional('den'))
      const listingTypeValue = normalizeOptionalString(data.ListingType ?? data.listingType ?? getAdditional('listing_type'))

      let listPrice = parseNumeric(data.ListPrice ?? data.listPrice ?? data.price) ?? 0
      const additionalListPrice = parseNumeric(getAdditional('list_price'))
      if (!listPrice && additionalListPrice) listPrice = additionalListPrice

      let originalListPrice = parseNumeric(data.OriginalListPrice ?? data.originalListPrice ?? undefined)
      if (!originalListPrice) originalListPrice = parseNumeric(getAdditional('original_list_price'))

      const bedrooms = parseInteger(data.BedroomsTotal ?? data.bedrooms ?? data.Bedrooms) ?? parseInteger(getAdditional('bedrooms')) ?? 0
      const bathroomsFull = parseNumeric(data.BathroomsFull ?? data.bathroomsFull ?? data.Baths ?? getAdditional('bathrooms_full')) ?? undefined
      let bathrooms = parseNumeric(data.BathroomsTotal ?? data.bathrooms ?? data.Bathrooms) ?? bathroomsFull ?? 0
      if (!bathrooms) bathrooms = parseNumeric(getAdditional('bathrooms')) ?? bathroomsFull ?? 0
      if (bathrooms && bathrooms > 20 && bathroomsFull) {
        bathrooms = bathroomsFull
      }
      const bathroomsHalf = parseInteger(data.BathroomsHalf ?? data.bathroomsHalf ?? getAdditional('half_baths'))
      const bathroomsTotal = parseNumeric(data.BathroomsTotal ?? data.bathroomsTotal ?? getAdditional('bathrooms_total')) ?? bathroomsFull ?? bathrooms
      let lotSizeAcres = parseNumeric(data.LotSizeAcres ?? data.lotSizeAcres ?? data.Acres)
      if (!lotSizeAcres) lotSizeAcres = parseNumeric(getAdditional('lot_acres'))
      let livingAreaSqFt = parseInteger(
        data.LivingAreaSqFt ?? data.livingAreaSqFt ?? data.LivingArea ?? data.sqft ?? data.living_area_sqft
      ) ?? 0
      if (!livingAreaSqFt) livingAreaSqFt = parseInteger(getAdditional('living_area_sqft') ?? getAdditional('living_area')) ?? 0
      if (!livingAreaSqFt) livingAreaSqFt = parseInteger(data.TotalAreaSqFt ?? data.total_area_sqft ?? getAdditional('total_area_sqft')) ?? 0
      let lotSizeSqFt = parseInteger(data.LotSizeSqFt ?? data.lotSize ?? data.LotSize) ?? 0
      if (!lotSizeSqFt) lotSizeSqFt = parseInteger(getAdditional('lot_size_sqft') ?? getAdditional('lot_size')) ?? 0
      let yearBuilt = parseInteger(data.YearBuilt ?? data.yearBuilt) ?? 0
      if (!yearBuilt) yearBuilt = parseInteger(getAdditional('year_built')) ?? 0
      const garageSpaces = parseInteger(data.GarageSpaces ?? data.garageSpaces ?? getAdditional('garage_spaces'))
      const stories = parseInteger(data.Stories ?? data.stories ?? getAdditional('stories'))

      const domValue = parseInteger(data.DOM ?? data.dom ?? getAdditional('dom'))
      const cdomValue = parseInteger(data.CDOM ?? data.cdom ?? getAdditional('cdom'))
      const internetSitesValue = normalizeOptionalString(data.InternetSites ?? data.internetSites ?? getAdditional('internet_sites'))
      const listingOnInternetValue = boolToYesNo(parseBoolean(data.ListingOnInternet ?? data.listingOnInternet ?? getAdditional('listing_on_internet')))
      const addressOnInternetValue = boolToYesNo(parseBoolean(data.AddressOnInternet ?? data.addressOnInternet ?? getAdditional('address_on_internet')))
      const bloggingValue = boolToYesNo(parseBoolean(data.Blogging ?? data.blogging ?? getAdditional('blogging')))
      const avmValue = boolToYesNo(parseBoolean(data.Avm ?? data.avm ?? getAdditional('avm')))
      const targetMarketingValue = boolToYesNo(parseBoolean(data.TargetMarketing ?? data.targetMarketing ?? getAdditional('target_marketing')))
      const foreclosedValue = boolToYesNo(parseBoolean(data.Foreclosed ?? data.foreclosed ?? getAdditional('foreclosed')))
      const shortSaleValue = boolToYesNo(parseBoolean(data.ShortSale ?? data.shortSale ?? getAdditional('short_sale')))
      const gulfAccessBool = parseBoolean(data.GulfAccess ?? data.gulfAccess ?? getAdditional('gulf_access'))
      const gulfAccessValue = boolToYesNo(gulfAccessBool) ?? normalizeOptionalString(data.GulfAccess ?? data.gulfAccess ?? getAdditional('gulf_access'))
      const boatDockInfoValue = sanitizeSystemText(normalizeOptionalString(data.BoatDockInfo ?? data.boatDockInfo ?? getAdditional('boat_dock_info')))
      const rearExposureValue = sanitizeSystemText(normalizeOptionalString(data.RearExposure ?? data.rearExposure ?? getAdditional('rear_exposure')))
      const sectionTownRangeValue = normalizeOptionalString(data.SectionTownRange ?? data.sectionTownRange ?? getAdditional('section_town_range'))
      const appointmentPhoneValue = normalizeOptionalString(data.AppointmentPhone ?? data.appointmentPhone ?? getAdditional('appointment_phone'))
      const officeNameValue = stripAgentInfo(normalizeOptionalString(data.OfficeName ?? data.officeName ?? getAdditional('office_name')))
      const officePhoneValue = stripAgentInfo(normalizeOptionalString(data.OfficePhone ?? data.officePhone ?? getAdditional('office_phone')))
      const officeAddressValue = normalizeOptionalString(data.OfficeAddress ?? data.officeAddress ?? getAdditional('office_address'))
      const officeCodeValue = normalizeOptionalString(data.OfficeCode ?? data.officeCode ?? getAdditional('office_code'))
      const listingBrokerValue = normalizeOptionalString(data.ListingBroker ?? data.listingBroker ?? getAdditional('listing_broker'))
      const listingAgentMlsIdValue = normalizeOptionalString(data.ListingAgentMlsId ?? data.listingAgentMlsId ?? getAdditional('listing_agent_mls_id') ?? getAdditional('agent_id'))
      const ownerNameValue = normalizeOptionalString(data.OwnerName ?? data.ownerName ?? getAdditional('owner_name'))
      const totalAnnualRecurringFeesValue = parseNumeric(data.TotalAnnualRecurringFees ?? data.totalAnnualRecurringFees ?? getAdditional('total_annual_recurring_fees'))
      const totalOneTimeFeesValue = parseNumeric(data.TotalOneTimeFees ?? data.totalOneTimeFees ?? getAdditional('total_one_time_fees'))
      const mandatoryClubFeeValue = parseNumeric(data.MandatoryClubFee ?? data.mandatoryClubFee ?? getAdditional('mandatory_club_fee'))
      const landLeaseValue = parseNumeric(data.LandLease ?? data.landLease ?? getAdditional('land_lease'))
      const otherFeeValue = parseNumeric(data.OtherFee ?? data.otherFee ?? getAdditional('other_fee'))
      const specialAssessmentValue = parseNumeric(data.SpecialAssessment ?? data.specialAssessment ?? getAdditional('special_assessment'))
      const condoFeeValue = parseNumeric(data.CondoFee ?? data.condoFee ?? getAdditional('condo_fee'))
      const masterHoaFeeValue = parseNumeric(data.MasterHoaFee ?? data.masterHoaFee ?? getAdditional('master_hoa_fee'))
      const hoaFeeValue = parseNumeric(data.HoaFee ?? data.hoaFee ?? getAdditional('hoa_fee'))
      const waterValue = sanitizeSystemText(normalizeOptionalString(data.Water ?? data.water ?? getAdditional('water')))
      const waterSourceValue = sanitizeSystemText(normalizeOptionalString(data.WaterSource ?? data.waterSource ?? getAdditional('water_source')))
      const sewerValue = sanitizeSystemText(normalizeOptionalString(data.Sewer ?? data.sewer ?? getAdditional('sewer')))
      const sewerSystemValue = sanitizeSystemText(normalizeOptionalString(data.SewerSystem ?? data.sewerSystem ?? (data as any)?.SewerSystem ?? getAdditional('sewer_system')))
      const irrigationValue = sanitizeSystemText(normalizeOptionalString(data.Irrigation ?? data.irrigation ?? getAdditional('irrigation')))
      const canalWidthValue = sanitizeSystemText(normalizeOptionalString(data.CanalWidth ?? data.canalWidth ?? getAdditional('canal_width')))
      const listingDateRaw = normalizeOptionalString(data.ListingDate ?? data.listingDate ?? getAdditional('listing_date'))
      const expirationDateRaw = normalizeOptionalString(data.ExpirationDate ?? data.expirationDate ?? getAdditional('expiration_date'))
      const listingDateValue = extractDate(listingDateRaw) ?? listingDateRaw
      const expirationDateValue = extractDate(expirationDateRaw) ?? expirationDateRaw

      console.debug('draft ingest values', { listPrice, additionalListPrice, bedrooms, bathrooms, livingAreaSqFt, lotSizeSqFt, yearBuilt })
      const validationErrors = convertIssues(draft.validationErrors, 'error')
      const validationWarnings = convertIssues(draft.validationWarnings, 'warning')

      const mlsProperty: MLSProperty = {
        // Core identification
        id: (draft.id as string) || `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: normalizeOptionalString((draft as Record<string, unknown>)?.createdAt) ?? new Date().toISOString(),

        // Status and workflow
        status: (draft.status as 'active' | 'pending' | 'sold' | 'draft') || 'draft',

        mlsNumber: normalizedMLS || undefined,
        
        // CRITICAL: Map imported CSV data to MLSProperty fields
        // Price information
        listPrice,
        listPricePerSqFt: listPricePerSqFtValue ?? undefined,
        originalListPrice,
        statusType: statusTypeValue ?? undefined,
        geoArea: geoAreaValue ?? undefined,
        development: developmentValue ?? undefined,
        
        // Location information - map from CSV fields
        streetNumber: normalizeString(data.StreetNumber ?? data.streetNumber ?? getAdditional('street_number')),
        streetName: normalizeString(data.StreetName ?? data.streetName ?? getAdditional('street_name')),
        streetSuffix: normalizeString(data.StreetSuffix ?? data.streetSuffix ?? getAdditional('street_suffix')),
        city: normalizeString(data.City ?? data.city ?? getAdditional('city')),
        state: normalizeString(data.State ?? data.state ?? (data as any)?.StateOrProvince ?? getAdditional('state')),
        zipCode: normalizeString(data.ZIP ?? data.zipCode ?? data.PostalCode ?? getAdditional('zip')),
        county: normalizeString(data.County ?? data.county ?? getAdditional('county')),
        subdivision: normalizeOptionalString(data.Subdivision ?? data.subdivision ?? data.SubdivisionName ?? getAdditional('subdivision')),
        parcelID: normalizeOptionalString(data.ParcelID ?? data.parcelID ?? (data as any)?.parcelId ?? getAdditional('property_id')),
        rearExposure: rearExposureValue,
        sectionTownRange: sectionTownRangeValue,
        legalDescription: normalizeOptionalString(data.LegalDescription ?? data.legalDescription ?? getAdditional('legal_description')),
        dom: domValue ?? undefined,
        cdom: cdomValue ?? undefined,
        latitude: parseCoordinate(
          (data as any).Latitude ??
          data.Latitude ??
          data.latitude ??
          (data as any).lat ??
          (data as any).LATITUDE ??
          getAdditional('latitude')
        ),
        longitude: parseCoordinate(
          (data as any).Longitude ??
          data.Longitude ??
          data.longitude ??
          (data as any).lng ??
          (data as any).LONGITUDE ??
          getAdditional('longitude')
        ),

        // Property details
        propertyType: normalizePropertyType(
          data.PropertyType ||
          data.propertyType ||
          (data as any)?.type ||
          data.PropertyCategory
        ) || 'residential',
        propertySubType: normalizeOptionalString(
          data.PropertySubtype ||
          data.propertySubType ||
          data.PropertySubType ||
          rawPropertyType ||
          rawPropertyCategory ||
          ''
        ),
        architecturalStyle: normalizedArchitecturalStyle || undefined,
        bedrooms,
        bathrooms,
        bathroomsHalf,
        bathroomsTotal,
        lotSizeAcres,
        livingAreaSqFt,
        lotSize: lotSizeSqFt,
        yearBuilt,
        floorPlanDescription: floorPlanDescriptionValue,

        // Building features
        garageSpaces,
        stories,
        pool: parseBoolean((data as any).Pool ?? data.pool),
        communityType: normalizeOptionalString(data.CommunityType ?? data.communityType ?? getAdditional('community_type')),
        parkingFeatures: normalizeOptionalString(data.Parking ?? data.parking ?? data.ParkingFeatures ?? data.parkingFeatures ?? getAdditional('parking_features')),

        // Utilities and systems
        heatingType: sanitizeSystemText(normalizeOptionalString(data.Heating ?? data.heatingType ?? (data as any)?.HeatingType)),
        coolingType: sanitizeSystemText(normalizeOptionalString(data.Cooling ?? data.coolingType ?? (data as any)?.CoolingType)),
        flooring: normalizeOptionalString(data.Flooring ?? data.flooring),
        poolFeatures: normalizeOptionalString(data.PoolFeatures ?? data.poolFeatures ?? data.FeaturePool ?? data.Pool),
        garageType: normalizedGarageType || undefined,
        fireplaceFeatures: normalizeOptionalString(data.FireplaceFeatures ?? data.fireplaceFeatures),
        kitchenFeatures: normalizeOptionalString(data.KitchenFeatures ?? data.kitchenFeatures),
        primarySuite: normalizeOptionalString(data.PrimarySuite ?? data.primarySuite),
        laundryFeatures: normalizedLaundry || undefined,
        interiorFeatures: normalizeOptionalString(data.InteriorFeatures ?? data.interiorFeatures),
        appliances: normalizeOptionalString(data.Appliances ?? data.appliances),
        constructionMaterials: normalizedConstruction || undefined,
        roofType: normalizeOptionalString(data.Roof ?? data.roofType ?? (data as any)?.RoofType),
        foundationDetails: normalizedFoundation || undefined,
        exteriorFeatures: normalizeOptionalString(data.ExteriorFeatures ?? data.exteriorFeatures),
        propertyView: sanitizeSystemText(normalizeOptionalString(data.View ?? data.propertyView)),
        waterSource: waterSourceValue,
        sewerSystem: sewerSystemValue,
        water: waterValue,
        sewer: sewerValue,
        irrigation: irrigationValue,
        canalWidth: canalWidthValue,
        boatDockInfo: boatDockInfoValue,
        gulfAccess: gulfAccessValue,

        // Financial information
        taxes: parseNumeric(data.TaxesAnnual ?? data.taxes ?? data.Taxes),
        taxYear: parseInteger(data.TaxYear ?? data.taxYear),
        taxDescription: normalizeOptionalString(data.TaxDescription ?? data.taxDescription ?? getAdditional('tax_description')),
        hoaFee: hoaFeeValue,
        masterHoaFee: masterHoaFeeValue,
        condoFee: condoFeeValue,
        specialAssessments: specialAssessmentValue,
        specialAssessment: specialAssessmentValue,
        otherFee: otherFeeValue,
        landLease: landLeaseValue,
        mandatoryClubFee: mandatoryClubFeeValue,
        totalAnnualRecurringFees: totalAnnualRecurringFeesValue,
        totalOneTimeFees: totalOneTimeFeesValue,
        terms: normalizeOptionalString(data.Terms ?? data.terms ?? getAdditional('terms')),
        possession: normalizeOptionalString(data.Possession ?? data.possession ?? getAdditional('possession')),
        approval: normalizeOptionalString(data.Approval ?? data.approval ?? getAdditional('approval')),
        management: normalizeOptionalString(data.Management ?? data.management ?? getAdditional('management')),

        // Agent information - map from CSV fields
        listingAgentName: normalizeString(data.ListingAgentName ?? data.listingAgentName ?? data.ListingAgentFullName),
        listingAgentLicense: normalizeString(data.ListingAgentLicense ?? data.listingAgentLicense),
        listingAgentPhone: normalizeString(data.ListingAgentPhone ?? data.listingAgentPhone),
        listingAgentEmail: normalizeOptionalString(data.ListingAgentEmail ?? data.listingAgentEmail),
        brokerage: normalizeString(data.ListingOfficeName ?? data.brokerage ?? data.ListingOffice),
        brokerageLicense: normalizeOptionalString(
          data.ListingOfficeLicense ?? data.brokerageLicense ?? (data as any)?.BrokerageLicense
        ),
        officeName: officeNameValue,
        officePhone: officePhoneValue,
        officeAddress: officeAddressValue,
        officeCode: officeCodeValue,
        listingAgentMlsId: listingAgentMlsIdValue,

        // Marketing information
        publicRemarks: normalizeOptionalString(data.PublicRemarks ?? data.publicRemarks ?? (data as any)?.description),
        brokerRemarks: normalizeOptionalString(data.BrokerRemarks ?? data.brokerRemarks),
        showingInstructions: normalizeOptionalString(data.ShowingInstructions ?? data.showingInstructions),
        listingBroker: listingBrokerValue,
        appointmentPhone: appointmentPhoneValue,
        targetMarketing: targetMarketingValue,
        internetSites: internetSitesValue,
        listingOnInternet: listingOnInternetValue,
        addressOnInternet: addressOnInternetValue,
        blogging: bloggingValue,
        avm: avmValue,
        foreclosed: foreclosedValue,
        shortSale: shortSaleValue,
        ownerName: ownerNameValue,

        // Media - FIXED: Use safely processed photos
        photos: processedPhotos,
        virtualTourUrl: normalizeOptionalString(data.VirtualTourURL ?? data.virtualTourUrl),
        
        // Dates
        listingDate: listingDateValue ?? new Date().toISOString().split('T')[0],
        expirationDate: expirationDateValue,
        listingType: listingTypeValue,
        
        // Initialize counters for published properties
        leadCount: 0,
        viewCount: 0,
        favoriteCount: 0,
        
        // Validation and completion tracking
        validationErrors,
        validationWarnings,
        completionPercentage: (draft.completionPercentage as number) || 0,
        mlsCompliant: Boolean(draft.mlsCompliant),
        
        // Additional tracking
        fileName: normalizeOptionalString(draft.fileName) ?? undefined,
        fieldMatches: (draft.fieldMatches as Record<string, string>) || {},
        lastModified: normalizeOptionalString((draft as Record<string, unknown>)?.lastModified) ?? new Date().toISOString(),
        additionalFields: draft.additionalFields as Record<string, MLSPropertyAdditionalField> | undefined,
        sourceExtractedFields: draft.sourceExtractedFields as MLSProperty['sourceExtractedFields'],
        sourceMatches: draft.sourceMatches as MLSProperty['sourceMatches'],
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

      const alreadyKnown = knownIdentifiers.has(identifier)
      if (alreadyKnown) {
        duplicateDrafts.push({
          mlsNumber: draftProperty.mlsNumber,
          address: [draftProperty.streetNumber, draftProperty.streetName, draftProperty.streetSuffix]
            .filter(Boolean)
            .join(' ')
            .trim(),
          fileName: (draftProperty as any).fileName as string | undefined,
          reason: 'existing',
        })
      } else {
        knownIdentifiers.add(identifier)
      }

      batchIdentifiers.add(identifier)
      return true
    })

    if (duplicateDrafts.length > 0) {
      const updates = duplicateDrafts.filter((dup) => dup.reason === 'existing')
      const skipped = duplicateDrafts.filter((dup) => dup.reason === 'batch_duplicate')
      if (updates.length > 0) {
        console.info('♻️ Duplicate draft listings matched existing records and will be updated:', updates)
      }
      if (skipped.length > 0) {
        console.warn('🚫 Duplicate draft listings skipped within this import:', skipped)
      }
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
    normalizedPromoted.forEach((prop) => unmarkPropertyDeletion(prop.id))

    setProperties((prev) => {
      const mergedPromoted = normalizedPromoted.map((prop) =>
        mergePropertyMetadata(prop, prev.find((p) => p.id === prop.id))
      )
      const promotedIds = new Set(mergedPromoted.map((prop) => prop.id))
      const combined = [...mergedPromoted, ...prev.filter((prop) => !promotedIds.has(prop.id))]
      const reordered = orderAndFilterProperties(combined)
      safeSetItem(STORAGE_KEYS.properties, reordered, STORAGE_LIMITS.properties)
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
    agents: teamMembers,
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
