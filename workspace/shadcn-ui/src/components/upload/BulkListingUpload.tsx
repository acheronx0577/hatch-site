import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import type { ExtractedLabelValue } from '@hatch/shared'
import {
  MLS_FIELD_DEFINITIONS,
  mapCSVHeaders,
  validateMLSData,
  processFieldValueCSV
} from '@/utils/fuzzyFieldMatcher'
import { MIN_PROPERTY_PHOTOS, MAX_PROPERTY_PHOTOS } from '@/constants/photoRequirements'
import { toast } from '@/components/ui/use-toast'
import {
  suggestHatchFieldMappings,
  uploadDraftPdf,
  type DraftPdfUploadResponse,
  type HatchFieldMappingAvailableField
} from '@/lib/api/hatch'

// Local FieldMapping type (module does not export it)
type FieldMapping = {
  inputField: string
  mlsField: { standardName: string }
  confidence: number
}

export interface DraftListing {
  id: string
  fileName: string
  uploadDate: string
  status: 'processing' | 'ready' | 'error' | 'published'
  totalRecords: number
  validRecords: number
  errorRecords: number
  requiredFieldsComplete: number
  optionalFieldsComplete: number
  photosCount: number
  data: any[]
  validationErrors: ValidationError[]
  fieldMapping: FieldMapping[]
  mlsCompliant?: boolean
  completionPercentage: number
  mappedData?: Record<string, unknown>
  originalData?: Record<string, unknown>
  canonicalDraft?: Record<string, unknown>
  sourceType?: 'csv' | 'excel' | 'pdf'
  matches?: DraftPdfUploadResponse['matches']
  extracted?: ExtractedLabelValue[]
  additionalFields?: Record<string, { label: string; value: string; section?: string }>
}

export interface ValidationError {
  row: number
  field: string
  type: 'required' | 'optional' | 'format' | 'photos'
  message: string
}

const MAX_PDF_SIZE_MB = 25
const PDF_VENDOR_FALLBACK = 'Unknown Vendor'
const PDF_DOCUMENT_VERSION = 'unspecified'
const MAX_AI_FIELD_MAPPING_BATCHES = 3

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

type PdfCanonicalDraft = DraftPdfUploadResponse['draft']

const AI_FIELD_MAPPING_AVAILABLE_FIELDS: HatchFieldMappingAvailableField[] = [
  { field: 'MLSNumber', label: 'MLS Number', required: true },
  { field: 'Status', label: 'Listing Status' },
  { field: 'ListPrice', label: 'List Price', required: true },
  { field: 'OriginalListPrice', label: 'Original List Price' },

  { field: 'StreetLine', label: 'Street Address (full)' },
  { field: 'StreetNumber', label: 'Street Number', required: true },
  { field: 'StreetName', label: 'Street Name', required: true },
  { field: 'StreetSuffix', label: 'Street Suffix', required: true },
  { field: 'UnitNumber', label: 'Unit / Apt' },
  { field: 'City', label: 'City', required: true },
  { field: 'State', label: 'State', required: true },
  { field: 'ZipCode', label: 'ZIP Code', required: true },
  { field: 'ZipPlus4', label: 'ZIP+4' },
  { field: 'CountyOrParish', label: 'County' },
  { field: 'SubdivisionName', label: 'Subdivision' },

  { field: 'PropertyType', label: 'Property Type' },
  { field: 'PropertySubType', label: 'Property Sub-Type' },
  { field: 'ArchitecturalStyle', label: 'Architectural Style' },

  { field: 'BedroomsTotal', label: 'Bedrooms' },
  { field: 'BathroomsTotal', label: 'Bathrooms (total)' },
  { field: 'BathroomsFull', label: 'Bathrooms (full)' },
  { field: 'BathroomsHalf', label: 'Bathrooms (half)' },
  { field: 'LivingArea', label: 'Living Area (sqft)' },
  { field: 'BuildingAreaTotal', label: 'Total Building Area (sqft)' },
  { field: 'LotSizeSquareFeet', label: 'Lot Size (sqft)' },
  { field: 'LotSizeAcres', label: 'Lot Size (acres)' },
  { field: 'YearBuilt', label: 'Year Built' },

  { field: 'Latitude', label: 'Latitude' },
  { field: 'Longitude', label: 'Longitude' },

  { field: 'PhotoURLs', label: 'Photo URLs' },

  { field: 'ListingAgentName', label: 'Listing Agent Name' },
  { field: 'ListingAgentPhone', label: 'Listing Agent Phone' },
  { field: 'ListingAgentEmail', label: 'Listing Agent Email' },
  { field: 'ListingAgentLicense', label: 'Listing Agent License' },
  { field: 'ListingOfficeName', label: 'Listing Office Name' },
  { field: 'ListingOfficePhone', label: 'Listing Office Phone' },
  { field: 'ListingOfficeEmail', label: 'Listing Office Email' },
  { field: 'BrokerageLicense', label: 'Brokerage License' },

  { field: 'PublicRemarks', label: 'Public Remarks / Description' },
  { field: 'PrivateRemarks', label: 'Private Remarks' },
  { field: 'ShowingInstructions', label: 'Showing Instructions' }
];

// Safe lower-case helper to avoid crashes on undefined/null/non-strings
const safeLower = (v: any) =>
  (typeof v === 'string' ? v.toLowerCase() : (v == null ? '' : String(v).toLowerCase()));

// Normalize each row using the per-cell normalizer from fuzzyFieldMatcher
const processFieldValueCSVRows = (rows: any[]): any[] => {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    const out: Record<string, any> = {}
    Object.entries(row ?? {}).forEach(([k, v]) => {
      out[k as string] = processFieldValueCSV(k as string, v)
    })
    return out
  })
}

// --- Heuristic header matching (fallback if fuzzy matcher returns nothing) ---
const norm = (s: unknown) => safeLower(s).replace(/[^a-z0-9]/g, '')

