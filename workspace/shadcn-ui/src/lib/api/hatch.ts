import type { ExtractedLabelValue } from '@hatch/shared';
import { ApiError, toApiError } from './errors';
import type { PersonaId } from '@/lib/ai/aiPersonas';

const ensureTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`);
const DEFAULT_API_PREFIX = '/api/v1';
const AUTH_STORAGE_KEY = 'hatch_auth_tokens';

const resolveApiBaseUrl = (value?: string) => {
  const fallback = `http://localhost:4000${DEFAULT_API_PREFIX}`;
  const candidate = value?.trim() || fallback;

  if (candidate.startsWith('/')) {
    return ensureTrailingSlash(candidate);
  }

  try {
    const url = new URL(candidate);
    const normalized = url.pathname?.replace(/\/+$/, '') || '';

    if (!normalized || normalized === '/' || normalized === '/api') {
      url.pathname = DEFAULT_API_PREFIX;
    } else if (normalized === DEFAULT_API_PREFIX || normalized.startsWith(`${DEFAULT_API_PREFIX}/`)) {
      url.pathname = normalized;
    } else if (normalized.startsWith('/api/')) {
      const remainder = normalized.slice('/api'.length);
      url.pathname = `${DEFAULT_API_PREFIX}${remainder}`;
    } else {
      const suffix = normalized.startsWith('/') ? normalized : `/${normalized}`;
      url.pathname = `${DEFAULT_API_PREFIX}${suffix}`;
    }

    return ensureTrailingSlash(url.toString());
  } catch {
    // If the value isn't a valid URL, fall back to the default.
    return ensureTrailingSlash(fallback);
  }
};

export const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const API_TOKEN = import.meta.env.VITE_API_TOKEN;
const CHAOS_MODE = (import.meta.env.VITE_CHAOS_MODE ?? 'false').toLowerCase() === 'true';
interface FetchOptions extends RequestInit {
  token?: string;
}

const readAuthFromStorage = () => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { accessToken?: string; user?: { id?: string; role?: string } };
  } catch {
    return null;
  }
};

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const sanitizedPath = path.replace(/^\/+/, '');
  let url: string;
  if (API_BASE_URL.startsWith('http')) {
    url = new URL(sanitizedPath, API_BASE_URL).toString();
  } else {
    const base = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
    url = `${base}${sanitizedPath}`.replace(/\/\/+/, '/');
  }
  const headers = new Headers(options.headers);
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const stored = readAuthFromStorage();
  if (stored?.user?.id && !headers.has('x-user-id')) {
    headers.set('x-user-id', stored.user.id);
  }
  if (!headers.has('x-user-role') && stored?.user?.role) {
    headers.set('x-user-role', stored.user.role.toUpperCase());
  }
  if (!headers.has('x-tenant-id')) {
    headers.set('x-tenant-id', import.meta.env.VITE_TENANT_ID || 'tenant-hatch');
  }
  if (!headers.has('x-org-id')) {
    headers.set('x-org-id', import.meta.env.VITE_ORG_ID || 'org-hatch');
  }

  if (!headers.has('Content-Type') && options.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  const storedToken = stored?.accessToken;
  const authToken = options.token ?? storedToken ?? API_TOKEN;
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  if (CHAOS_MODE) {
    const jitter = Math.floor(Math.random() * 250) + 50;
    await new Promise((resolve) => setTimeout(resolve, jitter));
    if (Math.random() < 0.05) {
      throw new ApiError('Chaos mode simulated failure', 503);
    }
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers,
  });

  if (!response.ok) {
    let payload: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
    } else {
      try {
        payload = await response.text();
      } catch {
        payload = undefined;
      }
    }

    throw toApiError(payload ?? response.statusText ?? 'request_failed', response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type ContactListItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  secondaryEmails: string[];
  primaryPhone: string | null;
  secondaryPhones: string[];
  stage: string;
  tags: string[];
  source: string | null;
  address: string | null;
  doNotContact: boolean;
  buyerRepStatus: 'ACTIVE' | 'NONE' | 'EXPIRED';
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  aiScore?: number | null;
  conversionLikelihood?: number | null;
  lastAiScoreAt?: string | null;
  consent: {
    email: {
      channel: 'EMAIL';
      status: string;
      scope: string | null;
      capturedAt: string | null;
    };
    sms: {
      channel: 'SMS';
      status: string;
      scope: string | null;
      capturedAt: string | null;
    };
  };
  hasOpenDeal: boolean;
  agreements: Array<{
    id: string;
    status: string;
    expiryDate: string | null;
  }>;
  owner?: {
    id: string;
    name: string;
    email: string;
    role: string;
    avatarUrl?: string | null;
  } | null;
  deletedAt: string | null;
};

