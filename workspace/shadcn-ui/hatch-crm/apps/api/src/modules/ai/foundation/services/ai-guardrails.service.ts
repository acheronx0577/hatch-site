import { Injectable } from '@nestjs/common';

import type { PiiMatch, RedactionMap, RedactionState } from './ai-pii.service';
import { AiPiiService } from './ai-pii.service';

@Injectable()
export class AiGuardrailsService {
  constructor(private readonly pii: AiPiiService) {}

  applyVariableGuardrails(input: {
    variables: Record<string, any>;
    skipPiiRedaction?: boolean;
    piiAllowlist?: Array<string | RegExp>;
  }): {
    variables: Record<string, any>;
    guardrailsApplied: string[];
    piiRedacted: boolean;
    redactionState: RedactionState;
    redactionMap: RedactionMap;
    piiFound: PiiMatch[];
  } {
    const guardrailsApplied: string[] = [];
    const redactionState = this.pii.createRedactionState();
    const variables = input.variables ?? {};

    if (input.skipPiiRedaction) {
      return {
        variables,
        guardrailsApplied,
        piiRedacted: false,
        redactionState,
        redactionMap: redactionState.redactionMap,
        piiFound: redactionState.piiFound
      };
    }

    const piiAllowlist = input.piiAllowlist ?? [];
    const redactedVariables = this.redactValue(variables, redactionState, piiAllowlist);
    const piiRedacted = redactionState.piiFound.length > 0;
    if (piiRedacted) {
      guardrailsApplied.push('pii_redaction');
    }

    return {
      variables: redactedVariables,
      guardrailsApplied,
      piiRedacted,
      redactionState,
      redactionMap: redactionState.redactionMap,
      piiFound: redactionState.piiFound
    };
  }

  applyInputGuardrails(input: {
    systemPrompt: string;
    userPrompt: string;
    skipPiiRedaction?: boolean;
    piiAllowlist?: Array<string | RegExp>;
    redactionState?: RedactionState;
  }): {
    systemPrompt: string;
    userPrompt: string;
    guardrailsApplied: string[];
    piiRedacted: boolean;
    redactionMap: RedactionMap;
    piiFound: PiiMatch[];
  } {
    const guardrailsApplied: string[] = [];
    const redactionState = input.redactionState ?? this.pii.createRedactionState();

    let systemPrompt = input.systemPrompt ?? '';
    let userPrompt = input.userPrompt ?? '';

    if (!input.skipPiiRedaction) {
      const redacted = this.pii.redactWithState(userPrompt, redactionState, {
        strategy: 'placeholder',
        allowlist: input.piiAllowlist ?? []
      });
      userPrompt = redacted.redactedText;
    }

    const piiRedacted = !input.skipPiiRedaction && redactionState.piiFound.length > 0;
    if (piiRedacted) {
      guardrailsApplied.push('pii_redaction');
    }

    systemPrompt = systemPrompt.trim();
    userPrompt = userPrompt.trim();

    return {
      systemPrompt,
      userPrompt,
      guardrailsApplied,
      piiRedacted,
      redactionMap: redactionState.redactionMap,
      piiFound: redactionState.piiFound
    };
  }

  restoreOutput(text: string, redactionMap: RedactionMap): string {
    return this.pii.restore(text, redactionMap);
  }

  private redactValue(value: any, state: RedactionState, allowlist: Array<string | RegExp>) {
    if (typeof value === 'string') {
      const result = this.pii.redactWithState(value, state, { strategy: 'placeholder', allowlist });
      return result.redactedText;
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.redactValue(entry, state, allowlist));
    }

    if (this.isPlainObject(value)) {
      const out: Record<string, any> = {};
      for (const [key, entry] of Object.entries(value)) {
        out[key] = this.redactValue(entry, state, allowlist);
      }
      return out;
    }

    return value;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }
}
