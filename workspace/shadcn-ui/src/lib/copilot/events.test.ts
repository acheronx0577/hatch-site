import { describe, expect, it, vi } from 'vitest';

import { emitCopilotContext, emitCopilotPrefill } from './events';

describe('emitCopilotContext', () => {
  it('dispatches a copilot:context event with the provided payload', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const payload = {
      surface: 'lead',
      entityId: 'lead_123',
      entityType: 'lead',
      summary: 'Lead ABC – Hot',
      metadata: { stage: 'Nurture' }
    };

    emitCopilotContext(payload);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('copilot:context');
    expect(event.detail).toEqual(payload);

    dispatchSpy.mockRestore();
  });
});

describe('emitCopilotPrefill', () => {
  it('dispatches a copilot:prefill event with the provided payload', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const payload = {
      personaId: 'hatch_assistant',
      chatMode: 'team' as const,
      message: 'Hello from prefill'
    };

    emitCopilotPrefill(payload);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('copilot:prefill');
    expect(event.detail).toEqual(payload);

    dispatchSpy.mockRestore();
  });
});
