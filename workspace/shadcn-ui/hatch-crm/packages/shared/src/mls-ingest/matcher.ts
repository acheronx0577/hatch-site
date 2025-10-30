import { partial_ratio } from 'fuzzball';

import type {
  CanonicalDraftListing,
  CanonicalField,
  ExtractedLabelValue,
  MatchedField
} from './canonical';
import { FALLBACK_THRESHOLD, FUZZY_LABELS, PRIMARY_THRESHOLD } from './labels';
import { applyPostProcessors } from './processors';

type SectionKey =
  | 'general information'
  | 'details'
  | 'room features'
  | 'lot & taxes'
  | 'fees'
  | 'remarks'
  | 'media'
  | 'other';

const SECTION_PRIORS: Partial<Record<SectionKey, number>> = {
  'general information': 1.1,
  details: 1.05,
  remarks: 1.05,
  media: 1,
  'lot & taxes': 0.95,
  fees: 0.95
};

const normalizeLabel = (label: string | undefined): string =>
  (label ?? '')
    .toLowerCase()
    .replace(/[:：]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSection = (section: string | undefined): SectionKey | undefined => {
  if (!section) {
    return undefined;
  }
  const normalized = section.toLowerCase();
  if (normalized.includes('general')) {
    return 'general information';
  }
  if (normalized.includes('detail')) {
    return 'details';
  }
  if (normalized.includes('room')) {
    return 'room features';
  }
  if (normalized.includes('tax') || normalized.includes('lot')) {
    return 'lot & taxes';
  }
  if (normalized.includes('fee') || normalized.includes('hoa')) {
    return 'fees';
  }
  if (normalized.includes('remark') || normalized.includes('comment')) {
    return 'remarks';
  }
  if (normalized.includes('media') || normalized.includes('photo')) {
    return 'media';
  }
  return 'other';
};

const clampScore = (score: number): number => Math.max(0, Math.min(1, score));

const computeAliasScore = (input: string, candidate: string): number => {
  if (!input || !candidate) {
    return 0;
  }
  const ratio = partial_ratio(input, candidate);
  return clampScore(ratio / 100);
};

export interface FieldMatchResult extends MatchedField {
  derived?: Record<string, unknown>;
}

export const matchField = (raw: ExtractedLabelValue): FieldMatchResult | null => {
  const normalizedLabel = normalizeLabel(raw.label);
  if (!normalizedLabel) {
    return null;
  }

  let best: FieldMatchResult | null = null;
  const section = normalizeSection(raw.section);
  const sectionBoost = section ? (SECTION_PRIORS[section] ?? 1) - 1 : 0;

  for (const candidate of FUZZY_LABELS) {
    let aliasScore = 0;
    let matchedAlias = '';

    for (const alias of candidate.labels) {
      const score = computeAliasScore(normalizedLabel, normalizeLabel(alias));
      if (score > aliasScore) {
        aliasScore = score;
        matchedAlias = alias;
      }
    }

    const valueString =
      typeof raw.value === 'string'
        ? raw.value
        : raw.value !== null && raw.value !== undefined
          ? String(raw.value)
          : '';

    const regexMatched =
      candidate.regex &&
      valueString.length > 0 &&
      candidate.regex.some((regex) => regex.test(valueString));

    if (aliasScore === 0 && !regexMatched) {
      continue;
    }

    let score = aliasScore;

    if (candidate.weight) {
      score *= candidate.weight;
    }
    if (sectionBoost) {
      score *= 1 + sectionBoost;
    }
    if (candidate.sections && section) {
      const matchesSection = candidate.sections.some(
        (sectionLabel) => normalizeSection(sectionLabel) === section
      );
      if (matchesSection) {
        score += 0.05;
      }
    }
    if (regexMatched && score < PRIMARY_THRESHOLD) {
      score += 0.1;
    }

    if (raw.bold) {
      score += 0.02;
    }
    if (raw.uppercase) {
      score += 0.015;
    }

    score = clampScore(score);

    const meetsPrimary = score >= PRIMARY_THRESHOLD;
    const meetsFallback = score >= FALLBACK_THRESHOLD && regexMatched;

    if (!meetsPrimary && !meetsFallback) {
      continue;
    }

    const { value, appliedPostProcessors, derived } = applyPostProcessors(
      candidate.canonical,
      raw,
      candidate.post
    );

    if (best && score <= best.score) {
      continue;
    }

    best = {
      canonical: candidate.canonical,
      value,
      raw,
      score,
      appliedPostProcessors,
      regexMatched,
      derived
    };
  }

  return best;
};

export interface BuildDraftOptions {
  source: CanonicalDraftListing['source'];
  extracted: ExtractedLabelValue[];
  remarks?: Array<string | null> | string | null;
  media?: {
    urls?: string[];
    coverIndex?: number;
    detectedTotal?: number | null;
  };
}

const REQUIRED_FIELDS: CanonicalField[] = [
  'list_price',
  'mls_number',
  'address',
  'beds',
  'baths_total',
  'living_area_sqft',
  'lot_acres',
  'lot_sqft',
  'property_type',
  'subdivision'
];

const initDraft = (source: CanonicalDraftListing['source']): CanonicalDraftListing => ({
  source,
  basic: {
    status: 'draft',
    listing_status: null,
    property_type: null,
    list_price: null,
    price_currency: 'USD',
    address: null
  },
  details: {
    beds: null,
    baths_total: null,
    baths_full: null,
    baths_half: null,
    year_built: null,
    living_area_sqft: null,
    total_area_sqft: null,
    lot_acres: null,
    lot_sqft: null,
    garage_spaces: null,
    pool: null,
    waterfront: null,
    subdivision: null
  },
  taxes_fees: {
    tax_year: null,
    total_tax_bill: null,
    hoa_fee: null,
    master_hoa_fee: null,
    zoning: null
  },
  remarks: {
    public: null
  },
  media: {
    images: [],
    cover_image_index: 0,
    detected_total: null
  },
  diagnostics: {
    confidence: {} as Partial<Record<CanonicalField, number>>,
    missing: [],
    warnings: [],
    issues: []
  }
});

const coalesceRemarks = (input: BuildDraftOptions['remarks']): string | null => {
  if (!input) {
    return null;
  }
  if (Array.isArray(input)) {
    return input.filter((item): item is string => !!item && item.trim().length > 0).join('\n\n') || null;
  }
  return typeof input === 'string' && input.trim().length > 0 ? input.trim() : null;
};

const normalizeMedia = (media: BuildDraftOptions['media']) => {
  const urls = media?.urls ?? [];
  const seen = new Set<string>();
  const deduped = urls.filter((url) => {
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });

  const cover =
    media?.coverIndex !== undefined && media?.coverIndex < deduped.length ? media.coverIndex : 0;

  return {
    images: deduped.map((url) => ({ url })),
    cover_image_index: cover,
    detected_total: media?.detectedTotal ?? deduped.length
  };
};

export interface DraftMappingResult {
  draft: CanonicalDraftListing;
  matches: FieldMatchResult[];
}

const assignField = (
  draft: CanonicalDraftListing,
  match: FieldMatchResult,
  confidence: Partial<Record<CanonicalField, number>>
) => {
  const { canonical, value, derived } = match;

  switch (canonical) {
    case 'list_price':
      draft.basic.list_price = (value as number | null) ?? null;
      break;
    case 'mls_number': {
      const rawValue = (value as string | null) ?? null;
      if (rawValue) {
        const match = rawValue.match(/[A-Z0-9-]+/i);
        draft.source.mls_number = match ? match[0] : rawValue;
      } else {
        draft.source.mls_number = undefined;
      }
      break;
    }
    case 'address':
      if (value && typeof value === 'object') {
        const address = value as {
          street?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
        };
        draft.basic.address = {
          street: address.street ?? null,
          city: address.city ?? null,
          state: address.state ?? null,
          postal_code: address.postal_code ?? null,
          country: address.country ?? 'US'
        };
      } else if (typeof value === 'string') {
        draft.basic.address = {
          street: value,
          city: null,
          state: null,
          postal_code: null,
          country: 'US'
        };
      }
      break;
    case 'status': {
      const statusValue =
        typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : null;
      const sanitizedStatus =
        statusValue && statusValue.length > 0 ? statusValue.replace(/\(.*?\)/g, '').trim() : null;
      draft.basic.listing_status = sanitizedStatus && sanitizedStatus.length > 0 ? sanitizedStatus : null;
      if (draft.basic.listing_status) {
        const normalized = draft.basic.listing_status.toLowerCase();
        if (normalized.includes('active') || normalized.includes('pending') || normalized.includes('live')) {
          draft.basic.status = 'published';
        } else if (normalized.includes('sold') || normalized.includes('closed')) {
          draft.basic.status = 'published';
        } else if (normalized.includes('draft') || normalized.includes('coming soon')) {
          draft.basic.status = 'draft';
        }
      }
      break;
    }
    case 'beds':
      draft.details.beds = (value as number | null) ?? null;
      break;
    case 'baths_total':
      draft.details.baths_total = (value as number | null) ?? null;
      break;
    case 'baths_full':
      draft.details.baths_full = (value as number | null) ?? null;
      break;
    case 'baths_half':
      draft.details.baths_half = (value as number | null) ?? null;
      break;
    case 'year_built':
      draft.details.year_built = (value as number | null) ?? null;
      break;
    case 'living_area_sqft':
      draft.details.living_area_sqft = (value as number | null) ?? null;
      break;
    case 'total_area_sqft':
      draft.details.total_area_sqft = (value as number | null) ?? null;
      break;
    case 'lot_acres':
      draft.details.lot_acres = (value as number | null) ?? null;
      break;
    case 'lot_sqft':
      draft.details.lot_sqft = (value as number | null) ?? null;
      break;
    case 'property_type':
      draft.basic.property_type = (value as string | null) ?? null;
      break;
    case 'subdivision':
      draft.details.subdivision = (value as string | null) ?? null;
      break;
    case 'waterfront':
      draft.details.waterfront = (value as boolean | null) ?? null;
      break;
    case 'pool':
      draft.details.pool = (value as boolean | null) ?? null;
      break;
    case 'garage_spaces':
      draft.details.garage_spaces = (value as number | null) ?? null;
      break;
    case 'tax_year':
      draft.taxes_fees = draft.taxes_fees ?? {};
      draft.taxes_fees.tax_year = (value as number | null) ?? null;
      break;
    case 'total_tax_bill':
      draft.taxes_fees = draft.taxes_fees ?? {};
      draft.taxes_fees.total_tax_bill = (value as number | null) ?? null;
      break;
    case 'hoa_fee':
      draft.taxes_fees = draft.taxes_fees ?? {};
      draft.taxes_fees.hoa_fee = (value as number | null) ?? null;
      break;
    case 'master_hoa_fee':
      draft.taxes_fees = draft.taxes_fees ?? {};
      draft.taxes_fees.master_hoa_fee = (value as number | null) ?? null;
      break;
    case 'zoning':
      draft.taxes_fees = draft.taxes_fees ?? {};
      draft.taxes_fees.zoning = (value as string | null) ?? null;
      break;
    case 'remarks_public':
      draft.remarks.public = (value as string | null) ?? null;
      break;
    case 'images_detected':
      draft.media.detected_total = (value as number | null) ?? null;
      break;
    default:
      break;
  }

  confidence[canonical] = match.score;

  if (derived) {
    if (derived.baths_full !== undefined) {
      draft.details.baths_full = (derived.baths_full as number | null) ?? draft.details.baths_full;
      confidence.baths_full = match.score;
    }
    if (derived.baths_half !== undefined) {
      draft.details.baths_half = (derived.baths_half as number | null) ?? draft.details.baths_half;
      confidence.baths_half = match.score;
    }
    if (derived.lot_sqft !== undefined) {
      draft.details.lot_sqft = (derived.lot_sqft as number | null) ?? draft.details.lot_sqft;
      confidence.lot_sqft = match.score;
    }
    if (derived.lot_acres !== undefined) {
      draft.details.lot_acres = (derived.lot_acres as number | null) ?? draft.details.lot_acres;
      confidence.lot_acres = match.score;
    }
  }
};

export const buildCanonicalDraft = (options: BuildDraftOptions): DraftMappingResult => {
  const draft = initDraft(options.source);
  const matches: FieldMatchResult[] = [];
  const diagnostics =
    draft.diagnostics ??
    (draft.diagnostics = {
      confidence: {},
      missing: [],
      warnings: [],
      issues: []
    });

  if (!diagnostics.confidence) {
    diagnostics.confidence = {};
  }

  for (const raw of options.extracted) {
    const match = matchField(raw);
    if (!match) {
      continue;
    }
    matches.push(match);
    assignField(draft, match, diagnostics.confidence);
  }

  if (options.remarks) {
    draft.remarks.public = coalesceRemarks(options.remarks);
  }

  draft.media = normalizeMedia(options.media);

  const missing: CanonicalField[] = [];
  for (const field of REQUIRED_FIELDS) {
    if ((draft.diagnostics?.confidence?.[field] ?? 0) === 0) {
      missing.push(field);
      continue;
    }

    switch (field) {
      case 'list_price':
        if (!draft.basic.list_price) {
          missing.push(field);
        }
        break;
      case 'mls_number':
        if (!draft.source.mls_number) {
          missing.push(field);
        }
        break;
      case 'address':
        if (!draft.basic.address?.street) {
          missing.push(field);
        }
        break;
      case 'beds':
        if (draft.details.beds == null) {
          missing.push(field);
        }
        break;
      case 'baths_total':
        if (draft.details.baths_total == null) {
          missing.push(field);
        }
        break;
      case 'living_area_sqft':
        if (draft.details.living_area_sqft == null) {
          missing.push(field);
        }
        break;
      case 'lot_acres':
        if (draft.details.lot_acres == null) {
          missing.push(field);
        }
        break;
      case 'lot_sqft':
        if (draft.details.lot_sqft == null) {
          missing.push(field);
        }
        break;
      case 'property_type':
        if (!draft.basic.property_type) {
          missing.push(field);
        }
        break;
      case 'subdivision':
        if (!draft.details.subdivision) {
          missing.push(field);
        }
        break;
      default:
        break;
    }
  }

  if (
    draft.details.total_area_sqft != null &&
    draft.details.living_area_sqft != null &&
    draft.details.living_area_sqft > draft.details.total_area_sqft
  ) {
    diagnostics.warnings = [
      ...(diagnostics.warnings ?? []),
      'living_area_sqft exceeds total_area_sqft'
    ];
  }

  diagnostics.missing = Array.from(new Set(missing));

  return {
    draft,
    matches
  };
};
