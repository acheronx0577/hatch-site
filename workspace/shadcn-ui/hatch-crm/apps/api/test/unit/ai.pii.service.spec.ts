import { AiGuardrailsService } from '../../src/modules/ai/foundation/services/ai-guardrails.service';
import { AiPiiService } from '../../src/modules/ai/foundation/services/ai-pii.service';

describe('AiPiiService', () => {
  it('redacts with a shared state to avoid placeholder collisions', () => {
    const service = new AiPiiService();
    const state = service.createRedactionState();

    const first = service.redactWithState('Email a@example.com', state, { strategy: 'placeholder' });
    const second = service.redactWithState('Email b@example.com', state, { strategy: 'placeholder' });

    expect(first.redactedText).toContain('[EMAIL_1]');
    expect(second.redactedText).toContain('[EMAIL_2]');
    expect(state.redactionMap['[EMAIL_1]']).toBe('a@example.com');
    expect(state.redactionMap['[EMAIL_2]']).toBe('b@example.com');

    const restored = service.restore('Contact: [EMAIL_1] + [EMAIL_2]', state.redactionMap);
    expect(restored).toBe('Contact: a@example.com + b@example.com');
  });
});

describe('AiGuardrailsService', () => {
  it('redacts variables before interpolation and restores output', () => {
    const pii = new AiPiiService();
    const guardrails = new AiGuardrailsService(pii);

    const variableGuarded = guardrails.applyVariableGuardrails({
      variables: {
        lead: {
          name: 'Jane Smith',
          email: 'jane@example.com'
        },
        agent: {
          name: 'John Doe',
          email: 'john@example.com'
        }
      }
    });

    expect(variableGuarded.piiRedacted).toBe(true);
    expect(variableGuarded.variables.lead.email).toMatch(/\[EMAIL_\d+\]/);
    expect(variableGuarded.variables.agent.email).toMatch(/\[EMAIL_\d+\]/);
    expect(variableGuarded.variables.lead.email).not.toBe(variableGuarded.variables.agent.email);

    const interpolated = `Lead=${variableGuarded.variables.lead.email} Agent=${variableGuarded.variables.agent.email}`;
    const guardedPrompt = guardrails.applyInputGuardrails({
      systemPrompt: '',
      userPrompt: interpolated,
      redactionState: variableGuarded.redactionState
    });

    expect(guardedPrompt.piiRedacted).toBe(true);
    expect(guardedPrompt.userPrompt).toBe(interpolated);

    const modelOutput = 'Draft email to [EMAIL_1] and CC [EMAIL_2].';
    const restored = guardrails.restoreOutput(modelOutput, guardedPrompt.redactionMap);
    expect(restored).toBe('Draft email to jane@example.com and CC john@example.com.');
  });
});

