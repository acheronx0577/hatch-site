// Enhanced MLS Property interface with comprehensive field support
export interface MLSRoom {
  name?: string
  level?: string
  length?: number
  width?: number
  dimensions?: string
}

export interface MLSProperty {
  // Core identification
  id: string
  mlsNumber?: string
  status: 'draft' | 'active' | 'pending' | 'sold' | 'withdrawn' | 'expired'
  workflowState?: 'PROPERTY_PENDING' | 'LIVE' | 'SOLD'
  
  // Basic property information
  listPrice: number
  listPricePerSqFt?: number
  originalListPrice?: number
  propertyType: string
  propertySubType?: string
  architecturalStyle?: string
  yearBuilt: number
  livingAreaSqFt: number
  totalAreaSqFt?: number
  statusType?: string
  geoArea?: string
  development?: string
  propertyId?: string
  dom?: number
  cdom?: number
  listingDate?: string
  expirationDate?: string
  listingType?: string
  floorPlanDescription?: string
  floorPlanType?: string
  
  // Bedroom and bathroom details (enhanced)
  bedrooms: number
  bathrooms: number // Full bathrooms
  bathroomsHalf?: number // Half bathrooms
  bathroomsPartial?: number // Partial bathrooms
  bathroomsTotal?: number // Total bathrooms
  bathroomsThreeQuarter?: number
  
  // Structure details
  stories?: number
  
  // Location information (all required for MLS compliance)
  streetNumber: string
  streetName: string
  streetSuffix: string
  city: string
  state: string
  zipCode: string
  county: string
  subdivision?: string
  parcelID?: string // Added Parcel ID
  latitude?: number
  longitude?: number
  lotDescription?: string
  lotDimensions?: string
  rearExposure?: string
  sectionTownRange?: string
  legalDescription?: string

  // Lot and land
  lotSize: number
  lotSizeAcres?: number
  
  // Parking and garage
  garageSpaces?: number
  garageType?: string
  carportSpaces?: number
  
  // Enhanced feature fields
  flooring?: string
  poolFeatures?: string
  fireplaceFeatures?: string
  kitchenFeatures?: string
  primarySuite?: string
  primaryBathFeatures?: string
  laundryFeatures?: string
  interiorFeatures?: string
  appliances?: string
  constructionMaterials?: string
  roofType?: string
  foundationDetails?: string
  exteriorFinish?: string
  exteriorFeatures?: string
  propertyView?: string
  waterSource?: string
  sewerSystem?: string
  heatingType?: string
  coolingType?: string
  gulfAccess?: string
  canalWidth?: string
  water?: string
  sewer?: string
  irrigation?: string
  boatDockInfo?: string
  communityType?: string
  golfType?: string
  parkingFeatures?: string
  stormProtection?: string
  windowFeatures?: string
  builderProductYN?: boolean
  builderName?: string
  ownership?: string
  petsAllowed?: string
  roadResponsibility?: string
  roadSurfaceType?: string
  accessType?: string
  newConstructionYN?: boolean

  // Legacy feature flags (for backward compatibility)
  pool?: boolean
  fireplace?: boolean

  // Financial information
  taxes?: number
  taxYear?: number
  hoaFee?: number
  masterHoaFee?: number
  condoFee?: number
  buyerAgentCompensation?: number
  specialAssessments?: number
  specialAssessment?: number
  otherFee?: number
  landLease?: number
  mandatoryClubFee?: number
  recreationLeaseFee?: number
  totalAnnualRecurringFees?: number
  totalOneTimeFees?: number
  taxDescription?: string
  terms?: string
  possession?: string
  approval?: string
  management?: string
  hoaFeeFrequency?: string
  masterHoaFeeFrequency?: string
  associationYN?: boolean
  taxDistrict?: string
  taxDistrictType?: string

