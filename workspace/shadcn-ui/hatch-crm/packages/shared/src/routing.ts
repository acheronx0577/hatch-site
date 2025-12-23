import { z } from 'zod';

export const leadRoutingModeSchema = z.enum(['FIRST_MATCH', 'SCORE_AND_ASSIGN']);
export type LeadRoutingMode = z.infer<typeof leadRoutingModeSchema>;

export const routingMatchModeSchema = z.enum(['ANY', 'ALL']);
export type RoutingMatchMode = z.infer<typeof routingMatchModeSchema>;

export const routingStringSetFilterSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  match: routingMatchModeSchema.optional()
});
export type RoutingStringSetFilter = z.infer<typeof routingStringSetFilterSchema>;

export const leadRoutingConsentStateSchema = z.enum(['GRANTED', 'REVOKED', 'UNKNOWN']);
export type LeadRoutingConsentState = z.infer<typeof leadRoutingConsentStateSchema>;

export const leadRoutingConsentRequirementSchema = z.enum(['OPTIONAL', 'GRANTED', 'NOT_REVOKED']);
export type LeadRoutingConsentRequirement = z.infer<typeof leadRoutingConsentRequirementSchema>;

export const leadRoutingBuyerRepRequirementSchema = z.enum(['ANY', 'REQUIRED_ACTIVE', 'PROHIBIT_ACTIVE']);
export type LeadRoutingBuyerRepRequirement = z.infer<typeof leadRoutingBuyerRepRequirementSchema>;

const timeExpression = /^\d{2}:\d{2}$/;

export const leadRoutingDaysOfWeekSchema = z.array(z.number().int().min(0).max(6)).min(1);

export const leadRoutingTimeWindowSchema = z.object({
  timezone: z.string(),
  start: z
    .string()
    .regex(timeExpression, 'start must be formatted HH:MM'),
  end: z
    .string()
    .regex(timeExpression, 'end must be formatted HH:MM'),
  days: leadRoutingDaysOfWeekSchema.optional()
});
export type LeadRoutingTimeWindow = z.infer<typeof leadRoutingTimeWindowSchema>;

export const leadRoutingGeographySchema = z
  .object({
    includeStates: z.array(z.string()).optional(),
    includeCities: z.array(z.string()).optional(),
    includePostalCodes: z.array(z.string()).optional(),
    excludeStates: z.array(z.string()).optional(),
    excludeCities: z.array(z.string()).optional(),
    excludePostalCodes: z.array(z.string()).optional()
  })
  .optional();
export type LeadRoutingGeographyCondition = z.infer<typeof leadRoutingGeographySchema>;

export const leadRoutingPriceBandSchema = z
  .object({
    min: z.number().nonnegative().optional(),
    max: z.number().positive().optional(),
    currency: z.string().optional()
  })
  .optional();
export type LeadRoutingPriceBandCondition = z.infer<typeof leadRoutingPriceBandSchema>;

export const leadRoutingSourceSchema = z
  .object({
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional()
  })
  .optional();
export type LeadRoutingSourceCondition = z.infer<typeof leadRoutingSourceSchema>;

export const leadRoutingConsentConditionSchema = z
  .object({
    sms: leadRoutingConsentRequirementSchema.optional(),
    email: leadRoutingConsentRequirementSchema.optional()
  })
  .optional();
export type LeadRoutingConsentCondition = z.infer<typeof leadRoutingConsentConditionSchema>;

export const leadRoutingDemographicsSchema = z
  .object({
    minAge: z.number().int().min(0).optional(),
    maxAge: z.number().int().min(0).optional(),
    tags: routingStringSetFilterSchema.optional(),
    languages: routingStringSetFilterSchema.optional(),
    ethnicities: routingStringSetFilterSchema.optional()
  })
  .optional();
export type LeadRoutingDemographicsCondition = z.infer<typeof leadRoutingDemographicsSchema>;

