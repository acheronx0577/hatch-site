import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase configuration')
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })

const parseJsonBody = async (req: Request) => {
  try {
    return await req.json()
  } catch (error) {
    console.warn('Failed to parse JSON body', error)
    throw new Error('invalid_json')
  }
}

const pick = (
  input: Record<string, unknown>,
  map: Record<string, string>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      result[column] = input[key]
    }
  }
  return result
}

const PROPERTY_FIELD_MAP: Record<string, string> = {
  mlsNumber: 'mls_number',
  addressLine: 'address_line',
  streetNumber: 'street_number',
  streetName: 'street_name',
  streetSuffix: 'street_suffix',
  city: 'city',
  stateCode: 'state_code',
  zipCode: 'zip_code',
  county: 'county',
  latitude: 'latitude',
  longitude: 'longitude',
  bedroomsTotal: 'bedrooms_total',
  bathroomsTotal: 'bathrooms_total',
  bathroomsFull: 'bathrooms_full',
  bathroomsHalf: 'bathrooms_half',
  livingAreaSqFt: 'living_area_sq_ft',
  lotSizeSqFt: 'lot_size_sq_ft',
  lotSizeAcres: 'lot_size_acres',
  yearBuilt: 'year_built',
  listPrice: 'list_price',
  originalListPrice: 'original_list_price',
  publicRemarks: 'public_remarks',
  privateRemarks: 'private_remarks',
  showingInstructions: 'showing_instructions',
  architecturalStyle: 'architectural_style',
  propertyType: 'property_type',
  propertySubType: 'property_sub_type',
  parcelId: 'parcel_id',
  garageSpaces: 'garage_spaces',
  garageType: 'garage_type',
  constructionMaterials: 'construction_materials',
  foundationDetails: 'foundation_details',
  exteriorFeatures: 'exterior_features',
  interiorFeatures: 'interior_features',
  poolFeatures: 'pool_features',
  cooling: 'cooling',
  heating: 'heating',
  parkingFeatures: 'parking_features',
  appliances: 'appliances',
  laundryFeatures: 'laundry_features',
  flooring: 'flooring',
  fireplaceFeatures: 'fireplace_features',
  kitchenFeatures: 'kitchen_features',
  primarySuite: 'primary_suite',
  roofType: 'roof_type',
  propertyView: 'property_view',
  waterSource: 'water_source',
  sewerSystem: 'sewer_system',
  taxes: 'taxes',
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
  taxDescription: 'tax_description',
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
  officeCode: 'office_code',
  officeName: 'office_name',
  officePhone: 'office_phone',
  officeAddress: 'office_address',
  agentId: 'agent_id',
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
  subdivision: 'subdivision',
  slug: 'slug',
  coverPhotoUrl: 'cover_photo_url',
  validationSummary: 'validation_summary',
  ownerName: 'owner_name',
  ownerEmail: 'owner_email',
  ownerPhone: 'owner_phone',
  additionalFields: 'additional_fields',
  sourceExtractedFields: 'source_extracted',
  sourceMatches: 'source_matches',
  listingAgentName: 'listing_agent_name',
  listingAgentLicense: 'listing_agent_license',
  listingAgentPhone: 'listing_agent_phone',
  listingAgentEmail: 'listing_agent_email',
  listingOfficeName: 'listing_office_name',
  listingOfficePhone: 'listing_office_phone',
  listingOfficeEmail: 'listing_office_email',
  listingOfficeLicense: 'listing_office_license',
  listingAgentMlsId: 'listing_agent_mls_id',
  listingAgentFax: 'listing_agent_fax',
  status: 'status',
  isTest: 'is_test',
  state: 'state',
  publishedAt: 'published_at',
  closedAt: 'closed_at',
}