export type ContactDetails = ContactListItem & {
  organizationId: string;
  aiScore?: number | null;
  conversionLikelihood?: number | null;
  lastAiScoreAt?: string | null;
  consents: Array<{
    id: string;
    channel: string;
    scope: string | null;
    status: string;
    capturedAt: string | null;
    verbatimText: string;
    source: string;
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
    body?: string | null;
    user?: {
      id: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }>;
  timeline: Array<{
    id: string;
    type: string;
    occurredAt: string;
    payload: unknown;
    actor?: {
      id: string | null;
      name: string | null;
    };
  }>;
};

export type ListingSummary = {
  id: string;
  status: string;
  title?: string | null;
  address?: string | null;
  updatedAt?: string | null;
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

export type ClearCooperationRow = {
  timerId: string;
  status: string;
  startedAt: string;
  deadlineAt: string | null;
};

export type BrokerDashboardSummary = {
  leadToKeptRate: number;
  toursWithBbaRate: number;
  deliverability: DeliverabilityRow[];
  deals: DealSummaryRow[];
  clearCooperation: ClearCooperationRow[];
};

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
  lastTouchpointAt?: string | null;
};

export type MessageChannelType = 'EMAIL' | 'SMS' | 'VOICE' | 'IN_APP';

export type LeadTouchpointType = 'MESSAGE' | 'CALL' | 'MEETING' | 'TASK' | 'NOTE' | 'OTHER';

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

export type LeadTouchpoint = {
  id: string;
  type: LeadTouchpointType;
  channel?: MessageChannelType | null;
  occurredAt: string;
  summary?: string | null;
  body?: string | null;
  metadata?: unknown;
  recordedBy?: LeadOwnerSummary;
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
  touchpoints: LeadTouchpoint[];
};

export type LeadListResponse = {
  items: LeadSummary[];
  nextCursor?: string | null;
};

export type ComplianceStatusResponse = {
  range: { start: string; end: string; days: number };
  filters: { agentIds: string[]; teamIds: string[]; mlsIds: string[] };
  quietHours: { startHour: number; endHour: number; timezone: string } | null;
  metrics: {
    buyerRepCoverage: { numerator: number; denominator: number; percentage: number };
    consentHealth: {
      sms: { granted: number; revoked: number; unknown: number; health: number };
      email: { granted: number; revoked: number; unknown: number; health: number };
    };
    clearCooperation: { total: number; yellow: number; red: number; dueSoon: number };
    idxCompliance: { failuresLast7Days: number; totalChecksLast7Days: number };
    messagingReadiness: {
      tenDlcApproved: boolean;
      dmarcAligned: boolean;
      lastOverride: { id: string; context: string; occurredAt: string } | null;
    };
    alerts: {
      coopDueSoon: boolean;
      optOutSpike: boolean;
    };
  };
};

export type ComplianceAgreementRow = {
  tourId: string;
  startAt: string;
  person: { id: string; name: string };
  agent: { id: string; name: string } | null;
  listing: { id: string; address: string } | null;
  status: 'LINKED' | 'ACTIVE' | 'EXPIRED' | 'MISSING';
  agreement: { id: string; effectiveDate: string | null; expiryDate: string | null } | null;
  linkedAt: string | null;
};

export type ComplianceAgreementsResponse = {
  count: number;
  missing: number;
  expired: number;
  rows: ComplianceAgreementRow[];
};

export type ComplianceConsentsResponse = {
  summary: ComplianceStatusResponse['metrics']['consentHealth'];
  anomalies: {
    optOutSpike: {
      detected: boolean;
      recentCount: number;
      baselineDaily: number;
    };
  };
  recentRevocations: Array<{
    id: string;
    channel: 'SMS' | 'EMAIL' | 'VOICE';
    scope: 'PROMOTIONAL' | 'TRANSACTIONAL';
    revokedAt: string | null;
    person: { id: string; name: string };
  }>;
  baselineWindowStart: string;
};

export type ComplianceListingRow = {
  id: string;
  status: 'GREEN' | 'YELLOW' | 'RED';
  dueAt: string | null;
  dueInHours: number | null;
  dueSoon: boolean;
  riskReason: string | null;
  lastAction: string | null;
  lastActor: { id: string; name: string } | null;
  listing: { id: string; address: string } | null;
  mlsProfile: { id: string; name: string } | null;
};

export type ComplianceListingsResponse = {
  count: number;
  overdue: number;
  dueSoon: number;
  rows: ComplianceListingRow[];
};

export type ComplianceDisclaimersResponse = {
  policies: Array<{
    id: string;
    mlsProfile: { id: string; name: string };
    requiredText: string;
    requiredPlacement: string;
    compensationRule: string;
    lastReviewedAt: string;
  }>;
  failures: Array<{
    id: string;
    occurredAt: string;
    result: string | null;
    listing: { id: string; address: string } | null;
    mlsProfile: { id: string; name: string } | null;
  }>;
};

export type ComplianceOverride = {
  id: string;
  context: string;
  reasonText?: string | null;
  metadata?: unknown;
  occurredAt: string;
  actor: { id: string; name: string; email: string } | null;
};

export type CalendarEventRecord = {
  id: string;
  tenantId: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  eventType: 'SHOWING' | 'MEETING' | 'INSPECTION' | 'CLOSING' | 'FOLLOW_UP' | 'MARKETING' | 'OTHER';
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  location?: string | null;
  notes?: string | null;
  assignedAgentId?: string | null;
  personId?: string | null;
  listingId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamMemberRecord = {
  id: string;
  tenantId: string;
  orgId?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: 'active' | 'inactive' | 'pending';
  experienceYears?: number | null;
  rating: number;
  totalSales: number;
  dealsInProgress: number;
  openLeads: number;
  responseTimeHours: number;
  joinedAt: string;
  lastActiveAt: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTeamMemberRequest = {
  tenantId: string;
  orgId?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status?: TeamMemberRecord['status'];
  experienceYears?: number;
  rating?: number;
  totalSales?: number;
  dealsInProgress?: number;
  openLeads?: number;
  responseTimeHours?: number;
  joinedAt?: string;
  lastActiveAt?: string;
  notes?: string | null;
};

export type UpdateTeamMemberRequest = Partial<Omit<CreateTeamMemberRequest, 'tenantId'>> & {
  tenantId?: string;
};

export type ContactListResponse = {
  items: ContactListItem[];
  nextCursor: string | null;
  savedView?: {
    id: string;
    name: string;
    filters: unknown;
    isDefault: boolean;
  } | null;
};

export type ContactSavedView = {
  id: string;
  name: string;
  filters: unknown;
  isDefault: boolean;
};

export type ConversationParticipant = {
  id: string;
  role: 'OWNER' | 'MEMBER' | 'VIEWER';
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    role?: string | null;
    avatarUrl?: string | null;
  } | null;
  person?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
  } | null;
  joinedAt: string;
  muted: boolean;
  lastReadAt?: string | null;
};

export type ConversationAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum?: string | null;
  scanned: boolean;
  storageKey: string;
  downloadUrl: string | null;
  expiresAt: string | null;
};

export type ConversationMessageReceipt = {
  participantId: string;
  status: 'DELIVERED' | 'READ';
  recordedAt: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  userId: string | null;
  personId: string | null;
  body: string | null;
  createdAt: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'BOUNCED' | 'FAILED' | 'BLOCKED' | 'READ';
  direction: 'INBOUND' | 'OUTBOUND';
  attachments: ConversationAttachment[];
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string | null;
  } | null;
  receipts?: ConversationMessageReceipt[];
};

export type ConversationListItem = {
  id: string;
  tenantId: string;
  type: 'EXTERNAL' | 'INTERNAL';
  person?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
  } | null;
  participants: ConversationParticipant[];
  lastMessage?: ConversationMessage | null;
  unreadCount: number;
  updatedAt: string;
};

export type ConversationListResponse = {
  items: ConversationListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ConversationDetail = ConversationListItem & {
  messages: ConversationMessage[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type AttachmentUploadResponse = {
  token: string;
  storageKey: string;
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  expiresAt: string;
  conversationId: string;
};

export async function listContacts(tenantId: string, params: Record<string, unknown> = {}) {
  const searchParams = new URLSearchParams({ tenantId });
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.filter((v) => v !== undefined && v !== null && v !== '').forEach((entry) => {
        searchParams.append(key, String(entry));
      });
    } else {
      searchParams.set(key, String(value));
    }
  }
  return apiFetch<ContactListResponse>(`/contacts?${searchParams.toString()}`);
}

export async function searchContacts(params: { query: string; limit?: number; tenantId?: string }) {
  const searchParams = new URLSearchParams({ q: params.query });
  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }
  const tenantId = params.tenantId ?? import.meta.env.VITE_TENANT_ID ?? 'tenant-hatch';
  if (tenantId) {
    searchParams.set('tenantId', tenantId);
  }
  return apiFetch<ContactListResponse>(`/contacts?${searchParams.toString()}`);
}

