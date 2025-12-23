import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AiFoundationConfig } from './ai.config';
import { AiFeatureFlagsService } from './ai-feature-flags.service';
import { AiApprovalService } from './services/ai-approval.service';
import { AiCostService } from './services/ai-cost.service';
import { AiGuardrailsService } from './services/ai-guardrails.service';
import { AiLoggingService } from './services/ai-logging.service';
import { AiPromptService } from './services/ai-prompt.service';
import type { AiCompletionRequest, AiCompletionResponse } from './types/ai-request.types';
import { GrokAdapter } from './providers/grok.adapter';
import type { AiProviderAdapter, AiProviderCompleteResult } from './providers/ai-provider.types';
import { AiProviderError } from './providers/ai-provider.errors';

type CircuitState = {
  state: 'closed' | 'open' | 'half';
  consecutiveFails: number;
  openedAtMs: number;
};

@Injectable()
export class AiOrchestrationService {
  private readonly log = new Logger(AiOrchestrationService.name);
  private readonly providers: Record<'grok', AiProviderAdapter>;
  private readonly circuits: Record<'grok', CircuitState> = {
    grok: { state: 'closed', consecutiveFails: 0, openedAtMs: 0 }
  };

  constructor(
    private readonly prompts: AiPromptService,
    private readonly guardrails: AiGuardrailsService,
    private readonly approvals: AiApprovalService,
    private readonly logging: AiLoggingService,
    private readonly costs: AiCostService,
    private readonly flags: AiFeatureFlagsService
  ) {
    this.providers = {
      grok: new GrokAdapter()
    };
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const requestId = randomUUID();
    const startedAt = Date.now();

    if (!AiFoundationConfig.enabled) {
      throw new Error('AI is disabled (AI_ENABLED=false)');
    }

    const organizationId = request.brokerageId;
    const settings = await this.flags.getSettings(organizationId);
    if (!settings) {
      throw new Error('Missing organizationId for AI request');
    }

    const featureEnabled = this.flags.isEnabledWithSettings(request.feature, settings);
    if (!featureEnabled) {
      throw new Error(`AI feature disabled: ${request.feature}`);
    }

    const prompt = await this.prompts.getPrompt(request.feature, organizationId, request.promptTemplate);

    const requestedModel = request.options?.model;
    const promptModel = prompt.model;
    const temperature =
      request.options?.temperature ?? prompt.temperature ?? AiFoundationConfig.defaultTemperature;
    const maxTokens =
      request.options?.maxTokens ?? prompt.maxTokens ?? AiFoundationConfig.defaultMaxTokens;

    const responseFormat =
      request.options?.responseFormat ?? 'text';

    const systemPrompt = prompt.systemPrompt ?? '';
    const skipPiiRedaction = Boolean(request.options?.skipPiiRedaction);
    const piiAllowlist = settings.piiAllowlist ?? [];

    const variableGuarded = this.guardrails.applyVariableGuardrails({
      variables: request.variables ?? {},
      skipPiiRedaction,
      piiAllowlist
    });

    const interpolatedUser = this.prompts.interpolate(prompt.userPromptTemplate, variableGuarded.variables ?? {});

    const guarded = this.guardrails.applyInputGuardrails({
      systemPrompt,
      userPrompt: interpolatedUser,
      skipPiiRedaction,
      piiAllowlist,
      redactionState: variableGuarded.redactionState
    });

    const requiresApproval = resolveApprovalRequired(request);
    const guardrailsApplied = Array.from(new Set([...variableGuarded.guardrailsApplied, ...guarded.guardrailsApplied]));
    const piiRedacted = variableGuarded.piiRedacted || guarded.piiRedacted;

    const providerOrder = ['grok'] as const;

    let lastError: unknown;
    for (const providerId of providerOrder) {
      const adapter = this.providers[providerId];
      if (!adapter?.isConfigured()) {
        continue;
      }

      if (this.isCircuitOpen(providerId)) {
        continue;
      }

      const model = this.resolveModelForProvider(providerId, { requestedModel, promptModel });

      this.logging.logStart(requestId, request, { provider: providerId, model });

      try {
        const result = await this.withRetries(() =>
          adapter.complete({
            systemPrompt: guarded.systemPrompt,
            userPrompt: guarded.userPrompt,
            model,
            temperature,
            maxTokens,
            timeoutMs: AiFoundationConfig.timeoutMs,
            responseFormat
          })
        );

        this.recordSuccess(providerId);

        const latencyMs = Date.now() - startedAt;
        const estimatedCost = Number(
          this.costs.calculateCost(providerId, model, result.usage).toNumber()
        );
        const content = piiRedacted ? this.guardrails.restoreOutput(result.content, guarded.redactionMap) : result.content;

        const response: AiCompletionResponse = {
          id: requestId,
          content,
          usage: {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
            estimatedCost
          },
          metadata: {
            provider: providerId,
            model,
            latencyMs,
            guardrailsApplied,
            piiRedacted
          },
          requiresApproval
        };

        if (requiresApproval) {
          await this.approvals.queueForApproval({
            organizationId,
            requestedById: request.userId,
            feature: request.feature,
            actionType: request.feature,
            generatedContent: response.content,
            entityType: request.context?.entityType,
            entityId: request.context?.entityId,
            originalRequest: request as any
          });
        }

        await this.costs.logUsage(request, response);
        this.logging.logSuccess(requestId, {
          latencyMs,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens
        });

        return response;
      } catch (error) {
        lastError = error;
        this.recordFailure(providerId, error);
        const latencyMs = Date.now() - startedAt;
        const detail = error instanceof Error ? error.message : String(error ?? 'unknown');
        const errorType = error instanceof AiProviderError ? error.type : 'unknown';
        this.logging.logFailure(requestId, { latencyMs, errorType, detail });

        await this.costs.logFailure({
          organizationId,
          userId: request.userId,
          feature: request.feature,
          provider: providerId,
          model,
          requestId,
          latencyMs,
          errorType,
          piiRedacted,
          guardrailsApplied,
          entityType: request.context?.entityType ?? null,
          entityId: request.context?.entityId ?? null
        });

        // Try next provider if available.
      }
    }

    const msg = lastError instanceof Error ? lastError.message : 'AI request failed';
    this.log.error(`AI complete failed id=${requestId}: ${msg}`);
    throw lastError instanceof Error ? lastError : new Error(msg);
  }

