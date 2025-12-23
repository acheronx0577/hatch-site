import type { DraftMappingResult, ExtractedLabelValue } from '@hatch/shared';

import { ApiError, toApiError } from './api/errors';

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

    if (!currentPath) {
      url.pathname = '/api';
      return `${url.protocol}//${url.host}${url.pathname}`;
    }

    const apiIndex = currentPath.indexOf('/api');
    if (apiIndex !== -1) {
      url.pathname = currentPath.slice(0, apiIndex + 4);
      return `${url.protocol}//${url.host}${url.pathname}`;
    }

    url.pathname = `${currentPath}/api`.replace(/\/{2,}/g, '/');
    if (!url.pathname.startsWith('/')) {
      url.pathname = `/${url.pathname}`;
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
    return buildApiUrlFromBase(explicitApiUrl) ?? explicitApiUrl;
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
const DEFAULT_BROKERAGE_ID =
  process.env.NEXT_PUBLIC_BROKERAGE_ID ??
  process.env.NEXT_PUBLIC_TENANT_ID ??
  process.env.NEXT_PUBLIC_ORG_ID ??
  'tenant-hatch';

export function getApiBaseUrl() {
  return API_URL;
}

type BodyLike = RequestInit['body'] | object;

interface FetchOptions extends Omit<RequestInit, 'body'> {
  token?: string;
  body?: BodyLike;
}

function normalizeJsonBody(body: BodyLike, isFormData: boolean): RequestInit['body'] {
  if (!body || isFormData) {
    return body as RequestInit['body'];
  }

  if (typeof body === 'string') {
    return body;
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return body;
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return body;
  }

  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return body;
  }

  if (ArrayBuffer.isView(body)) {
    return body as unknown as BodyInit;
  }

  // Default: assume JSON payload.
  return JSON.stringify(body);
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const sanitizedPath = path.replace(/^[\s/]+/, '');
  const versionedPath =
    sanitizedPath.length === 0 ||
    sanitizedPath.startsWith('v1/') ||
    sanitizedPath.startsWith('api/') ||
    sanitizedPath.startsWith('http://') ||
    sanitizedPath.startsWith('https://')
      ? sanitizedPath
      : `v1/${sanitizedPath}`;
  const url =
    versionedPath.startsWith('http://') || versionedPath.startsWith('https://')
      ? versionedPath
      : `${API_URL}${versionedPath}`;
  const headers = new Headers(options.headers);
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  const normalizedBody = normalizeJsonBody(options.body, isFormData);

  if (!headers.has('x-user-role')) {
    headers.set('x-user-role', 'BROKER');
  }
  if (!headers.has('x-user-id')) {
    const defaultUserId =
      process.env.NEXT_PUBLIC_DEFAULT_USER_ID?.trim() ??
      process.env.DEFAULT_USER_ID?.trim() ??
      process.env.NEXT_PUBLIC_USER_ID?.trim() ??
      'user-broker';
    headers.set('x-user-id', defaultUserId);
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

  const isRefreshEndpoint = versionedPath === 'v1/auth/refresh';

  const doFetch = () =>
    fetch(url, {
      ...options,
      body: normalizedBody,
      headers,
      cache: 'no-store',
      credentials: 'include'
    });

  let response = await doFetch();

  if (response.status === 401 && typeof window !== 'undefined' && !options.token && !isRefreshEndpoint) {
    const refreshed = await fetch(`${API_URL}v1/auth/refresh`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include'
    }).then((res) => res.ok).catch(() => false);

    if (refreshed) {
      response = await doFetch();
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw toApiError(payload, response.status, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiFetchText(path: string, options: FetchOptions = {}): Promise<string> {
  const sanitizedPath = path.replace(/^[\s/]+/, '');
  const versionedPath =
    sanitizedPath.length === 0 ||
    sanitizedPath.startsWith('v1/') ||
    sanitizedPath.startsWith('api/') ||
    sanitizedPath.startsWith('http://') ||
    sanitizedPath.startsWith('https://')
      ? sanitizedPath
      : `v1/${sanitizedPath}`;
  const url =
    versionedPath.startsWith('http://') || versionedPath.startsWith('https://')
      ? versionedPath
      : `${API_URL}${versionedPath}`;
  const headers = new Headers(options.headers);
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  const normalizedBody = normalizeJsonBody(options.body, isFormData);

  if (!headers.has('x-user-role')) {
    headers.set('x-user-role', 'BROKER');
  }
  if (!headers.has('x-user-id')) {
    const defaultUserId =
      process.env.NEXT_PUBLIC_DEFAULT_USER_ID?.trim() ??
      process.env.DEFAULT_USER_ID?.trim() ??
      process.env.NEXT_PUBLIC_USER_ID?.trim() ??
      'user-broker';
    headers.set('x-user-id', defaultUserId);
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

  const isRefreshEndpoint = versionedPath === 'v1/auth/refresh';

  const doFetch = () =>
    fetch(url, {
      ...options,
      body: normalizedBody,
      headers,
      cache: 'no-store',
      credentials: 'include'
    });

  let response = await doFetch();

  if (response.status === 401 && typeof window !== 'undefined' && !options.token && !isRefreshEndpoint) {
    const refreshed = await fetch(`${API_URL}v1/auth/refresh`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include'
    }).then((res) => res.ok).catch(() => false);

    if (refreshed) {
      response = await doFetch();
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    throw toApiError(payload, response.status, payload);
  }

  return response.text();
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
  leadType?: 'BUYER' | 'SELLER' | 'UNKNOWN';
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

export async function getPipelines(brokerageId?: string): Promise<Pipeline[]> {
  const id = encodeURIComponent(brokerageId ?? DEFAULT_BROKERAGE_ID);
  return apiFetch<Pipeline[]>(`pipelines?brokerageId=${id}`);
}

export interface ListLeadsParams {
  ownerId?: string;
  pipelineId?: string;
  stageId?: string[];
  scoreTier?: string[];
  leadType?: 'BUYER' | 'SELLER' | 'UNKNOWN';
  lastActivityDays?: number;
  preapproved?: boolean;
  limit?: number;
  cursor?: string | null;
  q?: string;
  signal?: AbortSignal;
}

export interface LeadListResponse {
  items: LeadSummary[];
  nextCursor?: string | null;
}

export async function getLeads(params: ListLeadsParams = {}): Promise<LeadListResponse> {
  const { cursor, q, signal, ...rest } = params;
  const searchParams = new URLSearchParams();
  if (rest.ownerId) searchParams.set('ownerId', rest.ownerId);
  if (rest.pipelineId) searchParams.set('pipelineId', rest.pipelineId);
  if (rest.stageId?.length) searchParams.set('stageId', rest.stageId.join(','));
  if (rest.scoreTier?.length) searchParams.set('scoreTier', rest.scoreTier.join(','));
  if (rest.leadType) searchParams.set('leadType', rest.leadType);
  if (rest.lastActivityDays) searchParams.set('lastActivityDays', String(rest.lastActivityDays));
  if (rest.preapproved !== undefined) searchParams.set('preapproved', String(rest.preapproved));
  if (rest.limit) searchParams.set('limit', String(rest.limit));
  if (cursor) searchParams.set('cursor', cursor);
  if (q) searchParams.set('q', q);
  const query = searchParams.toString();
  const path = query ? `leads?${query}` : 'leads';
  return apiFetch<LeadListResponse>(path, { signal });
}

export async function getLead(id: string): Promise<LeadDetail> {
  return apiFetch<LeadDetail>(`leads/${id}`);
}

export interface UpdateLeadPayload {
  ownerId?: string;
  pipelineId?: string;
  stageId?: string;
  leadType?: 'BUYER' | 'SELLER' | 'UNKNOWN';
  consentEmail?: boolean;
  consentSMS?: boolean;
  doNotContact?: boolean;
}

export async function updateLead(id: string, payload: UpdateLeadPayload) {
  return apiFetch<LeadDetail>(`leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export interface CreateLeadPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  gclid?: string;
  ownerId?: string;
  pipelineId?: string;
  stageId?: string;
  leadType?: 'BUYER' | 'SELLER' | 'UNKNOWN';
  consentEmail?: boolean;
  consentSMS?: boolean;
  doNotContact?: boolean;
  fit?: LeadDetail['fit'];
}

export async function createLead(payload: CreateLeadPayload) {
  return apiFetch<LeadDetail>('leads', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function createLeadNote(leadId: string, body: string) {
  return apiFetch<LeadNote>(`leads/${leadId}/notes`, {
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
  return apiFetch<LeadTask>(`leads/${leadId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateLeadTask(
  leadId: string,
  taskId: string,
  payload: Partial<CreateLeadTaskPayload>
) {
  return apiFetch<LeadTask>(`leads/${leadId}/tasks/${taskId}`, {
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
  customFields?: Record<string, unknown> | null;
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

export type InsightFilterOption = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  meta?: Record<string, unknown> | null;
};

export type InsightHeatmapCell = {
  key: string;
  label: string;
  leads: number;
  engaged: number;
  touchpoints: number;
  intensity: number;
};

export type InsightStageBottleneck = {
  stageId: string;
  stageName: string;
  avgTimeHours: number | null;
  conversionRate: number | null;
  stalled: number;
  touchpointsPerLead: number;
};

export type InsightAgentPerformance = {
  agentId: string;
  agentName: string;
  avatarUrl?: string | null;
  activeLeads: number;
  touchpoints: number;
  slaBreaches: number;
  avgResponseMinutes: number | null;
  conversionRate: number | null;
};

export type InsightActivityFeedEntry = {
  id: string;
  type: string;
  occurredAt: string;
  leadId: string;
  leadName: string;
  ownerName?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
};

export type InsightReengagementLead = {
  leadId: string;
  leadName: string;
  stageId?: string | null;
  stageName?: string | null;
  ownerName?: string | null;
  daysDormant: number;
  lastActivityAt?: string | null;
};

export type InsightTrendCard = {
  key: string;
  label: string;
  value: string;
  deltaLabel?: string | null;
  trend?: number | null;
};

export type InsightCopilotMessage = {
  message: string;
};

export type ClientInsightsSummary = {
  activeLeads: number;
  avgStageTimeHours: number | null;
  conversionPct: number | null;
  deltaWoW?: { conversionPct?: number | null } | null;
};

export type InsightHeatmapEntry = {
  stage: string;
  engaged: number;
  inactive: number;
};

export type InsightQueueBreach = {
  leadId: string;
  leadName: string;
  ownerName?: string | null;
  minutesOver: number;
  minutesOverLabel?: string | null;
};

export type InsightQueues = {
  reengage: InsightReengagementLead[];
  breaches: InsightQueueBreach[];
};

export type ClientInsightsPayload = {
  v: number;
  period: {
    label: string;
    days: number;
    start: string;
    end: string;
  };
  summary: ClientInsightsSummary;
  dataAge?: string | null;
  filters: {
    owners: InsightFilterOption[];
    tiers: InsightFilterOption[];
    activities: InsightFilterOption[];
    savedViews: InsightFilterOption[];
  };
  heatmap: InsightHeatmapEntry[];
  engagement: {
    byStage: InsightHeatmapCell[];
    byOwner: InsightHeatmapCell[];
    byTier: InsightHeatmapCell[];
  };
  bottlenecks: InsightStageBottleneck[];
  leaderboard: InsightAgentPerformance[];
  feed: InsightActivityFeedEntry[];
  activityFeed?: InsightActivityFeedEntry[];
  reengagementQueue: InsightReengagementLead[];
  queues: InsightQueues;
  trendCards: InsightTrendCard[];
  copilotInsights: InsightCopilotMessage[];
};

const nowIso = () => new Date().toISOString();

const EMPTY_CLIENT_INSIGHTS: ClientInsightsPayload = {
  v: 1,
  period: {
    label: '7 days',
    days: 7,
    start: nowIso(),
    end: nowIso()
  },
  summary: {
    activeLeads: 0,
    avgStageTimeHours: null,
    conversionPct: null,
    deltaWoW: null
  },
  dataAge: null,
  filters: {
    owners: [],
    tiers: [],
    activities: [],
    savedViews: []
  },
  heatmap: [],
  engagement: {
    byStage: [],
    byOwner: [],
    byTier: []
  },
  bottlenecks: [],
  leaderboard: [],
  feed: [],
  activityFeed: [],
  reengagementQueue: [],
  queues: { reengage: [], breaches: [] },
  trendCards: [],
  copilotInsights: []
};

export type ClientInsightsQueryParams = {
  tenantId?: string;
  ownerId?: string;
  teamId?: string;
  tier?: string;
  activity?: string;
  period?: string;
  dormantDays?: number;
  viewId?: string;
  stage?: string[] | string;
  limit?: number;
};

export type StartJourneyPayload = {
  leadId: string;
  templateId: string;
  source?: string;
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

export async function listContacts(tenantId?: string, params: Record<string, unknown> = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return apiFetch<ContactListResponse>(query ? `/contacts?${query}` : '/contacts');
}

export async function getContact(tenantId: string | undefined, personId: string) {
  const suffix = tenantId ? `?tenantId=${tenantId}` : '';
  return apiFetch<ContactDetails>(`/contacts/${personId}${suffix}`);
}

export interface UpdateContactPayload {
  tenantId: string;
  ownerId?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
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

export async function getClientInsights(params: ClientInsightsQueryParams = {}): Promise<ClientInsightsPayload> {
  const searchParams = new URLSearchParams();
  const tenant = params.tenantId ?? process.env.NEXT_PUBLIC_TENANT_ID ?? process.env.VITE_TENANT_ID;
  if (tenant) searchParams.set('tenantId', tenant);
  if (params.ownerId) searchParams.set('ownerId', params.ownerId);
  if (params.teamId) searchParams.set('teamId', params.teamId);
  if (params.tier) searchParams.set('tier', params.tier);
  if (params.activity) searchParams.set('activity', params.activity);
  if (Array.isArray(params.stage)) {
    params.stage.forEach((stageId) => {
      if (stageId) searchParams.append('stage', stageId);
    });
  } else if (params.stage) {
    searchParams.set('stage', params.stage);
  }
  if (params.period) searchParams.set('period', params.period);
  if (typeof params.dormantDays === 'number' && Number.isFinite(params.dormantDays)) {
    searchParams.set('dormantDays', String(params.dormantDays));
  }
  if (params.viewId) searchParams.set('viewId', params.viewId);
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    searchParams.set('limit', String(params.limit));
  }

  const suffix = searchParams.toString();

  try {
    return await apiFetch<ClientInsightsPayload>(suffix ? `/insights?${suffix}` : '/insights');
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      throw error;
    }
    console.error('Failed to load client insights', error);
    return EMPTY_CLIENT_INSIGHTS;
  }
}

export async function startJourney(payload: StartJourneyPayload) {
  return apiFetch<{ ok: boolean }>('/journeys/start', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
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
