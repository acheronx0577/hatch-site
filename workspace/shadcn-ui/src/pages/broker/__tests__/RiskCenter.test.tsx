import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import RiskCenterPage from '../RiskCenter';

const mockFetchMissionControlAgents = vi.fn();
const mockFetchMissionControlActivity = vi.fn();
const mockFetchAgentProfile = vi.fn();
const mockUpdateAgentCompliance = vi.fn();
const mockFetchRiskPackages = vi.fn();

vi.mock('@/lib/hooks/useOrgId', () => ({
  useOrgId: () => 'org-test'
}));

vi.mock('@/lib/api/agents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/agents')>('@/lib/api/agents');
  return {
    ...actual,
    fetchAgentProfile: (...args: any[]) => mockFetchAgentProfile(...args),
    updateAgentCompliance: (...args: any[]) => mockUpdateAgentCompliance(...args)
  };
});

vi.mock('@/lib/api/mission-control', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/mission-control')>('@/lib/api/mission-control');
  return {
    ...actual,
    fetchMissionControlAgents: (...args: any[]) => mockFetchMissionControlAgents(...args),
    fetchMissionControlActivity: (...args: any[]) => mockFetchMissionControlActivity(...args)
  };
});

vi.mock('@/lib/api/risk-packages', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/risk-packages')>('@/lib/api/risk-packages');
  return {
    ...actual,
    fetchRiskPackages: (...args: any[]) => mockFetchRiskPackages(...args)
  };
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe('RiskCenterPage', () => {
  it('opens agent details without navigating to Team', async () => {
    mockFetchMissionControlAgents.mockResolvedValue([
      {
        agentProfileId: 'agent-1',
        userId: 'user-1',
        name: 'Agent One',
        email: 'agent@example.com',
        riskLevel: 'HIGH',
        riskScore: 92.3,
        isCompliant: false,
        requiresAction: true,
        ceHoursRequired: 20,
        ceHoursCompleted: 10,
        memberships: [{ type: 'mls', name: 'MLS', status: 'ACTIVE' }],
        trainingAssigned: 5,
        trainingCompleted: 3,
        requiredTrainingAssigned: 4,
        requiredTrainingCompleted: 2,
        listingCount: 10,
        activeListingCount: 6,
        transactionCount: 7,
        nonCompliantTransactionCount: 2,
        closedTransactionCount: 1,
        closedTransactionVolume: 100000,
        currentClientCount: 4,
        pastClientCount: 10,
        openComplianceIssues: 3,
        lastComplianceEvaluationAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
        lifecycleStage: 'ACTIVE',
        onboardingTasksOpenCount: 1,
        onboardingTasksCompletedCount: 2,
        offboardingTasksOpenCount: 0,
        assignedLeadsCount: 3,
        newLeadsCount: 1,
        qualifiedLeadsCount: 1,
        offerIntentCount: 0,
        acceptedOfferIntentCount: 0
      }
    ]);
    mockFetchMissionControlActivity.mockResolvedValue([]);
    mockFetchRiskPackages.mockResolvedValue({ activePackageIds: [], packages: [] });
    mockFetchAgentProfile.mockResolvedValue({
      id: 'agent-1',
      organizationId: 'org-test',
      userId: 'user-1',
      isCompliant: false,
      requiresAction: true,
      riskLevel: 'HIGH',
      riskScore: 92,
      riskFlags: {
        riskSignals: [
          {
            source: 'CE',
            code: 'CE_HOURS_INCOMPLETE',
            severity: 'HIGH',
            description: 'CE gap of 10 hour(s) (10/20)',
            category: 'TRAINING'
          }
        ]
      }
    });
    mockUpdateAgentCompliance.mockResolvedValue({ id: 'agent-1' });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/broker/compliance']}>
          <Routes>
            <Route
              path="/broker/compliance"
              element={
                <>
                  <LocationDisplay />
                  <RiskCenterPage />
                </>
              }
            />
            <Route path="/broker/team" element={<div>Team</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Agent One')).toBeTruthy();
    });

    expect(screen.getByTestId('location').textContent).toBe('/broker/compliance');

    await user.click(screen.getByRole('button', { name: /view details/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toContain('/broker/compliance?agent=agent-1');
    });

    await waitFor(() => {
      expect(screen.getByText(/Risk drivers/i)).toBeTruthy();
      expect(screen.getByText(/CE gap of 10 hour/i)).toBeTruthy();
    });
  });
});