  private resolveModelForProvider(
    _provider: keyof typeof this.providers,
    params: {
      requestedModel?: string | null;
      promptModel?: string | null;
    }
  ): string {
    const requestedModel = params.requestedModel?.trim() ? params.requestedModel.trim() : null;
    const promptModel = params.promptModel?.trim() ? String(params.promptModel).trim() : null;

    if (requestedModel) return requestedModel;
    if (promptModel) return promptModel;
    return AiFoundationConfig.modelByProvider.grok ?? AiFoundationConfig.defaultModel;
  }

  private async withRetries<T>(fn: () => Promise<T>, maxAttempts = AiFoundationConfig.retries + 1): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        attempt += 1;

        const providerError = error instanceof AiProviderError ? error : null;
        const retryable = providerError ? providerError.isRetryable() : true;

        if (!retryable || attempt >= maxAttempts) {
          break;
        }

        const retryAfterMs = providerError?.retryAfterMs ?? null;
        const backoffMs =
          retryAfterMs ??
          AiFoundationConfig.retryBaseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError instanceof Error ? lastError : new Error('AI provider call failed');
  }

  private isCircuitOpen(provider: keyof typeof this.circuits) {
    const circuit = this.circuits[provider];
    if (circuit.state !== 'open') {
      return false;
    }

    if (Date.now() - circuit.openedAtMs > AiFoundationConfig.circuit.resetMs) {
      circuit.state = 'half';
      return false;
    }

    return true;
  }

  private recordSuccess(provider: keyof typeof this.circuits) {
    const circuit = this.circuits[provider];
    circuit.consecutiveFails = 0;
    if (circuit.state === 'half') {
      circuit.state = 'closed';
    }
  }

  private recordFailure(provider: keyof typeof this.circuits, error: unknown) {
    const circuit = this.circuits[provider];
    circuit.consecutiveFails += 1;

    const providerError = error instanceof AiProviderError ? error : null;
    if (providerError && providerError.type === 'auth') {
      // Configuration issues should not take down the circuit for everyone else.
      return;
    }

    if (circuit.consecutiveFails >= AiFoundationConfig.circuit.failsToOpen && circuit.state !== 'open') {
      circuit.state = 'open';
      circuit.openedAtMs = Date.now();
    }
  }
}

function resolveApprovalRequired(request: AiCompletionRequest): boolean {
  if (request.options?.requiresHumanApproval) {
    return true;
  }

  const defaults: Record<AiCompletionRequest['feature'], 'required' | 'optional' | 'none'> = {
    listing_description: 'optional',
    follow_up_email: 'required',
    follow_up_text: 'required',
    ad_copy: 'optional',
    objection_reply: 'required',
    lead_summary: 'none',
    conversation_summary: 'none',
    document_qa: 'none',
    property_dossier: 'none',
    nl_search: 'none',
    compliance_check: 'none',
    onboarding_assistant: 'none',
    contextual_help: 'none',
    training_assistant: 'none',
    video_assistant: 'none',
    commission_parser: 'none'
  };

  return defaults[request.feature] === 'required';
}