  // Agent and brokerage information
  listingAgentName: string
  listingAgentLicense: string
  listingAgentPhone: string
  listingAgentEmail?: string
  brokerage: string
  brokerageLicense?: string
  showingInstructions?: string
  listingBroker?: string
  listingAgentMlsId?: string
  listingBroker?: string
  appointmentRequired?: string
  appointmentPhone?: string
  targetMarketing?: string
  internetSites?: string
  listingOnInternet?: string
  addressOnInternet?: string
  blogging?: string
  avm?: string
  auction?: string
  foreclosed?: string
  shortSale?: string
  officeCode?: string
  officeName?: string
  officePhone?: string
  officeAddress?: string
  listingAgentMlsId?: string
  listingAgentFax?: string
  ownerName?: string
  ownerPhone?: string
  ownerEmail?: string
  ownerPhone?: string
  ownerEmail?: string

  // Media and marketing
  photos?: string[]
  coverPhotoUrl?: string
  publicRemarks?: string
  brokerRemarks?: string
  directions?: string
  virtualTourUrl?: string
  videoUrl?: string
  listingDate?: string
  expirationDate?: string
  viewCount?: number
  leadCount?: number
  favoriteCount?: number
  
  // System fields
  createdAt: string
  lastModified: string
  completionPercentage: number
  validationErrors?: ValidationError[]
  validationWarnings?: ValidationError[]
  mlsCompliant?: boolean
  fileName?: string
  fieldMatches?: Record<string, string>
  publishedAt?: string | null
  closedAt?: string | null
  isFeatured?: boolean
  additionalFields?: Record<string, MLSPropertyAdditionalField>
  sourceExtractedFields?: MLSPropertyExtractedField[]
  sourceMatches?: MLSPropertyMatch[]
  elementarySchool?: string
  middleSchool?: string
  highSchool?: string
  rooms?: MLSRoom[]
  domSource?: string
  cdomSource?: string
}

export interface MLSPropertyAdditionalField {
  label: string
  value: string
  section?: string
}

export interface MLSPropertyExtractedField {
  label?: string
  value: string
  section?: string
}

export interface MLSPropertyMatch {
  canonical: string
  score?: number
  label?: string | null
}

export interface ValidationError {
  field: string
  message: string
  severity: 'error' | 'warning'
}

// Property search and filter interfaces
export interface PropertyFilters {
  priceMin?: number
  priceMax?: number
  bedrooms?: number
  bathrooms?: number
  propertyType?: string
  city?: string
  state?: string
  zipCode?: string
  yearBuiltMin?: number
  yearBuiltMax?: number
  sqftMin?: number
  sqftMax?: number
  lotSizeMin?: number
  lotSizeMax?: number
  hasPool?: boolean
  hasFireplace?: boolean
  garageSpaces?: number
  architecturalStyle?: string
  flooring?: string
  heatingType?: string
  coolingType?: string
}

export interface PropertySearchResult {
  properties: MLSProperty[]
  totalCount: number
  filters: PropertyFilters
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// Property status and workflow
export type PropertyStatus = 'draft' | 'active' | 'pending' | 'sold' | 'withdrawn' | 'expired'

export interface PropertyStatusUpdate {
  propertyId: string
  newStatus: PropertyStatus
  updatedBy: string
  updatedAt: string
  notes?: string
}

// Enhanced property analytics
export interface PropertyAnalytics {
  propertyId: string
  views: number
  inquiries: number
  showings: number
  offers: number
  daysOnMarket: number
  priceHistory: PriceHistoryEntry[]
  marketComparables?: MLSProperty[]
}

export interface PriceHistoryEntry {
  price: number
  date: string
  type: 'initial' | 'reduction' | 'increase'
  notes?: string
}

// Property comparison interface
export interface PropertyComparison {
  properties: MLSProperty[]
  comparisonFields: (keyof MLSProperty)[]
  createdAt: string
  createdBy: string
}

// Export interfaces for bulk operations
export interface BulkPropertyOperation {
  operationType: 'update' | 'delete' | 'publish' | 'unpublish'
  propertyIds: string[]
  updates?: Partial<MLSProperty>
  performedBy: string
  performedAt: string
}

export interface BulkOperationResult {
  successful: string[]
  failed: Array<{
    propertyId: string
    error: string
  }>
  totalProcessed: number
}
