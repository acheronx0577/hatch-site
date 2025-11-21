const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const API_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;

interface FetchOptions extends RequestInit {
  token?: string;
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const sanitizedPath = path.replace(/^\//, '');
  const url = new URL(sanitizedPath, API_BASE_URL);
  const headers = new Headers(options.headers);

  if (!headers.has('x-user-role')) {
    headers.set('x-user-role', 'BROKER');
  }
  if (!headers.has('x-user-id')) {
    headers.set('x-user-id', 'user-broker');
  }
  if (!headers.has('x-tenant-id')) {
    headers.set('x-tenant-id', import.meta.env.VITE_TENANT_ID || 'tenant-hatch');
  }

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = await response.json();
      if (payload?.message) {
        message = payload.message;
      }
    } catch (error) {
      // ignore JSON parse errors and fallback to status text
    }

    throw new Error(message || 'request_failed');
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
  total: number;
  page: number;
  pageSize: number;
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
  tenantId: string;
  name: string;
  type: 'FLAT' | 'TIERED' | 'CAP';
  description?: string | null;
  definition: unknown;
  postCapFee?: unknown | null;
  bonusRules?: unknown | null;
  isArchived: boolean;
  version: number;
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
  return apiFetch<CommissionPlan[]>('/commission-plans');
}

export async function createCommissionPlan(payload: CreateCommissionPlanPayload) {
  return apiFetch<CommissionPlan>('/commission-plans', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateCommissionPlan(id: string, payload: UpdateCommissionPlanPayload) {
  return apiFetch<CommissionPlan>(`/commission-plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function archiveCommissionPlan(id: string) {
  return apiFetch<{ id: string }>(`/commission-plans/${id}/archive`, {
    method: 'POST'
  });
}

export async function fetchCommissionPlan(id: string) {
  return apiFetch<CommissionPlan>(`/commission-plans/${id}`);
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

export { apiFetch };
