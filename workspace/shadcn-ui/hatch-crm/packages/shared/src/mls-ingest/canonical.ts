export type CanonicalField =
  | 'list_price'
  | 'mls_number'
  | 'address'
  | 'status'
  | 'beds'
  | 'baths_total'
  | 'baths_full'
  | 'baths_half'
  | 'year_built'
  | 'living_area_sqft'
  | 'total_area_sqft'
  | 'lot_acres'
  | 'lot_sqft'
  | 'property_type'
  | 'subdivision'
  | 'waterfront'
  | 'pool'
  | 'garage_spaces'
  | 'tax_year'
  | 'total_tax_bill'
  | 'hoa_fee'
  | 'master_hoa_fee'
  | 'zoning'
  | 'remarks_public'
  | 'images_detected';

export type PostProcessorKey =
  | 'currency'
  | 'int'
  | 'float'
  | 'bool'
  | 'address'
  | 'area_ft'
  | 'acres'
  | 'baths'
  | 'string';

export interface DraftSourceDescriptor {
  ingest_type: 'pdf' | 'spreadsheet' | 'api';
  vendor: string;
  document_version?: string;
  mls_number?: string;
}

export interface CanonicalDraftListing {
  source: DraftSourceDescriptor;
  basic: {
    status: 'draft' | 'pending' | 'published';
    listing_status?: string | null;
    property_type?: string | null;
    list_price?: number | null;
    price_currency?: 'USD' | string;
    address?: {
      street?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
    } | null;
  };
  details: {
    beds?: number | null;
    baths_total?: number | null;
    baths_full?: number | null;
    baths_half?: number | null;
    year_built?: number | null;
    living_area_sqft?: number | null;
    total_area_sqft?: number | null;
    lot_acres?: number | null;
    lot_sqft?: number | null;
    garage_spaces?: number | null;
    pool?: boolean | null;
    waterfront?: boolean | null;
    subdivision?: string | null;
  };
  taxes_fees?: {
    tax_year?: number | null;
    total_tax_bill?: number | null;
    hoa_fee?: number | null;
    master_hoa_fee?: number | null;
    zoning?: string | null;
  };
  remarks: {
    public?: string | null;
  };
  media: {
    images: Array<{ url: string; score?: number }>;
    cover_image_index: number;
    detected_total?: number | null;
  };
  diagnostics?: {
    confidence: Partial<Record<CanonicalField, number>>;
    missing: CanonicalField[];
    warnings?: string[];
    issues?: string[];
  };
}

export interface ExtractedLabelValue {
  label: string;
  value: string | number | boolean | null;
  section?: string;
  bbox?: { x: number; y: number; width: number; height: number };
  bold?: boolean;
  uppercase?: boolean;
}

export interface FuzzyLabel {
  canonical: CanonicalField;
  weight?: number;
  labels: string[];
  regex?: RegExp[];
  post?: PostProcessorKey[];
  sections?: string[];
}

export interface MatchedField {
  canonical: CanonicalField;
  value: unknown;
  raw: ExtractedLabelValue;
  score: number;
  appliedPostProcessors: PostProcessorKey[];
  regexMatched?: boolean;
}