export const leadRoutingCustomFieldOperatorSchema = z.enum([
  'EQUALS',
  'NOT_EQUALS',
  'IN',
  'NOT_IN',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'CONTAINS',
  'NOT_CONTAINS',
  'EXISTS',
  'NOT_EXISTS'
]);
export type LeadRoutingCustomFieldOperator = z.infer<typeof leadRoutingCustomFieldOperatorSchema>;

export const leadRoutingCustomFieldConditionSchema = z.object({
  key: z.string().min(1),
  operator: leadRoutingCustomFieldOperatorSchema,
  value: z.any().optional()
});
export type LeadRoutingCustomFieldCondition = z.infer<typeof leadRoutingCustomFieldConditionSchema>;

export const leadRoutingConditionsSchema = z.object({
  geography: leadRoutingGeographySchema,
  priceBand: leadRoutingPriceBandSchema,
  sources: leadRoutingSourceSchema,
  consent: leadRoutingConsentConditionSchema,
  buyerRep: leadRoutingBuyerRepRequirementSchema.optional(),
  timeWindows: z.array(leadRoutingTimeWindowSchema).optional(),
  demographics: leadRoutingDemographicsSchema,
  customFields: z.array(leadRoutingCustomFieldConditionSchema).optional()
});
export type LeadRoutingConditions = z.infer<typeof leadRoutingConditionsSchema>;

export const leadRoutingAgentFilterSchema = z.object({
  tags: routingStringSetFilterSchema.optional(),
  languages: routingStringSetFilterSchema.optional(),
  specialties: routingStringSetFilterSchema.optional(),
  minKeptApptRate: z.number().min(0).max(1).optional(),
  minCapacityRemaining: z.number().int().min(0).optional()
});
export type LeadRoutingAgentFilter = z.infer<typeof leadRoutingAgentFilterSchema>;

export const leadRoutingTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('AGENT'),
    id: z.string(),
    label: z.string().optional(),
    agentFilter: leadRoutingAgentFilterSchema.optional()
  }),
  z.object({
    type: z.literal('TEAM'),
    id: z.string(),
    strategy: z.enum(['BEST_FIT', 'ROUND_ROBIN']).default('BEST_FIT'),
    includeRoles: z.array(z.string()).optional(),
    agentFilter: leadRoutingAgentFilterSchema.optional()
  }),
  z.object({
    type: z.literal('POND'),
    id: z.string(),
    label: z.string().optional()
  })
]);
export type LeadRoutingTarget = z.infer<typeof leadRoutingTargetSchema>;

export const leadRoutingFallbackSchema = z
  .object({
    teamId: z.string(),
    label: z.string().optional(),
    escalationChannels: z.array(z.enum(['EMAIL', 'SMS', 'IN_APP'])).optional(),
    relaxAgentFilters: z.boolean().optional()
  })
  .optional();
export type LeadRoutingFallback = z.infer<typeof leadRoutingFallbackSchema>;

export const leadRoutingRuleConfigSchema = z.object({
  conditions: leadRoutingConditionsSchema.default({}),
  targets: z.array(leadRoutingTargetSchema).min(1),
  fallback: leadRoutingFallbackSchema
});
export type LeadRoutingRuleConfig = z.infer<typeof leadRoutingRuleConfigSchema>;

export interface LeadRoutingPersonContext {
  source?: string | null;
  buyerRepStatus?: string | null;
  tags?: string[] | null;
  age?: number | null;
  languages?: string[] | null;
  ethnicities?: string[] | null;
  customFields?: Record<string, unknown> | null;
  consent: {
    sms: LeadRoutingConsentState;
    email: LeadRoutingConsentState;
  };
}

