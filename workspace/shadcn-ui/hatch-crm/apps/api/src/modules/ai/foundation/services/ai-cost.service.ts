import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@hatch/db';

import type { AiCompletionRequest, AiCompletionResponse, AiProviderId } from '../types/ai-request.types';
import { PrismaService } from '@/modules/prisma/prisma.service';

export type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type BudgetCheckResult = {
  allowed: boolean;
  hardLimited: boolean;
  reason?: string;
  projectedUsage?: Prisma.Decimal;
  monthlyBudget?: Prisma.Decimal | null;
};

type CostRow = { input: number; output: number };

const COST_PER_1K_TOKENS: Record<string, Record<string, CostRow>> = {
  openai: {
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
  },
  anthropic: {
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 }
  },
  gemini: {
    // Pricing varies by plan/region; keep 0 by default and override later.
    'gemini-1.5-pro': { input: 0, output: 0 },
    'gemini-1.5-flash': { input: 0, output: 0 }
  },
  grok: {
    // Pricing varies by plan; keep 0 by default and override later.
    'grok-beta': { input: 0, output: 0 }
  }
};

@Injectable()
export class AiCostService {
  constructor(private readonly prisma: PrismaService) {}

  calculateCost(provider: string, model: string, tokens: TokenUsage): Prisma.Decimal {
    const row = COST_PER_1K_TOKENS[provider]?.[model];
    if (!row) {
      return new Prisma.Decimal(0);
    }

    const promptUnits = new Prisma.Decimal(tokens.promptTokens).div(1000);
    const completionUnits = new Prisma.Decimal(tokens.completionTokens).div(1000);

    const inputCost = promptUnits.mul(row.input);
    const outputCost = completionUnits.mul(row.output);
    return inputCost.add(outputCost);
  }

  async logUsage(request: AiCompletionRequest, response: AiCompletionResponse & { metadata: { provider: string } }): Promise<void> {
    const organizationId = request.brokerageId;
    const userId = request.userId;
    const provider = response.metadata.provider;
    const model = response.metadata.model;

    await this.prisma.aiUsageLog.create({
      data: {
        organizationId,
        userId,
        feature: request.feature,
        provider,
        model,
        requestId: response.id,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        estimatedCost: new Prisma.Decimal(response.usage.estimatedCost),
        latencyMs: response.metadata.latencyMs,
        success: true,
        errorType: null,
        entityType: request.context?.entityType ?? null,
        entityId: request.context?.entityId ?? null,
        piiRedacted: response.metadata.piiRedacted,
        guardrailsApplied: response.metadata.guardrailsApplied
      }
    });

    await this.applyBudgetUsage(organizationId, new Prisma.Decimal(response.usage.estimatedCost));
  }

  async logFailure(params: {
    organizationId: string;
    userId: string;
    feature: string;
    provider: AiProviderId | string;
    model: string;
    requestId: string;
    latencyMs: number;
    errorType: string;
    piiRedacted: boolean;
    guardrailsApplied: string[];
    entityType?: string | null;
    entityId?: string | null;
  }) {
    await this.prisma.aiUsageLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        feature: params.feature,
        provider: params.provider,
        model: params.model,
        requestId: params.requestId,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: new Prisma.Decimal(0),
        latencyMs: params.latencyMs,
        success: false,
        errorType: params.errorType,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        piiRedacted: params.piiRedacted,
        guardrailsApplied: params.guardrailsApplied
      }
    });
  }

  async checkBudget(organizationId: string, estimatedCost: Prisma.Decimal): Promise<BudgetCheckResult> {
    const budget = await this.prisma.aiUsageBudget.findUnique({ where: { organizationId } });
    if (!budget) {
      return { allowed: true, hardLimited: false };
    }

    const monthlyBudget = budget.monthlyBudget;
    const projected = budget.currentPeriodUsage.add(estimatedCost);

    if (budget.hardLimit && monthlyBudget && projected.greaterThan(monthlyBudget)) {
      return {
        allowed: false,
        hardLimited: true,
        reason: 'monthly_budget_exceeded',
        projectedUsage: projected,
        monthlyBudget
      };
    }

    return {
      allowed: true,
      hardLimited: Boolean(budget.hardLimit),
      projectedUsage: projected,
      monthlyBudget
    };
  }

  async getUsageStats(organizationId: string, period: 'day' | 'week' | 'month') {
    const now = new Date();
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.aiUsageLog.findMany({
      where: { organizationId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    const totalCost = rows.reduce((sum, row) => sum + Number(row.estimatedCost ?? 0), 0);
    const totalCalls = rows.length;

    return {
      period,
      since,
      totalCalls,
      totalCost: Number.isFinite(totalCost) ? Number(totalCost.toFixed(4)) : 0
    };
  }

  @Cron('0 */6 * * *')
  async checkBudgetAlerts(): Promise<void> {
    // Phase 0: leave alert delivery to NotificationsModule integration.
    // This placeholder keeps the scheduler hook so we can wire it later.
    return;
  }

  @Cron('0 0 1 * *')
  async resetMonthlyUsage(): Promise<void> {
    const now = new Date();
    await this.prisma.aiUsageBudget.updateMany({
      data: {
        currentPeriodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        currentPeriodUsage: new Prisma.Decimal(0),
        alertsSent: []
      }
    });
  }

  private async applyBudgetUsage(organizationId: string, cost: Prisma.Decimal) {
    if (cost.lessThanOrEqualTo(0)) {
      return;
    }

    const budget = await this.prisma.aiUsageBudget.findUnique({ where: { organizationId } });
    if (!budget) {
      return;
    }

    await this.prisma.aiUsageBudget.update({
      where: { organizationId },
      data: { currentPeriodUsage: budget.currentPeriodUsage.add(cost) }
    });
  }
}