// Common MLS alias map → standard field name used in your app
const ALIAS_TO_STANDARD: Record<string, string> = {
  // identity/common
  mls: 'MLSNumber', mlsid: 'MLSNumber', mlsnumber: 'MLSNumber', 'mls#': 'MLSNumber', 'mlsno': 'MLSNumber',
  id: 'MLSNumber', listingid: 'MLSNumber',

  listprice: 'ListPrice', price: 'ListPrice', askingprice: 'ListPrice',

  address: 'StreetLine', street: 'StreetLine', streetaddress: 'StreetLine',
  streetnumber: 'StreetNumber', stnumber: 'StreetNumber', 'house#': 'StreetNumber',
  streetname: 'StreetName', stname: 'StreetName',
  streetsuffix: 'StreetSuffix', stsuffix: 'StreetSuffix', suffix: 'StreetSuffix',
  unit: 'UnitNumber', unitnumber: 'UnitNumber', apt: 'UnitNumber', suite: 'UnitNumber',
  city: 'City', township: 'City',
  state: 'State', province: 'State',
  zip: 'ZipCode', zipcode: 'ZipCode', postalcode: 'ZipCode',

  county: 'CountyOrParish', subdivision: 'SubdivisionName', neighborhood: 'SubdivisionName',

  propertytype: 'PropertyType', type: 'PropertyType',
  propertysubtype: 'PropertySubType', subtype: 'PropertySubType', propsubtype: 'PropertySubType',
  architecturalstyle: 'ArchitecturalStyle', style: 'ArchitecturalStyle', archstyle: 'ArchitecturalStyle',

  parcelid: 'ParcelID', strap: 'ParcelID', pid: 'ParcelID', apn: 'ParcelID', folio: 'ParcelID',

  bedrooms: 'BedroomsTotal', beds: 'BedroomsTotal', br: 'BedroomsTotal',
  bathrooms: 'BathroomsTotal', baths: 'BathroomsTotal', ba: 'BathroomsTotal',
  fullbaths: 'BathroomsFull', halfbaths: 'BathroomsHalf', partialbaths: 'BathroomsHalf',

  livingsqft: 'LivingArea', livingsf: 'LivingArea', sqft: 'LivingArea', sfla: 'LivingArea', area: 'LivingArea',
  totalsqft: 'BuildingAreaTotal', grossarea: 'BuildingAreaTotal',

  yearbuilt: 'YearBuilt', yrbuilt: 'YearBuilt', built: 'YearBuilt',

  latitude: 'Latitude', lat: 'Latitude', longitude: 'Longitude', long: 'Longitude', lng: 'Longitude',

  photos: 'PhotoURLs', photo: 'PhotoURLs', photourls: 'PhotoURLs', imageurls: 'PhotoURLs', images: 'PhotoURLs', mediaphotos: 'PhotoURLs',

  listingagent: 'ListingAgentName', agentname: 'ListingAgentName', la_name: 'ListingAgentName',
  listingagentphone: 'ListingAgentPhone', agentphone: 'ListingAgentPhone', la_phone: 'ListingAgentPhone',
  listingofficename: 'ListingOfficeName', brokerage: 'ListingOfficeName', office: 'ListingOfficeName',
  brokeragelicense: 'BrokerageLicense', officelicense: 'BrokerageLicense',

  // --- Added aliases ---
  // Beds/Baths granular
  bedroom: 'BedroomsTotal', bedrooms_total: 'BedroomsTotal',
  fullbath: 'BathroomsFull', full_baths: 'BathroomsFull', bathsfull: 'BathroomsFull',
  halfbath: 'BathroomsHalf', half_baths: 'BathroomsHalf', bathshalf: 'BathroomsHalf',
  threequarterbaths: 'BathroomsThreeQuarter', threequarter_baths: 'BathroomsThreeQuarter',

  // Living area / building area
  livingarea: 'LivingArea', living_area: 'LivingArea', finishedsqft: 'LivingArea', finished_area: 'LivingArea',
  grosssqft: 'BuildingAreaTotal', buildingareatotal: 'BuildingAreaTotal', building_area_total: 'BuildingAreaTotal',

  // Lot size
  lotsize: 'LotSizeSquareFeet', lotsizearea: 'LotSizeSquareFeet', lot_size: 'LotSizeSquareFeet',
  lotsqft: 'LotSizeSquareFeet', lotsquarefeet: 'LotSizeSquareFeet', acres: 'LotSizeAcres', lotacres: 'LotSizeAcres',

  // Address pieces (ensure coverage)
  street_no: 'StreetNumber', street_num: 'StreetNumber',
  street_dir: 'StreetDir', streetdirection: 'StreetDir',
  stateorprovince: 'State',
  zipcode4: 'ZipPlus4', zip4: 'ZipPlus4',
  countyname: 'CountyOrParish', county_or_parish: 'CountyOrParish',

  // Parcel/APN
  apn_number: 'ParcelID', parcel: 'ParcelID', parcel_number: 'ParcelID',

  // Taxes & fees
  annualtax: 'AnnualTaxes', annualtaxes: 'AnnualTaxes', taxamount: 'AnnualTaxes',
  hoa: 'AssociationFee', hoa_fee: 'AssociationFee', monthlyhoa: 'AssociationFee', associationfee: 'AssociationFee',
  hoafee: 'AssociationFee', hoa_amount: 'AssociationFee',
  specialassessments: 'SpecialAssessments', special_assessments: 'SpecialAssessments', specialassessment: 'SpecialAssessments',

  // Compensation
  buyeragentcomp: 'BuyerAgentCompensation', buyer_agent_comp: 'BuyerAgentCompensation', buyeragentcommission: 'BuyerAgentCompensation',
  bac: 'BuyerAgentCompensation', coop: 'BuyerAgentCompensation', co_op: 'BuyerAgentCompensation',

  // Agent/office identity
  listingagentemail: 'ListingAgentEmail', agentemail: 'ListingAgentEmail', la_email: 'ListingAgentEmail',
  listingagentlicense: 'ListingAgentLicense', agentlicense: 'ListingAgentLicense', la_license: 'ListingAgentLicense',
  listingofficephone: 'ListingOfficePhone', officephone: 'ListingOfficePhone', brokeragephone: 'ListingOfficePhone',
  officeemail: 'ListingOfficeEmail', brokerageemail: 'ListingOfficeEmail',

  // Remarks / instructions
  showinginstructions: 'ShowingInstructions', showing_time: 'ShowingInstructions', showingtime: 'ShowingInstructions',
  publicremarks: 'PublicRemarks', remarks: 'PublicRemarks', description: 'PublicRemarks', propertydescription: 'PublicRemarks',
  brokerremarks: 'PrivateRemarks', privateremarks: 'PrivateRemarks', confidentialremarks: 'PrivateRemarks',

  // Features & amenities (map to general buckets your app supports)
  pool: 'FeaturePool', waterfront: 'FeatureWaterfront',
  garagespaces: 'GarageSpaces', garage_spaces: 'GarageSpaces', parking: 'ParkingFeatures', parkingfeatures: 'ParkingFeatures',
  garagetype: 'GarageType', 'garage type': 'GarageType',
  cooling: 'Cooling', coolingtype: 'Cooling', airconditioning: 'Cooling', hvac: 'Cooling',
  heating: 'Heating', heatingtype: 'Heating',
  roof: 'Roof', roofing: 'Roof', flooring: 'Flooring', exterior: 'ExteriorFeatures', interiorfeatures: 'InteriorFeatures', exteriorfeatures: 'ExteriorFeatures',
  appliances: 'Appliances', furnished: 'Furnished', gated: 'GatedCommunity', gatedcommunity: 'GatedCommunity', fireplace: 'FireplaceFeatures', newconstruction: 'NewConstruction',
  laundry: 'LaundryFeatures', laundryroom: 'LaundryFeatures', laundry_features: 'LaundryFeatures',
  construction: 'ConstructionMaterials', constructiondetails: 'ConstructionMaterials',
  foundation: 'FoundationDetails', foundationdetails: 'FoundationDetails', foundation_type: 'FoundationDetails',

  buyeragentcompensation: 'BuyerAgentCompensation',
  buyeragentbonus: 'BuyerAgentCompensation',

  fullbathrooms: 'BathroomsFull',
  halfbathrooms: 'BathroomsHalf',

  bedroomcount: 'BedroomsTotal',
  bathroomcount: 'BathroomsTotal',

  livingsqfttotal: 'LivingArea',
  lotacresize: 'LotSizeAcres',
  'lot size acres': 'LotSizeAcres',
  lotsizeacres: 'LotSizeAcres',

  streetaddr: 'StreetLine',
  zipplus4: 'ZipPlus4',

  agentfirstname: 'ListingAgentName',
  agentlastname: 'ListingAgentName',
  agentcell: 'ListingAgentPhone',
  agentphonecell: 'ListingAgentPhone',
  agentemailaddress: 'ListingAgentEmail',

  brokerlicense: 'BrokerageLicense',

  remarkspublic: 'PublicRemarks',
  remarksprivate: 'PrivateRemarks',
}

const buildHeuristicMappings = (
  headers: string[],
  overrides: Record<string, string> = {}
): FieldMapping[] => {
  // Build a quick lookup of standard names declared in MLS_FIELD_DEFINITIONS
  const standardNames = (MLS_FIELD_DEFINITIONS || [])
    .map((d: any) => d?.standardName ?? d?.name ?? d?.key)
    .filter(Boolean)
  const normStandards = new Set(standardNames.map(norm))

  const mappings: FieldMapping[] = []

  headers.forEach((h) => {
    const n = norm(h)
    if (!n) return

    const overridden = overrides[n]
    if (overridden) {
      mappings.push({ inputField: h, mlsField: { standardName: overridden } as any, confidence: 0.95 })
      return
    }

    // 1) Direct match to a known standard name
    if (normStandards.has(n)) {
      const std = (standardNames.find((s) => norm(s) === n) as string) || h
      mappings.push({ inputField: h, mlsField: { standardName: std } as any, confidence: 0.95 })
      return
    }

    // 2) Alias match
    if (ALIAS_TO_STANDARD[n]) {
      mappings.push({ inputField: h, mlsField: { standardName: ALIAS_TO_STANDARD[n] } as any, confidence: 0.9 })
      return
    }

    // 3) Loose contains on standard names (e.g., "list price" vs "price")
    const loose = standardNames.find((s) => {
      const ns = norm(s)
      return ns.includes(n) || n.includes(ns)
    })
    if (loose) {
      mappings.push({ inputField: h, mlsField: { standardName: loose } as any, confidence: 0.75 })
      return
    }
  })

  return mappings
}