export interface LeadRoutingListingContext {
  price?: number | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

export interface LeadRoutingContext {
  now: Date;
  tenantTimezone: string;
  person: LeadRoutingPersonContext;
  listing?: LeadRoutingListingContext;
}

export interface LeadRoutingConditionCheck {
  key: keyof LeadRoutingConditions;
  passed: boolean;
  detail?: string;
}

export interface LeadRoutingEvaluationResult {
  matched: boolean;
  checks: LeadRoutingConditionCheck[];
}

const parseTimeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map((value) => Number.parseInt(value, 10));
  return hours * 60 + minutes;
};

const resolveTimeParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    timeZone
  });
  const parts = formatter.formatToParts(date);
  const hour = Number.parseInt(parts.find((part) => part.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(parts.find((part) => part.type === 'minute')?.value ?? '0', 10);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const abbreviations = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const index = abbreviations.findIndex((value) => weekday.startsWith(value));
  return { minutes: hour * 60 + minute, dayIndex: index === -1 ? 0 : index };
};

const matchGeography = (
  condition: NonNullable<LeadRoutingConditions['geography']>,
  listing?: LeadRoutingListingContext
) => {
  if (!listing) {
    return {
      passed: false,
      detail: 'No listing context available for geography matching'
    };
  }

  const city = listing.city?.toLowerCase();
  const state = listing.state?.toLowerCase();
  const postalCode = listing.postalCode?.toLowerCase();

  const includesState = condition.includeStates?.map((value) => value.toLowerCase());
  const excludesState = condition.excludeStates?.map((value) => value.toLowerCase());
  if (includesState && includesState.length > 0 && (!state || !includesState.includes(state))) {
    return {
      passed: false,
      detail: `State ${state ?? 'unknown'} not in allowed list`
    };
  }
  if (excludesState && state && excludesState.includes(state)) {
    return {
      passed: false,
      detail: `State ${state} explicitly excluded`
    };
  }

  const includesCity = condition.includeCities?.map((value) => value.toLowerCase());
  const excludesCity = condition.excludeCities?.map((value) => value.toLowerCase());
  if (includesCity && includesCity.length > 0 && (!city || !includesCity.includes(city))) {
    return {
      passed: false,
      detail: `City ${city ?? 'unknown'} not in allowed list`
    };
  }
  if (excludesCity && city && excludesCity.includes(city)) {
    return {
      passed: false,
      detail: `City ${city} explicitly excluded`
    };
  }

  const includesPostal = condition.includePostalCodes?.map((value) => value.toLowerCase());
  const excludesPostal = condition.excludePostalCodes?.map((value) => value.toLowerCase());
  if (includesPostal && includesPostal.length > 0 && (!postalCode || !includesPostal.includes(postalCode))) {
    return {
      passed: false,
      detail: `Postal code ${postalCode ?? 'unknown'} not in allowed list`
    };
  }
  if (excludesPostal && postalCode && excludesPostal.includes(postalCode)) {
    return {
      passed: false,
      detail: `Postal code ${postalCode} explicitly excluded`
    };
  }

  return { passed: true, detail: undefined as string | undefined };
};

const matchPriceBand = (
  condition: NonNullable<LeadRoutingConditions['priceBand']>,
  listing?: LeadRoutingListingContext
) => {
  const price = listing?.price ?? null;
  if (price === null || price === undefined) {
    return {
      passed: false,
      detail: 'Listing price unavailable'
    };
  }
  if (condition.min !== undefined && price < condition.min) {
    return {
      passed: false,
      detail: `Listing price ${price} below minimum ${condition.min}`
    };
  }
  if (condition.max !== undefined && price > condition.max) {
    return {
      passed: false,
      detail: `Listing price ${price} above maximum ${condition.max}`
    };
  }
  return { passed: true, detail: undefined as string | undefined };
};

const matchSource = (condition: NonNullable<LeadRoutingConditions['sources']>, person: LeadRoutingPersonContext) => {
  const source = person.source?.toLowerCase() ?? null;

  const includes = condition.include?.map((value) => value.toLowerCase());
  const excludes = condition.exclude?.map((value) => value.toLowerCase());

  if (includes && includes.length > 0 && (!source || !includes.includes(source))) {
    return {
      passed: false,
      detail: `Source ${source ?? 'unknown'} not in allowed list`
    };
  }

  if (excludes && source && excludes.includes(source)) {
    return {
      passed: false,
      detail: `Source ${source} explicitly excluded`
    };
  }

  return { passed: true, detail: undefined as string | undefined };
};

const matchConsentRequirement = (
  requirement: LeadRoutingConsentRequirement | undefined,
  state: LeadRoutingConsentState,
  channel: 'sms' | 'email'
) => {
  if (!requirement || requirement === 'OPTIONAL') {
    return { passed: true, detail: undefined as string | undefined };
  }

  if (requirement === 'GRANTED' && state !== 'GRANTED') {
    return {
      passed: false,
      detail: `${channel.toUpperCase()} consent must be granted`
    };
  }

  if (requirement === 'NOT_REVOKED' && state === 'REVOKED') {
    return {
      passed: false,
      detail: `${channel.toUpperCase()} consent revoked`
    };
  }

  return { passed: true, detail: undefined as string | undefined };
};

const matchBuyerRep = (requirement: LeadRoutingBuyerRepRequirement | undefined, status?: string | null) => {
  if (!requirement || requirement === 'ANY') {
    return { passed: true, detail: undefined as string | undefined };
  }

  const normalized = status?.toUpperCase() ?? 'UNKNOWN';
  if (requirement === 'REQUIRED_ACTIVE' && normalized !== 'ACTIVE') {
    return {
      passed: false,
      detail: `Active buyer representation required`
    };
  }

  if (requirement === 'PROHIBIT_ACTIVE' && normalized === 'ACTIVE') {
    return {
      passed: false,
      detail: `Leads with active buyer representation excluded`
    };
  }

  return { passed: true, detail: undefined as string | undefined };
};

const matchTimeWindows = (windows: LeadRoutingTimeWindow[], context: LeadRoutingContext) => {
  const details = windows.map((window) => {
    const days = window.days
      ? window.days.map((day) => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][day]).join(', ')
      : 'All days';
    return `${window.start}-${window.end} ${window.timezone} (${days})`;
  });

  const matched = windows.some((window) => {
    const now = resolveTimeParts(context.now, window.timezone);
    if (window.days && window.days.length > 0 && !window.days.includes(now.dayIndex)) {
      return false;
    }
    const startMinutes = parseTimeToMinutes(window.start);
    const endMinutes = parseTimeToMinutes(window.end);
    if (startMinutes <= endMinutes) {
      return now.minutes >= startMinutes && now.minutes <= endMinutes;
    }
    // Overnight window (e.g. 22:00 - 06:00)
    return now.minutes >= startMinutes || now.minutes <= endMinutes;
  });

  return {
    passed: matched,
    detail: matched ? undefined : `Outside allowed windows: ${details.join('; ')}`
  };
};

