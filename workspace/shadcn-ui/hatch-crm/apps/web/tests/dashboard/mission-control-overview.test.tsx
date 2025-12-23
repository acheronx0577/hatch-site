import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { MissionControlOverview } from '@/app/dashboard/mission-control/components/mission-control-overview';

vi.mock('@/lib/api/mission-control', () => ({
  fetchMissionControlOverview: vi.fn().mockResolvedValue({
    organizationId: 'org-1',
    totalAgents: 12,
    activeAgents: 10,
    nonCompliantAgents: 2,
    highRiskAgents: 1,
    pendingInvites: 0,
    vaultFileCounts: { total: 3, byCategory: {} },
    comms: { channels: 2, directConversations: 5, messagesLast7Days: 10 },
    training: { totalModules: 4, requiredModules: 2, totalAssignments: 8, completedAssignments: 6 },
    listings: { total: 6, active: 3, pendingApproval: 1, expiringSoon: 0 },
    transactions: { total: 5, underContract: 3, closingsNext30Days: 1, nonCompliant: 0 },
    onboarding: { agentsInOnboarding: 1, totalOnboardingTasksOpen: 2, totalOnboardingTasksCompleted: 1 },
    offboarding: { agentsInOffboarding: 1, totalOffboardingTasksOpen: 1 },
    aiCompliance: { evaluationsLast30Days: 4, highRiskListings: 1, highRiskTransactions: 0 },
    aiApprovals: { pending: 2 },
    leadStats: {
      totalLeads: 4,
      newLeads: 2,
      contactedLeads: 1,
      qualifiedLeads: 1,
      unqualifiedLeads: 0,
      appointmentsSet: 0
    },
    loiStats: {
      totalOfferIntents: 3,
      submittedOfferIntents: 1,
      underReviewOfferIntents: 1,
      acceptedOfferIntents: 1,
      declinedOfferIntents: 0
    },
    rentalStats: {
      propertiesUnderManagement: 2,
      activeLeases: 4,
      seasonalLeases: 1,
      upcomingTaxDueCount: 1,
      overdueTaxCount: 0
    },
    financialStats: {
      transactionsSyncedCount: 2,
      transactionsSyncFailedCount: 0,
      rentalLeasesSyncedCount: 1,
      rentalLeasesSyncFailedCount: 0,
      estimatedGci: 500000,
      estimatedPmIncome: 10000
    },
    mlsStats: {
      totalIndexed: 5,
      activeForSale: 3,
      activeRentals: 2,
      provider: 'GENERIC',
      boardName: 'Test Board',
      lastFullSyncAt: new Date().toISOString(),
      lastIncrementalSyncAt: new Date().toISOString()
    },
    savedSearchStats: {
      totalSavedSearches: 4,
      alertsEnabledCount: 3,
      dailyCount: 2,
      weeklyCount: 1
    },
    favoritesStats: {
      totalSavedListings: 6
    },
    recentEvents: []
  })
}));

const renderComponent = () => {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MissionControlOverview orgId="org-1" />
    </QueryClientProvider>
  );
};

describe('MissionControlOverview', () => {
  it('renders key metrics from the API response', async () => {
    renderComponent();

    await waitFor(() => expect(screen.getByText(/total agents/i)).toBeInTheDocument());
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText(/evaluations \(30d\)/i)).toBeInTheDocument();
    expect(screen.getByText(/total lois/i)).toBeInTheDocument();
    expect(screen.getByText(/properties under mgmt/i)).toBeInTheDocument();
    expect(screen.getByText(/saved listings/i)).toBeInTheDocument();
  });
});
