const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const ensureTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`);
const ensureProtocol = (value: string) => (value.startsWith('http') ? value : `https://${value}`);

const inferSiblingApiHost = (url: URL) => {
  if (url.hostname.includes('-api.')) {
    return url.hostname;
  }

  if (url.hostname.endsWith('.vercel.app')) {
    return url.hostname.replace('.vercel.app', '-api.vercel.app');
  }

  return null;
};

const normaliseBase = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(stripTrailingSlash(ensureProtocol(value)));
  } catch {
    return null;
  }
};

const buildApiUrlFromBase = (value: string | null) => {
  const baseUrl = normaliseBase(value);
  if (!baseUrl) {
    return null;
  }

  const ensureApiPath = (url: URL) => {
    const currentPath = url.pathname === '/' ? '' : stripTrailingSlash(url.pathname);
    if (currentPath === '/api') {
      url.pathname = '/api';
    } else if (currentPath.endsWith('/api')) {
      url.pathname = currentPath;
    } else {
      url.pathname = `${currentPath || ''}/api`.replace(/\/{2,}/g, '/');
      if (!url.pathname.startsWith('/')) {
        url.pathname = `/${url.pathname}`;
      }
    }
    return `${url.protocol}//${url.host}${url.pathname}`;
  };

  // If the provided value already points at the API host, just normalise the path.
  if (baseUrl.hostname.includes('-api.') || baseUrl.pathname.includes('/api')) {
    return ensureApiPath(baseUrl);
  }

  const siblingHost = inferSiblingApiHost(baseUrl);
  if (siblingHost) {
    baseUrl.hostname = siblingHost;
    baseUrl.pathname = '/';
    return ensureApiPath(baseUrl);
  }

  // Fall back to assuming the API is hosted on the same origin under /api.
  baseUrl.pathname = '/';
  return ensureApiPath(baseUrl);
};

const resolveInternalApiUrl = () => {
  const candidates = [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.VITE_API_BASE_URL,
    process.env.API_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.VERCEL_URL
  ];

  for (const candidate of candidates) {
    const resolved = buildApiUrlFromBase(candidate ?? null);
    if (resolved) {
      return resolved;
    }
  }

  return null;
};

const explicitApiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.VITE_API_BASE_URL ?? process.env.API_URL ?? null;

const computeApiUrl = () => {
  if (explicitApiUrl) {
    return explicitApiUrl;
  }

  if (typeof window === 'undefined') {
    return resolveInternalApiUrl() ?? 'http://localhost:4000/api';
  }

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:4000/api';
  }

  const inferred = buildApiUrlFromBase(window.location.origin);
  return inferred ?? `${stripTrailingSlash(window.location.origin)}/api`;
};

const API_URL = ensureTrailingSlash(computeApiUrl());

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const sanitizedPath = path.replace(/^\//, '');
  const url = `${API_URL}${sanitizedPath}`;
  const headers = new Headers(options.headers);

  if (!headers.has('x-user-role')) {
    headers.set('x-user-role', 'BROKER');
  }
  if (!headers.has('x-user-id')) {
    headers.set('x-user-id', 'user-broker');
  }
  if (!headers.has('x-tenant-id')) {
    headers.set('x-tenant-id', process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch');
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    cache: 'no-store'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? response.statusText);
  }

  return response.json() as Promise<T>;
}

export type ContactListItem = {
  id: string;
  firstName: string;
  lastName: string;
  stage: string;
  primaryEmail?: string;
  primaryPhone?: string;
};