const normalizeStringSet = (values: Array<string | null | undefined> | null | undefined) =>
  (values ?? [])
    .map((value) => value?.trim())
    .filter(Boolean)
    .map((value) => value!.toLowerCase());

const matchStringSetFilter = (
  label: string,
  filter: RoutingStringSetFilter,
  haystack: string[]
) => {
  const includes = normalizeStringSet(filter.include);
  const excludes = normalizeStringSet(filter.exclude);
  const mode = filter.match ?? 'ANY';

  if (excludes.length > 0) {
    const blocked = excludes.find((value) => haystack.includes(value));
    if (blocked) {
      return { passed: false, detail: `${label} ${blocked} explicitly excluded` };
    }
  }

  if (includes.length > 0) {
    const matched = mode === 'ALL'
      ? includes.every((value) => haystack.includes(value))
      : includes.some((value) => haystack.includes(value));
    if (!matched) {
      return { passed: false, detail: `${label} missing required values (${mode})` };
    }
  }

  return { passed: true, detail: undefined as string | undefined };
};

const matchDemographics = (
  condition: NonNullable<LeadRoutingConditions['demographics']>,
  person: LeadRoutingPersonContext
) => {
  const tags = normalizeStringSet(person.tags);
  const languages = [...normalizeStringSet(person.languages), ...tags];
  const ethnicities = [...normalizeStringSet(person.ethnicities), ...tags];

  if (condition.minAge !== undefined || condition.maxAge !== undefined) {
    const age = person.age ?? null;
    if (age === null) {
      return { passed: false, detail: 'Age unavailable' };
    }
    if (condition.minAge !== undefined && age < condition.minAge) {
      return { passed: false, detail: `Age ${age} below minimum ${condition.minAge}` };
    }
    if (condition.maxAge !== undefined && age > condition.maxAge) {
      return { passed: false, detail: `Age ${age} above maximum ${condition.maxAge}` };
    }
  }

  if (condition.tags) {
    const result = matchStringSetFilter('Tag', condition.tags, tags);
    if (!result.passed) return result;
  }

  if (condition.languages) {
    const result = matchStringSetFilter('Language', condition.languages, languages);
    if (!result.passed) return result;
  }

  if (condition.ethnicities) {
    const result = matchStringSetFilter('Ethnicity', condition.ethnicities, ethnicities);
    if (!result.passed) return result;
  }

  return { passed: true, detail: undefined as string | undefined };
};

