import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CopilotDock } from '../CopilotDock';

const mockRefreshPersonas = vi.fn();
const mockRefreshActions = vi.fn();
const mockUseAiEmployees = vi.fn();
const mockUseAiActions = vi.fn();
const mockGetAiEmployeeUsageStats = vi.fn();

const persona = {
  template: {
    key: 'lead_nurse',
    displayName: 'Luna – Lead Nurse',
    description: 'Lead specialist',
    allowedTools: ['lead_add_note'],
    defaultSettings: { personaColor: '#FF8A80', avatarShape: 'circle' }
  }
};

vi.mock('@/hooks/useAiEmployees', () => ({
  useAiEmployees: () => mockUseAiEmployees()
}));

vi.mock('@/hooks/useAiActions', () => ({
  useAiActions: () => mockUseAiActions()
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    profile: null,
    refreshSession: vi.fn(),
    signOut: vi.fn()
  })
}));

vi.mock('@/lib/api/hatch', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/hatch')>('@/lib/api/hatch');
  return {
    ...actual,
    getAiEmployeeUsageStats: (...args: Parameters<typeof actual.getAiEmployeeUsageStats>) =>
      mockGetAiEmployeeUsageStats(...args)
  };
});

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));

describe.skip('CopilotDock (Vite)', () => {
  beforeEach(() => {
    mockRefreshPersonas.mockClear();
    mockRefreshActions.mockClear();
    mockGetAiEmployeeUsageStats.mockResolvedValue([
      {
        personaKey: 'lead_nurse',
        personaName: 'Luna',
        totalActions: 10,
        successfulActions: 9,
        failedActions: 1,
        toolsUsed: [],
        timeWindow: { from: '2025-01-01', to: '2025-01-31' }
      }
    ]);
    mockUseAiEmployees.mockReturnValue({
      personas: [persona],
      loading: false,
      error: null,
      refresh: mockRefreshPersonas,
      disabled: false
    });
    mockUseAiActions.mockReturnValue({
      actions: [],
      loading: false,
      error: null,
      refresh: mockRefreshActions,
      approveAction: vi.fn(),
      rejectAction: vi.fn(),
      disabled: false
    });
  });

  it('renders context banner when a copilot:context event is received', async () => {
    const user = userEvent.setup();
    render(<CopilotDock debug={false} />);

    await user.click(screen.getByLabelText('Open Hatch Copilot'));

    act(() => {
      window.dispatchEvent(
        new CustomEvent('copilot:context', {
          detail: {
            surface: 'lead',
            summary: 'Lead XYZ – Stage: Active'
          }
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Lead XYZ/i)).toBeInTheDocument();
      expect(screen.getByText(/Last 30d/i)).toBeInTheDocument();
    });
  });

  it('renders a disabled notice when AI employees are off', async () => {
    const user = userEvent.setup();
    mockUseAiEmployees.mockReturnValue({
      personas: [],
      loading: false,
      error: null,
      refresh: mockRefreshPersonas,
      disabled: true
    });
    render(<CopilotDock debug={false} />);

    await user.click(screen.getByLabelText('Open Hatch Copilot'));
    expect(screen.getByText(/AI Employees are disabled/i)).toBeInTheDocument();
  });
});
