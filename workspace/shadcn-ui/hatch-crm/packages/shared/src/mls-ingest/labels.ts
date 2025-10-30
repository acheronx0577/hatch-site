import type { FuzzyLabel } from './canonical';

export const FUZZY_LABELS: FuzzyLabel[] = [
  {
    canonical: 'list_price',
    labels: ['list price', 'lp', 'price', 'asking price', 'offered price', 'current price'],
    post: ['currency']
  },
  {
    canonical: 'mls_number',
    labels: ['mls#', 'mls id', 'listing number', 'mls number', 'mls identifier'],
    regex: [/\b\d{7,12}\b/g],
    post: ['string']
  },
  {
    canonical: 'address',
    labels: ['address', 'property address', 'site address', 'listing address', 'location'],
    post: ['address']
  },
  {
    canonical: 'status',
    labels: ['status', 'status type', 'current status', 'status public'],
    post: ['string']
  },
  {
    canonical: 'beds',
    labels: ['beds', 'bedrooms', 'br', 'total beds'],
    post: ['int']
  },
  {
    canonical: 'baths_total',
    labels: ['baths', 'bathrooms', 'total baths', 'bathrooms total'],
    post: ['baths']
  },
  {
    canonical: 'baths_full',
    labels: ['full baths', 'baths full', 'full bathrooms'],
    post: ['int']
  },
  {
    canonical: 'baths_half',
    labels: ['half baths', 'baths half', 'partial baths'],
    post: ['int']
  },
  {
    canonical: 'year_built',
    labels: ['year built', 'built', 'construction year'],
    post: ['int']
  },
  {
    canonical: 'living_area_sqft',
    labels: ['approx. living area', 'living area', 'heated sq ft', 'sqft living'],
    post: ['area_ft']
  },
  {
    canonical: 'total_area_sqft',
    labels: ['approx. total area', 'total area', 'total sq ft', 'floor area total'],
    post: ['area_ft']
  },
  {
    canonical: 'lot_acres',
    labels: ['lot size (acres)', 'lot acreage', 'lot acres'],
    regex: [/\b\d{0,3}\.?\d{0,4}\s*(ac|acre|acres)\b/gi],
    post: ['acres']
  },
  {
    canonical: 'lot_sqft',
    labels: ['lot size', 'lot square feet', 'lot size (sqft)', 'lot sq ft'],
    regex: [/\b[\d,]+\s*(sf|sqft|square feet|sq\. ft\.)\b/gi],
    post: ['area_ft']
  },
  {
    canonical: 'property_type',
    labels: ['property type', 'ownership', 'building design', 'property class', 'type'],
    post: ['string']
  },
  {
    canonical: 'subdivision',
    labels: ['subdivision', 'subdiv', 'community', 'neighborhood'],
    post: ['string']
  },
  {
    canonical: 'waterfront',
    labels: ['waterfront', 'gulf access', 'waterfront y/n'],
    post: ['bool']
  },
  {
    canonical: 'pool',
    labels: ['private pool', 'pool', 'pool y/n'],
    post: ['bool']
  },
  {
    canonical: 'garage_spaces',
    labels: ['# garage spaces', 'garage', 'garage spaces', 'parking spaces'],
    post: ['int']
  },
  {
    canonical: 'tax_year',
    labels: ['tax year'],
    post: ['int']
  },
  {
    canonical: 'total_tax_bill',
    labels: ['total tax bill', 'annual tax', 'annual taxes'],
    post: ['currency']
  },
  {
    canonical: 'hoa_fee',
    labels: ['hoa fee', 'homeowner association fee', 'association fee'],
    post: ['currency']
  },
  {
    canonical: 'master_hoa_fee',
    labels: ['master hoa fee', 'master association fee'],
    post: ['currency']
  },
  {
    canonical: 'zoning',
    labels: ['zoning', 'zoning code'],
    post: ['string']
  },
  {
    canonical: 'remarks_public',
    labels: ['public remarks', 'remarks', 'marketing remarks', 'public comment'],
    post: ['string']
  },
  {
    canonical: 'images_detected',
    labels: ['images', 'photos', 'media count'],
    post: ['int']
  }
];

export const PRIMARY_THRESHOLD = 0.8;
export const FALLBACK_THRESHOLD = 0.65;