const isNil = (value: unknown) => value === null || value === undefined;

const equalsValue = (left: unknown, right: unknown) => {
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  if (typeof left === 'string' && typeof right === 'string') return left.toLowerCase() === right.toLowerCase();
  if (typeof left === 'boolean' && typeof right === 'boolean') return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

const matchCustomFieldCondition = (
  condition: LeadRoutingCustomFieldCondition,
  fields: Record<string, unknown>
) => {
  const value = fields[condition.key];
  const operator = condition.operator;
  const expected = condition.value;

  if (operator === 'EXISTS') {
    return { passed: !isNil(value), detail: !isNil(value) ? undefined : `Custom field ${condition.key} missing` };
  }
  if (operator === 'NOT_EXISTS') {
    return { passed: isNil(value), detail: isNil(value) ? undefined : `Custom field ${condition.key} present` };
  }

  if (isNil(value)) {
    return { passed: false, detail: `Custom field ${condition.key} missing` };
  }

  if (operator === 'EQUALS') {
    const passed = equalsValue(value, expected);
    return { passed, detail: passed ? undefined : `Custom field ${condition.key} does not equal expected value` };
  }

  if (operator === 'NOT_EQUALS') {
    const passed = !equalsValue(value, expected);
    return { passed, detail: passed ? undefined : `Custom field ${condition.key} equals excluded value` };
  }

  if (operator === 'IN' || operator === 'NOT_IN') {
    const expectedValues = toArray(expected);
    const valueValues = toArray(value);
    const matched = valueValues.some((candidate) =>
      expectedValues.some((entry) => equalsValue(candidate, entry))
    );
    const passed = operator === 'IN' ? matched : !matched;
    return {
      passed,
      detail: passed ? undefined : `Custom field ${condition.key} ${operator === 'IN' ? 'not in' : 'in'} expected set`
    };
  }

  if (operator === 'CONTAINS' || operator === 'NOT_CONTAINS') {
    let matched = false;
    if (typeof value === 'string' && typeof expected === 'string') {
      matched = value.toLowerCase().includes(expected.toLowerCase());
    } else if (Array.isArray(value)) {
      matched = value.some((entry) => equalsValue(entry, expected));
    }
    const passed = operator === 'CONTAINS' ? matched : !matched;
    return {
      passed,
      detail: passed ? undefined : `Custom field ${condition.key} ${operator === 'CONTAINS' ? 'missing' : 'contains'} expected value`
    };
  }

  const valueNumber = toNumber(value);
  const expectedNumber = toNumber(expected);
  if (valueNumber === null || expectedNumber === null) {
    return { passed: false, detail: `Custom field ${condition.key} not comparable` };
  }

  const passed =
    operator === 'GT'
      ? valueNumber > expectedNumber
      : operator === 'GTE'
        ? valueNumber >= expectedNumber
        : operator === 'LT'
          ? valueNumber < expectedNumber
          : operator === 'LTE'
            ? valueNumber <= expectedNumber
            : false;

  return {
    passed,
    detail: passed ? undefined : `Custom field ${condition.key} comparison failed`
  };
};

export const evaluateLeadRoutingConditions = (
  conditions: LeadRoutingConditions | null | undefined,
  context: LeadRoutingContext
): LeadRoutingEvaluationResult => {
  if (!conditions) {
    return { matched: true, checks: [] };
  }

  const parsed = leadRoutingConditionsSchema.parse(conditions);
  const checks: LeadRoutingConditionCheck[] = [];

  if (parsed.geography) {
    const result = matchGeography(parsed.geography, context.listing);
    checks.push({ key: 'geography', passed: result.passed, detail: result.detail });
  }

  if (parsed.priceBand) {
    const result = matchPriceBand(parsed.priceBand, context.listing);
    checks.push({ key: 'priceBand', passed: result.passed, detail: result.detail });
  }

  if (parsed.sources) {
    const result = matchSource(parsed.sources, context.person);
    checks.push({ key: 'sources', passed: result.passed, detail: result.detail });
  }

  if (parsed.consent) {
    const sms = matchConsentRequirement(parsed.consent.sms, context.person.consent.sms, 'sms');
    const email = matchConsentRequirement(parsed.consent.email, context.person.consent.email, 'email');
    const passed = sms.passed && email.passed;
    const details = [sms.detail, email.detail].filter(Boolean).join('; ') || undefined;
    checks.push({ key: 'consent', passed, detail: details });
  }

  if (parsed.buyerRep) {
    const result = matchBuyerRep(parsed.buyerRep, context.person.buyerRepStatus);
    checks.push({ key: 'buyerRep', passed: result.passed, detail: result.detail });
  }

  if (parsed.timeWindows && parsed.timeWindows.length > 0) {
    const result = matchTimeWindows(parsed.timeWindows, context);
    checks.push({ key: 'timeWindows', passed: result.passed, detail: result.detail });
  }

  if (parsed.demographics) {
    const result = matchDemographics(parsed.demographics, context.person);
    checks.push({ key: 'demographics', passed: result.passed, detail: result.detail });
  }

  if (parsed.customFields && parsed.customFields.length > 0) {
    const fields = (context.person.customFields ?? {}) as Record<string, unknown>;
    const failures = parsed.customFields
      .map((condition) => matchCustomFieldCondition(condition, fields))
      .filter((result) => !result.passed);
    checks.push({
      key: 'customFields',
      passed: failures.length === 0,
      detail: failures[0]?.detail
    });
  }

  const matched = checks.every((check) => check.passed);
  return { matched, checks };
};

export const routingConfigSchema = z.object({
  minimumScore: z.number().default(0.6),
  performanceWeight: z.number().default(0.25),
  capacityWeight: z.number().default(0.3),
  geographyWeight: z.number().default(0.2),
  priceBandWeight: z.number().default(0.15),
  leadTypeWeight: z.number().default(0.1)
});

export type RoutingConfig = z.infer<typeof routingConfigSchema>;

export interface AgentSnapshot {
  userId: string;
  fullName: string;
  capacityTarget: number;
  activePipeline: number;
  geographyFit: number; // 0 - 1
  priceBandFit: number; // 0 - 1
  keptApptRate: number; // 0 - 1
  leadTypeFit?: number; // 0 - 1 (computed per-lead)
  consentReady: boolean;
  tenDlcReady: boolean;
  teamId?: string;
  roundRobinOrder?: number;
}

export interface RoutingInput {
  leadId: string;
  tenantId: string;
  geographyImportance: number;
  priceBandImportance: number;
  agents: AgentSnapshot[];
  config?: RoutingConfig;
  fallbackTeamId?: string;
  quietHours: boolean;
}

export interface AgentScore {
  userId: string;
  fullName: string;
  score: number;
  reasons: {
    type: 'CAPACITY' | 'PERFORMANCE' | 'GEOGRAPHY' | 'PRICE_BAND' | 'LEAD_TYPE' | 'CONSENT' | 'TEN_DLC';
    description: string;
    weight: number;
  }[];
}

export interface RoutingResult {
  leadId: string;
  tenantId: string;
  selectedAgents: AgentScore[];
  fallbackTeamId?: string;
  usedFallback: boolean;
  quietHours: boolean;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const capacityScore = (capacityTarget: number, activePipeline: number) => {
  if (capacityTarget <= 0) return 0;
  const remaining = Math.max(capacityTarget - activePipeline, 0);
  return clamp01(remaining / capacityTarget);
};

export const scoreAgent = (input: AgentSnapshot, config: RoutingConfig): AgentScore | null => {
  if (!input.consentReady || !input.tenDlcReady) {
    return null;
  }

  const capacity = capacityScore(input.capacityTarget, input.activePipeline);
  const performance = clamp01(input.keptApptRate);
  const geography = clamp01(input.geographyFit);
  const priceBand = clamp01(input.priceBandFit);
  const leadType = clamp01(input.leadTypeFit ?? 0.7);

  const score =
    capacity * config.capacityWeight +
    performance * config.performanceWeight +
    geography * config.geographyWeight +
    priceBand * config.priceBandWeight +
    leadType * config.leadTypeWeight;

  const reasons: AgentScore['reasons'] = [
    {
      type: 'CAPACITY',
      description: `Capacity remaining ${(capacity * 100).toFixed(0)}%`,
      weight: config.capacityWeight
    },
    {
      type: 'PERFORMANCE',
      description: `Kept appointment rate ${(performance * 100).toFixed(0)}%`,
      weight: config.performanceWeight
    },
    {
      type: 'GEOGRAPHY',
      description: `Geography fit ${(geography * 100).toFixed(0)}%`,
      weight: config.geographyWeight
    },
    {
      type: 'PRICE_BAND',
      description: `Price-band fit ${(priceBand * 100).toFixed(0)}%`,
      weight: config.priceBandWeight
    },
    {
      type: 'LEAD_TYPE',
      description: `Buyer/seller match ${(leadType * 100).toFixed(0)}%`,
      weight: config.leadTypeWeight
    }
  ];

  return {
    userId: input.userId,
    fullName: input.fullName,
    score: Number(score.toFixed(4)),
    reasons
  };
};

export const routeLead = (payload: RoutingInput): RoutingResult => {
  const config = routingConfigSchema.parse(payload.config ?? {});
  const scored = payload.agents
    .map((agent) => scoreAgent(agent, config))
    .filter((value): value is AgentScore => value !== null)
    .sort((a, b) => b.score - a.score);

  const bestScore = scored[0]?.score ?? 0;
  const selected = scored.filter((agent) => agent.score >= config.minimumScore && agent.score >= bestScore - 0.05);

  const usedFallback = selected.length === 0;
  const chosen = usedFallback
    ? scored.slice(0, 1)
    : selected.sort((a, b) => (a.score === b.score ? 0 : b.score - a.score));

  return {
    leadId: payload.leadId,
    tenantId: payload.tenantId,
    selectedAgents: chosen,
    fallbackTeamId: usedFallback ? payload.fallbackTeamId : undefined,
    usedFallback,
    quietHours: payload.quietHours
  };
};
