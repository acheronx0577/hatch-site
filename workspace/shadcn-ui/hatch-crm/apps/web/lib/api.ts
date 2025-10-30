import type { DraftMappingResult, ExtractedLabelValue } from '@hatch/shared';

import { toApiError } from './api/errors';

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
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (!headers.has('x-user-role')) {
    headers.set('x-user-role', 'BROKER');
  }
  if (!headers.has('x-user-id')) {
    headers.set('x-user-id', 'user-broker');
  }
  if (!headers.has('x-tenant-id')) {
    headers.set('x-tenant-id', process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID ?? 'tenant-hatch');
  }
  if (!headers.has('x-org-id')) {
    headers.set('x-org-id', process.env.NEXT_PUBLIC_ORG_ID ?? 'org-hatch');
  }

  if (options.body && !headers.has('Content-Type') && !isFormData) {
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
    const payload = await response.json().catch(() => undefined);
    throw toApiError(payload, response.status, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export type PipelineStage = {
  id: string;
  tenantId: string;
  pipelineId: string;
  name: string;
  order: number;
  slaMinutes: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Pipeline = {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  stages: PipelineStage[];
};

export type LeadOwnerSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type LeadStageSummary = {
  id: string;
  name: string;
  order: number;
  pipelineId: string;
  pipelineName: string;
  pipelineType: string;
  slaMinutes: number | null;
};

export type LeadActivityRollup = {
  last7dListingViews: number;
  last7dSessions: number;
  lastReplyAt?: string | null;
  lastEmailOpenAt?: string | null;
};

export type LeadSummary = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  score: number;
  scoreTier: string;
  pipelineId?: string | null;
  pipelineName?: string | null;
  pipelineType?: string | null;
  stageId?: string | null;
  stage?: LeadStageSummary;
  owner?: LeadOwnerSummary;
  lastActivityAt?: string | null;
  stageEnteredAt?: string | null;
  preapproved?: boolean;
  budgetMin?: number | null;
  budgetMax?: number | null;
  timeframeDays?: number | null;
  activityRollup?: LeadActivityRollup;
  createdAt: string;
  updatedAt: string;
};

export type LeadNote = {
  id: string;
  body: string;
  createdAt: string;
  author: LeadOwnerSummary;
};

export type LeadTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: LeadOwnerSummary;
};

export type LeadConsent = {
  id: string;
  channel: string;
  scope: string;
  status: string;
  capturedAt: string | null;
};

export type LeadEvent = {
  id: string;
  name: string;
  timestamp: string;
  properties?: Record<string, unknown>;
};

export type LeadDetail = LeadSummary & {
  notes: LeadNote[];
  tasks: LeadTask[];
  consents: LeadConsent[];
  events: LeadEvent[];
  fit?: {
    preapproved?: boolean;
    budgetMin?: number | null;
    budgetMax?: number | null;
    timeframeDays?: number | null;
    geo?: string | null;
    inventoryMatch?: number | null;
  } | null;
};

export async function getPipelines(): Promise<Pipeline[]> {
  return apiFetch<Pipeline[]>('v1/pipelines');
}

export interface ListLeadsParams {
  ownerId?: string;
  pipelineId?: string;
  stageId?: string[];
  scoreTier?: string[];
  lastActivityDays?: number;
  preapproved?: boolean;
  limit?: number;
}

export interface LeadListResponse {
  items: LeadSummary[];
  nextCursor?: string | null;
}

export async function getLeads(params: ListLeadsParams = {}): Promise<LeadListResponse> {
  const searchParams = new URLSearchParams();
  if (params.ownerId) searchParams.set('ownerId', params.ownerId);
  if (params.pipelineId) searchParams.set('pipelineId', params.pipelineId);
  if (params.stageId?.length) searchParams.set('stageId', params.stageId.join(','));
  if (params.scoreTier?.length) searchParams.set('scoreTier', params.scoreTier.join(','));
  if (params.lastActivityDays) searchParams.set('lastActivityDays', String(params.lastActivityDays));
  if (params.preapproved !== undefined) searchParams.set('preapproved', String(params.preapproved));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  const path = query ? `v1/leads?${query}` : 'v1/leads';
  return apiFetch<LeadListResponse>(path);
}

export async function getLead(id: string): Promise<LeadDetail> {
  return apiFetch<LeadDetail>(`v1/leads/${id}`);
}

export interface UpdateLeadPayload {
  ownerId?: string;
  pipelineId?: string;
  stageId?: string;
  consentEmail?: boolean;
  consentSMS?: boolean;
  doNotContact?: boolean;
}

export async function updateLead(id: string, payload: UpdateLeadPayload) {
  return apiFetch<LeadDetail>(`v1/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function createLeadNote(leadId: string, body: string) {
  return apiFetch<LeadNote>(`v1/leads/${leadId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body })
  });
}