export async function getContact(contactId: string, tenantId: string) {
  return apiFetch<ContactDetails>(`/contacts/${contactId}?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function createContact(payload: Record<string, unknown>) {
  return apiFetch<ContactListItem>('/contacts', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateContact(contactId: string, payload: Record<string, unknown>) {
  return apiFetch<ContactListItem>(`/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteContact(contactId: string, tenantId: string) {
  return apiFetch(`/contacts/${contactId}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'DELETE'
  });
}

export async function restoreContact(contactId: string, tenantId: string) {
  return apiFetch<ContactDetails>(`/contacts/${contactId}/restore?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'POST'
  });
}

export interface ConvertToOpportunityResponse {
  opportunity: Record<string, unknown>;
  account: Record<string, unknown>;
  message: string;
}

export async function convertContactToOpportunity(
  contactId: string,
  options?: { opportunityName?: string; accountName?: string }
) {
  return apiFetch<ConvertToOpportunityResponse>(`/contacts/${contactId}/convert-to-opportunity`, {
    method: 'POST',
    body: JSON.stringify(options || {})
  });
}

export const getPipelines = () => apiFetch<Pipeline[]>('/pipelines');

export interface ListLeadsParams {
  ownerId?: string;
  pipelineId?: string;
  stageId?: string[];
  scoreTier?: string[];
  lastActivityDays?: number;
  preapproved?: boolean;
  limit?: number;
}

export async function getLeads(params: ListLeadsParams = {}) {
  const search = new URLSearchParams();
  if (params.ownerId) search.set('ownerId', params.ownerId);
  if (params.pipelineId) search.set('pipelineId', params.pipelineId);
  if (params.stageId?.length) search.set('stageId', params.stageId.join(','));
  if (params.scoreTier?.length) search.set('scoreTier', params.scoreTier.join(','));
  if (params.lastActivityDays) search.set('lastActivityDays', String(params.lastActivityDays));
  if (params.preapproved !== undefined) search.set('preapproved', String(params.preapproved));
  if (params.limit) search.set('limit', String(params.limit));

  const query = search.toString();
  const path = query ? `/leads?${query}` : '/leads';
  return apiFetch<LeadListResponse>(path);
}

export const getLead = (leadId: string) => apiFetch<LeadDetail>(`/leads/${leadId}`);

export interface UpdateLeadPayload {
  // Identity/contact
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  gclid?: string;

  // Ownership & pipeline
  ownerId?: string | null;
  pipelineId?: string;
  stageId?: string;

  // Communication consent
  consentEmail?: boolean;
  consentSMS?: boolean;
  doNotContact?: boolean;

  // Fit & notes
  fit?: {
    preapproved?: boolean;
    budgetMin?: number | null;
    budgetMax?: number | null;
    timeframeDays?: number | null;
    geo?: string | null;
  } | null;
  notes?: string;
}

export const updateLead = (leadId: string, payload: UpdateLeadPayload) =>
  apiFetch<LeadDetail>(`/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export type CreateLeadPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  ownerId?: string;
  pipelineId?: string;
  stageId?: string;
  consentEmail?: boolean;
  consentSMS?: boolean;
};

export const createLead = (payload: CreateLeadPayload) =>
  apiFetch<LeadDetail>('/leads', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export interface CreateLeadTouchpointPayload {
  type: LeadTouchpointType;
  channel?: MessageChannelType;
  summary?: string;
  body?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

export interface RecordLeadTouchpointResponse {
  touchpoint: LeadTouchpoint;
  lead: LeadSummary;
}

export const createLeadTouchpoint = (leadId: string, payload: CreateLeadTouchpointPayload) =>
  apiFetch<RecordLeadTouchpointResponse>(`/leads/${leadId}/touchpoints`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createLeadNote = (leadId: string, body: string) =>
  apiFetch<LeadNote>(`/leads/${leadId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body })
  });

export interface CreateLeadTaskPayload {
  title: string;
  assigneeId?: string;
  dueAt?: string;
  status?: string;
}

export const createLeadTask = (leadId: string, payload: CreateLeadTaskPayload) =>
  apiFetch<LeadTask>(`/leads/${leadId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateLeadTask = (
  leadId: string,
  taskId: string,
  payload: Partial<CreateLeadTaskPayload>
) =>
  apiFetch<LeadTask>(`/leads/${leadId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export async function getBrokerDashboard(tenantId: string) {
  return apiFetch<BrokerDashboardSummary>(`/dashboards/broker?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function getComplianceStatus(
  tenantId: string,
  options: { start?: string; end?: string; agentIds?: string[]; teamIds?: string[]; mlsIds?: string[] } = {}
) {
  const params = new URLSearchParams({ tenantId });
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);
  if (options.agentIds && options.agentIds.length > 0) {
    params.set('agentIds', options.agentIds.join(','));
  }
  if (options.teamIds && options.teamIds.length > 0) {
    params.set('teamIds', options.teamIds.join(','));
  }
  if (options.mlsIds && options.mlsIds.length > 0) {
    params.set('mlsIds', options.mlsIds.join(','));
  }
  return apiFetch<ComplianceStatusResponse>(`/compliance/status?${params.toString()}`);
}

const buildComplianceQuery = (
  tenantId: string,
  options: { start?: string; end?: string; agentIds?: string[]; teamIds?: string[]; mlsIds?: string[] } = {}
) => {
  const params = new URLSearchParams({ tenantId });
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);
  if (options.agentIds && options.agentIds.length > 0) params.set('agentIds', options.agentIds.join(','));
  if (options.teamIds && options.teamIds.length > 0) params.set('teamIds', options.teamIds.join(','));
  if (options.mlsIds && options.mlsIds.length > 0) params.set('mlsIds', options.mlsIds.join(','));
  return params.toString();
};

export async function getComplianceAgreements(
  tenantId: string,
  options: { start?: string; end?: string; agentIds?: string[]; teamIds?: string[]; mlsIds?: string[] } = {}
) {
  const query = buildComplianceQuery(tenantId, options);
  return apiFetch<ComplianceAgreementsResponse>(`/compliance/agreements?${query}`);
}

export async function getComplianceConsents(
  tenantId: string,
  options: { start?: string; end?: string; agentIds?: string[]; teamIds?: string[]; mlsIds?: string[] } = {}
) {
  const query = buildComplianceQuery(tenantId, options);
  return apiFetch<ComplianceConsentsResponse>(`/compliance/consents?${query}`);
}

export async function getComplianceListings(
  tenantId: string,
  options: { start?: string; end?: string; agentIds?: string[]; teamIds?: string[]; mlsIds?: string[] } = {}
) {
  const query = buildComplianceQuery(tenantId, options);
  return apiFetch<ComplianceListingsResponse>(`/compliance/listings?${query}`);
}

export async function getComplianceDisclaimers(
  tenantId: string,
  options: { start?: string; end?: string; agentIds?: string[]; teamIds?: string[]; mlsIds?: string[] } = {}
) {
  const query = buildComplianceQuery(tenantId, options);
  return apiFetch<ComplianceDisclaimersResponse>(`/compliance/disclaimers?${query}`);
}

export async function getComplianceOverrides(
  tenantId: string,
  options: { context?: string } = {}
) {
  const params = new URLSearchParams({ tenantId });
  if (options.context) params.set('context', options.context);
  return apiFetch<ComplianceOverride[]>(`/compliance/overrides?${params.toString()}`);
}

export async function createComplianceOverride(payload: {
  tenantId: string;
  actorUserId?: string;
  context: string;
  reasonText?: string;
}) {
  return apiFetch<ComplianceOverride>('/compliance/overrides', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function exportComplianceStatus(
  tenantId: string,
  options: { start?: string; end?: string; agentIds?: string[]; teamIds?: string[]; mlsIds?: string[] } = {}
) {
  const response = await fetch(`${API_BASE_URL}/compliance/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenantId, ...options })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'export_failed');
  }

  return response.blob();
}