export type ContactDetails = ContactListItem & {
  organizationId: string;
  notes?: string | null;
  consents: Array<{
    id: string;
    channel: string;
    scope: string | null;
    status: string;
    capturedAt: string | null;
    verbatimText?: string | null;
    source?: string | null;
  }>;
  deals: Array<{
    id: string;
    stage: string;
    updatedAt: string;
    listing?: {
      id: string;
      status: string;
      addressLine1?: string | null;
    } | null;
  }>;
  tours: Array<{
    id: string;
    status: string;
    startAt: string;
    listing?: {
      id: string;
      addressLine1?: string | null;
    } | null;
    agent?: {
      id: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }>;
  messages: Array<{
    id: string;
    channel: string;
    direction: string;
    createdAt: string;
    subject?: string | null;
    body?: string | null;
    user?: {
      id: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }>;
  timeline?: Array<{
    id: string;
    type: string;
    occurredAt: string;
    payload: unknown;
    actor?: {
      id: string | null;
      name: string | null;
    };
  }>;
  agreements?: Array<{
    id: string;
    type: string;
    status: string;
    signedAt?: string | null;
  }>;
  activitySummary?: Array<{
    type: string;
    _count: {
      type: number;
    };
  }>;
  toursSummary?: Array<{
    status: string;
    _count: {
      status: number;
    };
  }>;
};

export type ListingSummary = {
  id: string;
  tenantId: string;
  status: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  price?: string | null;
  beds?: number | null;
  baths?: number | null;
  propertyType?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgreementSummary = {
  id: string;
  tenantId: string;
  personId: string;
  type: string;
  status: string;
  signedAt?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
};

export type PreflightResult = {
  pass: boolean;
  violations: string[];
  warnings: string[];
};

export type AgentRoutingReason = {
  type: string;
  description: string;
  weight: number;
};

export type AgentScore = {
  userId: string;
  fullName: string;
  score: number;
  reasons: AgentRoutingReason[];
};

export type RoutingResult = {
  leadId: string;
  tenantId: string;
  selectedAgents: AgentScore[];
  fallbackTeamId?: string;
  usedFallback: boolean;
  quietHours: boolean;
};

export type RequestTourResponse = {
  tourId: string;
  status: 'REQUESTED' | 'CONFIRMED';
  assignedAgent?: AgentScore | null;
  routingResult?: RoutingResult;
};

export type DeliverabilityRow = {
  channel: string;
  accepted: number;
  delivered: number;
  bounced: number;
  optOuts: number;
};

export type DealSummaryRow = {
  stage: string;
  forecastGci: number;
  actualGci: number;
};

export type BrokerDashboardSummary = {
  leadToKeptRate: number;
  toursWithBbaRate: number;
  deliverability: DeliverabilityRow[];
  deals: DealSummaryRow[];
  clearCooperation: Array<{
    timerId: string;
    status: string;
    startedAt: string;
    deadlineAt: string | null;
    listing?: {
      addressLine1?: string | null;
    } | null;
  }>;
};

const EMPTY_DASHBOARD: BrokerDashboardSummary = {
  leadToKeptRate: 0,
  toursWithBbaRate: 0,
  deliverability: [],
  deals: [],
  clearCooperation: []
};

export type MlsProfile = {
  id: string;
  tenantId: string;
  name: string;
  disclaimerText: string;
  compensationDisplayRule: 'allowed' | 'prohibited' | 'conditional';
  requiredPlacement?: string | null;
  prohibitedFields?: Record<string, unknown> | null;
  clearCooperationRequired: boolean;
  slaHours: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listContacts(tenantId: string) {
  const response = await apiFetch<{ items: ContactListItem[]; total: number; page: number; pageSize: number }>(`/contacts?tenantId=${tenantId}`);
  return response.items;
}

export async function getContact(tenantId: string, personId: string) {
  return apiFetch<ContactDetails>(`/contacts/${personId}?tenantId=${tenantId}`);
}

export async function getBrokerDashboard(tenantId: string) {
  try {
    return await apiFetch<BrokerDashboardSummary>(`/dashboards/broker?tenantId=${tenantId}`);
  } catch (error) {
    console.error('Failed to load broker dashboard data', error);
    return EMPTY_DASHBOARD;
  }
}

export async function requestTour(payload: Record<string, unknown>) {
  return apiFetch<RequestTourResponse>('/tours', { method: 'POST', body: JSON.stringify(payload) });
}

export async function captureConsent(personId: string, payload: Record<string, unknown>) {
  return apiFetch(`/contacts/${personId}/consents`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function sendSms(payload: Record<string, unknown>) {
  return apiFetch('/messages/sms', { method: 'POST', body: JSON.stringify(payload) });
}

export async function runPreflight(payload: Record<string, unknown>) {
  return apiFetch<PreflightResult>('/mls/preflight', { method: 'POST', body: JSON.stringify(payload) });
}

export async function listListings(tenantId: string) {
  return apiFetch<ListingSummary[]>(`/listings?tenantId=${tenantId}`);
}

export async function createAgreement(payload: Record<string, unknown>) {
  return apiFetch<AgreementSummary>('/agreements', { method: 'POST', body: JSON.stringify(payload) });
}

export async function signAgreement(agreementId: string, payload: Record<string, unknown>) {
  return apiFetch<AgreementSummary>(`/agreements/${agreementId}/sign`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function listMlsProfiles(tenantId: string) {
  return apiFetch<MlsProfile[]>(`/mls/profiles?tenantId=${tenantId}`);
}