/** Convert parsed rows to rows that ALSO include standardized keys using fieldMappings. */
const toStandardizedRows = (rows: any[], fieldMappings: FieldMapping[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return []

  // input header (normalized) → standard name
  const mapByInputNorm = new Map<string, string>()
  fieldMappings.forEach((m) => {
    const inp = m?.inputField
    const std = m?.mlsField?.standardName
    if (inp && std) mapByInputNorm.set(norm(inp), std)
  })

  // standard → app key (aligns with what BrokerContext expects)
const STANDARD_TO_APP: Record<string, string> = {
    MLSNumber: 'mlsNumber',
    Status: 'status',
    ListPrice: 'listPrice',
    OriginalListPrice: 'originalListPrice',

    StreetLine: 'streetLine',
    StreetNumber: 'streetNumber',
    StreetName: 'streetName',
    StreetSuffix: 'streetSuffix',
    UnitNumber: 'unitNumber',
    City: 'city',
    State: 'state',
    ZipCode: 'zipCode',
    ZipPlus4: 'zipPlus4',
    CountyOrParish: 'county',

    PropertyType: 'propertyType',
    PropertySubType: 'propertySubType',
    ArchitecturalStyle: 'architecturalStyle',

    ParcelID: 'parcelId',
    GarageType: 'garageType',

    BedroomsTotal: 'bedrooms',
    BathroomsTotal: 'bathrooms',
    BathroomsFull: 'bathroomsFull',
    BathroomsHalf: 'bathroomsHalf',

    LivingArea: 'livingArea',
    BuildingAreaTotal: 'buildingAreaTotal',

    LotSizeSquareFeet: 'lotSizeSqft',
    LotSizeAcres: 'lotSizeAcres',

    YearBuilt: 'yearBuilt',

    Latitude: 'latitude',
    Longitude: 'longitude',

    PhotoURLs: 'photos',

    ListingAgentName: 'listingAgentName',
    ListingAgentPhone: 'listingAgentPhone',
    ListingAgentEmail: 'listingAgentEmail',
    ListingAgentLicense: 'listingAgentLicense',

    ListingOfficeName: 'listingOfficeName',
    ListingOfficePhone: 'listingOfficePhone',
    ListingOfficeEmail: 'listingOfficeEmail',
    BrokerageLicense: 'brokerageLicense',

    PublicRemarks: 'publicRemarks',
    PrivateRemarks: 'privateRemarks',
    ShowingInstructions: 'showingInstructions',

    Roof: 'roof',
    Flooring: 'flooring',
    ExteriorFeatures: 'exteriorFeatures',
    InteriorFeatures: 'interiorFeatures',
    Appliances: 'appliances',
    LaundryFeatures: 'laundryFeatures',
    ConstructionMaterials: 'constructionMaterials',
    FoundationDetails: 'foundationDetails',
    GarageSpaces: 'garageSpaces',
    ParkingFeatures: 'parkingFeatures',
    Cooling: 'cooling',
    Heating: 'heating',
    FeaturePool: 'pool',
    FeatureWaterfront: 'waterfront',
    NewConstruction: 'newConstruction',
    Furnished: 'furnished',
    GatedCommunity: 'gatedCommunity',

    // Identity mappings to handle cases where the mapper yields app-key names as standards
    mlsNumber: 'mlsNumber',
    status: 'status',
    listPrice: 'listPrice',
    originalListPrice: 'originalListPrice',

    streetLine: 'streetLine',
    streetNumber: 'streetNumber',
    streetName: 'streetName',
    streetSuffix: 'streetSuffix',
    unitNumber: 'unitNumber',
    city: 'city',
    state: 'state',
    zipCode: 'zipCode',
    zipPlus4: 'zipPlus4',
    county: 'county',

    propertyType: 'propertyType',
    propertySubType: 'propertySubType',
    architecturalStyle: 'architecturalStyle',

    parcelId: 'parcelId',
    garageType: 'garageType',

    bedrooms: 'bedrooms',
    bathrooms: 'bathrooms',
    bathroomsFull: 'bathroomsFull',
    bathroomsHalf: 'bathroomsHalf',

    livingArea: 'livingArea',
    buildingAreaTotal: 'buildingAreaTotal',

    lotSizeSqft: 'lotSizeSqft',
    lotSizeAcres: 'lotSizeAcres',

    yearBuilt: 'yearBuilt',

    latitude: 'latitude',
    longitude: 'longitude',

    photos: 'photos',

    listingAgentName: 'listingAgentName',
    listingAgentPhone: 'listingAgentPhone',
    listingAgentEmail: 'listingAgentEmail',
    listingAgentLicense: 'listingAgentLicense',

    listingOfficeName: 'listingOfficeName',
    listingOfficePhone: 'listingOfficePhone',
    listingOfficeEmail: 'listingOfficeEmail',
    brokerageLicense: 'brokerageLicense',

    publicRemarks: 'publicRemarks',
    privateRemarks: 'privateRemarks',
    showingInstructions: 'showingInstructions',

    roof: 'roof',
    flooring: 'flooring',
    exteriorFeatures: 'exteriorFeatures',
    interiorFeatures: 'interiorFeatures',
    appliances: 'appliances',
    laundryFeatures: 'laundryFeatures',
    constructionMaterials: 'constructionMaterials',
    foundationDetails: 'foundationDetails',
    garageSpaces: 'garageSpaces',
    parkingFeatures: 'parkingFeatures',
    cooling: 'cooling',
    heating: 'heating',
    pool: 'pool',
    waterfront: 'waterfront',
    newConstruction: 'newConstruction',
    furnished: 'furnished',
    gatedCommunity: 'gatedCommunity',
  }

  // helper to normalize/clean and accept typical image URLs
  const normalizePhotoList = (v: any): string => {
    const s = Array.isArray(v) ? v.join(',') : (v ?? '').toString()
    const parts = s.replace(/[;|]/g, ',').split(',').map(p => p.trim()).filter(Boolean)
    const allowedExt = /\.(jpe?g|png|webp|gif|bmp|tiff?)(\?.*)?$/i
    return parts
      .filter(p => /^https?:\/\//i.test(p) && (allowedExt.test(p) || /\/uc\?export=download/.test(p)))
      .slice(0, MAX_PROPERTY_PHOTOS)
      .join(',')
  }

  return rows.map((row) => {
    const out: Record<string, any> = { ...row }

    // 1) Create standardized twins (preserve originals)
    Object.entries(row || {}).forEach(([k, v]) => {
      const std = mapByInputNorm.get(norm(k))
      if (std) {
        out[std] = v
        const appKey = STANDARD_TO_APP[std]
        if (appKey) out[appKey] = v
      }

      // If any incoming column looks like a photos column, sanitize it and mirror to PhotoURLs/photos
      if (/^(photos?|images?|photo_urls?|image_urls?|photourls|mediaphotos)$/i.test(k)) {
        const cleaned = normalizePhotoList(v)
        out[k] = cleaned
        out['PhotoURLs'] = cleaned
        out['photos'] = cleaned
      }
    })

    // 2) If we have StreetLine but missing components, attempt to parse into number/name/suffix
    if (out.StreetLine && (!out.StreetNumber || !out.StreetName)) {
      // Try common patterns: "123 Main St", "123 W Main Street", "123 Main"
      const line = String(out.StreetLine).trim()
      const m = line.match(/^\s*(\d+[A-Za-z]?)\s+(.+?)\s+([A-Za-z\.]+)\s*$/)
      if (m) {
        out.StreetNumber = out.StreetNumber || m[1]
        out.StreetName   = out.StreetName   || m[2]
        out.StreetSuffix = out.StreetSuffix || m[3]
      } else {
        // Fallback split: first token = number, last token = maybe suffix, middle = name
        const parts = line.split(/\s+/)
        if (parts.length >= 2) {
          if (!out.StreetNumber && /^\d/.test(parts[0])) out.StreetNumber = parts[0]
          if (!out.StreetName) out.StreetName = parts.slice(1, -1).join(' ') || parts.slice(1).join(' ')
          if (!out.StreetSuffix && parts.length > 2) out.StreetSuffix = parts[parts.length - 1]
        }
      }
    }

    // 3) Mirror parsed address pieces to app keys
    ;(['StreetNumber','StreetName','StreetSuffix','ZipCode','ZipPlus4','CountyOrParish'] as const).forEach((std) => {
      const appKey = STANDARD_TO_APP[std]
      if (appKey && out[std] && !out[appKey]) out[appKey] = out[std]
    })

    // 4) Compute BathroomsTotal if we only have full/half
    if (!out.BathroomsTotal && (out.BathroomsFull || out.BathroomsHalf)) {
      const f = Number(out.BathroomsFull || 0)
      const h = Number(out.BathroomsHalf || 0)
      out.BathroomsTotal = (f + h * 0.5).toString()
      out['bathrooms'] = out.BathroomsTotal
    }

    // 5) Ensure app keys exist for key fields even if only standards were set
    Object.entries(STANDARD_TO_APP).forEach(([std, app]) => {
      if (out[std] != null && out[app] == null) out[app] = out[std]
    })

    // 6) Extra backfills for critical identifiers and address parts
    if (out.MLSNumber && !out.mlsNumber) out.mlsNumber = out.MLSNumber
    if (out.StreetLine && !out.streetLine) out.streetLine = out.StreetLine
    if (out.StreetNumber && !out.streetNumber) out.streetNumber = out.StreetNumber
    if (out.StreetName && !out.streetName) out.streetName = out.StreetName
    if (out.StreetSuffix && !out.streetSuffix) out.streetSuffix = out.StreetSuffix

    // 7) Final hardening: ensure both MLSNumber and mlsNumber mirror a non-empty string value
    const mlsFromStd = out.MLSNumber != null ? String(out.MLSNumber).trim() : ''
    const mlsFromApp = out.mlsNumber != null ? String(out.mlsNumber).trim() : ''
    const finalMLS = mlsFromApp || mlsFromStd
    if (finalMLS) {
      out.MLSNumber = finalMLS
      out.mlsNumber = finalMLS
    }

    return out
  })
}

const normaliseAdditionalFieldKey = (label: string): string =>
  label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const buildAdditionalFieldMap = (
  extracted?: ExtractedLabelValue[]
): Record<string, { label: string; value: string; section?: string }> | undefined => {
  if (!Array.isArray(extracted) || extracted.length === 0) {
    return undefined
  }

  const result: Record<string, { label: string; value: string; section?: string }> = {}

  extracted.forEach((item, index) => {
    const label = (item.label ?? `Field ${index + 1}`).toString()
    const rawValue =
      typeof item.value === 'string'
        ? item.value.trim()
        : item.value !== undefined && item.value !== null
          ? String(item.value).trim()
          : ''

    if (!rawValue) {
      return
    }

    const baseKey = normaliseAdditionalFieldKey(label) || `field_${index + 1}`
    let key = baseKey
    let suffix = 1
    while (result[key] !== undefined) {
      key = `${baseKey}_${suffix}`
      suffix += 1
    }

    result[key] = {
      label,
      value: rawValue,
      section: item.section ?? undefined
    }
  })

  return Object.keys(result).length > 0 ? result : undefined
}

const mergeAdditionalFieldMap = (
  base?: Record<string, { label: string; value: string; section?: string }>,
  incoming?: Record<string, { label: string; value: string; section?: string }>
): Record<string, { label: string; value: string; section?: string }> | undefined => {
  if (!base && !incoming) {
    return undefined
  }

  const merged = new Map<string, { label: string; value: string; section?: string }>()

  const consume = (fields?: Record<string, { label: string; value: string; section?: string }>) => {
    if (!fields) return
    Object.values(fields).forEach((field) => {
      if (!field) return
      const key = `${(field.label ?? '').toLowerCase()}:${field.value}`
      if (!merged.has(key)) {
        merged.set(key, field)
      }
    })
  }

  consume(base)
  consume(incoming)

  if (merged.size === 0) {
    return undefined
  }

  const result: Record<string, { label: string; value: string; section?: string }> = {}
  let index = 0

  merged.forEach((field) => {
    const baseKey = normaliseAdditionalFieldKey(field.label ?? `field_${index + 1}`) || `field_${index + 1}`
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

// Get required and optional fields from the fuzzy field matcher
const getRequiredFields = () => (MLS_FIELD_DEFINITIONS || [])
  .filter((f: any) => !!f?.required)
  .map((f: any) => f?.standardName ?? f?.name ?? f?.key)
  .filter(Boolean)

const getOptionalFields = () => (MLS_FIELD_DEFINITIONS || [])
  .filter((f: any) => !f?.required)
  .map((f: any) => f?.standardName ?? f?.name ?? f?.key)
  .filter(Boolean)

// Simple CSV parser without external dependencies
const normalizeFieldValueRows = (rows: any[]): any[] => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return []
  }

  const fieldKey = (obj: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(obj ?? {})) {
      if (safeLower(key) === 'field') {
        return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
      }
    }
    return ''
  }

  const valueKey = (obj: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(obj ?? {})) {
      if (safeLower(key) === 'value') {
        return value
      }
    }
    return undefined
  }

  const firstRow = rows[0] ?? {}
  const keys = Object.keys(firstRow).map((k) => safeLower(k))
  const hasFieldValueColumns = keys.includes('field') && keys.includes('value')

  if (!hasFieldValueColumns) {
    return rows
  }

  const listing: Record<string, unknown> = {}
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return
    const fieldName = fieldKey(row as Record<string, unknown>)
    if (!fieldName) return
    listing[fieldName] = valueKey(row as Record<string, unknown>)
  })

  return Object.keys(listing).length > 0 ? [listing] : rows
}