const sanitizePhotos = (value: unknown): string[] | undefined => {
  if (!value) return undefined
  if (Array.isArray(value)) {
    return value
      .map((url) => (typeof url === 'string' ? url.trim() : ''))
      .filter((url) => /^https?:\/\//i.test(url) && !/https?:\/\/localhost/i.test(url))
      .slice(0, 50)
  }
  if (typeof value === 'string') {
    return value
      .split(/[;,\n]/)
      .map((url) => url.trim())
      .filter((url) => /^https?:\/\//i.test(url) && !/https?:\/\/localhost/i.test(url))
      .slice(0, 50)
  }
  return undefined
}

const detectTestFlag = (source?: string | null, fileName?: string | null) => {
  const haystack = `${source ?? ''} ${fileName ?? ''}`.toLowerCase()
  return /(fake|sample|test)/.test(haystack)
}

const normalizeStatus = (value: unknown): 'draft' | 'active' | 'pending' | 'sold' | 'withdrawn' | 'expired' => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  switch (normalized) {
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
      return 'draft'
  }
}

const deriveWorkflowState = (
  status: 'draft' | 'active' | 'pending' | 'sold' | 'withdrawn' | 'expired'
): 'PROPERTY_PENDING' | 'LIVE' | 'SOLD' => {
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

const isUuid = (value?: string | null): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const FALLBACK_DEMO_USER_ID = Deno.env.get('DEMO_USER_ID') ?? 'demo_broker_1'
const FALLBACK_DEMO_ORG_ID =
  Deno.env.get('DEMO_ORG_ID') ?? Deno.env.get('DEMO_FIRM_ID') ?? '550e8400-e29b-41d4-a716-446655440001'

const getUserContext = async (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()

  const fallbackOrgId = req.headers.get('x-demo-org') ?? FALLBACK_DEMO_ORG_ID
  const fallbackUserId = req.headers.get('x-demo-user') ?? FALLBACK_DEMO_USER_ID

  if (authError || !user) {
    return { user: { id: fallbackUserId }, orgIds: [fallbackOrgId], isDemo: true as const }
  }

  const { data: memberships, error: membershipError } = await authClient
    .from('org_members')
    .select('org_id')
    .eq('status', 'active')

  if (membershipError) {
    console.error('Failed to load org memberships', membershipError)
    return { user: { id: fallbackUserId }, orgIds: [fallbackOrgId], isDemo: true as const }
  }

  const orgIds = (memberships ?? [])
    .map((row) => row.org_id)
    .filter((id): id is string => Boolean(id))

  if (orgIds.length === 0) {
    return { user: { id: fallbackUserId }, orgIds: [fallbackOrgId], isDemo: true as const }
  }

  return { user, orgIds }
}

const loadPropertyForOrg = async (
  serviceClient: SupabaseClient,
  orgIds: string[],
  propertyId: string
) => {
  const { data, error } = await serviceClient
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .in('org_id', orgIds)
    .maybeSingle()

  if (error) {
    console.error('Failed to fetch property', error)
    throw new Error('property_fetch_failed')
  }

  return data
}

const ensureOrgId = (bodyOrgId: string | null | undefined, orgIds: string[]) => {
  if (bodyOrgId) {
    if (!orgIds.includes(bodyOrgId)) {
      throw new Error('org_not_permitted')
    }
    return bodyOrgId
  }

  if (orgIds.length === 1) {
    return orgIds[0]
  }

  throw new Error('org_required')
}

const buildValidationSummary = (property: Record<string, any>) => {
  const photos = Array.isArray(property.photos) ? property.photos : []
  return {
    lastCheckedAt: new Date().toISOString(),
    photos: {
      count: photos.length,
      hasCover: Boolean(property.cover_photo_url),
    },
    location: {
      hasLatitude: property.latitude != null,
      hasLongitude: property.longitude != null,
      hasAddress: Boolean(
        property.street_number &&
          property.street_name &&
          property.city &&
          property.state_code &&
          property.zip_code
      ),
    },
    specs: {
      price: property.list_price,
      bedrooms: property.bedrooms_total,
      bathrooms: property.bathrooms_total ?? property.bathrooms_full,
      livingArea: property.living_area_sq_ft,
    },
  }
}

const validatePublishReadiness = (property: Record<string, any>) => {
  const reasons: Record<string, string> = {}
  const photos = Array.isArray(property.photos) ? property.photos : []

  if (photos.length < 5) {
    reasons.photos = 'min_5'
  }

  const hasAddress = Boolean(
    property.street_number &&
      property.street_name &&
      property.city &&
      property.state_code &&
      property.zip_code
  )
  const hasGeo = property.latitude != null && property.longitude != null

  if (!hasAddress || !hasGeo) {
    reasons.geo = 'missing'
  }

  if (!property.list_price || Number(property.list_price) <= 0) {
    reasons.price = 'invalid'
  }

  if (!property.bedrooms_total || Number(property.bedrooms_total) <= 0) {
    reasons.bedrooms = 'invalid'
  }

  const bathValue = property.bathrooms_total ?? property.bathrooms_full
  if (!bathValue || Number(bathValue) <= 0) {
    reasons.bathrooms = 'invalid'
  }

  if (!property.living_area_sq_ft || Number(property.living_area_sq_ft) <= 0) {
    reasons.livingArea = 'invalid'
  }

  const summary = buildValidationSummary(property)

  return { reasons, summary }
}

const upsertProperty = async (
  serviceClient: SupabaseClient,
  payload: Record<string, unknown>,
  propertyId?: string
) => {
  if (propertyId) {
    const { data, error } = await serviceClient
      .from('properties')
      .update(payload)
      .eq('id', propertyId)
      .select('*')
      .single()

    if (error) {
      console.error('Failed to update property', error)
      throw new Error('property_update_failed')
    }

    return data
  }

  const { data, error } = await serviceClient
    .from('properties')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    console.error('Failed to insert property', error)
    const message = typeof error.message === 'string' ? error.message : JSON.stringify(error)
    throw new Error(`property_insert_failed: ${message}`)
  }

  return data
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const context = await getUserContext(req)
  if ('error' in context) {
    return jsonResponse({ error: context.error }, context.error === 'forbidden' ? 403 : 401)
  }

  const { user, orgIds } = context

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey)

  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/properties/, '')
  const segments = path.split('/').filter(Boolean)

  try {
    if (segments.length === 0 && req.method === 'GET') {
      const stateFilter = url.searchParams.get('state')
      const searchTerm = url.searchParams.get('q')?.trim()

      let builder = serviceClient
        .from('vw_broker_properties')
        .select('*')
        .in('org_id', orgIds)
        .order('updated_at', { ascending: false })
        .limit(200)

      if (stateFilter) {
        builder = builder.eq('state', stateFilter)
      }

      if (searchTerm) {
        const term = searchTerm.replace(/[%_]/g, (match) => `\\${match}`)
        builder = builder.or(
          [
            `mls_number.ilike.%${term}%`,
            `street_name.ilike.%${term}%`,
            `city.ilike.%${term}%`,
            `zip_code.ilike.%${term}%`,
            `public_remarks.ilike.%${term}%`,
          ].join(',')
        )
      }

      const { data, error } = await builder

      if (error) {
        console.error('Failed to list properties', error)
        return jsonResponse({ error: 'failed_to_fetch', details: error }, 500)
      }

      return jsonResponse({ data })
    }

    if (segments.length === 1 && segments[0] === 'promote' && req.method === 'POST') {
      const body = await parseJsonBody(req)
        const draftId = typeof body.draftId === 'string' ? body.draftId : undefined
        const orgCandidate =
          typeof body.orgId === 'string' && body.orgId.trim().length > 0
            ? body.orgId.trim()
            : null
        const firmCandidate =
          typeof body.firmId === 'string' && body.firmId.trim().length > 0
            ? body.firmId.trim()
            : null
        const orgId = ensureOrgId(orgCandidate ?? firmCandidate, orgIds)
        const firmId = firmCandidate ?? orgId
        const agentId = typeof body.agentId === 'string' && isUuid(body.agentId)
          ? body.agentId
          : (isUuid(user.id) ? user.id : null)
        const source = (body.source as string) ?? 'bulk_upload'
        const fileName = typeof body.fileName === 'string' ? body.fileName : null
        const propertyInput = (body.property ?? {}) as Record<string, unknown>

        const mapped = pick(propertyInput, PROPERTY_FIELD_MAP)
        let sanitizedPhotos: string[] | undefined
        if (Array.isArray(propertyInput.photos)) {
          sanitizedPhotos = sanitizePhotos(propertyInput.photos)
        } else if (propertyInput.photos) {
          sanitizedPhotos = sanitizePhotos([propertyInput.photos as string])
        }

        mapped.org_id = orgId
        mapped.firm_id = firmId
        mapped.agent_id = agentId
        mapped.draft_id = draftId ?? null
        mapped.source = source
        mapped.file_name = fileName
        const rawStatus = typeof propertyInput.status === 'string' ? propertyInput.status : mapped.status
        const normalizedStatus = normalizeStatus(rawStatus)
        mapped.status = normalizedStatus
        mapped.state = deriveWorkflowState(normalizedStatus)
        mapped.is_test = Boolean(
          propertyInput.isTest || detectTestFlag(source, fileName)
        )
        mapped.validation_summary =
          body.validationSummary ?? buildValidationSummary(mapped)

        const numericFields = [
          'list_price_per_sqft',
          'dom',
          'cdom',
          'lot_size_sq_ft',
          'lot_size_acres',
          'taxes',
          'master_hoa_fee',
          'condo_fee',
          'special_assessment',
          'other_fee',
          'land_lease',
          'mandatory_club_fee',
          'recreation_lease_fee',
          'total_annual_recurring_fees',
          'total_one_time_fees'
        ] as const

        for (const field of numericFields) {
          const value = mapped[field]
          if (value === undefined || value === null || value === '') {
            mapped[field] = value === '' ? null : value
            continue
          }
          const num = typeof value === 'number' ? value : Number(value)
          mapped[field] = Number.isFinite(num) ? num : null
        }

        const stringFields = [
          'status_type',
          'geo_area',
          'development',
          'property_id',
          'community_type',
          'golf_type',
          'gulf_access',
          'canal_width',
          'rear_exposure',
          'lot_description',
          'lot_dimensions',
          'water',
          'sewer',
          'irrigation',
          'boat_dock_info',
          'tax_description',
          'terms',
          'possession',
          'approval',
          'management',
          'office_code',
          'office_name',
          'office_phone',
          'office_address',
          'listing_agent_mls_id',
          'listing_agent_fax',
          'appointment_required',
          'appointment_phone',
          'target_marketing',
          'internet_sites',
          'listing_on_internet',
          'address_on_internet',
          'blogging',
          'avm',
          'listing_broker',
          'legal_description',
          'section_town_range'
        ] as const

        for (const field of stringFields) {
          const value = mapped[field]
          if (typeof value === 'string') {
            const trimmed = value.trim()
            mapped[field] = trimmed.length > 0 ? trimmed : null
          }
        }

        if (mapped.additional_fields && typeof mapped.additional_fields !== 'object') {
          mapped.additional_fields = null
        }

        if (mapped.source_extracted && typeof mapped.source_extracted !== 'object') {
          mapped.source_extracted = null
        }

        if (mapped.source_matches && typeof mapped.source_matches !== 'object') {
          mapped.source_matches = null
        }
        if (mapped.state === 'LIVE' && !mapped.published_at) {
          const publishedAt =
            typeof propertyInput.publishedAt === 'string' ? propertyInput.publishedAt : null
          mapped.published_at = publishedAt ?? new Date().toISOString()
        }
        if (mapped.state === 'SOLD' && !mapped.closed_at) {
          const closedAt = typeof propertyInput.closedAt === 'string' ? propertyInput.closedAt : null
          mapped.closed_at = closedAt ?? new Date().toISOString()
        }

        let targetId: string | undefined
        if (draftId) {
          const existingByDraft = await serviceClient
            .from('properties')
            .select('id')
            .eq('draft_id', draftId)
            .maybeSingle()
          if (existingByDraft.data?.id) {
            targetId = existingByDraft.data.id
          } else if (existingByDraft.error && existingByDraft.error.code !== 'PGRST116') {
            console.error('Failed draft lookup', existingByDraft.error)
          }
        }

        if (!targetId && mapped.mls_number) {
          const existingByMls = await serviceClient
            .from('properties')
            .select('id')
            .eq('org_id', orgId)
            .ilike('mls_number', mapped.mls_number as string)
            .maybeSingle()
          if (existingByMls.data?.id) {
            targetId = existingByMls.data.id
          } else if (existingByMls.error && existingByMls.error.code !== 'PGRST116') {
            console.error('Failed MLS lookup', existingByMls.error)
          }
        }

        if (sanitizedPhotos && sanitizedPhotos.length > 0) {
          mapped.photos = sanitizedPhotos
        } else if (!targetId) {
          mapped.photos = []
        } else {
          delete mapped.photos
        }

        if (propertyInput.coverPhotoUrl && typeof propertyInput.coverPhotoUrl === 'string') {
          mapped.cover_photo_url = propertyInput.coverPhotoUrl
        }

        const record = await upsertProperty(serviceClient, mapped, targetId)
      return jsonResponse({ data: record }, targetId ? 200 : 201)
    }

    if (segments.length === 1) {
      const propertyId = decodeURIComponent(segments[0])

      if (req.method === 'PATCH') {
        const body = await parseJsonBody(req)
        const mapped = pick(body, PROPERTY_FIELD_MAP)
        if (body.photos !== undefined) {
          const sanitized = sanitizePhotos(body.photos)
          mapped.photos = sanitized ?? []
        }
        if (body.coverPhotoUrl) {
          mapped.cover_photo_url = body.coverPhotoUrl
        }

        if (Object.keys(mapped).length === 0) {
          return jsonResponse({ error: 'no_updates' }, 400)
        }

        const property = await loadPropertyForOrg(serviceClient, orgIds, propertyId)
        if (!property) {
          return jsonResponse({ error: 'not_found' }, 404)
        }

        mapped.validation_summary = buildValidationSummary({ ...property, ...mapped })

        const updated = await upsertProperty(serviceClient, mapped, propertyId)
        return jsonResponse({ data: updated })
      }

      if (req.method === 'GET') {
        const property = await loadPropertyForOrg(serviceClient, orgIds, propertyId)
        if (!property) {
          return jsonResponse({ error: 'not_found' }, 404)
        }
        return jsonResponse({ data: property })
      }

      if (req.method === 'DELETE') {
        const property = await loadPropertyForOrg(serviceClient, orgIds, propertyId)
        if (!property) {
          return jsonResponse({ error: 'not_found' }, 404)
        }

        const { error: deleteError } = await serviceClient
          .from('properties')
          .delete()
          .eq('id', propertyId)

        if (deleteError) {
          console.error('Failed to delete property', deleteError)
          return jsonResponse({ error: 'delete_failed' }, 500)
        }

        return jsonResponse({ data: { id: propertyId } })
      }

      if (req.method === 'POST') {
        return jsonResponse({ error: 'unsupported_action' }, 400)
      }
    }

    if (segments.length === 2 && req.method === 'POST') {
      const propertyId = decodeURIComponent(segments[0])
      const action = segments[1]

      const property = await loadPropertyForOrg(serviceClient, orgIds, propertyId)
      if (!property) {
        return jsonResponse({ error: 'not_found' }, 404)
      }

      if (action === 'reopen') {
        if (property.state !== 'SOLD') {
          return jsonResponse({ error: 'invalid_state' }, 409)
        }

        let body: any = {}
        try {
          body = await parseJsonBody(req)
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'invalid_json') {
            throw error
          }
        }

        const targetStatusRaw = (body?.status ?? '').toString().toLowerCase()
        const normalizedStatus = ['active', 'pending', 'withdrawn'].includes(targetStatusRaw)
          ? (targetStatusRaw as 'active' | 'pending' | 'withdrawn')
          : 'withdrawn'

        const targetState = normalizedStatus === 'withdrawn' ? 'PROPERTY_PENDING' : 'LIVE'
        const payload: Record<string, unknown> = {
          state: targetState,
          status: normalizedStatus,
          closed_at: null,
          published_at:
            targetState === 'LIVE'
              ? property.published_at ?? new Date().toISOString()
              : null,
        }

        payload.validation_summary = buildValidationSummary({
          ...property,
          ...payload,
        })

        const updated = await upsertProperty(serviceClient, payload, propertyId)
        return jsonResponse({ data: updated })
      }

      if (action === 'publish') {
        const shouldFlagTest = detectTestFlag(property.source, property.file_name)
        const forcedTest = shouldFlagTest ? true : property.is_test
        const propertyForValidation = {
          ...property,
          is_test: forcedTest,
        }

        const { reasons, summary } = validatePublishReadiness(propertyForValidation)

        if (forcedTest) {
          reasons.is_test = 'flagged'
        }

        if (Object.keys(reasons).length > 0) {
          const { error: updateError } = await serviceClient
            .from('properties')
            .update({
              is_test: forcedTest,
              validation_summary: { ...summary, reasons },
            })
            .eq('id', property.id)

          if (updateError) {
            console.error('Failed to persist validation summary', updateError)
          }

          const { error: eventError } = await serviceClient.from('property_events').insert({
            property_id: property.id,
            org_id: property.org_id,
            draft_id: property.draft_id,
            event_type: 'publish.blocked',
            reasons,
            payload: {
              attemptedBy: user.id,
              attemptedAt: new Date().toISOString(),
            },
          })

          if (eventError) {
            console.error('Failed to log publish.blocked event', eventError)
          }

          return jsonResponse({ error: 'validation_failed', reasons }, 422)
        }

        const payload: Record<string, unknown> = {
          state: 'LIVE',
          status: property.status === 'pending' ? 'pending' : 'active',
          is_test: false,
          published_at: new Date().toISOString(),
          validation_summary: summary,
        }

        if (!property.cover_photo_url && Array.isArray(property.photos) && property.photos.length > 0) {
          payload.cover_photo_url = property.photos[0]
        }

        const updated = await upsertProperty(serviceClient, payload, propertyId)
        return jsonResponse({ data: updated })
      }

      if (action === 'unpublish') {
        if (property.state !== 'LIVE') {
          return jsonResponse({ error: 'invalid_state' }, 409)
        }

        const payload = {
          state: 'PROPERTY_PENDING',
          status: 'pending',
          validation_summary: buildValidationSummary(property),
        }

        const updated = await upsertProperty(serviceClient, payload, propertyId)
        return jsonResponse({ data: updated })
      }

      if (action === 'close') {
        if (property.state === 'SOLD') {
          return jsonResponse({ error: 'already_closed' }, 409)
        }

        const payload = {
          state: 'SOLD',
          status: 'sold',
          closed_at: new Date().toISOString(),
          validation_summary: buildValidationSummary(property),
        }

        const updated = await upsertProperty(serviceClient, payload, propertyId)
        return jsonResponse({ data: updated })
      }
    }

    return jsonResponse({ error: 'not_found' }, 404)
  } catch (error) {
    console.error('Unexpected broker properties error', error)
    const status = error instanceof Error
      ? error.message === 'org_required'
        ? 400
        : error.message === 'org_not_permitted'
          ? 403
          : error.message === 'invalid_json'
            ? 400
            : 500
      : 500
    return jsonResponse({ error: error instanceof Error ? error.message : 'unexpected_error' }, status)
  }
})
