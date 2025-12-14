import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PersonaChatPanel } from '@/components/personas/PersonaChatPanel';
import { chatAiEmployee } from '@/lib/api/ai-employees';

vi.mock('@/lib/api/ai-employees', () => ({
  chatAiEmployee: vi.fn()
}));

const template = {
  id: 'tmpl-1',
  key: 'agent_persona',
  displayName: 'Agent Persona',
  description: 'Helps agents',
  systemPrompt: '',
  defaultSettings: {},
  allowedTools: []
};

const persona = {
  template,
  instance: {
    id: 'inst-1',
    name: 'Agent Persona',
    status: 'active',
    autoMode: 'requires-approval' as const,
    template,
    settings: {},
    allowedTools: [],
    userId: null
  }
};

describe('PersonaChatPanel', () => {
  beforeEach(() => {
    vi.mocked(chatAiEmployee).mockReset();
  });

  it('passes context type and id to chat calls', async () => {
    vi.mocked(chatAiEmployee).mockResolvedValue({
      sessionId: 'sess-1',
      employeeInstanceId: 'inst-1',
      reply: 'Hello!',
      actions: []
    });

    render(
      <PersonaChatPanel
        persona={persona}
        context={{ surface: 'lead', entityType: 'lead', entityId: 'lead-123', summary: 'Lead 123' }}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/chat with/i), { target: { value: 'Hi there' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(chatAiEmployee).toHaveBeenCalled());
    expect(chatAiEmployee).toHaveBeenCalledWith(
      'inst-1',
      expect.objectContaining({
        message: 'Hi there',
        contextType: 'lead',
        contextId: 'lead-123'
      })
    );
  });

  it('sends quick prompts and refreshes actions when returned', async () => {
    vi.mocked(chatAiEmployee).mockResolvedValue({
      sessionId: 'sess-1',
      employeeInstanceId: 'inst-1',
      reply: 'Check these leads',
      actions: [
        {
          id: 'act-1',
          employeeInstanceId: 'inst-1',
          actionType: 'get_hot_leads',
          payload: {},
          status: 'requires-approval',
          requiresApproval: true
        }
      ]
    });
    const onActionsCreated = vi.fn();

    render(<PersonaChatPanel persona={persona} context={{ surface: 'dashboard' }} onActionsCreated={onActionsCreated} />);

    fireEvent.click(screen.getByRole('button', { name: /who should i call today/i }));

    await waitFor(() => expect(chatAiEmployee).toHaveBeenCalled());
    await waitFor(() => expect(onActionsCreated).toHaveBeenCalled());
  });
});