const parseCSV = (csvText: string): Record<string, any>[] => {
  const lines = csvText.trim().split('\n').filter(line => line.trim())
  if (lines.length === 0) return []

  // Check if this is a Field,Value format (vertical format)
  const firstLine = safeLower(lines?.[0])
  if (firstLine.includes('field') && firstLine.includes('value')) {
    // This is a Field,Value format - single listing
    const listing: Record<string, any> = {}
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const commaIndex = line.indexOf(',')
      if (commaIndex > 0) {
        const field = line.substring(0, commaIndex).trim().replace(/"/g, '')
        const value = line.substring(commaIndex + 1).trim().replace(/"/g, '')
        if (field && value) {
          listing[field] = value
        }
      }
    }
    
    console.log('📋 Parsed Field,Value CSV:', listing)
    return [listing] // Return array with single listing
  } else {
    // Traditional CSV format with headers and multiple rows
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    
    const rows = lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
        const obj: any = {}
        headers.forEach((header, index) => {
          obj[header] = values[index] || ''
        })
        return obj
      })

    return normalizeFieldValueRows(rows)
  }
}

interface BulkListingUploadProps {
  isOpen: boolean
  onClose: () => void
  onUploadComplete: (draftListings: DraftListing[]) => void
}

const MAX_FILES_PER_BATCH = 50
const MAX_RECORDS_PER_FILE = 1000

