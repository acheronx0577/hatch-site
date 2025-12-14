import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PersonaDock } from '../PersonaDock';

const persona = {
  template: {
    key: 'lead_nurse',
    displayName: 'Luna – Lead Nurse',
    description: 'Lead specialist',
    allowedTools: ['lead_add_note'],
    defaultSettings: { personaColor: '#FF8A80', avatarShape: 'circle' }
  }
};

const refreshPersonas = vi.fn();
const refreshActions = vi.fn();
const mockUseAiEmployees = vi.fn();
const mockUseAiActions = vi.fn();
const mockGetAiEmployeeUsageStats = vi.fn();

vi.mock('@/hooks/use-ai-employees', () => ({
  useAiEmployees: () => mockUseAiEmployees()
}));

vi.mock('@/hooks/use-ai-actions', () => ({
  useAiActions: () => mockUseAiActions()
}));

vi.mock('@/lib/api/ai-employees', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/ai-employees')>('@/lib/api/ai-employees');
  return {
    ...actual,
    getAiEmployeeUsageStats: (...args: Parameters<typeof actual.getAiEmployeeUsageStats>) =>
      mockGetAiEmployeeUsageStats(...args)
  };
});

vi.mock('@/components/personas/PersonaChatPanel', () => ({
  PersonaChatPanel: () => <div data-testid="mock-persona-panel" />
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));

describe('PersonaDock (Next.js)', () => {
  beforeEach(() => {
    refreshPersonas.mockClear();
    refreshActions.mockClear();
    mockGetAiEmployeeUsageStats.mockResolvedValue([
      {
        personaKey: 'lead_nurse',
        personaName: 'Luna',
        totalActions: 8,
        successfulActions: 6,
        failedActions: 2,
        toolsUsed: [],
        timeWindow: { from: '2025-01-01', to: '2025-01-31' }
      }
    ]);
    mockUseAiEmployees.mockReturnValue({
      personas: [persona],
      loading: false,
      error: null,
      refresh: refreshPersonas,
      disabled: false
    });
    mockUseAiActions.mockReturnValue({
      actions: [],
      loading: false,
      error: null,
      refresh: refreshActions,
      approveAction: vi.fn(),
      rejectAction: vi.fn(),
      disabled: false
    });
  });

  it('renders context banner when persona context is emitted', async () => {
    render(<PersonaDock debug={false} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('persona:context', {
          detail: {
            surface: 'listing',
            summary: '123 Main St – Active'
          }
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/123 Main St/i)).toBeInTheDocument();
      expect(screen.getByText(/Last 30d/i)).toBeInTheDocument();
    });
  });

  it('shows a disabled banner when AI Employees are unavailable', () => {
    mockUseAiEmployees.mockReturnValue({
      personas: [],
      loading: false,
      error: null,
      refresh: refreshPersonas,
      disabled: true
    });
    render(<PersonaDock debug={false} />);

    expect(screen.getByText(/AI Personas are disabled/i)).toBeInTheDocument();
  });
});
