// Common property types
export const PROPERTY_TYPES = [
  'residential',
  'commercial',
  'land',
  'rental',
  'condo',
  'townhouse',
  'multi-family'
] as const;

export type PropertyType = typeof PROPERTY_TYPES[number];

// Property statuses
export const PROPERTY_STATUSES = [
  'draft',
  'active',
  'pending',
  'sold',
  'withdrawn',
  'expired'
] as const;

export type PropertyStatus = typeof PROPERTY_STATUSES[number];

// US States (focus on Florida for real estate)
export const US_STATES = [
  { code: 'FL', name: 'Florida' },
  { code: 'AL', name: 'Alabama' },
  { code: 'GA', name: 'Georgia' },
  { code: 'SC', name: 'South Carolina' },
  // Add more as needed
] as const;

// Contact types
export const CONTACT_TYPES = ['buyer', 'seller', 'investor', 'agent'] as const;
export type ContactType = typeof CONTACT_TYPES[number];

// Lead statuses
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'negotiating', 'closed', 'lost'] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

// Transaction statuses
export const TRANSACTION_STATUSES = ['pending', 'accepted', 'rejected', 'under_contract', 'closed'] as const;
export type TransactionStatus = typeof TRANSACTION_STATUSES[number];

// Bedroom/Bathroom options
export const BEDROOM_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const;
export const BATHROOM_OPTIONS = [0, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const;

// Price ranges for filtering
export const PRICE_RANGES = [
  { label: 'Under $100K', min: 0, max: 100000 },
  { label: '$100K - $250K', min: 100000, max: 250000 },
  { label: '$250K - $500K', min: 250000, max: 500000 },
  { label: '$500K - $1M', min: 500000, max: 1000000 },
  { label: '$1M+', min: 1000000, max: Infinity },
] as const;

// Date formats
export const DATE_FORMATS = {
  SHORT: 'MM/DD/YYYY',
  LONG: 'MMMM DD, YYYY',
  FULL: 'dddd, MMMM DD, YYYY',
  TIME: 'h:mm A',
  DATETIME: 'MM/DD/YYYY h:mm A',
} as const;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

// File upload limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const;