export async function listListings(tenantId: string) {
  return apiFetch<ListingSummary[]>(`/listings?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function listConversations(
  tenantId: string,
  params: { type?: 'EXTERNAL' | 'INTERNAL'; page?: number; pageSize?: number; search?: string } = {}
) {
  const searchParams = new URLSearchParams();
  searchParams.set('tenantId', tenantId);
  if (params.type) {
    searchParams.set('type', params.type);
  }
  if (typeof params.page === 'number') {
    searchParams.set('page', params.page.toString());
  }
  if (typeof params.pageSize === 'number') {
    searchParams.set('pageSize', params.pageSize.toString());
  }
  if (params.search) {
    searchParams.set('search', params.search);
  }
  return apiFetch<ConversationListResponse>(`/conversations?${searchParams.toString()}`);
}

export async function getConversation(
  conversationId: string,
  tenantId: string,
  options: { cursor?: string | null; limit?: number } = {}
) {
  const searchParams = new URLSearchParams({ tenantId });
  if (options.cursor) {
    searchParams.set('cursor', options.cursor);
  }
  if (options.limit) {
    searchParams.set('limit', String(options.limit));
  }
  return apiFetch<ConversationDetail>(`/conversations/${conversationId}?${searchParams.toString()}`);
}

export async function createConversation(payload: {
  tenantId: string;
  type: 'EXTERNAL' | 'INTERNAL';
  personId?: string;
  participantUserIds?: string[];
  topic?: string;
}) {
  return apiFetch<ConversationDetail>('/conversations', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function postConversationMessage(
  conversationId: string,
  payload: { tenantId: string; body: string; attachmentTokens?: string[]; replyToMessageId?: string }
) {
  return apiFetch<ConversationMessage>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function markConversationRead(
  conversationId: string,
  payload: { tenantId: string; upToMessageId?: string }
) {
  return apiFetch<{ conversationId: string; lastReadAt: string; readCount: number }>(
    `/conversations/${conversationId}/read`,
    {
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

export async function addConversationParticipants(
  conversationId: string,
  payload: { tenantId: string; userIds: string[] }
) {
  return apiFetch<ConversationDetail>(`/conversations/${conversationId}/participants`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function removeConversationParticipant(
  conversationId: string,
  participantId: string,
  tenantId: string
) {
  return apiFetch<{ id: string }>(
    `/conversations/${conversationId}/participants/${participantId}?tenantId=${encodeURIComponent(tenantId)}`,
    {
      method: 'DELETE'
    }
  );
}

export async function requestConversationAttachment(
  conversationId: string,
  payload: { tenantId: string; filename: string; mimeType: string; size: number; checksum?: string; storageKey?: string }
) {
  return apiFetch<AttachmentUploadResponse>(`/conversations/${conversationId}/attachments`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function listCalendarEvents(
  tenantId: string,
  options: { start?: string; end?: string; assignedAgentId?: string } = {}
) {
  const params = new URLSearchParams({ tenantId });
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);
  if (options.assignedAgentId) params.set('assignedAgentId', options.assignedAgentId);
  return apiFetch<CalendarEventRecord[]>(`/calendar?${params.toString()}`);
}

export async function createCalendarEvent(payload: Record<string, unknown>) {
  return apiFetch<CalendarEventRecord>('/calendar', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateCalendarEvent(eventId: string, payload: Record<string, unknown>) {
  return apiFetch<CalendarEventRecord>(`/calendar/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteCalendarEvent(eventId: string) {
  return apiFetch(`/calendar/${eventId}`, { method: 'DELETE' });
}

export async function listTeamMembers(tenantId: string) {
  return apiFetch<TeamMemberRecord[]>(`/team?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function assignContactOwner(
  contactId: string,
  payload: { tenantId: string; ownerId: string; notify?: boolean; reason?: string }
) {
  return apiFetch(`/contacts/${contactId}/assign`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function listContactViews(tenantId: string) {
  return apiFetch<ContactSavedView[]>(`/contacts/views?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function saveContactView(payload: { tenantId: string; name: string; filters: unknown; isDefault?: boolean }) {
  return apiFetch<ContactSavedView>('/contacts/views', {
    method: 'POST',
    body: JSON.stringify({ ...payload, filters: JSON.stringify(payload.filters ?? {}) })
  });
}

export async function deleteContactView(viewId: string, tenantId: string) {
  return apiFetch(`/contacts/views/${viewId}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'DELETE'
  });
}

export async function createTeamMember(payload: CreateTeamMemberRequest) {
  return apiFetch<TeamMemberRecord>('/team', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateTeamMemberApi(id: string, payload: UpdateTeamMemberRequest) {
  return apiFetch<TeamMemberRecord>(`/team/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteTeamMember(id: string) {
  return apiFetch(`/team/${id}`, { method: 'DELETE' });
}

// Lead Routing Desk

export type LeadRoutingConsentRequirement = 'OPTIONAL' | 'GRANTED' | 'NOT_REVOKED';

export type LeadRoutingGeographyCondition = {
  includeStates?: string[];
  includeCities?: string[];
  includePostalCodes?: string[];
  excludeStates?: string[];
  excludeCities?: string[];
  excludePostalCodes?: string[];
};

export type LeadRoutingPriceBandCondition = {
  min?: number;
  max?: number;
};

export type LeadRoutingSourceCondition = {
  include?: string[];
  exclude?: string[];
};

export type LeadRoutingConsentCondition = {
  sms?: LeadRoutingConsentRequirement;
  email?: LeadRoutingConsentRequirement;
};

export type LeadRoutingConditions = {
  geography?: LeadRoutingGeographyCondition;
  priceBand?: LeadRoutingPriceBandCondition;
  sources?: LeadRoutingSourceCondition;
  consent?: LeadRoutingConsentCondition;
  buyerRep?: 'ANY' | 'REQUIRED_ACTIVE' | 'PROHIBIT_ACTIVE';
  timeWindows?: Array<{
    timezone: string;
    start: string;
    end: string;
    days?: number[];
  }>;
};

export type LeadRoutingTarget =
  | { type: 'AGENT'; id: string; label?: string }
  | { type: 'TEAM'; id: string; strategy?: 'BEST_FIT' | 'ROUND_ROBIN'; includeRoles?: string[] }
  | { type: 'POND'; id: string; label?: string };

export type LeadRoutingFallback = {
  teamId: string;
  label?: string;
  escalationChannels?: Array<'EMAIL' | 'SMS' | 'IN_APP'>;
};

export type LeadRoutingRule = {
  id: string;
  tenantId: string;
  name: string;
  priority: number;
  mode: 'FIRST_MATCH' | 'SCORE_AND_ASSIGN';
  enabled: boolean;
  conditions: LeadRoutingConditions;
  targets: LeadRoutingTarget[];
  fallback?: LeadRoutingFallback | null;
  slaFirstTouchMinutes?: number | null;
  slaKeptAppointmentMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadRoutingRulePayload = {
  name: string;
  priority: number;
  mode: 'FIRST_MATCH' | 'SCORE_AND_ASSIGN';
  enabled?: boolean;
  conditions?: LeadRoutingConditions;
  targets: LeadRoutingTarget[];
  fallback?: LeadRoutingFallback | null;
  slaFirstTouchMinutes?: number | null;
  slaKeptAppointmentMinutes?: number | null;
};

export type RoutingDecisionCandidate = {
  agentId: string;
  fullName: string;
  status: 'SELECTED' | 'REJECTED' | 'DISQUALIFIED';
  score?: number;
  reasons: string[];
  capacityRemaining: number;
  consentReady: boolean;
  tenDlcReady: boolean;
  teamIds: string[];
};

export type LeadRouteEventRecord = {
  id: string;
  tenantId: string;
  leadId: string;
  matchedRuleId?: string | null;
  mode: 'FIRST_MATCH' | 'SCORE_AND_ASSIGN';
  payload: Record<string, unknown>;
  candidates: RoutingDecisionCandidate[];
  assignedAgentId?: string | null;
  fallbackUsed: boolean;
  reasonCodes?: string[] | null;
  slaDueAt?: string | null;
  slaSatisfiedAt?: string | null;
  slaBreachedAt?: string | null;
  createdAt: string;
};

export type RoutingCapacityAgent = {
  agentId: string;
  name: string;
  activePipeline: number;
  capacityTarget: number;
  capacityRemaining: number;
  keptApptRate: number;
  teamIds: string[];
};

export type RoutingSlaTimerRecord = {
  id: string;
  tenantId: string;
  leadId: string;
  ruleId?: string | null;
  assignedAgentId?: string | null;
  type: 'FIRST_TOUCH' | 'KEPT_APPOINTMENT';
  status: string;
  dueAt: string;
  satisfiedAt: string | null;
  breachedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RoutingSlaDashboard = {
  summary: {
    total: number;
    pending: number;
    breached: number;
    satisfied: number;
  };
  timers: RoutingSlaTimerRecord[];
};

export type RoutingMetricsSummary = {
  firstTouch: {
    count: number;
    averageMinutes: number | null;
  };
  breach: {
    firstTouch: { total: number; breached: number; percentage: number };
    keptAppointment: { total: number; breached: number; percentage: number };
  };
  rules: Array<{ ruleId: string; ruleName: string; total: number; keptRate: number }>;
  agents: Array<{ agentId: string; agentName: string; total: number; keptRate: number }>;
};

export async function fetchRoutingRules(tenantId: string) {
  return apiFetch<LeadRoutingRule[]>(`/routing/rules?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function createRoutingRule(tenantId: string, payload: LeadRoutingRulePayload) {
  return apiFetch<LeadRoutingRule>(`/routing/rules?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      conditions: payload.conditions ?? {},
      fallback: payload.fallback ?? null
    })
  });
}

export async function updateRoutingRule(id: string, tenantId: string, payload: Partial<LeadRoutingRulePayload>) {
  return apiFetch<LeadRoutingRule>(`/routing/rules/${id}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function deleteRoutingRule(id: string, tenantId: string) {
  return apiFetch(`/routing/rules/${id}?tenantId=${encodeURIComponent(tenantId)}`, { method: 'DELETE' });
}

export async function fetchRoutingCapacity(tenantId: string) {
  return apiFetch<RoutingCapacityAgent[]>(`/routing/capacity?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function fetchRoutingSla(tenantId: string) {
  return apiFetch<RoutingSlaDashboard>(`/routing/sla?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function processRoutingSla(tenantId: string) {
  return apiFetch<{ processed: number }>(`/routing/sla/process?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'POST'
  });
}

export async function fetchRoutingMetrics(tenantId: string) {
  return apiFetch<RoutingMetricsSummary>(`/routing/metrics?tenantId=${encodeURIComponent(tenantId)}`);
}

export async function fetchRoutingEvents(params: { tenantId: string; limit?: number; cursor?: string }) {
  const search = new URLSearchParams({ tenantId: params.tenantId });
  if (params.limit) search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  return apiFetch<LeadRouteEventRecord[]>(`/routing/events?${search.toString()}`);
}

// Commission Plans

export type CommissionPlan = {
  id: string;
  tenantId?: string;
  orgId?: string;
  name: string;
  brokerSplit: number;
  agentSplit: number;
  tiers?: Array<Record<string, unknown>> | null;
  type: 'FLAT' | 'TIERED' | 'CAP';
  description?: string | null;
  definition: unknown;
  postCapFee?: unknown | null;
  bonusRules?: unknown | null;
  isArchived?: boolean;
  version?: number;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommissionPlanAssignment = {
  id: string;
  tenantId: string;
  assigneeType: 'USER' | 'TEAM';
  assigneeId: string;
  planId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  priority: number;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CapProgressItem = {
  id: string;
  userId: string;
  userName: string;
  plan: { id: string; name: string; type: 'FLAT' | 'TIERED' | 'CAP' };
  capAmount: number;
  companyDollarYtd: number;
  postCapFeesYtd: number;
  progressPct: number;
  periodStart: string;
  periodEnd: string;
  lastDealId?: string | null;
};

export type CreateCommissionPlanPayload = {
  name: string;
  type: 'FLAT' | 'TIERED' | 'CAP';
  description?: string;
  definition: unknown;
  postCapFee?: { type: 'FLAT' | 'PERCENTAGE'; amount: number };
  bonusRules?: unknown;
  archived?: boolean;
};

export type UpdateCommissionPlanPayload = Partial<CreateCommissionPlanPayload>;

export type AssignCommissionPlanPayload = {
  assigneeType: 'USER' | 'TEAM';
  assigneeId: string;
  planId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  priority?: number;
};

export async function fetchCommissionPlans() {
  const response = await apiFetch<
    | Array<{
        id: string;
        orgId?: string;
        name: string;
        brokerSplit: number;
        agentSplit: number;
        tiers?: Array<Record<string, unknown>> | null;
        createdAt: string;
        updatedAt?: string;
      }>
    | {
        items: Array<{
          id: string;
          orgId?: string;
          name: string;
          brokerSplit: number;
          agentSplit: number;
          tiers?: Array<Record<string, unknown>> | null;
          createdAt: string;
          updatedAt?: string;
        }>;
      }
  >('/commission-plans');

  const plans = Array.isArray(response) ? response : (response as any)?.items;
  if (!Array.isArray(plans)) {
    return [];
  }

  return plans.map(normalizeCommissionPlan);
}

export async function createCommissionPlan(payload: CreateCommissionPlanPayload) {
  const brokerSplit =
    typeof (payload as any)?.definition?.split?.brokerage === 'number'
      ? (payload as any).definition.split.brokerage
      : 0.3;
  const agentSplit =
    typeof (payload as any)?.definition?.split?.agent === 'number'
      ? (payload as any).definition.split.agent
      : 0.7;

  const body: Record<string, unknown> = {
    name: payload.name,
    brokerSplit,
    agentSplit
  };

  const tiersCandidate = (payload as any)?.definition?.tiers ?? (payload as any)?.tiers;
  if (Array.isArray(tiersCandidate)) {
    body.tiers = tiersCandidate;
  }

  const plan = await apiFetch<{
    id: string;
    orgId?: string;
    name: string;
    brokerSplit: number;
    agentSplit: number;
    tiers?: Array<Record<string, unknown>> | null;
    createdAt: string;
    updatedAt?: string;
  }>('/commission-plans', {
    method: 'POST',
    body
  });

  return normalizeCommissionPlan(plan);
}

export async function updateCommissionPlan(id: string, payload: UpdateCommissionPlanPayload) {
  const body: Record<string, unknown> = {};

  if (payload.name !== undefined) {
    body.name = payload.name;
  }

  const brokerSplit = (payload as any)?.definition?.split?.brokerage;
  if (typeof brokerSplit === 'number') {
    body.brokerSplit = brokerSplit;
  } else if (typeof (payload as any)?.brokerSplit === 'number') {
    body.brokerSplit = (payload as any).brokerSplit;
  }

  const agentSplit = (payload as any)?.definition?.split?.agent;
  if (typeof agentSplit === 'number') {
    body.agentSplit = agentSplit;
  } else if (typeof (payload as any)?.agentSplit === 'number') {
    body.agentSplit = (payload as any).agentSplit;
  }

  const tiersCandidate = (payload as any)?.definition?.tiers ?? (payload as any)?.tiers;
  if (Array.isArray(tiersCandidate)) {
    body.tiers = tiersCandidate;
  }

  const plan = await apiFetch<{
    id: string;
    orgId?: string;
    name: string;
    brokerSplit: number;
    agentSplit: number;
    tiers?: Array<Record<string, unknown>> | null;
    createdAt: string;
    updatedAt?: string;
  }>(`/commission-plans/${id}`, {
    method: 'PATCH',
    body
  });

  return normalizeCommissionPlan(plan);
}

export async function archiveCommissionPlan(id: string) {
  return apiFetch<{ id: string }>(`/commission-plans/${id}/archive`, {
    method: 'POST'
  });
}

export async function fetchCommissionPlan(id: string) {
  const plan = await apiFetch<{
    id: string;
    orgId?: string;
    name: string;
    brokerSplit: number;
    agentSplit: number;
    tiers?: Array<Record<string, unknown>> | null;
    createdAt: string;
    updatedAt?: string;
  }>(`/commission-plans/${id}`);
  return normalizeCommissionPlan(plan);
}

function normalizeCommissionPlan(plan: {
  id: string;
  orgId?: string;
  name: string;
  brokerSplit: number | string;
  agentSplit: number | string;
  tiers?: Array<Record<string, unknown>> | null;
  createdAt: string;
  updatedAt?: string;
}): CommissionPlan {
  const toNumber = (value: number | string | undefined, fallback: number) => {
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const brokerSplit = toNumber(plan.brokerSplit, 0.3);
  const agentSplit = toNumber(plan.agentSplit, 0.7);

  return {
    id: plan.id,
    tenantId: plan.orgId,
    orgId: plan.orgId,
    name: plan.name,
    brokerSplit,
    agentSplit,
    tiers: plan.tiers ?? null,
    type: 'FLAT',
    description: null,
    definition: {
      type: 'FLAT',
      split: { brokerage: brokerSplit, agent: agentSplit },
      tiers: plan.tiers ?? []
    },
    postCapFee: null,
    bonusRules: null,
    isArchived: false,
    version: 1,
    createdById: null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt ?? plan.createdAt
  };
}

export async function fetchCommissionPlanAssignments(planId: string) {
  return apiFetch<CommissionPlanAssignment[]>(`/commission-plans/${planId}/assignments`);
}

export async function assignCommissionPlan(planId: string, payload: AssignCommissionPlanPayload) {
  return apiFetch<CommissionPlanAssignment>(`/commission-plans/${planId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, planId })
  });
}

export async function endCommissionPlanAssignment(assignmentId: string, effectiveTo?: string | null) {
  return apiFetch<CommissionPlanAssignment>(`/commission-plans/assignments/${assignmentId}/end`, {
    method: 'POST',
    body: JSON.stringify({ effectiveTo })
  });
}

export async function fetchCapProgress(params: { userId?: string; teamId?: string; periodStart?: string; periodEnd?: string }) {
  const search = new URLSearchParams();
  if (params.userId) search.set('userId', params.userId);
  if (params.teamId) search.set('teamId', params.teamId);
  if (params.periodStart) search.set('periodStart', params.periodStart);
  if (params.periodEnd) search.set('periodEnd', params.periodEnd);
  const query = search.toString();
  return apiFetch<CapProgressItem[]>(`/commission-plans/cap-progress${query ? `?${query}` : ''}`);
}

type CanonicalDraftAddress = {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

type CanonicalDraftDetails = {
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

type CanonicalDraft = {
  source: {
    ingest_type: string;
    vendor?: string;
    document_version?: string;
    mls_number?: string | null;
  };
  basic: {
    status: string;
    listing_status?: string | null;
    property_type?: string | null;
    list_price?: number | null;
    price_currency?: string | null;
    address?: CanonicalDraftAddress | null;
  };
  details: CanonicalDraftDetails;
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
    missing?: string[];
    warnings?: string[];
    issues?: string[];
  };
};

export interface DraftPdfUploadResponse {
  tenantId: string | null;
  filename: string;
  mimeType: string;
  draft: CanonicalDraft;
  matches: Array<{
    canonical: string;
    score: number;
    raw?: { label?: string };
  }>;
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

export async function getClientInsights(params: ClientInsightsQueryParams = {}): Promise<ClientInsightsPayload> {
  const tenant = params.tenantId ?? import.meta.env.VITE_TENANT_ID ?? 'tenant-hatch';
  const searchParams = new URLSearchParams();
  if (params.ownerId) searchParams.set('ownerId', params.ownerId);
  if (params.teamId) searchParams.set('teamId', params.teamId);
  if (params.tier) searchParams.set('tier', params.tier);
  if (params.activity) searchParams.set('activity', params.activity);
  if (Array.isArray(params.stage)) {
    params.stage.forEach((stageId) => stageId && searchParams.append('stage', stageId));
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
  const path = suffix
    ? `/clients/${tenant}/ai/insights?${suffix}`
    : `/clients/${tenant}/ai/insights`;

  return apiFetch<ClientInsightsPayload>(path);
}

export async function startJourney(payload: StartJourneyPayload) {
  return apiFetch<{ ok: boolean }>('/journeys/start', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export interface AiEmployeeTemplate {
  id: string;
  key: string;
  displayName: string;
  description: string;
  systemPrompt: string;
  defaultSettings: Record<string, unknown>;
  allowedTools: string[];
}

export interface AiEmployeeInstance {
  id: string;
  name: string;
  status: string;
  autoMode: 'suggest-only' | 'requires-approval' | 'auto-run';
  template: AiEmployeeTemplate;
  settings: Record<string, unknown>;
  allowedTools: string[];
  userId: string | null;
}

export interface AiEmployeeUsageToolStat {
  toolKey: string;
  count: number;
}

export interface AiEmployeeUsageStats {
  personaKey: string;
  personaName: string;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  toolsUsed: AiEmployeeUsageToolStat[];
  timeWindow: {
    from: string;
    to: string;
  };
}

export async function getAiEmployeeUsageStats(params: { from?: string; to?: string } = {}) {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  const suffix = search.toString();
  const path = suffix ? `/ai/employees/usage?${suffix}` : '/ai/employees/usage';
  return apiFetch<AiEmployeeUsageStats[]>(path);
}

export interface AiEmployeeAction {
  id: string;
  employeeInstanceId: string;
  actionType: string;
  payload: Record<string, unknown>;
  status: string;
  requiresApproval: boolean;
  errorMessage?: string | null;
  executedAt?: string | null;
  sessionId?: string | null;
  result?: Record<string, unknown> | null;
  replyText?: string | null;
  dryRun?: boolean;
}

export interface AiEmployeeChatResponse {
  sessionId: string;
  employeeInstanceId: string;
  reply: string;
  actions: AiEmployeeAction[];
}

export interface AiEmployeeChatRequest {
  message: string;
  channel?: string;
  contextType?: string;
  contextId?: string;
}

export type PersonaChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  personaId?: PersonaId;
};

export type PersonaMemoryLog = {
  personaId: PersonaId;
  label: string;
};

export type PersonaChatResponse = {
  activePersonaId: PersonaId;
  reason?: string | null;
  messages: PersonaChatMessage[];
  memoryLog?: PersonaMemoryLog | null;
};

export async function listAiEmployeeInstances(): Promise<AiEmployeeInstance[]> {
  return apiFetch('ai/employees/instances');
}

export async function listAiEmployeeTemplates(): Promise<AiEmployeeTemplate[]> {
  return apiFetch('ai/employees/templates');
}

export async function listAiEmployeeActions(): Promise<AiEmployeeAction[]> {
  return apiFetch('ai/employees/actions');
}

export async function chatAiEmployee(
  employeeInstanceId: string,
  payload: AiEmployeeChatRequest
): Promise<AiEmployeeChatResponse> {
  return apiFetch(`ai/employees/${employeeInstanceId}/chat`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function approveAiEmployeeAction(actionId: string, note?: string) {
  return apiFetch(`ai/employees/actions/${actionId}/approve`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {})
  });
}

export async function rejectAiEmployeeAction(actionId: string, note?: string) {
  return apiFetch(`ai/employees/actions/${actionId}/reject`, {
    method: 'POST',
    body: JSON.stringify(note ? { note } : {})
  });
}

export async function chatAiPersona(payload: {
  text: string;
  currentPersonaId: PersonaId;
  history?: PersonaChatMessage[];
  forceCurrentPersona?: boolean;
}): Promise<PersonaChatResponse> {
  return apiFetch('ai/personas/chat', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export type MarketingCampaignStatus = 'draft' | 'scheduled' | 'sent' | 'failed';
export type MarketingChannel = 'EMAIL' | 'SMS';
export type CampaignFilter = 'all' | MarketingCampaignStatus;

export type MarketingCampaign = {
  id: string;
  tenantId: string;
  personaId: PersonaId;
  name: string;
  subject: string;
  body: string;
  channel: MarketingChannel;
  audienceKey?: string | null;
  audienceLabel?: string | null;
  callToAction?: string | null;
  recipientsCount: number;
  status: MarketingCampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiEmailDraftRequest = {
  personaId: PersonaId;
  audience?: string;
  callToAction?: string;
  subject?: string;
  brief?: string;
};

export type AiEmailDraft = {
  personaId: PersonaId;
  subject: string;
  body: string;
};

export type CreateMarketingCampaignPayload = {
  personaId: PersonaId;
  subject: string;
  body: string;
  name?: string;
  audienceKey?: string;
  audienceLabel?: string;
  callToAction?: string;
  recipientsCount?: number;
  status?: MarketingCampaignStatus;
  channel?: MarketingChannel;
};

export async function listMarketingCampaigns(filter: CampaignFilter = 'all'): Promise<MarketingCampaign[]> {
  const params = new URLSearchParams();
  if (filter) {
    params.set('filter', filter);
  }
  const query = params.toString();
  const data = await apiFetch<{ campaigns: MarketingCampaign[] }>(
    query ? `marketing/campaigns?${query}` : 'marketing/campaigns'
  );
  return data.campaigns;
}

export async function createMarketingCampaign(
  payload: CreateMarketingCampaignPayload
): Promise<MarketingCampaign> {
  const data = await apiFetch<{ campaign: MarketingCampaign }>('marketing/campaigns', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.campaign;
}

export async function generateAiEmailDraft(payload: AiEmailDraftRequest): Promise<AiEmailDraft> {
  const data = await apiFetch<{ draft: AiEmailDraft }>('marketing/draft', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return data.draft;
}

export async function sendAiEmailPreview(payload: CreateMarketingCampaignPayload): Promise<MarketingCampaign> {
  return createMarketingCampaign(payload);
}

export type SendCustomerEmailPayload = {
  to?: string[];
  subject: string;
  html?: string;
  text?: string;
  personaId?: PersonaId;
  segmentKey?: string;
};

export type SendCustomerEmailResponse = {
  success: boolean;
  campaign?: MarketingCampaign;
};

export async function sendCustomerEmail(
  payload: SendCustomerEmailPayload
): Promise<SendCustomerEmailResponse> {
  return apiFetch<SendCustomerEmailResponse>('email/send', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// Voice: start an outbound call via Twilio (backend proxy)
export async function startVoiceCall(payload: { to: string; tenantId?: string }): Promise<{ success: boolean; sid?: string }> {
  return apiFetch<{ success: boolean; sid?: string }>('voice/call', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// Contracts
export type ContractTemplate = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description?: string | null;
  jurisdiction?: string | null;
  propertyType?: string | null;
  side?: string | null;
  s3Key: string;
  version?: number;
  isActive?: boolean;
  editableKeys?: string[] | null;
  tags: string[];
};

export type ContractInstance = {
  id: string;
  organizationId: string;
  templateId: string | null;
  orgListingId: string | null;
  orgTransactionId: string | null;
  title: string;
  status: string;
  fieldValues: Record<string, unknown>;
  draftS3Key?: string | null;
  signedS3Key?: string | null;
  draftUrl?: string | null;
  signedUrl?: string | null;
  recommendationReason?: string | null;
  template?: {
    id: string;
    name: string;
    code: string;
    version: number;
    propertyType?: string | null;
    side?: string | null;
  } | null;
  envelope?: {
    id: string;
    provider: string;
    providerEnvelopeId: string;
    status: string;
    signers?: unknown;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export const searchContractTemplates = async (
  orgId: string,
  params: {
    query: string;
    propertyType?: string;
    side?: string;
    jurisdiction?: string;
    includeUrl?: boolean;
  }
) => {
  const qs = new URLSearchParams();
  qs.set('query', params.query);
  if (params.propertyType) qs.set('propertyType', params.propertyType);
  if (params.side) qs.set('side', params.side);
  if (params.jurisdiction) qs.set('jurisdiction', params.jurisdiction);
  if (params.includeUrl) qs.set('includeUrl', 'true');
  return apiFetch<Array<ContractTemplate & { templateUrl?: string | null }>>(
    `organizations/${orgId}/contracts/templates/search?${qs.toString()}`
  );
};

export const listContractTemplates = async (
  orgId: string,
  params?: { propertyType?: string; side?: string; jurisdiction?: string }
) => {
  const qs = new URLSearchParams();
  if (params?.propertyType) qs.set('propertyType', params.propertyType);
  if (params?.side) qs.set('side', params.side);
  if (params?.jurisdiction) qs.set('jurisdiction', params.jurisdiction);
  return apiFetch<ContractTemplate[]>(`organizations/${orgId}/contracts/templates?${qs.toString()}`);
};

export const recommendContractTemplates = async (
  orgId: string,
  params?: { propertyType?: string; side?: string; jurisdiction?: string }
) => {
  const qs = new URLSearchParams();
  if (params?.propertyType) qs.set('propertyType', params.propertyType);
  if (params?.side) qs.set('side', params.side);
  if (params?.jurisdiction) qs.set('jurisdiction', params.jurisdiction);
  return apiFetch<Array<ContractTemplate & { recommendationReason?: string | null }>>(
    `organizations/${orgId}/contracts/templates/recommendations?${qs.toString()}`
  );
};

export const listContractInstances = async (
  orgId: string,
  params?: { propertyId?: string; transactionId?: string; status?: string }
) => {
  const qs = new URLSearchParams();
  if (params?.propertyId) qs.set('propertyId', params.propertyId);
  if (params?.transactionId) qs.set('transactionId', params.transactionId);
  if (params?.status) qs.set('status', params.status);
  return apiFetch<ContractInstance[]>(`organizations/${orgId}/contracts/instances?${qs.toString()}`);
};

export const getContractInstance = async (orgId: string, id: string) =>
  apiFetch<ContractInstance>(`organizations/${orgId}/contracts/instances/${id}`);

export const createContractInstance = async (
  orgId: string,
  payload: { templateId: string; propertyId?: string; transactionId?: string; title?: string }
) =>
  apiFetch<ContractInstance>(`organizations/${orgId}/contracts/instances`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateContractInstance = async (
  orgId: string,
  id: string,
  payload: { title?: string; fieldValues?: Record<string, unknown> }
) =>
  apiFetch<ContractInstance>(`organizations/${orgId}/contracts/instances/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const sendContractForSignature = async (
  orgId: string,
  id: string,
  payload: { signers?: Array<{ name: string; email: string; role?: string }>; returnUrl?: string }
) =>
  apiFetch<ContractInstance & { envelopeId?: string; senderViewUrl?: string }>(
    `organizations/${orgId}/contracts/instances/${id}/send-for-signature`,
    { method: 'POST', body: JSON.stringify(payload) }
  );

export const deleteContractInstance = async (orgId: string, id: string) =>
  apiFetch<{ deleted: number }>(`organizations/${orgId}/contracts/instances/${id}`, {
    method: 'DELETE'
  });

export const deleteContractInstances = async (orgId: string, ids: string[]) =>
  apiFetch<{ deleted: number }>(`organizations/${orgId}/contracts/instances/bulk-delete`, {
    method: 'POST',
    body: JSON.stringify({ ids })
  });

export { apiFetch };
