export class MissionControlMlsStatsDto {
  totalIndexed = 0;
  activeForSale = 0;
  activeRentals = 0;
  lastFullSyncAt?: string | null;
  lastIncrementalSyncAt?: string | null;
  provider?: string | null;
  boardName?: string | null;
}

export class MissionControlSavedSearchStatsDto {
  totalSavedSearches = 0;
  alertsEnabledCount = 0;
  dailyCount = 0;
  weeklyCount = 0;
}

export class MissionControlFavoriteStatsDto {
  totalSavedListings = 0;
}

export class MissionControlOverviewDto {
  organizationId!: string;

  totalAgents = 0;
  activeAgents = 0;
  nonCompliantAgents = 0;
  highRiskAgents = 0;

  pendingInvites = 0;

  vaultFileCounts: {
    total: number;
    byCategory: Record<string, number>;
  } = { total: 0, byCategory: {} };

  comms: {
    channels: number;
    directConversations: number;
    messagesLast7Days: number;
  } = { channels: 0, directConversations: 0, messagesLast7Days: 0 };

  training: {
    totalModules: number;
    requiredModules: number;
    totalAssignments: number;
    completedAssignments: number;
  } = { totalModules: 0, requiredModules: 0, totalAssignments: 0, completedAssignments: 0 };

  listings: {
    total: number;
    active: number;
    pendingApproval: number;
    expiringSoon: number;
  } = { total: 0, active: 0, pendingApproval: 0, expiringSoon: 0 };

  transactions: {
    total: number;
    underContract: number;
    closingsNext30Days: number;
    nonCompliant: number;
    docsReadyPercent: number;
    missingDocs: number;
    upcomingClosingsMissingDocs: number;
  } = { total: 0, underContract: 0, closingsNext30Days: 0, nonCompliant: 0, docsReadyPercent: 0, missingDocs: 0, upcomingClosingsMissingDocs: 0 };

  onboarding: {
    agentsInOnboarding: number;
    totalOnboardingTasksOpen: number;
    totalOnboardingTasksCompleted: number;
  } = { agentsInOnboarding: 0, totalOnboardingTasksOpen: 0, totalOnboardingTasksCompleted: 0 };

  offboarding: {
    agentsInOffboarding: number;
    totalOffboardingTasksOpen: number;
  } = { agentsInOffboarding: 0, totalOffboardingTasksOpen: 0 };

  aiCompliance: {
    evaluationsLast30Days: number;
    highRiskListings: number;
    highRiskTransactions: number;
  } = { evaluationsLast30Days: 0, highRiskListings: 0, highRiskTransactions: 0 };

  aiApprovals: {
    pending: number;
  } = { pending: 0 };

  leadStats: {
    totalLeads: number;
    newLeads: number;
    contactedLeads: number;
    qualifiedLeads: number;
    unqualifiedLeads: number;
    appointmentsSet: number;
  } = {
    totalLeads: 0,
    newLeads: 0,
    contactedLeads: 0,
    qualifiedLeads: 0,
    unqualifiedLeads: 0,
    appointmentsSet: 0
  };

  leadTypeBreakdown: {
    BUYER: number;
    SELLER: number;
    UNKNOWN: number;
  } = { BUYER: 0, SELLER: 0, UNKNOWN: 0 };

  loiStats: {
    totalOfferIntents: number;
    draftOfferIntents: number;
    sentOfferIntents: number;
    receivedOfferIntents: number;
    counteredOfferIntents: number;
    acceptedOfferIntents: number;
    rejectedOfferIntents: number;
  } = {
    totalOfferIntents: 0,
    draftOfferIntents: 0,
    sentOfferIntents: 0,
    receivedOfferIntents: 0,
    counteredOfferIntents: 0,
    acceptedOfferIntents: 0,
    rejectedOfferIntents: 0
  };

  rentalStats: {
    propertiesUnderManagement: number;
    activeLeases: number;
    seasonalLeases: number;
    upcomingTaxDueCount: number;
    overdueTaxCount: number;
  } = {
    propertiesUnderManagement: 0,
    activeLeases: 0,
    seasonalLeases: 0,
    upcomingTaxDueCount: 0,
    overdueTaxCount: 0
  };