export default function BulkListingUpload({ isOpen, onClose, onUploadComplete }: BulkListingUploadProps) {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previewData, setPreviewData] = useState<Record<string, any[]>>({})
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [mappingReport, setMappingReport] = useState<{ mapped: number; unmapped: string[] }>({ mapped: 0, unmapped: [] })
  const [aiOverrides, setAiOverrides] = useState<Record<string, string>>({})
  const [aiMappingLoading, setAiMappingLoading] = useState(false)

  const previewFile = useCallback(async (file: File): Promise<any[] | null> => {
    if (isPdfFile(file)) {
      return [
        {
          File: file.name,
          Status: 'PDF detected – detailed preview available after processing'
        }
      ]
    }

    try {
      const data = await readFileData(file)
      if (data.length > MAX_RECORDS_PER_FILE) {
        setUploadError(`Maximum ${MAX_RECORDS_PER_FILE} listings allowed per file (${file.name})`)
        return null
      }
      return data.slice(0, 5)
    } catch (error) {
      setUploadError('Error reading file. Please check the file format.')
      return null
    }
  }, [setUploadError])

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ]

    const accepted: File[] = []

    files.forEach((file) => {
      const pdf = isPdfFile(file)
      const spreadsheet =
        validTypes.includes(file.type) || file.name.toLowerCase().endsWith('.csv')

      if (!pdf && !spreadsheet) {
        console.warn(`Skipping unsupported file: ${file.name}`)
        return
      }

      const sizeLimitMb = pdf ? MAX_PDF_SIZE_MB : 10
      if (file.size > sizeLimitMb * 1024 * 1024) {
        console.warn(`Skipping oversized file (>${sizeLimitMb}MB): ${file.name}`)
        return
      }

      accepted.push(file)
    })

    if (accepted.length === 0) {
      setUploadError('Please select valid CSV/Excel files (.csv, .xls, .xlsx) under 10MB or PDF files under 25MB.')
      return
    }

    setUploadError(null)
    setMappingReport({ mapped: 0, unmapped: [] })

    const existingNames = new Set(selectedFiles.map((file) => file.name))
    const uniqueNewFiles: File[] = []
    const duplicateNames: string[] = []

    accepted.forEach((file) => {
      if (existingNames.has(file.name)) {
        duplicateNames.push(file.name)
        return
      }
      existingNames.add(file.name)
      uniqueNewFiles.push(file)
    })

    const combined = [...selectedFiles, ...uniqueNewFiles]
    if (combined.length > MAX_FILES_PER_BATCH) {
      toast({
        title: 'File limit reached',
        description: `Maximum ${MAX_FILES_PER_BATCH} files per batch. Extra files were skipped.`,
        variant: 'destructive',
      })
    }

    const limitedSelection = combined.slice(0, MAX_FILES_PER_BATCH)
    setSelectedFiles(limitedSelection)

    const allowedNames = new Set(limitedSelection.map((file) => file.name))

    uniqueNewFiles
      .filter((file) => allowedNames.has(file.name))
      .forEach(async (file) => {
        const previewRows = await previewFile(file)
        if (previewRows) {
          setPreviewData((prev) => ({ ...prev, [file.name]: previewRows }))
        }
      })

    if (duplicateNames.length > 0) {
      const deduped = Array.from(new Set(duplicateNames))
      toast({
        title: deduped.length === 1 ? 'Duplicate file skipped' : 'Duplicate files skipped',
        description: deduped.join(', '),
        variant: 'warning',
      })
    }
  }, [previewFile, selectedFiles])

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setMappingReport({ mapped: 0, unmapped: [] })
      return
    }

    const aggregatedMappings = new Set<string>()
    const aggregatedUnmapped = new Set<string>()

    selectedFiles.forEach((file) => {
      if (isPdfFile(file)) return
      const rows = previewData[file.name]
      const firstRow = rows?.[0]
      if (!firstRow || typeof firstRow !== 'object') return

      const headers = Object.keys(firstRow)
      if (headers.length === 0) return

      const mappings = buildHeuristicMappings(headers, aiOverrides)
      mappings.forEach((mapping) => {
        if (mapping?.mlsField?.standardName) {
          aggregatedMappings.add(mapping.mlsField.standardName)
        }
      })

      const mappedInputs = new Set(mappings.map((mapping) => norm(mapping.inputField)))
      headers.forEach((header) => {
        if (!mappedInputs.has(norm(header))) {
          aggregatedUnmapped.add(header)
        }
      })
    })

    setMappingReport({
      mapped: aggregatedMappings.size,
      unmapped: Array.from(aggregatedUnmapped)
    })
  }, [aiOverrides, previewData, selectedFiles])

  const readFileData = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      if (isPdfFile(file)) {
        resolve([])
        return
      }
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const data = e.target?.result
          let jsonData: any[] = []

          if (file.name.endsWith('.csv')) {
            // Parse CSV using our simple parser
            const text = data as string
            jsonData = parseCSV(text)
          } else {
            // Parse Excel
            const workbook = XLSX.read(data, { type: 'binary' })
            const sheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[sheetName]
            jsonData = normalizeFieldValueRows(XLSX.utils.sheet_to_json(worksheet))
          }

          resolve(jsonData)
        } catch (error) {
          reject(error)
        }
      }

      reader.onerror = () => reject(new Error('File reading failed'))

      if (file.name.endsWith('.csv')) {
        reader.readAsText(file)
      } else {
        reader.readAsBinaryString(file)
      }
    })
  }

  const removeSelectedFile = (fileName: string) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((file) => file.name !== fileName)
      if (next.length === 0) {
        setMappingReport({ mapped: 0, unmapped: [] })
      }
      return next
    })
    setPreviewData((prev) => {
      if (!(fileName in prev)) return prev
      const next = { ...prev }
      delete next[fileName]
      return next
    })
  }

  const buildAiSampleValues = (sourceFields: string[]) => {
    const sampleValues: Record<string, Array<string | number>> = Object.fromEntries(
      sourceFields.map((field) => [field, []])
    )

    Object.values(previewData).forEach((rows) => {
      if (!Array.isArray(rows)) return
      rows.forEach((row) => {
        if (!row || typeof row !== 'object') return
        sourceFields.forEach((field) => {
          const samples = sampleValues[field]
          if (!samples || samples.length >= 3) return
          const value = (row as any)[field]
          if (value === undefined || value === null) return

          if (typeof value === 'string') {
            const trimmed = value.trim()
            if (!trimmed) return
            samples.push(trimmed.slice(0, 120))
            return
          }

          if (typeof value === 'number' && Number.isFinite(value)) {
            samples.push(value)
            return
          }

          const asText = String(value).trim()
          if (asText) {
            samples.push(asText.slice(0, 120))
          }
        })
      })
    })

    return sampleValues
  }

  const getAiOverridesForFields = async (sourceFields: string[]): Promise<Record<string, string>> => {
    if (sourceFields.length === 0) return {}

    const sampleValues = buildAiSampleValues(sourceFields)
    const response = await suggestHatchFieldMappings({
      sourceFields,
      sampleValues,
      availableFields: AI_FIELD_MAPPING_AVAILABLE_FIELDS
    })

    const suggestions = Array.isArray(response?.suggestions) ? response.suggestions : []
    const overrides: Record<string, string> = {}
    suggestions.forEach((suggestion) => {
      const sourceField = (suggestion?.sourceField ?? '').trim()
      const hatchField = (suggestion?.hatchField ?? '').trim()
      if (!sourceField || !hatchField) return
      overrides[norm(sourceField)] = hatchField
    })

    return overrides
  }

  const validateListingData = (
    data: any[],
    overrides: Record<string, string> = aiOverrides
  ): { validationErrors: ValidationError[], fieldMappings: FieldMapping[], unmappedHeaders: string[] } => {
    const validationErrors: ValidationError[] = []
    let fieldMappings: FieldMapping[] = []
    if (data.length === 0) return { validationErrors, fieldMappings, unmappedHeaders: [] }

    // Normalize all rows using the cell normalizer
    const processedData = processFieldValueCSVRows(data)
    if (processedData.length === 0) {
      return { validationErrors: [], fieldMappings: [], unmappedHeaders: [] }
    }

    // Get headers from the processed data
    const headers = Object.keys(processedData[0] ?? {})
    if (headers.length === 0) {
      return { validationErrors: [], fieldMappings: [], unmappedHeaders: [] }
    }
    console.log('🔍 Processing headers:', headers)
    // --- Inserted: Log normalized headers for coverage verification
    console.log('🧾 Raw headers (normalized):', headers.map(h => ({ h, n: norm(h) })))
    
    // Defensive: tolerate undefined/legacy return shapes from mapCSVHeaders
    const mappingResultRaw = typeof mapCSVHeaders === 'function' ? mapCSVHeaders(headers, 0.6) : null
    const mappingResult = (mappingResultRaw && typeof mappingResultRaw === 'object') ? mappingResultRaw : {
      mappings: [],
      unmapped: Array.isArray(headers) ? headers : [],
      // Provide objects with standardName for logging compatibility
      missingRequired: getRequiredFields().map((n) => ({ standardName: n }))
    }
    fieldMappings = Array.isArray((mappingResult as any).mappings) ? (mappingResult as any).mappings : []

    // Fallback: if nothing (or very few) fields were detected, try heuristic matching
    if (!fieldMappings || fieldMappings.length < 3) {
      const heuristic = buildHeuristicMappings(headers as string[], overrides)
      // Merge unique mappings by target standard name (avoid duplicates)
      const byStd = new Map<string, FieldMapping>()
      ;[...(fieldMappings || []), ...heuristic].forEach((m) => {
        const key = m?.mlsField?.standardName
        if (!key) return
        if (!byStd.has(key)) byStd.set(key, m)
        else {
          // keep higher confidence
          const prev = byStd.get(key)!
          if ((m.confidence ?? 0) > (prev.confidence ?? 0)) byStd.set(key, m)
        }
      })
      fieldMappings = Array.from(byStd.values())

      console.log('🧭 Heuristic mappings applied:', fieldMappings.map(m => `${m.inputField}→${m.mlsField.standardName} (${Math.round((m.confidence||0)*100)}%)`))
    }

    // ——— Merge fuzzy result with heuristic mappings and de-duplicate by INPUT HEADER ———
    const byInput = new Map<string, FieldMapping>()

    // Seed from fuzzy matcher (if present)
    if (Array.isArray((mappingResult as any).mappings)) {
      (mappingResult as any).mappings.forEach((m: FieldMapping) => {
        const k = norm(m?.inputField)
        if (k && !byInput.has(k)) byInput.set(k, m)
      })
    }

    // Add heuristic mappings when fuzzy missed a header
    (fieldMappings || []).forEach((m: FieldMapping) => {
      const k = norm(m?.inputField)
      if (k && !byInput.has(k)) byInput.set(k, m)
    })

    // Apply AI overrides as a last-pass assist (fill gaps / low-confidence mappings).
    headers.forEach((header) => {
      const key = norm(header)
      const overrideStd = overrides[key]
      if (!overrideStd) return

      const existing = byInput.get(key)
      const existingConfidence = existing?.confidence ?? 0
      if (existing && existingConfidence >= 0.8) {
        return
      }

      byInput.set(key, {
        inputField: header,
        mlsField: { standardName: overrideStd } as any,
        confidence: 0.95
      })
    })

    // Final MERGED mappings used downstream
    const mergedMappings: FieldMapping[] = Array.from(byInput.values())

    // If we have a StreetLine mapping, add synthetic mappings for derived parts
    const hasStreetLine = mergedMappings.some(m => m.mlsField?.standardName === 'StreetLine')
    if (hasStreetLine) {
      const synthetic: FieldMapping[] = [
        { inputField: '[Derived from StreetLine]', mlsField: { standardName: 'StreetNumber' } as any, confidence: 0.6 },
        { inputField: '[Derived from StreetLine]', mlsField: { standardName: 'StreetName' } as any, confidence: 0.6 },
        { inputField: '[Derived from StreetLine]', mlsField: { standardName: 'StreetSuffix' } as any, confidence: 0.6 },
      ]
      // de-duplicate on standardName
      const byStd2 = new Map<string, FieldMapping>(mergedMappings.map(m => [m.mlsField.standardName, m]))
      synthetic.forEach(s => {
        if (!byStd2.has(s.mlsField.standardName)) byStd2.set(s.mlsField.standardName, s)
      })
      fieldMappings = Array.from(byStd2.values())
    } else {
  fieldMappings = mergedMappings
    }

    // Compute UNMAPPED headers from all incoming headers (ignore synthetic placeholders)
    const mergedMappedInputs = new Set(
      fieldMappings.map(m => m.inputField).filter(Boolean).filter(k => !/^\[Derived from StreetLine\]/.test(k))
    )
    const unmappedHeaders: string[] = (headers as string[]).filter(h => !mergedMappedInputs.has(h))

    // Compute MISSING REQUIRED standards, but consider derived Street* as satisfied if StreetLine is present
    const missingRequired = (MLS_FIELD_DEFINITIONS || []).filter((def: any) => {
      const std = (def?.standardName ?? def?.name ?? def?.key)
      if (!def?.required) return false
      if (!std) return false
      if (hasStreetLine && (std === 'StreetNumber' || std === 'StreetName' || std === 'StreetSuffix')) {
        return false
      }
      return !fieldMappings.some(m => m.mlsField?.standardName === std)
    })

    // Reflect merged results back on mappingResult for any downstream consumers
    ;(mappingResult as any).mappings = mergedMappings
    ;(mappingResult as any).unmapped = unmappedHeaders
    ;(mappingResult as any).missingRequired = missingRequired

    // Developer-friendly logs
    const mappedStandards = new Set(mergedMappings.map(m => m.mlsField.standardName))
    console.log('🎯 Standards mapped (merged):', Array.from(mappedStandards))
    console.log('🔍 Field Mapping Results (merged)')
    console.log(`✅ Mapped: ${mergedMappings.length} fields`)
    console.log(`❌ Unmapped: ${unmappedHeaders.length} fields`)
    console.log(`⚠️ Missing Required: ${missingRequired.length} fields`)
    mergedMappings.forEach((mapping: any) => {
      const src = mapping?.inputField ?? '(unknown)'
      const dest = mapping?.mlsField?.standardName ?? '(unknown)'
      const conf = Math.round((mapping?.confidence ?? 0) * 100)
      console.log(`  ${src} → ${dest} (${conf}% confidence)`)
    })
    if (unmappedHeaders.length > 0) {
      console.log('❌ Unmapped fields:', unmappedHeaders)
    }
    if (missingRequired.length > 0) {
      console.log('⚠️ Missing required fields:', missingRequired.map((f: any) => f?.standardName ?? f))
    }

    processedData.forEach((row, index) => {
      // Validate using the fuzzy field matcher (defensive defaults)
      const v: any = (validateMLSData as any)
        ? (validateMLSData as any)(row, fieldMappings) ?? {}
        : {}
      const errs = Array.isArray(v.errors) ? v.errors : []
      const warns = Array.isArray(v.warnings) ? v.warnings : []

      // Convert validation results to our format
      errs.forEach((error: any) => {
        validationErrors.push({
          row: index + 1,
          field: error?.field ?? '(unknown)',
          type: 'required',
          message: error?.message ?? 'Required field missing'
        })
      })

      warns.forEach((warning: any) => {
        validationErrors.push({
          row: index + 1,
          field: warning?.field ?? '(unknown)',
          type: 'optional',
          message: warning?.message ?? 'Optional field missing or recommended'
        })
      })

      // Check photos requirement (minimum required photos) - but only if PhotoURLs field exists
      const photoMappings = fieldMappings.filter(m => m.mlsField.standardName === 'PhotoURLs')
      if (photoMappings.length > 0) {
        const photoField = photoMappings[0].inputField
        const photosCell = row[photoField]
        const photosStr = Array.isArray(photosCell) ? photosCell.join(',') : (photosCell ?? '').toString()
        const photoList = photosStr.split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_PROPERTY_PHOTOS)
        if (photoList.length < MIN_PROPERTY_PHOTOS) {
          validationErrors.push({
            row: index + 1,
            field: 'PhotoURLs',
            type: 'photos',
            message: `Minimum ${MIN_PROPERTY_PHOTOS} photos required`
          })
        }
        if (photoList.length > MAX_PROPERTY_PHOTOS) {
          validationErrors.push({
            row: index + 1,
            field: 'PhotoURLs',
            type: 'optional',
            message: `Maximum ${MAX_PROPERTY_PHOTOS} photos supported. Extra photos will be ignored.`
          })
        }
      }

      // Validate data formats
      const priceMappings = fieldMappings.filter(m => m.mlsField.standardName === 'ListPrice')
      if (priceMappings.length > 0) {
        const priceField = priceMappings[0].inputField
        if (row[priceField] && isNaN(parseFloat(row[priceField]))) {
          validationErrors.push({
            row: index + 1,
            field: 'ListPrice',
            type: 'format',
            message: 'Invalid price format'
          })
        }
      }

      // Validate MLS Number format
      const mlsMappings = fieldMappings.filter(m => m.mlsField.standardName === 'MLSNumber')
      if (mlsMappings.length > 0) {
        const mlsField = mlsMappings[0].inputField
        if (row[mlsField] && row[mlsField].toString().trim().length < 3) {
          validationErrors.push({
            row: index + 1,
            field: 'MLSNumber',
            type: 'format',
            message: 'MLS Number appears to be too short'
          })
        }
      }
    })

    return { validationErrors, fieldMappings, unmappedHeaders }
  }

  const buildPdfDataRow = (canonical: PdfCanonicalDraft): Record<string, unknown> => {
    const address = canonical.basic.address ?? {}
    const fullAddressParts: string[] = []
    if (address.street) fullAddressParts.push(address.street)
    const cityState = [address.city, address.state].filter(Boolean).join(', ')
    if (cityState) fullAddressParts.push(cityState)
    if (address.postal_code) fullAddressParts.push(address.postal_code)

    const photoUrls = Array.isArray(canonical.media?.images)
      ? canonical.media.images
          .map((image) => (typeof image?.url === 'string' ? image.url.trim() : ''))
          .filter((url) => url.length > 0)
      : []

    return {
      mls_number: canonical.source.mls_number ?? '',
      list_price: canonical.basic.list_price ?? null,
      price_currency: canonical.basic.price_currency ?? 'USD',
      property_type: canonical.basic.property_type ?? '',
      address_line: fullAddressParts.join(' · '),
      street: address.street ?? '',
      city: address.city ?? '',
      state: address.state ?? '',
      postal_code: address.postal_code ?? '',
      status: canonical.basic.listing_status ?? '',
      beds: canonical.details.beds ?? null,
      baths_total: canonical.details.baths_total ?? null,
      baths_full: canonical.details.baths_full ?? null,
      baths_half: canonical.details.baths_half ?? null,
      year_built: canonical.details.year_built ?? null,
      living_area_sqft: canonical.details.living_area_sqft ?? null,
      total_area_sqft: canonical.details.total_area_sqft ?? null,
      lot_acres: canonical.details.lot_acres ?? null,
      lot_sqft: canonical.details.lot_sqft ?? null,
      subdivision: canonical.details.subdivision ?? '',
      remarks_public: canonical.remarks.public ?? '',
      images_detected: canonical.media.detected_total ?? canonical.media.images?.length ?? 0,
      PhotoURLs: photoUrls.join(','),
      photos: photoUrls,
      cover_photo_url: photoUrls[0] ?? ''
    }
  }

  const buildPdfFieldMappings = (
    row: Record<string, unknown>,
    matches: DraftPdfUploadResponse['matches']
  ): FieldMapping[] => {
    if (!Array.isArray(matches) || matches.length === 0) {
      return Object.keys(row).map((key) => ({
        inputField: key,
        mlsField: { standardName: key },
        confidence: 1
      }))
    }

    const mapping: FieldMapping[] = matches.map((match) => ({
      inputField: match.raw?.label ?? match.canonical,
      mlsField: { standardName: match.canonical },
      confidence: Number.isFinite(match.score) ? match.score : 0.9
    }))

    const existing = new Set(mapping.map((m) => m.mlsField.standardName))
    Object.keys(row).forEach((key) => {
      if (!existing.has(key)) {
        mapping.push({
          inputField: key,
          mlsField: { standardName: key },
          confidence: 0.9
        })
      }
    })

    return mapping
  }

  const LABEL_KEY_MAP: Record<string, string[]> = {
    'status': ['status'],
    'status type': ['statusType'],
    'property class': ['property_type', 'propertyType'],
    'property type': ['property_type', 'propertyType'],
    'building design': ['property_sub_type', 'propertySubType'],
    'ownership': ['propertySubType', 'property_sub_type', 'ownership'],
    'development': ['development', 'subdivision'],
    'subdivision': ['subdivision'],
    'geo area': ['geoArea'],
    'county': ['county'],
    'bedrooms': ['bedrooms'],
    'bathrooms': ['bathrooms'],
    'full baths': ['bathroomsFull', 'bathrooms_full'],
    'half baths': ['bathroomsHalf', 'bathrooms_half'],
    'living area': ['livingAreaSqFt', 'living_area_sq_ft'],
    'total area': ['totalAreaSqFt', 'total_area_sq_ft'],
    'lot acres': ['lotSizeAcres', 'lot_acres'],
    'dom': ['dom'],
    'cdom': ['cdom'],
    'lot size': ['lotSize', 'lot_size_sq_ft'],
    'lot size sqft': ['lotSize', 'lot_size_sq_ft'],
    'lot size (sqft)': ['lotSize', 'lot_size_sq_ft'],
    'lot size (acres)': ['lotSizeAcres', 'lot_acres'],
    'lot description': ['lotDescription', 'lot_description'],
    'lot dimensions': ['lotDimensions', 'lot_dimensions'],
    'parcel id': ['parcelId', 'parcel_id'],
    'furnished': ['furnished'],
    'property id': ['propertyId'],
    'pets': ['pets'],
    'windows': ['windows'],
    'flooring': ['flooring'],
    'floor plan type': ['floorPlanType'],
    'cooling': ['cooling'],
    'heating': ['heating'],
    'kitchen': ['kitchenFeatures', 'kitchen_features'],
    'equipment': ['appliances'],
    'interior features': ['interiorFeatures', 'interior_features'],
    'exterior features': ['exteriorFeatures', 'exterior_features'],
    'master bath': ['masterBathFeatures', 'master_bath_features'],
    'additional rooms': ['additionalRooms', 'additional_rooms'],
    'private pool': ['privatePool', 'private_pool'],
    'private spa': ['privateSpa', 'private_spa'],
    'view': ['propertyView', 'property_view'],
    'amenities': ['amenities'],
    'community type': ['communityType'],
    'golf type': ['golfType'],
    'parking': ['parkingFeatures', 'parking_features'],
    '# garage spaces': ['garageSpaces', 'garage_spaces'],
    'garage': ['garageType', 'garage_type'],
    '# carport spaces': ['carportSpaces', 'carport_spaces'],
    'water': ['water', 'waterSource', 'water_source'],
    'sewer': ['sewer', 'sewerSystem', 'sewer_system'],
    'irrigation': ['irrigation'],
    'boat/dock info': ['boatDockInfo'],
    'waterfront': ['waterfront'],
    'gulf access': ['gulfAccess', 'gulf_access'],
    'canal width': ['canalWidth', 'canal_width'],
    'rear exposure': ['rearExposure'],
    'zoning': ['zoning'],
    'total tax bill': ['taxes'],
    'tax description': ['taxDescription', 'tax_description'],
    'tax year': ['taxYear', 'tax_year'],
    'hoa fee': ['hoaFee', 'hoa_fee'],
    'master hoa fee': ['masterHoaFee', 'master_hoa_fee'],
    'condo fee': ['condoFee', 'condo_fee'],
    'special assessment': ['specialAssessment', 'special_assessment'],
    'spec assessment': ['specialAssessment', 'special_assessment'],
    'other fee': ['otherFee', 'other_fee'],
    'land lease': ['landLease', 'land_lease'],
    'mandatory club fee': ['mandatoryClubFee', 'mandatory_club_fee'],
    'recreation lease fee': ['recreationLeaseFee', 'recleasefee'],
    'rec. lease fee': ['recreationLeaseFee', 'recleasefee'],
    'total annual recurring fees': ['totalAnnualRecurringFees'],
    'total one time fees': ['totalOneTimeFees'],
    'terms': ['terms'],
    'possession': ['possession'],
    'approval': ['approval'],
    'management': ['management'],
    'owner name': ['ownerName', 'owner_name'],
    'owner phone': ['ownerPhone', 'owner_phone'],
    'owner email': ['ownerEmail', 'owner_email'],
    'listing broker': ['listingBroker', 'listingOfficeName', 'listing_office_name'],
    'office name': ['officeName', 'listingOfficeName', 'listing_office_name'],
    'office phone': ['officePhone', 'listingOfficePhone', 'listing_office_phone'],
    'office address': ['officeAddress'],
    'office code': ['officeCode'],
    'agent name': ['listingAgentName', 'listing_agent_name'],
    'agent phone': ['listingAgentPhone', 'listing_agent_phone'],
    'agent email': ['listingAgentEmail', 'listing_agent_email'],
    'agent id': ['listingAgentMlsId'],
    'agent fax': ['listingAgentFax'],
    'appointment req.': ['appointmentRequired'],
    'appointment req': ['appointmentRequired'],
    'appointment phone': ['appointmentPhone'],
    'listing date': ['listingDate'],
    'contract closing date': ['contractClosingDate'],
    'expiration date': ['expirationDate'],
    'listing type': ['listingType'],
    'showing instructions': ['showingInstructions', 'showing_instructions'],
    'storm protection': ['stormProtection', 'storm_protection'],
    'auction': ['auction'],
    'foreclosed (reo)': ['foreclosed'],
    'potential short sale': ['shortSale'],
    'legal description': ['legalDescription', 'legal_description'],
    'sec/town/rng': ['sectionTownRange'],
    'target marketing': ['targetMarketing'],
    'internet sites': ['internetSites'],
    'listing on internet': ['listingOnInternet'],
    'address on internet': ['addressOnInternet'],
    'blogging': ['blogging'],
    'avm': ['avm'],
    'list price per sqft': ['listPricePerSqFt'],
    'list price/sqft': ['listPricePerSqFt'],
    'street number': ['streetNumber', 'street_number'],
    'street name': ['streetName', 'street_name'],
    'street suffix': ['streetSuffix', 'street_suffix'],
    'city': ['city'],
    'state': ['state', 'stateCode', 'state_code'],
    'zip': ['zipCode', 'zip_code'],
    'den': ['den']
  }

  const NUMERIC_KEYS = new Set([
    'listPrice',
    'listPricePerSqFt',
    'dom',
    'cdom',
    'lotSizeAcres',
    'lot_acres',
    'lotSize',
    'lot_size_sq_ft',
    'livingAreaSqFt',
    'living_area_sq_ft',
    'totalAreaSqFt',
    'total_area_sq_ft',
    'bedrooms',
    'bathrooms',
    'bathroomsFull',
    'bathrooms_full',
    'bathroomsHalf',
    'bathrooms_half',
    'garageSpaces',
    'garage_spaces',
    'carportSpaces',
    'carport_spaces',
    'taxes',
    'taxYear',
    'tax_year',
    'hoaFee',
    'hoa_fee',
    'masterHoaFee',
    'master_hoa_fee',
    'condoFee',
    'condo_fee',
    'specialAssessment',
    'special_assessment',
    'otherFee',
    'other_fee',
    'landLease',
    'land_lease',
    'mandatoryClubFee',
    'mandatory_club_fee',
    'recreationLeaseFee',
    'recleasefee',
    'totalAnnualRecurringFees',
    'totalOneTimeFees'
  ])

  const BOOLEAN_KEYS = new Set([
    'privatePool',
    'private_pool',
    'privateSpa',
    'private_spa',
    'waterfront',
    'gulfAccess',
    'gulf_access',
    'auction',
    'foreclosed',
    'shortSale',
    'listingOnInternet',
    'addressOnInternet',
    'blogging',
    'avm',
    'targetMarketing'
  ])

  const normalizeNumericValue = (value: string): number | undefined => {
    const normalized = value.replace(/,/g, '')
    const match = normalized.match(/-?\d+(?:\.\d+)?/)
    if (!match) return undefined
    const parsed = Number(match[0])
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const normalizeBooleanValue = (value: string): boolean | undefined => {
    const lower = value.trim().toLowerCase()
    if (!lower) return undefined
    if (['y', 'yes', 'true', '1', 'included'].includes(lower)) return true
    if (['n', 'no', 'false', '0', 'not allowed'].includes(lower)) return false
    return undefined
  }

  const shouldOverwrite = (current: unknown, next: unknown) => {
    if (current === undefined || current === null) return true
    if (typeof current === 'string') {
      const trimmed = current.trim()
      if (trimmed.length === 0) return true
      const lowered = trimmed.toLowerCase()
      if (
        lowered === 'draft' &&
        typeof next === 'string' &&
        next.trim().length > 0 &&
        next.trim().toLowerCase() !== 'draft'
      ) {
        return true
      }
      if (
        ['no', 'n/a', 'unknown', 'none'].includes(lowered) &&
        typeof next === 'string' &&
        next.trim().length > 0 &&
        !['no', 'n/a', 'unknown', 'none'].includes(next.trim().toLowerCase())
      ) {
        return true
      }
      if (
        trimmed === '0' &&
        typeof next === 'number' &&
        next !== 0
      ) {
        return true
      }
    }
    if (
      typeof current === 'number' &&
      current === 0 &&
      typeof next === 'number' &&
      next !== 0
    ) {
      return true
    }
    return false
  }

  const assignValueToRow = (
    row: Record<string, unknown>,
    keys: string[],
    rawValue: string | number
  ) => {
    if (!keys || keys.length === 0) return
    const base =
      typeof rawValue === 'string'
        ? rawValue.replace(/\s+/g, ' ').replace(/:+$/, '').trim()
        : rawValue !== undefined
          ? String(rawValue).trim()
          : ''
    if (!base) return

    keys.forEach((key) => {
      if (!key) return
      let normalized: unknown = base
      if (NUMERIC_KEYS.has(key)) {
        const numeric = normalizeNumericValue(base)
        if (numeric === undefined) return
        normalized = numeric
      } else if (BOOLEAN_KEYS.has(key)) {
        const bool = normalizeBooleanValue(base)
        if (bool === undefined) return
        normalized = bool
      }

      const current = (row as Record<string, unknown>)[key]
      if (shouldOverwrite(current, normalized)) {
        ;(row as Record<string, unknown>)[key] = normalized
      }
    })
  }

  const applyExtractedValuesToRow = (
    row: Record<string, unknown>,
    extracted?: ExtractedLabelValue[]
  ) => {
    if (!Array.isArray(extracted)) return

    extracted.forEach((item) => {
      const label = (item.label ?? '').trim()
      if (!label) return
      const lowerLabel = label.toLowerCase()
      const baseValue =
        typeof item.value === 'string'
          ? item.value
          : item.value !== undefined && item.value !== null
            ? String(item.value)
            : ''
      const rawValue = baseValue.replace(/:+$/, '').trim()
      if (!rawValue) return

      const keys = LABEL_KEY_MAP[lowerLabel]
      if (keys && keys.length > 0) {
        assignValueToRow(row, keys, rawValue)
      }

      if (lowerLabel === 'list price per sqft') {
        assignValueToRow(row, ['listPricePerSqFt'], rawValue)
      }
    })
  }

  const createPdfDraftListing = (
    file: File,
    response: DraftPdfUploadResponse,
    order: number
  ): DraftListing => {
    const canonical = response.draft
    const row = buildPdfDataRow(canonical)
    applyExtractedValuesToRow(row, response.extracted)
    if (typeof window !== 'undefined') {
      ;(window as unknown as Record<string, unknown>).__lastCanonicalDraft = canonical
      ;(window as unknown as Record<string, unknown>).__lastPdfRow = row
      ;(window as unknown as Record<string, unknown>).__lastExtractedFields = response.extracted ?? []
    }

    const additionalFields = buildAdditionalFieldMap(response.extracted)
    const missing = canonical.diagnostics?.missing ?? []
    const warnings = canonical.diagnostics?.warnings ?? []

    const validationErrors: ValidationError[] = []
    missing.forEach((field) => {
      validationErrors.push({
        row: 1,
        field,
        type: 'required',
        message: `Missing required field: ${field}`
      })
    })
    warnings.forEach((message) => {
      validationErrors.push({
        row: 1,
        field: 'general',
        type: 'optional',
        message
      })
    })

    const photosDetected = canonical.media?.detected_total ?? canonical.media?.images?.length ?? 0
    const completionPercentage = missing.length === 0 ? 100 : Math.max(0, 100 - missing.length * 10)

    return {
      id: `draft_pdf_${Date.now()}_${order}`,
      fileName: file.name,
      uploadDate: new Date().toISOString(),
      status: missing.length === 0 ? 'ready' : 'error',
      totalRecords: 1,
      validRecords: missing.length === 0 ? 1 : 0,
      errorRecords: missing.length === 0 ? 0 : 1,
      requiredFieldsComplete: missing.length === 0 ? 1 : 0,
      optionalFieldsComplete: 1,
      photosCount: photosDetected,
      data: [row],
      validationErrors,
      fieldMapping: buildPdfFieldMappings(row, response.matches),
      mlsCompliant: missing.length === 0,
      completionPercentage,
      mappedData: row,
      originalData: canonical,
      canonicalDraft: canonical,
      sourceType: 'pdf',
      matches: response.matches,
      extracted: response.extracted ?? [],
      additionalFields
    }
  }

  const processPdfFile = async (file: File, order: number): Promise<DraftListing> => {
    const response = await uploadDraftPdf(file, {
      vendor: PDF_VENDOR_FALLBACK,
      documentVersion: PDF_DOCUMENT_VERSION
    })
    return createPdfDraftListing(file, response, order)
  }

  const processUpload = async () => {
    if (selectedFiles.length === 0) return

    setIsProcessing(true)
    setUploadProgress(0)

    try {
      let runtimeOverrides: Record<string, string> = { ...aiOverrides }
      const aiTried = new Set(Object.keys(runtimeOverrides))
      let aiBatchesUsed = 0
      let aiErrorNotified = false

      const tryApplyAiMappings = async (fields: string[]) => {
        if (!fields || fields.length === 0) return
        if (aiBatchesUsed >= MAX_AI_FIELD_MAPPING_BATCHES) return

        const unique = Array.from(new Set(fields.map((field) => (field ?? '').trim()).filter(Boolean)))
        const candidates = unique.filter((field) => !aiTried.has(norm(field))).slice(0, 25)
        if (candidates.length === 0) return

        setAiMappingLoading(true)
        try {
          const newOverrides = await getAiOverridesForFields(candidates)
          aiBatchesUsed += 1

          candidates.forEach((field) => aiTried.add(norm(field)))

          const hasNew = Object.keys(newOverrides).length > 0
          if (hasNew) {
            runtimeOverrides = { ...runtimeOverrides, ...newOverrides }
            setAiOverrides(runtimeOverrides)
          }
        } catch (error) {
          console.error('AI field mapping failed:', error)
          candidates.forEach((field) => aiTried.add(norm(field)))
          if (!aiErrorNotified) {
            aiErrorNotified = true
            toast({
              title: 'AI mapping unavailable',
              description: 'Continuing with automatic heuristic mapping.',
              variant: 'warning'
            })
          }
        } finally {
          setAiMappingLoading(false)
        }
      }

      await tryApplyAiMappings(mappingReport.unmapped)

      const aggregateListings: DraftListing[] = []
      const aggregatedMappings = new Set<string>()
      const aggregatedUnmapped = new Set<string>()

      for (let index = 0; index < selectedFiles.length; index++) {
        const file = selectedFiles[index]

        setUploadProgress(Math.round((index / selectedFiles.length) * 80))

        if (isPdfFile(file)) {
          const pdfDraft = await processPdfFile(file, index)
          pdfDraft.fieldMapping.forEach((mapping) => {
            if (mapping?.mlsField?.standardName) {
              aggregatedMappings.add(mapping.mlsField.standardName)
            }
          })
          aggregateListings.push(pdfDraft)
          setUploadProgress(Math.round(((index + 1) / selectedFiles.length) * 80))
          continue
        }

        const data = await readFileData(file)

        if (data.length > MAX_RECORDS_PER_FILE) {
          throw new Error(`${file.name}: Maximum ${MAX_RECORDS_PER_FILE} listings per file exceeded`)
        }

        let validationResult = validateListingData(data, runtimeOverrides)
        if (validationResult.unmappedHeaders.length > 0) {
          await tryApplyAiMappings(validationResult.unmappedHeaders)
          validationResult = validateListingData(data, runtimeOverrides)
        }

        const { validationErrors, fieldMappings, unmappedHeaders } = validationResult

        fieldMappings.forEach((mapping) => {
          if (mapping?.mlsField?.standardName) {
            aggregatedMappings.add(mapping.mlsField.standardName)
          }
        })
        unmappedHeaders.forEach((header) => aggregatedUnmapped.add(header))

        const requiredErrors = validationErrors.filter(e => e.type === 'required')
        const optionalErrors = validationErrors.filter(e => e.type === 'optional')

        const validRecords = data.length - new Set(requiredErrors.map(e => e.row)).size
        const requiredFieldsComplete = data.length - new Set(requiredErrors.map(e => e.row)).size
        const optionalFieldsComplete = data.length - new Set(optionalErrors.map(e => e.row)).size

        const processedDataRaw = processFieldValueCSVRows(data)
        const processedData = toStandardizedRows(processedDataRaw, fieldMappings)

        if (processedData.length > 0) {
          console.log('🧪 First processed row snapshot:', processedData[0])
        }

        const draftListing: DraftListing = {
          id: `draft_${Date.now()}_${index}`,
          fileName: file.name,
          uploadDate: new Date().toISOString(),
          status: validRecords > 0 ? 'ready' : 'error',
          totalRecords: processedData.length,
          validRecords,
          errorRecords: processedData.length - validRecords,
          requiredFieldsComplete,
          optionalFieldsComplete,
          photosCount: processedData.reduce((sum, row) => {
            const photoMappings = fieldMappings.filter(m => m.mlsField.standardName === 'PhotoURLs')
            if (photoMappings.length > 0) {
              const photoField = photoMappings[0].inputField
              const photosCell = row[photoField]
              const photosStr = Array.isArray(photosCell) ? photosCell.join(',') : (photosCell ?? '').toString()
              const photoList = photosStr
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
                .slice(0, MAX_PROPERTY_PHOTOS)
              return sum + photoList.length
            }
            return sum
          }, 0),
          data: processedData,
          validationErrors,
          fieldMapping: fieldMappings,
          mlsCompliant: requiredErrors.length === 0,
          completionPercentage: processedData.length > 0
            ? Math.round((requiredFieldsComplete / processedData.length) * 100)
            : 0,
          sourceType: file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'excel'
        }

        aggregateListings.push(draftListing)
      }

      setMappingReport({ mapped: aggregatedMappings.size, unmapped: Array.from(aggregatedUnmapped) })

      setUploadProgress(100)
      await new Promise(resolve => setTimeout(resolve, 300))

      console.log('📤 Upload complete: processed', aggregateListings.length, 'files')

      onUploadComplete(aggregateListings)
      onClose()
      resetUpload()

    } catch (error) {
      console.error('Upload error:', error)
      setUploadError(error instanceof Error ? error.message : 'Error processing file. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const resetUpload = () => {
    setSelectedFiles([])
    setPreviewData({})
    setUploadProgress(0)
    setIsProcessing(false)
    setUploadError(null)
    setMappingReport({ mapped: 0, unmapped: [] })
    setAiOverrides({})
    setAiMappingLoading(false)
  }

  const requiredFields = getRequiredFields()
  const previewEntries = Object.entries(previewData)
  const primaryPreview = previewEntries[0]?.[1] ?? []
  const previewLabel = previewEntries[0]?.[0] ?? null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            MLS Data Upload
          </DialogTitle>
          <DialogDescription>
            Upload MLS export files with intelligent field mapping.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Field Mapping Info */}
          {/* File Upload */}
          <div className="space-y-4">
            <Label htmlFor="file-upload">Select MLS Export Files</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls,.pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <Label htmlFor="file-upload" className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>Choose Export Files</span>
                </Button>
              </Label>
              <p className="text-sm text-gray-500 mt-2">
                Supported formats: CSV, Excel (.xlsx, .xls) up to 10MB and PDF up to {MAX_PDF_SIZE_MB}MB • Max {MAX_FILES_PER_BATCH} files per batch
              </p>
            </div>
          </div>

          {/* Upload Error */}
          {uploadError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}

          {/* Mapping Report */}
          {(mappingReport.mapped > 0 || mappingReport.unmapped.length > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Field Mapping Report</CardTitle>
                <CardDescription>
                  Mapped {mappingReport.mapped} fields
                  {mappingReport.unmapped.length ? ` • ${mappingReport.unmapped.length} unmapped` : ''}
                </CardDescription>
              </CardHeader>
	              <CardContent>
	                {mappingReport.unmapped.length > 0 ? (
	                  <div className="text-sm">
	                    <div className="mb-2 text-gray-700 font-medium">Unmapped headers (add aliases for these):</div>
	                    <div className="flex flex-wrap gap-2">
	                      {mappingReport.unmapped.slice(0, 40).map((h) => (
	                        <Badge key={h} variant="secondary">{h}</Badge>
	                      ))}
	                      {mappingReport.unmapped.length > 40 && (
	                        <span className="text-xs text-gray-500">…and {mappingReport.unmapped.length - 40} more</span>
	                      )}
	                    </div>
	                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
	                      <div className="text-xs text-slate-600">
	                        {aiMappingLoading ? (
	                          <span className="inline-flex items-center">
	                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
	                            AI is mapping your columns…
	                          </span>
	                        ) : (
	                          'AI will assist mapping these columns during upload.'
	                        )}
	                      </div>
	                    </div>
	                  </div>
	                ) : (
	                  <div className="text-sm text-green-700">All headers mapped 🎉</div>
	                )}
	              </CardContent>
            </Card>
          )}

          {/* Selected Files Info */}
          {selectedFiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Selected Export Files ({selectedFiles.length})</CardTitle>
                <CardDescription>Maximum {MAX_FILES_PER_BATCH} files per batch.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.lastModified ?? 0}-${index}`}
                    className="flex items-center justify-between border rounded-md px-3 py-2"
                  >
                    <div>
                      <p className="font-medium truncate max-w-[220px]" title={file.name}>{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeSelectedFile(file.name)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={resetUpload}>
                  Clear All
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Preview Data */}
          {primaryPreview.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Data Preview</CardTitle>
                <CardDescription>
                  Preview of your MLS export data with enhanced field detection
                  {previewLabel ? ` • ${previewLabel}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {Object.keys(primaryPreview[0]).slice(0, 6).map((key) => {
                          const isRequired = requiredFields.some((field) => {
                            const f = safeLower(field)
                            const k = safeLower(key)
                            return f.includes(k) || k.includes(f)
                          })
                          return (
                            <th key={key as string} className="text-left p-2 font-medium">
                              {key as string}
                              {isRequired && (
                                <Badge variant="destructive" className="ml-1 text-xs">Required</Badge>
                              )}
                            </th>
                          )
                        })}
                        {Object.keys(primaryPreview[0]).length > 6 && (
                          <th className="text-left p-2 font-medium">...</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {primaryPreview.map((row, index) => (
                        <tr key={index} className="border-b">
                          {Object.values(row).slice(0, 6).map((value: any, i) => (
                            <td key={i} className="p-2 truncate max-w-32">
                              {value?.toString() || ''}
                            </td>
                          ))}
                          {Object.values(row).length > 6 && (
                            <td className="p-2">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Processing Progress */}
	          {isProcessing && (
	            <Card>
	              <CardContent className="pt-6">
	                <div className="space-y-4">
	                  <div className="flex items-center justify-between">
	                    <span className="text-sm font-medium">Uploading with AI-assisted field mapping...</span>
	                    <span className="text-sm text-gray-500">{uploadProgress}%</span>
	                  </div>
	                  <Progress value={uploadProgress} className="w-full" />
	                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
	          <Button 
	            onClick={processUpload} 
	            disabled={selectedFiles.length === 0 || isProcessing}
	          >
	            {isProcessing ? 'Uploading...' : 'Upload'}
	          </Button>
	        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
