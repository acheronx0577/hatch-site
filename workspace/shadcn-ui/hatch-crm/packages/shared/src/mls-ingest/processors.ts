import type {
  CanonicalField,
  ExtractedLabelValue,
  MatchedField,
  PostProcessorKey
} from './canonical';

type ProcessorFn = (raw: ExtractedLabelValue) => unknown;

const cleanString = (val: unknown): string => {
  if (val === null || val === undefined) {
    return '';
  }
  if (typeof val === 'string') {
    return val.trim();
  }
  return String(val).trim();
};

const toCurrency = (raw: ExtractedLabelValue): number | null => {
  const cleaned = cleanString(raw.value).replace(/[^\d.-]/g, '');
  if (!cleaned) {
    return null;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const toInt = (raw: ExtractedLabelValue): number | null => {
  const cleaned = cleanString(raw.value).replace(/[^\d-]/g, '');
  if (!cleaned) {
    return null;
  }
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toFloat = (raw: ExtractedLabelValue): number | null => {
  const cleaned = cleanString(raw.value).replace(/[^\d.-]/g, '');
  if (!cleaned) {
    return null;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBool = (raw: ExtractedLabelValue): boolean | null => {
  const cleaned = cleanString(raw.value).toLowerCase();
  if (!cleaned) {
    return null;
  }
  if (['y', 'yes', 'true', '1'].includes(cleaned)) {
    return true;
  }
  if (['n', 'no', 'false', '0'].includes(cleaned)) {
    return false;
  }
  return null;
};

const toAreaSqft = (raw: ExtractedLabelValue): number | null => {
  const value = cleanString(raw.value);
  if (!value) {
    return null;
  }

  const explicitMatch = value.match(/([\d.,]+)\s*(?:square\s*feet|sq\s*ft|sqft|sf)\b/i);
  if (explicitMatch) {
    const parsed = Number.parseFloat(explicitMatch[1].replace(/,/g, ''));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  const numericCandidates = value.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!numericCandidates || numericCandidates.length === 0) {
    const fallback = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(fallback) ? Math.round(fallback) : null;
  }

  const numbers = numericCandidates.map((candidate) =>
    Number.parseFloat(candidate.replace(/,/g, ''))
  );
  const best = numbers.filter((num) => Number.isFinite(num)).sort((a, b) => b - a)[0];
  return Number.isFinite(best) ? Math.round(best) : null;
};

const toAcres = (raw: ExtractedLabelValue): number | null => {
  const value = cleanString(raw.value);
  if (!value) {
    return null;
  }

  const acresMatch = value.match(/([\d.,]+)\s*(?:acres?|ac)\b/i);
  if (acresMatch) {
    const parsed = Number.parseFloat(acresMatch[1].replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const numericCandidates = value.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!numericCandidates || numericCandidates.length === 0) {
    const fallback = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(fallback) ? fallback : null;
  }

  const numbers = numericCandidates
    .map((candidate) => Number.parseFloat(candidate.replace(/,/g, '')))
    .filter((num) => Number.isFinite(num))
    .sort((a, b) => a - b);

  const smallest = numbers[0];
  return Number.isFinite(smallest) ? smallest : null;
};

const parseBathSummary = (raw: ExtractedLabelValue) => {
  const value = cleanString(raw.value);
  if (!value) {
    return { total: null, full: null, half: null };
  }

  const compositeMatch = value.match(/(\d+(?:\.\d+)?)\s*\((\d+)\s*(\d+)\)/);
  if (compositeMatch) {
    return {
      total: Number.parseFloat(compositeMatch[1]),
      full: Number.parseInt(compositeMatch[2], 10),
      half: Number.parseInt(compositeMatch[3], 10)
    };
  }

  const totalOnly = Number.parseFloat(value);
  if (Number.isFinite(totalOnly)) {
    return { total: totalOnly, full: null, half: null };
  }

  return { total: null, full: null, half: null };
};

const parseAddress = (raw: ExtractedLabelValue) => {
  const value = cleanString(raw.value);
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  const parts = normalized.split(',');
  if (parts.length < 3) {
    return {
      full: normalized,
      street: normalized || null,
      city: null,
      state: null,
      postal_code: null,
      country: 'US'
    };
  }

  const toTitleCase = (input: string) =>
    input
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const street = parts[0].trim();
  const city = parts[1].trim();
  const stateZip = parts.slice(2).join(',').trim();
  const stateZipMatch = stateZip.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/i);

  return {
    full: normalized,
    street: street || null,
    city: city ? toTitleCase(city) : null,
    state: stateZipMatch ? stateZipMatch[1].toUpperCase() : null,
    postal_code: stateZipMatch ? stateZipMatch[2] : null,
    country: 'US'
  };
};

const toStringValue = (raw: ExtractedLabelValue): string | null => {
  const value = cleanString(raw.value);
  return value.length ? value : null;
};

const PROCESSORS: Record<PostProcessorKey, ProcessorFn> = {
  currency: toCurrency,
  int: toInt,
  float: toFloat,
  bool: toBool,
  address: parseAddress,
  area_ft: toAreaSqft,
  acres: toAcres,
  baths: parseBathSummary,
  string: toStringValue
};

export const applyPostProcessors = (
  canonical: CanonicalField,
  raw: ExtractedLabelValue,
  processors: PostProcessorKey[] | undefined
): Pick<MatchedField, 'value' | 'appliedPostProcessors'> & { derived?: Record<string, unknown> } => {
  if (!processors || processors.length === 0) {
    return {
      value: raw.value,
      appliedPostProcessors: []
    };
  }

  let primaryValue: unknown = null;
  const applied: PostProcessorKey[] = [];
  const derived: Record<string, unknown> = {};

  for (const processor of processors) {
    const fn = PROCESSORS[processor];
    if (!fn) {
      continue;
    }
    applied.push(processor);
    const result = fn(raw);

    if (processor === 'baths' && result && typeof result === 'object') {
      const { total, full, half } = result as {
        total: number | null;
        full: number | null;
        half: number | null;
      };
      if (total !== null) {
        primaryValue = total;
      }
      if (full !== null) {
        derived.baths_full = full;
      }
      if (half !== null) {
        derived.baths_half = half;
      }
      continue;
    }

    if (processor === 'address') {
      primaryValue = result;
      continue;
    }

    if (primaryValue === null || primaryValue === undefined) {
      primaryValue = result;
    }
  }

  switch (canonical) {
    case 'lot_acres': {
      const sqft = toAreaSqft(raw);
      if (sqft !== null) {
        derived.lot_sqft = sqft;
      }
      break;
    }
    case 'lot_sqft': {
      const acres = toAcres(raw);
      if (acres !== null) {
        derived.lot_acres = acres;
      }
      break;
    }
    default:
      break;
  }

  return {
    value: primaryValue,
    appliedPostProcessors: applied,
    derived: Object.keys(derived).length ? derived : undefined
  };
};