  financialStats: {
    transactionsSyncedCount: number;
    transactionsSyncFailedCount: number;
    rentalLeasesSyncedCount: number;
    rentalLeasesSyncFailedCount: number;
    estimatedGci?: number;
    estimatedPmIncome?: number;
  } = {
    transactionsSyncedCount: 0,
    transactionsSyncFailedCount: 0,
    rentalLeasesSyncedCount: 0,
    rentalLeasesSyncFailedCount: 0,
    estimatedGci: 0,
    estimatedPmIncome: 0
  };

  mlsStats: MissionControlMlsStatsDto = new MissionControlMlsStatsDto();
  savedSearchStats: MissionControlSavedSearchStatsDto = new MissionControlSavedSearchStatsDto();
  favoritesStats: MissionControlFavoriteStatsDto = new MissionControlFavoriteStatsDto();

  marketingAutomation: {
    activeCampaigns: number;
    leadsInDrips: number;
    emailsQueuedToday: number;
    stepsExecutedToday: number;
  } = { activeCampaigns: 0, leadsInDrips: 0, emailsQueuedToday: 0, stepsExecutedToday: 0 };

  leadOptimization: {
    scoredToday: number;
    highPriority: number;
    atRisk: number;
  } = { scoredToday: 0, highPriority: 0, atRisk: 0 };

  documentCompliance: {
    pending: number;
    failed: number;
    passed: number;
  } = { pending: 0, failed: 0, passed: 0 };

  liveActivity: {
    activeUsers: number;
    listingViews: number;
    transactionViews: number;
    documentViews: number;
  } = { activeUsers: 0, listingViews: 0, transactionViews: 0, documentViews: 0 };

  recentEvents: Array<{
    id: string;
    type: string;
    message?: string | null;
    createdAt: string;
  }> = [];
}

export class MissionControlAgentRowDto {
  agentProfileId!: string;
  userId!: string;
  name!: string;
  email!: string;
  riskLevel!: string;
  riskScore!: number;
  isCompliant!: boolean;
  requiresAction!: boolean;
  buyerLeadCount = 0;
  sellerLeadCount = 0;
  unknownLeadCount = 0;
  buyerSellerOrientation: 'BUYER_HEAVY' | 'BALANCED' | 'SELLER_HEAVY' | 'UNKNOWN' = 'UNKNOWN';
  buyerSharePercent = 0;
  ceHoursRequired?: number | null;
  ceHoursCompleted?: number | null;
  memberships!: Array<{ type: string; name: string; status: string }>;
  trainingAssigned = 0;
  trainingCompleted = 0;
  requiredTrainingAssigned = 0;
  requiredTrainingCompleted = 0;
  listingCount = 0;
  activeListingCount = 0;
  transactionCount = 0;
  nonCompliantTransactionCount = 0;
  closedTransactionCount = 0;
  closedTransactionVolume = 0;
  currentClientCount = 0;
  pastClientCount = 0;
  openComplianceIssues = 0;
  lastComplianceEvaluationAt?: string;
  lifecycleStage!: string;
  onboardingTasksOpenCount = 0;
  onboardingTasksCompletedCount = 0;
  offboardingTasksOpenCount = 0;
  assignedLeadsCount = 0;
  newLeadsCount = 0;
  qualifiedLeadsCount = 0;
  offerIntentCount = 0;
  acceptedOfferIntentCount = 0;
  performance?: {
    modelVersion: string;
    overallScore: number;
    confidenceBand: string;
    riskDragPenalty?: number;
    topDrivers: Array<{
      label: string;
      direction: 'positive' | 'negative';
      metricSummary: string;
      deepLink?: string;
    }>;
    lastUpdated: string;
  } | null;
}

export class MissionControlComplianceSummaryDto {
  organizationId!: string;
  totalAgents = 0;
  compliantAgents = 0;
  nonCompliantAgents = 0;
  highRiskAgents = 0;
  ceExpiringSoon = 0;
  expiredMemberships = 0;
}
