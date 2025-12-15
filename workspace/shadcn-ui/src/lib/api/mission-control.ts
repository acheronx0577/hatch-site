import { apiFetch } from '@/lib/api/hatch';

export interface MissionControlSavedSearchStats {
  totalSavedSearches: number;
  alertsEnabledCount: number;
  dailyCount: number;
  weeklyCount: number;
}

export interface MissionControlFavoriteStats {
  totalSavedListings: number;
}

export interface MissionControlOverview {
  organizationId: string;
  totalAgents: number;
  activeAgents: number;
  nonCompliantAgents: number;
  highRiskAgents: number;
  pendingInvites: number;
  vaultFileCounts: {
    total: number;
    byCategory: Record<string, number>;
  };
  comms: {
    channels: number;
    directConversations: number;
    messagesLast7Days: number;
  };
  training: {
    totalModules: number;
    requiredModules: number;
    totalAssignments: number;
    completedAssignments: number;
  };
  listings: {
    total: number;
    active: number;
    pendingApproval: number;
    expiringSoon: number;
  };
  transactions: {
    total: number;
    underContract: number;
    closingsNext30Days: number;
    nonCompliant: number;
  };
  onboarding: {
    agentsInOnboarding: number;
    totalOnboardingTasksOpen: number;
    totalOnboardingTasksCompleted: number;
  };
  offboarding: {
    agentsInOffboarding: number;
    totalOffboardingTasksOpen: number;
  };
  aiCompliance: {
    evaluationsLast30Days: number;
    highRiskListings: number;
    highRiskTransactions: number;
  };
  leadStats: {
    totalLeads: number;
    newLeads: number;
    contactedLeads: number;
    qualifiedLeads: number;
    unqualifiedLeads: number;
    appointmentsSet: number;
  };
  loiStats: {
    totalOfferIntents: number;
    submittedOfferIntents: number;
    underReviewOfferIntents: number;
    acceptedOfferIntents: number;
    declinedOfferIntents: number;
  };
  rentalStats: {
    propertiesUnderManagement: number;
    activeLeases: number;
    seasonalLeases: number;
    upcomingTaxDueCount: number;
    overdueTaxCount: number;
  };
  financialStats: {
    transactionsSyncedCount: number;
    transactionsSyncFailedCount: number;
    rentalLeasesSyncedCount: number;
    rentalLeasesSyncFailedCount: number;
    estimatedGci?: number;
    estimatedPmIncome?: number;
  };
  mlsStats?: {
    totalIndexed: number;
    activeForSale: number;
    activeRentals: number;
    lastFullSyncAt?: string | null;
    lastIncrementalSyncAt?: string | null;
    provider?: string | null;
    boardName?: string | null;
  };
  savedSearchStats?: MissionControlSavedSearchStats;
  favoritesStats?: MissionControlFavoriteStats;
  documentCompliance?: {
    pending: number;
    failed: number;
    passed: number;
  };
  marketingAutomation?: {
    activeCampaigns: number;
    leadsInDrips: number;
    emailsQueuedToday: number;
    stepsExecutedToday: number;
  };
  leadOptimization?: {
    scoredToday: number;
    highPriority: number;
    atRisk: number;
  };
  liveActivity?: {
    activeUsers: number;
    listingViews: number;
    transactionViews: number;
    documentViews: number;
  };
  recentEvents: Array<{
    id: string;
    type: string;
    message?: string | null;
    createdAt: string;
  }>;
}

export interface MissionControlAgentRow {
  agentProfileId: string;
  userId: string;
  name: string;
  email: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskScore: number;
  isCompliant: boolean;
  requiresAction: boolean;
  ceHoursRequired?: number | null;
  ceHoursCompleted?: number | null;
  memberships: Array<{ type: string; name: string; status: string }>;
  trainingAssigned: number;
  trainingCompleted: number;
  requiredTrainingAssigned: number;
  requiredTrainingCompleted: number;
  listingCount: number;
  activeListingCount: number;
  transactionCount: number;
  nonCompliantTransactionCount: number;
  closedTransactionCount: number;
  closedTransactionVolume: number;
  currentClientCount: number;
  pastClientCount: number;
  openComplianceIssues: number;
  lastComplianceEvaluationAt?: string;
  lifecycleStage: string;
  onboardingTasksOpenCount: number;
  onboardingTasksCompletedCount: number;
  offboardingTasksOpenCount: number;
  assignedLeadsCount: number;
  newLeadsCount: number;
  qualifiedLeadsCount: number;
  offerIntentCount: number;
  acceptedOfferIntentCount: number;
}

export interface MissionControlComplianceSummary {
  organizationId: string;
  totalAgents: number;
  compliantAgents: number;
  nonCompliantAgents: number;
  highRiskAgents: number;
  ceExpiringSoon: number;
  expiredMemberships: number;
}

export interface MissionControlEvent {
  id: string;
  type: string;
  message?: string | null;
  createdAt: string;
}

export interface AskBrokerAssistantPayload {
  question: string;
  contextType?: 'GENERAL' | 'LISTING' | 'TRANSACTION' | 'TRAINING' | 'COMPLIANCE';
  listingId?: string;
  transactionId?: string;
}

export interface AiAnswer {
  answer: string;
  suggestions?: string[];
  references?: Array<{ type: string; id?: string }>;
}

export async function fetchMissionControlOverview(orgId: string): Promise<MissionControlOverview> {
  return apiFetch<MissionControlOverview>(`organizations/${orgId}/mission-control/overview`);
}

export async function fetchMissionControlAgents(orgId: string): Promise<MissionControlAgentRow[]> {
  const response = await apiFetch<MissionControlAgentRow[]>(`organizations/${orgId}/mission-control/agents`);
  return response ?? [];
}

export async function fetchMissionControlCompliance(orgId: string): Promise<MissionControlComplianceSummary> {
  return apiFetch<MissionControlComplianceSummary>(`organizations/${orgId}/mission-control/compliance`);
}

export async function fetchMissionControlActivity(orgId: string): Promise<MissionControlEvent[]> {
  const events = await apiFetch<MissionControlEvent[]>(`organizations/${orgId}/mission-control/activity`);
  return events ?? [];
}

export async function askAiBroker(orgId: string, payload: AskBrokerAssistantPayload): Promise<AiAnswer> {
  return apiFetch<AiAnswer>(`organizations/${orgId}/ai-broker/ask`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