export interface CreateLeadTaskPayload {
  title: string;
  assigneeId?: string;
  dueAt?: string;
  status?: string;
}

export async function createLeadTask(leadId: string, payload: CreateLeadTaskPayload) {
  return apiFetch<LeadTask>(`v1/leads/${leadId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateLeadTask(
  leadId: string,
  taskId: string,
  payload: Partial<CreateLeadTaskPayload>
) {
  return apiFetch<LeadTask>(`v1/leads/${leadId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
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

export type ContactListResponse = {
  items: ContactListItem[];
  nextCursor: string | null;
  savedView?: unknown;
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

export async function listContacts(tenantId: string, params: Record<string, unknown> = {}) {
  const searchParams = new URLSearchParams({ tenantId });
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    searchParams.set(key, String(value));
  }
  return apiFetch<ContactListResponse>(`/contacts?${searchParams.toString()}`);
}

export async function getContact(tenantId: string, personId: string) {
  return apiFetch<ContactDetails>(`/contacts/${personId}?tenantId=${tenantId}`);
}

export interface UpdateContactPayload {
  tenantId: string;
  ownerId?: string;
  notes?: string;
}

export async function updateContact(personId: string, payload: UpdateContactPayload) {
  return apiFetch<ContactDetails>(`/contacts/${personId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
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

export interface ListingListResponse {
  items: ListingSummary[];
  nextCursor: string | null;
}

export async function listListings(
  tenantId: string,
  params: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {}
): Promise<ListingListResponse> {
  const searchParams = new URLSearchParams({ tenantId });
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (typeof params.limit === 'number') searchParams.set('limit', params.limit.toString());
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await apiFetch<ListingListResponse | ListingSummary[]>(`/listings${suffix}`, {
    signal: params.signal
  });
  if (Array.isArray(response)) {
    return { items: response, nextCursor: null };
  }
  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
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

export interface MlsProfileListResponse {
  items: MlsProfile[];
  nextCursor: string | null;
}

export async function listMlsProfiles(
  tenantId: string,
  params: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {}
): Promise<MlsProfileListResponse> {
  const searchParams = new URLSearchParams({ tenantId });
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (typeof params.limit === 'number') searchParams.set('limit', params.limit.toString());
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await apiFetch<MlsProfileListResponse | MlsProfile[]>(`/mls/profiles${suffix}`, {
    signal: params.signal
  });
  if (Array.isArray(response)) {
    return { items: response, nextCursor: null };
  }
  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}

export interface DraftPdfUploadResponse {
  tenantId: string | null;
  filename: string;
  mimeType: string;
  draft: DraftMappingResult['draft'];
  matches: DraftMappingResult['matches'];
  extracted: ExtractedLabelValue[];
}

export interface DraftPdfUploadOptions {
  vendor?: string;
  documentVersion?: string;
}

export async function uploadDraftPdf(
  file: File,
  options: DraftPdfUploadOptions = {}
): Promise<DraftPdfUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options.vendor) {
    formData.append('vendor', options.vendor);
  }
  if (options.documentVersion) {
    formData.append('documentVersion', options.documentVersion);
  }

  return apiFetch<DraftPdfUploadResponse>('/drafts/upload', {
    method: 'POST',
    body: formData
  });
}
