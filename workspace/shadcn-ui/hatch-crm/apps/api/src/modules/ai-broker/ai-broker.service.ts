import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  ComplianceStatus,
  NotificationType,
  OrgEventType,
  AgentTrainingStatus,
  WorkflowTaskStatus,
  WorkflowTaskTrigger,
  UserRole
} from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { OrgEventsService } from '@/modules/org-events/org-events.service';
import { OnboardingService } from '@/modules/onboarding/onboarding.service';
import { AiEmployeesService } from '@/modules/ai-employees/ai-employees.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { MailService } from '@/modules/mail/mail.service';
import { TimelineService } from '@/modules/timelines/timeline.service';
import { complianceAlertEmail } from '@/modules/mail/templates';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';
import { AskBrokerAssistantDto } from './dto/ask-broker-assistant.dto';
import { AiAnswerDto } from './dto/ai-answer.dto';
import { EvaluateComplianceDto } from './dto/evaluate-compliance.dto';
import { ComplianceEvaluationResponseDto } from './dto/compliance-evaluation-response.dto';
import { UpdateRiskPackagesDto } from './dto/update-risk-packages.dto';
import { CreateCustomRiskPackageDto } from './dto/create-custom-risk-package.dto';
import { UpdateCustomRiskPackageDto } from './dto/update-custom-risk-package.dto';
import {
  computeRiskScore,
  normalizeRiskPackageIds,
  RISK_PACKAGES,
  type RiskPackageConfig,
  type RiskPackageDefinition,
  type RiskPackageId,
  type RiskSeverity,
  type RiskSignal
} from './risk-packages';

const ORG_ADDON_RISK_PACKAGES = 'risk_packages';

type JsonValue = Record<string, any> | null;

type ManualRiskOverride = {
  riskLevel: RiskSeverity;
  riskScore: number;
  reasonText?: string;
  actorUserId?: string;
  createdAt?: string;
  expiresAt?: string;
};

@Injectable()
export class AiBrokerService {
  private readonly dashboardBaseUrl = process.env.DASHBOARD_BASE_URL ?? 'http://localhost:5173/broker';

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly orgEvents: OrgEventsService,
    private readonly onboarding: OnboardingService,
    private readonly aiEmployees: AiEmployeesService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly timelines: TimelineService
  ) {}

  async askBrokerAssistant(orgId: string, userId: string, dto: AskBrokerAssistantDto): Promise<AiAnswerDto> {
    await this.assertUserInOrg(userId, orgId);

    const [orgContext, vaultContext] = await Promise.all([
      this.buildOrgContext(orgId),
      this.buildVaultContext(orgId)
    ]);

    let listingContext: JsonValue = null;
    if (dto.listingId) {
      listingContext = await this.buildListingContext(dto.listingId, orgId);
    }

    let transactionContext: JsonValue = null;
    if (dto.transactionId) {
      transactionContext = await this.buildTransactionContext(dto.transactionId, orgId);
    }

    const payload = {
      question: dto.question,
      contextType: dto.contextType ?? 'GENERAL',
      orgContext,
      listingContext,
      transactionContext,
      vaultContext
    };

    const personaResult = await this.aiEmployees.runPersona('brokerAssistant', {
      organizationId: orgId,
      userId,
      input: payload
    });

    const fallbackAnswer = this.buildFallbackAnswer(dto.question, orgContext, listingContext, transactionContext);
    return this.normalizeAiAnswer(personaResult.rawText ?? null, fallbackAnswer);
  }

  async evaluateCompliance(
    orgId: string,
    userId: string,
    dto: EvaluateComplianceDto
  ): Promise<ComplianceEvaluationResponseDto> {
    await this.assertUserInOrg(userId, orgId);

    let listingContext: JsonValue = null;
    let transactionContext: JsonValue = null;

    if (dto.targetType === 'LISTING') {
      if (!dto.listingId) {
        throw new ForbiddenException('listingId required for listing evaluations');
      }
      listingContext = await this.buildListingContext(dto.listingId, orgId);
    } else if (dto.targetType === 'TRANSACTION') {
      if (!dto.transactionId) {
        throw new ForbiddenException('transactionId required for transaction evaluations');
      }
      transactionContext = await this.buildTransactionContext(dto.transactionId, orgId);
    }

    const orgContext = await this.buildOrgContext(orgId);
    const payload = {
      targetType: dto.targetType,
      orgContext,
      listingContext,
      transactionContext
    };

    const systemPrompt =
      'You are Hatch AI Compliance Officer. Evaluate the provided listing or transaction context for real-estate compliance risk. ' +
      'Return strict JSON: {"riskLevel":"LOW|MEDIUM|HIGH","summary":string,"issues":[{"code":string,"title":string,"description":string,"severity":"LOW|MEDIUM|HIGH","relatedEntity":{"type":"LISTING|TRANSACTION|AGENT|DOCUMENT","id":string}}],"recommendations":string[]}. ' +
      'If no issues, return an empty issues array but still suggest proactive recommendations.';

    const aiResult = await this.aiService.runStructuredChat({
      systemPrompt,
      responseFormat: 'json_object',
      temperature: 0,
      messages: [{ role: 'user', content: JSON.stringify(payload) }]
    });

    const normalized = this.normalizeComplianceResponse(aiResult.text, dto);

    if (dto.targetType === 'LISTING' && dto.listingId) {
      await this.handleListingEvaluation(orgId, dto.listingId, userId, normalized);
    } else if (dto.targetType === 'TRANSACTION' && dto.transactionId) {
      await this.handleTransactionEvaluation(orgId, dto.transactionId, userId, normalized);
    }

    return normalized;
  }

  async recomputeAgentRiskForUser(orgId: string, userId: string, agentProfileId: string) {
    await this.assertUserInOrg(userId, orgId);
    const result = await this.recomputeAgentRisk(orgId, agentProfileId);
    if (!result) {
      throw new NotFoundException('Agent profile not found');
    }
    return result;
  }

  async getAgentRiskAnalysisForUser(orgId: string, userId: string, agentProfileId: string) {
    await this.assertUserInOrg(userId, orgId);

    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: {
        id: true,
        organizationId: true,
        riskScore: true,
        riskLevel: true,
        riskFlags: true,
        user: { select: { firstName: true, lastName: true } }
      }
    });
    if (!profile || profile.organizationId !== orgId) {
      throw new NotFoundException('Agent profile not found');
    }

    const agentName = `${profile.user?.firstName ?? ''} ${profile.user?.lastName ?? ''}`.trim() || 'Agent';

    const riskScore = typeof profile.riskScore === 'number' && Number.isFinite(profile.riskScore) ? profile.riskScore : 0;
    const riskLevel = this.normalizeSeverity(profile.riskLevel) ?? 'LOW';

    const riskFlags = profile.riskFlags as any;
    const storedSignals = Array.isArray(riskFlags?.riskSignals) ? (riskFlags.riskSignals as RiskSignal[]) : [];
    const topSignals = storedSignals.slice(0, 8).map((signal) => ({
      source: signal.source,
      code: signal.code,
      severity: signal.severity,
      description: signal.description,
      pointsAdded: typeof (signal.meta as any)?.pointsAdded === 'number' ? (signal.meta as any).pointsAdded : undefined
    }));

    const packageState = await this.getRiskPackageState(orgId);
    const activePackageNames = packageState.packages
      .filter((pkg) => packageState.activePackageIds.includes(pkg.id))
      .map((pkg) => pkg.name);

    const fallback = {
      summary:
        riskScore <= 0 || topSignals.length === 0
          ? `${agentName} has no active risk signals right now.`
          : `${agentName} is currently flagged as ${riskLevel.toLowerCase()} risk with a score of ${riskScore}.`,
      suggestions:
        topSignals.length === 0
          ? []
          : [
              'Review the top risk drivers and confirm the underlying data is accurate.',
              'Assign an owner + due date for each compliance follow-up.',
              'Recompute risk after closing open items.'
            ],
      priority: riskScore <= 0 ? 'none' : riskLevel === 'HIGH' ? 'high' : riskLevel === 'MEDIUM' ? 'medium' : 'low'
    } as const;

    if (topSignals.length === 0) {
      return {
        agentProfileId: profile.id,
        riskScore,
        riskLevel,
        summary: fallback.summary,
        suggestions: fallback.suggestions,
        priority: fallback.priority,
        generatedAt: new Date().toISOString()
      };
    }

    const systemPrompt =
      'You are Hatch Risk Compliance Officer. Summarize the current agent risk and propose remediation steps. ' +
      'Return strict JSON: {"summary":string,"suggestions":string[],"priority":"none|low|medium|high"}. ' +
      'Keep summary to 1-2 sentences and suggestions to at most 5 items.';

    const aiResult = await this.aiService.runStructuredChat({
      systemPrompt,
      responseFormat: 'json_object',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            agentName,
            riskScore,
            riskLevel,
            activePackages: activePackageNames,
            topSignals
          })
        }
      ]
    });

    const parsed = aiResult.text ? this.safeJsonParse(aiResult.text) : null;
    const summary = typeof parsed?.summary === 'string' ? parsed.summary : fallback.summary;
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter((item: unknown) => typeof item === 'string').slice(0, 5)
      : fallback.suggestions;
    const priority =
      parsed?.priority === 'none' || parsed?.priority === 'low' || parsed?.priority === 'medium' || parsed?.priority === 'high'
        ? parsed.priority
        : fallback.priority;

    return {
      agentProfileId: profile.id,
      riskScore,
      riskLevel,
      summary,
      suggestions,
      priority,
      generatedAt: new Date().toISOString()
    };
  }

  async listRiskPackagesForUser(orgId: string, userId: string) {
    await this.assertUserInOrg(userId, orgId);
    const state = await this.getRiskPackageState(orgId);
    return { activePackageIds: state.activePackageIds, packages: state.packages, updatedAt: state.updatedAt?.toISOString() };
  }

  async updateRiskPackagesForUser(orgId: string, userId: string, dto: UpdateRiskPackagesDto) {
    await this.assertUserInOrg(userId, orgId);
    const state = await this.getRiskPackageState(orgId);
    const requestedIds = normalizeRiskPackageIds(dto.activePackageIds);
    const availableIds = new Set(state.packages.map((pkg) => pkg.id));
    const activePackageIds = requestedIds.filter((id) => availableIds.has(id));
    const updated = await this.upsertRiskPackageState(orgId, { activePackageIds, customPackages: state.customPackages });

    return {
      activePackageIds,
      packages: state.packages,
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  async createCustomRiskPackageForUser(orgId: string, userId: string, dto: CreateCustomRiskPackageDto) {
    await this.assertUserInOrg(userId, orgId);
    const state = await this.getRiskPackageState(orgId);

    if (state.customPackages.length >= 50) {
      throw new ForbiddenException('Maximum custom packages reached');
    }

    const name = dto.name?.trim();
    if (!name) {
      throw new ForbiddenException('Package name is required');
    }

    const signalMultipliers = this.normalizeNumberMap(dto.signalMultipliers, 200);
    if (!Object.keys(signalMultipliers).length) {
      throw new ForbiddenException('signalMultipliers must include at least one entry');
    }

    const id = `custom_${uuid()}`;
    const group = (dto.group?.trim() || 'Custom') as any;
    const description = dto.description?.trim() || 'Custom risk package';

    const next: RiskPackageDefinition = {
      id,
      name,
      description,
      group,
      signalMultipliers,
      categoryCaps: Object.keys(dto.categoryCaps ?? {}).length ? this.normalizeNumberMap(dto.categoryCaps, 100) : undefined,
      categoryDefaultMultiplier:
        typeof dto.categoryDefaultMultiplier === 'number' && Number.isFinite(dto.categoryDefaultMultiplier)
          ? dto.categoryDefaultMultiplier
          : undefined,
      categoryMultipliers: Object.keys(dto.categoryMultipliers ?? {}).length
        ? this.normalizeNumberMap(dto.categoryMultipliers, 100)
        : undefined,
      isCustom: true
    };

    const updated = await this.upsertRiskPackageState(orgId, {
      activePackageIds: state.activePackageIds,
      customPackages: [...state.customPackages, next]
    });

    return {
      activePackageIds: state.activePackageIds,
      packages: [...RISK_PACKAGES, ...state.customPackages, next],
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  async updateCustomRiskPackageForUser(orgId: string, userId: string, packageId: string, dto: UpdateCustomRiskPackageDto) {
    await this.assertUserInOrg(userId, orgId);
    const id = (packageId ?? '').trim();
    if (!id) {
      throw new ForbiddenException('packageId is required');
    }

    const state = await this.getRiskPackageState(orgId);
    const idx = state.customPackages.findIndex((pkg) => pkg.id === id);
    if (idx === -1) {
      throw new NotFoundException('Custom package not found');
    }

    const existing = state.customPackages[idx]!;
    const name = dto.name?.trim() || existing.name;
    const description = dto.description?.trim() || existing.description;
    const group = (dto.group?.trim() || existing.group || 'Custom') as any;

    const signalMultipliers =
      dto.signalMultipliers !== undefined ? this.normalizeNumberMap(dto.signalMultipliers, 200) : existing.signalMultipliers;
    if (!Object.keys(signalMultipliers).length) {
      throw new ForbiddenException('signalMultipliers must include at least one entry');
    }

    const next: RiskPackageDefinition = {
      ...existing,
      name,
      description,
      group,
      signalMultipliers,
      categoryCaps: dto.categoryCaps !== undefined ? this.normalizeNumberMap(dto.categoryCaps, 100) : existing.categoryCaps,
      categoryDefaultMultiplier:
        dto.categoryDefaultMultiplier !== undefined &&
        typeof dto.categoryDefaultMultiplier === 'number' &&
        Number.isFinite(dto.categoryDefaultMultiplier)
          ? dto.categoryDefaultMultiplier
          : dto.categoryDefaultMultiplier !== undefined
            ? undefined
            : existing.categoryDefaultMultiplier,
      categoryMultipliers:
        dto.categoryMultipliers !== undefined ? this.normalizeNumberMap(dto.categoryMultipliers, 100) : existing.categoryMultipliers,
      isCustom: true
    };

    const customPackages = state.customPackages.slice();
    customPackages[idx] = next;

    const updated = await this.upsertRiskPackageState(orgId, {
      activePackageIds: state.activePackageIds,
      customPackages
    });

    return {
      activePackageIds: state.activePackageIds,
      packages: [...RISK_PACKAGES, ...customPackages],
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  async deleteCustomRiskPackageForUser(orgId: string, userId: string, packageId: string) {
    await this.assertUserInOrg(userId, orgId);
    const id = (packageId ?? '').trim();
    if (!id) {
      throw new ForbiddenException('packageId is required');
    }

    const state = await this.getRiskPackageState(orgId);
    const exists = state.customPackages.some((pkg) => pkg.id === id);
    if (!exists) {
      throw new NotFoundException('Custom package not found');
    }

    const customPackages = state.customPackages.filter((pkg) => pkg.id !== id);
    const activePackageIds = state.activePackageIds.filter((pkgId) => pkgId !== id);

    const updated = await this.upsertRiskPackageState(orgId, { activePackageIds, customPackages });

    return {
      activePackageIds,
      packages: [...RISK_PACKAGES, ...customPackages],
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  async recomputeOrgRiskForUser(orgId: string, userId: string) {
    await this.assertUserInOrg(userId, orgId);
    const config = await this.getRiskPackageConfig(orgId);
    const agentProfiles = await this.prisma.agentProfile.findMany({
      where: { organizationId: orgId },
      select: { id: true }
    });

    const concurrency = 5;
    let updatedCount = 0;
    let errorCount = 0;

    for (let idx = 0; idx < agentProfiles.length; idx += concurrency) {
      const batch = agentProfiles.slice(idx, idx + concurrency);
      const results = await Promise.all(
        batch.map(async (profile) => {
          try {
            return await this.recomputeAgentRisk(orgId, profile.id, config);
          } catch (error) {
            errorCount += 1;
            return null;
          }
        })
      );
      updatedCount += results.filter(Boolean).length;
    }

    return { processed: agentProfiles.length, updated: updatedCount, errors: errorCount };
  }

  private async getRiskPackageConfig(orgId: string): Promise<RiskPackageConfig> {
    const state = await this.getRiskPackageState(orgId);
    return { activePackageIds: state.activePackageIds };
  }

  private normalizeCustomPackages(value: unknown): RiskPackageDefinition[] {
    if (!Array.isArray(value)) return [];
    const packages: RiskPackageDefinition[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const raw = entry as Record<string, any>;
      const id = typeof raw.id === 'string' ? raw.id.trim() : '';
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      const description = typeof raw.description === 'string' ? raw.description.trim() : '';
      if (!id || !name) continue;

      const group = typeof raw.group === 'string' && raw.group.trim() ? (raw.group.trim() as any) : ('Custom' as const);

      const signalMultipliers = this.normalizeNumberMap(raw.signalMultipliers, 200);
      if (!Object.keys(signalMultipliers).length) continue;

      const categoryCaps = this.normalizeNumberMap(raw.categoryCaps, 100);
      const categoryMultipliers = this.normalizeNumberMap(raw.categoryMultipliers, 100);
      const categoryDefaultMultiplier =
        typeof raw.categoryDefaultMultiplier === 'number' && Number.isFinite(raw.categoryDefaultMultiplier)
          ? raw.categoryDefaultMultiplier
          : undefined;

      packages.push({
        id,
        name,
        description,
        group,
        signalMultipliers,
        categoryCaps: Object.keys(categoryCaps).length ? categoryCaps : undefined,
        categoryDefaultMultiplier,
        categoryMultipliers: Object.keys(categoryMultipliers).length ? categoryMultipliers : undefined,
        isCustom: true
      });
    }
    return packages;
  }

  private normalizeNumberMap(value: unknown, maxEntries: number): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => typeof key === 'string' && key.trim())
      .slice(0, maxEntries)
      .map(([key, rawValue]) => {
        const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        if (!Number.isFinite(num)) return null;
        return [key.trim(), num] as const;
      })
      .filter(Boolean) as Array<readonly [string, number]>;

    return Object.fromEntries(entries);
  }

  private async getRiskPackageState(orgId: string): Promise<{
    activePackageIds: RiskPackageId[];
    customPackages: RiskPackageDefinition[];
    packages: RiskPackageDefinition[];
    updatedAt?: Date;
  }> {
    const row = await this.prisma.organizationAddon.findUnique({
      where: {
        organizationId_key: {
          organizationId: orgId,
          key: ORG_ADDON_RISK_PACKAGES
        }
      },
      select: { metadata: true, updatedAt: true }
    });

    const metadata = row?.metadata as any;
    const customPackages = this.normalizeCustomPackages(metadata?.customPackages);
    const packages: RiskPackageDefinition[] = [...RISK_PACKAGES, ...customPackages];
    const availableIds = new Set(packages.map((pkg) => pkg.id));
    const activePackageIds = normalizeRiskPackageIds(metadata?.activePackageIds).filter((id) => availableIds.has(id));

    return { activePackageIds, customPackages, packages, updatedAt: row?.updatedAt };
  }

  private upsertRiskPackageState(
    orgId: string,
    state: { activePackageIds: RiskPackageId[]; customPackages: RiskPackageDefinition[] }
  ) {
    const metadata = {
      version: 2,
      activePackageIds: state.activePackageIds,
      customPackages: state.customPackages.map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        group: pkg.group,
        signalMultipliers: pkg.signalMultipliers,
        categoryCaps: pkg.categoryCaps,
        categoryDefaultMultiplier: pkg.categoryDefaultMultiplier,
        categoryMultipliers: pkg.categoryMultipliers
      }))
    };

    return this.prisma.organizationAddon.upsert({
      where: {
        organizationId_key: {
          organizationId: orgId,
          key: ORG_ADDON_RISK_PACKAGES
        }
      },
      create: {
        organizationId: orgId,
        key: ORG_ADDON_RISK_PACKAGES,
        enabled: true,
        metadata
      },
      update: {
        enabled: true,
        metadata
      },
      select: { updatedAt: true }
    });
  }

  private async handleListingEvaluation(
    orgId: string,
    listingId: string,
    actorId: string,
    evaluation: ComplianceEvaluationResponseDto
  ) {
    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId },
      include: {
        agentProfile: true
      }
    });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.agentProfileId && listing.agentProfile) {
      const nextFlags = this.mergeRiskFlags(listing.agentProfile.riskFlags, {
        timestamp: new Date().toISOString(),
        targetType: 'LISTING',
        listingId,
        riskLevel: evaluation.riskLevel,
        summary: evaluation.summary ?? null,
        issues: evaluation.issues.slice(0, 6).map((issue) => ({
          code: issue.code ?? null,
          title: issue.title,
          severity: issue.severity,
          relatedEntity: issue.relatedEntity ?? null
        }))
      });
      await this.prisma.agentProfile.update({
        where: { id: listing.agentProfileId },
        data: { riskFlags: nextFlags }
      });

      if (evaluation.riskLevel === 'HIGH') {
        await this.onboarding.generateOffboardingTasksForAgent(
          orgId,
          listing.agentProfileId,
          WorkflowTaskTrigger.AI_HIGH_RISK,
          `LISTING:${listingId}`,
          actorId
        );
      }

      await this.recomputeAgentRisk(orgId, listing.agentProfileId);
    }

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId,
      type: OrgEventType.ORG_LISTING_EVALUATED,
      payload: {
        listingId,
        riskLevel: evaluation.riskLevel,
        issuesCount: evaluation.issues.length,
        agentProfileId: listing.agentProfileId ?? null
      }
    });

    if (evaluation.riskLevel === 'HIGH' || evaluation.issues.length > 0) {
      await this.notifyComplianceRecipients(orgId, evaluation.summary ?? 'Listing compliance issues detected.', {
        listingId
      });
    }
  }

  private async handleTransactionEvaluation(
    orgId: string,
    transactionId: string,
    actorId: string,
    evaluation: ComplianceEvaluationResponseDto
  ) {
    const transaction = await this.prisma.orgTransaction.findUnique({
      where: { id: transactionId },
      include: {
        agentProfile: true
      }
    });
    if (!transaction || transaction.organizationId !== orgId) {
      throw new NotFoundException('Transaction not found');
    }

    const requiresAction = evaluation.riskLevel !== 'LOW' || evaluation.issues.length > 0;
    await this.prisma.orgTransaction.update({
      where: { id: transactionId },
      data: {
        isCompliant: !requiresAction,
        requiresAction,
        complianceNotes: evaluation.summary?.slice(0, 500) ?? null
      }
    });

    if (transaction.agentProfileId && transaction.agentProfile) {
      const nextFlags = this.mergeRiskFlags(transaction.agentProfile.riskFlags, {
        timestamp: new Date().toISOString(),
        targetType: 'TRANSACTION',
        transactionId,
        riskLevel: evaluation.riskLevel,
        summary: evaluation.summary ?? null,
        issues: evaluation.issues.slice(0, 6).map((issue) => ({
          code: issue.code ?? null,
          title: issue.title,
          severity: issue.severity,
          relatedEntity: issue.relatedEntity ?? null
        }))
      });
      await this.prisma.agentProfile.update({
        where: { id: transaction.agentProfileId },
        data: { riskFlags: nextFlags }
      });

      if (evaluation.riskLevel === 'HIGH') {
        await this.onboarding.generateOffboardingTasksForAgent(
          orgId,
          transaction.agentProfileId,
          WorkflowTaskTrigger.AI_HIGH_RISK,
          `TRANSACTION:${transactionId}`,
          actorId
        );
      }

      await this.recomputeAgentRisk(orgId, transaction.agentProfileId);
    }

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId,
      type: OrgEventType.ORG_TRANSACTION_EVALUATED,
      payload: {
        transactionId,
        riskLevel: evaluation.riskLevel,
        issuesCount: evaluation.issues.length,
        agentProfileId: transaction.agentProfileId ?? null
      }
    });

    if (evaluation.riskLevel === 'HIGH' || evaluation.issues.length > 0) {
      await this.notifyComplianceRecipients(orgId, evaluation.summary ?? 'Transaction compliance issues detected.', {
        transactionId
      });
    }
  }

  private upsertRiskSignals(
    existing: unknown,
    signals: RiskSignal[],
    computation?: {
      score: number;
      level: RiskSeverity;
      baseScore: number;
      baseLevel: RiskSeverity;
      computedAt: string;
      activePackageIds: RiskPackageConfig['activePackageIds'];
    }
  ): Record<string, any> {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, any>) } : {};
    base.riskSignals = this.trimSignalsForStorage(signals);
    if (computation) {
      base.riskComputation = computation;
    }
    return base;
  }

  private trimSignalsForStorage(signals: RiskSignal[]): RiskSignal[] {
    const severityOrder: Record<RiskSeverity, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const scoreOf = (signal: RiskSignal) => {
      const pointsAdded = (signal.meta as any)?.pointsAdded;
      return typeof pointsAdded === 'number' && Number.isFinite(pointsAdded) ? pointsAdded : 0;
    };

    const now = new Date().toISOString();
    return signals
      .slice()
      .sort(
        (a, b) =>
          scoreOf(b) - scoreOf(a) ||
          severityOrder[b.severity] - severityOrder[a.severity] ||
          a.source.localeCompare(b.source) ||
          a.code.localeCompare(b.code)
      )
      .slice(0, 12)
      .map((signal) => ({
        source: signal.source,
        code: signal.code,
        severity: signal.severity,
        description: signal.description,
        category: signal.category,
        detectedAt: signal.detectedAt ?? now,
        ttlHours: signal.ttlHours,
        meta: signal.meta
      }));
  }

  private mergeRiskFlags(existing: unknown, entry: Record<string, unknown>): Record<string, any> {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, any>) } : {};
    const history = Array.isArray(base.aiCompliance) ? [...base.aiCompliance] : [];
    history.push(entry);
    base.aiCompliance = history.slice(-5);
    return base;
  }

  private buildAgentSignals(profile: {
    id: string;
    organizationId: string;
    isCompliant: boolean;
    requiresAction: boolean;
    riskFlags: any;
    licenseExpiresAt: Date | null;
    ceHoursRequired: number | null;
    ceHoursCompleted: number | null;
    memberships: Array<{ status: string; expiresAt: Date | null; type: string; name: string }>;
  }): RiskSignal[] {
    const now = new Date();
    const msInDay = 24 * 60 * 60 * 1000;
    const signals: RiskSignal[] = [];

    const daysToExpiry = profile.licenseExpiresAt
      ? Math.floor((profile.licenseExpiresAt.getTime() - now.getTime()) / msInDay)
      : null;
    if (daysToExpiry !== null) {
      if (daysToExpiry < 0) {
        signals.push({
          source: 'LICENSE',
          code: 'LICENSE_EXPIRED',
          severity: 'HIGH',
          description: `License expired ${Math.abs(daysToExpiry)} day(s) ago`
        });
      } else if (daysToExpiry <= 30) {
        signals.push({
          source: 'LICENSE',
          code: 'LICENSE_EXPIRING_SOON',
          severity: 'MEDIUM',
          description: `License expires in ${daysToExpiry} day(s)`
        });
      }
    }

    if (profile.ceHoursRequired && profile.ceHoursCompleted !== null) {
      const gap = profile.ceHoursRequired - profile.ceHoursCompleted;
      if (gap > 0) {
        const completionRatio = profile.ceHoursCompleted / profile.ceHoursRequired;
        const severity: RiskSeverity = completionRatio < 0.5 ? 'HIGH' : 'MEDIUM';
        signals.push({
          source: 'CE',
          code: 'CE_HOURS_INCOMPLETE',
          severity,
          description: `CE gap of ${gap} hour(s) (${profile.ceHoursCompleted}/${profile.ceHoursRequired})`,
          meta: { gap, required: profile.ceHoursRequired, completed: profile.ceHoursCompleted }
        });
      }
    }

    for (const membership of profile.memberships ?? []) {
      const status = (membership.status ?? '').toUpperCase();
      if (status === 'EXPIRED') {
        signals.push({
          source: 'MEMBERSHIP',
          code: 'MEMBERSHIP_EXPIRED',
          severity: 'HIGH',
          description: `${membership.name} membership expired`
        });
      } else if (status === 'PENDING') {
        signals.push({
          source: 'MEMBERSHIP',
          code: 'MEMBERSHIP_PENDING',
          severity: 'MEDIUM',
          description: `${membership.name} membership pending`
        });
      } else if (membership.expiresAt) {
        const days = Math.floor((membership.expiresAt.getTime() - now.getTime()) / msInDay);
        if (days <= 30) {
          signals.push({
            source: 'MEMBERSHIP',
            code: 'MEMBERSHIP_EXPIRING_SOON',
            severity: 'MEDIUM',
            description: `${membership.name} expires in ${days} day(s)`
          });
        }
      }
    }

    if (!profile.isCompliant || profile.requiresAction) {
      signals.push({
        source: 'AGENT_COMPLIANCE',
        code: profile.requiresAction ? 'ACTION_REQUIRED' : 'NON_COMPLIANT',
        severity: profile.requiresAction ? 'HIGH' : 'MEDIUM',
        description: profile.requiresAction ? 'Agent flagged for broker action' : 'Agent is marked non-compliant'
      });
    }

    const aiHistory = Array.isArray((profile.riskFlags as any)?.aiCompliance)
      ? (profile.riskFlags as any).aiCompliance
      : [];
    for (const entry of aiHistory) {
      const severity = this.normalizeSeverity((entry as any)?.riskLevel);
      if (!severity) continue;
      signals.push({
        source: 'AI',
        code: 'AI_COMPLIANCE',
        severity,
        description: (entry as any)?.summary ?? 'AI compliance review',
        category: 'AI',
        detectedAt: (entry as any)?.timestamp
      });

      const issues = Array.isArray((entry as any)?.issues) ? (entry as any).issues : [];
      for (const issue of issues.slice(0, 3)) {
        const issueSeverity = this.normalizeSeverity((issue as any)?.severity) ?? severity;
        signals.push({
          source: 'AI',
          code: 'AI_RISK_FLAG',
          severity: issueSeverity,
          description: typeof (issue as any)?.title === 'string' ? (issue as any).title : 'AI flagged an issue',
          category: 'AI',
          detectedAt: (entry as any)?.timestamp,
          ttlHours: 24 * 14,
          meta: {
            issueCode: typeof (issue as any)?.code === 'string' ? (issue as any).code : undefined,
            relatedEntity: (issue as any)?.relatedEntity
          }
        });
      }
    }

    return signals;
  }

  private normalizeSeverity(value: any): RiskSeverity | null {
    if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') return value;
    return null;
  }

  private getActiveManualRiskOverride(riskFlags: unknown, now = new Date()): ManualRiskOverride | null {
    if (!riskFlags || typeof riskFlags !== 'object' || Array.isArray(riskFlags)) {
      return null;
    }

    const override = (riskFlags as any).manualOverride;
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      return null;
    }

    const riskLevel = this.normalizeSeverity((override as any).riskLevel);
    const riskScore = (override as any).riskScore;
    if (!riskLevel || typeof riskScore !== 'number' || Number.isNaN(riskScore)) {
      return null;
    }

    const expiresAtRaw = (override as any).expiresAt;
    if (typeof expiresAtRaw === 'string') {
      const expiresAt = new Date(expiresAtRaw);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now.getTime()) {
        return null;
      }
    }

    return {
      riskLevel,
      riskScore: Math.min(100, Math.max(0, Math.round(riskScore))),
      reasonText: typeof (override as any).reasonText === 'string' ? (override as any).reasonText : undefined,
      actorUserId: typeof (override as any).actorUserId === 'string' ? (override as any).actorUserId : undefined,
      createdAt: typeof (override as any).createdAt === 'string' ? (override as any).createdAt : undefined,
      expiresAt: typeof expiresAtRaw === 'string' ? expiresAtRaw : undefined
    };
  }

  async recomputeAgentRisk(orgId: string, agentProfileId: string, configOverride?: RiskPackageConfig) {
    const [profile, openTransactions, failingDocs, openTasks, requiredTrainingAssigned, requiredTrainingCompleted] =
      await Promise.all([
      this.prisma.agentProfile.findUnique({
        where: { id: agentProfileId },
        include: { memberships: true }
      }),
      this.prisma.orgTransaction.count({
        where: { organizationId: orgId, agentProfileId, requiresAction: true }
      }),
      this.prisma.orgFile.count({
        where: {
          orgId: orgId,
          complianceStatus: { in: [ComplianceStatus.FAILED, ComplianceStatus.PENDING] },
          OR: [
            { listing: { agentProfileId } },
            { transaction: { agentProfileId } }
          ]
        }
      }),
      this.prisma.agentWorkflowTask.count({
        where: {
          organizationId: orgId,
          agentProfileId,
          status: { in: [WorkflowTaskStatus.PENDING, WorkflowTaskStatus.IN_PROGRESS] }
        }
      }),
      this.prisma.agentTrainingProgress.count({
        where: {
          agentProfileId,
          module: { required: true }
        }
      }),
      this.prisma.agentTrainingProgress.count({
        where: {
          agentProfileId,
          module: { required: true },
          status: AgentTrainingStatus.COMPLETED
        }
      })
    ]);
    if (!profile || profile.organizationId !== orgId) {
      return null;
    }

    const packageState = await this.getRiskPackageState(orgId);
    const packageConfig = configOverride ?? { activePackageIds: packageState.activePackageIds };
    const signals = this.buildAgentSignals({
      id: profile.id,
      organizationId: profile.organizationId,
      isCompliant: profile.isCompliant,
      requiresAction: profile.requiresAction,
      riskFlags: profile.riskFlags,
      licenseExpiresAt: profile.licenseExpiresAt,
      ceHoursRequired: profile.ceHoursRequired,
      ceHoursCompleted: profile.ceHoursCompleted,
      memberships: profile.memberships.map((m) => ({
        status: m.status,
        expiresAt: m.expiresAt,
        type: m.type,
        name: m.name
      }))
    });

    if (openTransactions > 0) {
      signals.push({
        source: 'TRANSACTION',
        code: 'OPEN_COMPLIANCE_ISSUES',
        severity: openTransactions > 2 ? 'HIGH' : 'MEDIUM',
        description: `${openTransactions} transaction(s) need compliance action`
      });
    }

    if (failingDocs > 0) {
      signals.push({
        source: 'DOCUMENTS',
        code: 'DOCS_PENDING_OR_FAILED',
        severity: failingDocs > 2 ? 'HIGH' : 'MEDIUM',
        description: `${failingDocs} document(s) pending or failed compliance`
      });
    }

    if (openTasks > 0) {
      signals.push({
        source: 'WORKFLOW',
        code: 'OPEN_COMPLIANCE_TASKS',
        severity: openTasks > 3 ? 'HIGH' : 'MEDIUM',
        description: `${openTasks} compliance tasks open`
      });
    }

    const requiredTrainingGap = Math.max(0, requiredTrainingAssigned - requiredTrainingCompleted);
    if (requiredTrainingGap > 0) {
      const severity: RiskSeverity = requiredTrainingGap >= 3 || requiredTrainingCompleted === 0 ? 'HIGH' : 'MEDIUM';
      signals.push({
        source: 'TRAINING',
        code: 'REQUIRED_TRAINING_INCOMPLETE',
        severity,
        description: `${requiredTrainingGap} required training module(s) incomplete`,
        meta: {
          requiredTrainingAssigned,
          requiredTrainingCompleted,
          requiredTrainingGap
        }
      });
    }

    const now = new Date();
    const availablePackages = packageState.packages;
    const baseComputation = computeRiskScore(signals, { activePackageIds: [] }, now, availablePackages);
    const weightedComputation = computeRiskScore(signals, packageConfig, now, availablePackages);
    const { score, level, signals: normalizedSignals } = weightedComputation;
    const manualOverride = this.getActiveManualRiskOverride(profile.riskFlags);
    const requiresAction = manualOverride ? manualOverride.riskLevel !== 'LOW' : profile.requiresAction || level !== 'LOW';
    const nextFlags = this.upsertRiskSignals(profile.riskFlags, normalizedSignals, {
      score,
      level,
      baseScore: baseComputation.score,
      baseLevel: baseComputation.level,
      computedAt: new Date().toISOString(),
      activePackageIds: packageConfig.activePackageIds
    });

    await this.prisma.agentProfile.update({
      where: { id: profile.id },
      data: {
        riskScore: manualOverride ? manualOverride.riskScore : score,
        riskLevel: manualOverride ? manualOverride.riskLevel : level,
        riskFlags: nextFlags,
        requiresAction
      }
    });

    return { score: manualOverride ? manualOverride.riskScore : score, level: manualOverride ? manualOverride.riskLevel : level };
  }

  private normalizeAiAnswer(rawText: string | null, fallback: string): AiAnswerDto {
    let parsed: any = null;
    if (rawText) {
      parsed = this.safeJsonParse(rawText);
    }

    if (parsed && typeof parsed.answer === 'string') {
      return {
        answer: parsed.answer,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        references: Array.isArray(parsed.references) ? parsed.references : []
      };
    }

    return { answer: fallback, suggestions: ['Review latest compliance handbook in your vault.'] };
  }

  private normalizeComplianceResponse(rawText: string | null, dto: EvaluateComplianceDto) {
    let parsed: any = null;
    if (rawText) {
      parsed = this.safeJsonParse(rawText);
    }

    const response = new ComplianceEvaluationResponseDto();
    response.riskLevel =
      parsed && typeof parsed.riskLevel === 'string' && ['LOW', 'MEDIUM', 'HIGH'].includes(parsed.riskLevel)
        ? parsed.riskLevel
        : 'MEDIUM';
    response.summary = typeof parsed?.summary === 'string' ? parsed.summary : `Automated review for ${dto.targetType}`;
    if (Array.isArray(parsed?.issues)) {
      response.issues = parsed.issues.map((issue: any) => ({
        code: typeof issue?.code === 'string' ? issue.code : undefined,
        title: typeof issue?.title === 'string' ? issue.title : 'Potential issue',
        description:
          typeof issue?.description === 'string'
            ? issue.description
            : 'AI detected a potential compliance gap that should be reviewed.',
        severity:
          typeof issue?.severity === 'string' && ['LOW', 'MEDIUM', 'HIGH'].includes(issue.severity)
            ? issue.severity
            : 'MEDIUM',
        relatedEntity:
          issue?.relatedEntity && typeof issue.relatedEntity === 'object'
            ? {
                type: issue.relatedEntity.type ?? dto.targetType,
                id: issue.relatedEntity.id
              }
            : undefined
      }));
    } else {
      response.issues = [];
    }
    response.recommendations = Array.isArray(parsed?.recommendations)
      ? parsed.recommendations
      : ['Schedule a broker review meeting', 'Ensure the required documents are uploaded to the vault'];

    return response;
  }

  private buildFallbackAnswer(question: string, org: JsonValue, listing: JsonValue, transaction: JsonValue) {
    let subject = 'your organization';
    if (listing) subject = 'the referenced listing';
    else if (transaction) subject = 'the referenced transaction';

    const orgName = (org as any)?.organization?.name;
    const prefix = orgName ? `Hatch summary for ${orgName}: ` : 'Hatch summary: ';
    return `${prefix}Based on ${subject}, consider reviewing your compliance playbook. Question received: "${question}".`;
  }

  private safeJsonParse(text: string) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private async notifyComplianceRecipients(
    orgId: string,
    summary: string,
    links: { listingId?: string; transactionId?: string }
  ) {
    const brokers = await this.prisma.user.findMany({
      where: { organizationId: orgId, role: UserRole.BROKER },
      select: { id: true, email: true, firstName: true, lastName: true }
    });
    if (!brokers.length) {
      return;
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true }
    });
    const complianceLink = `${this.dashboardBaseUrl.replace(/\/+$/, '')}/compliance`;

    await Promise.all(
      brokers.map(async (broker) => {
        await this.notifications.createNotification({
          organizationId: orgId,
          userId: broker.id,
          type: NotificationType.COMPLIANCE,
          title: 'Compliance alert',
          message: summary,
          listingId: links.listingId,
          transactionId: links.transactionId
        });

        const shouldEmail = await this.notifications.shouldSendEmail(orgId, broker.id, NotificationType.COMPLIANCE);
        if (shouldEmail && broker.email) {
          const template = complianceAlertEmail({
            brokerName: [broker.firstName, broker.lastName].filter(Boolean).join(' ') || undefined,
            orgName: organization?.name ?? 'Hatch',
            issueSummary: summary,
            complianceLink
          });
          await this.mail.sendMail({
            to: broker.email,
            subject: template.subject,
            text: template.text,
            html: template.html
          });
        }
      })
    );
  }

  private async assertUserInOrg(userId: string, orgId: string) {
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } }
    });
    if (!membership) {
      throw new ForbiddenException('User is not part of this organization');
    }
  }

  private async buildOrgContext(orgId: string): Promise<JsonValue> {
    const [organization, agentProfiles, trainingModules, recentEvents] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true, createdAt: true, slug: true }
      }),
      this.prisma.agentProfile.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          licenseState: true,
          riskLevel: true,
          isCompliant: true,
          requiresAction: true,
          user: { select: { firstName: true, lastName: true } }
        },
        take: 5,
        orderBy: { updatedAt: 'desc' }
      }),
      this.prisma.agentTrainingModule.findMany({
        where: { organizationId: orgId },
        select: { id: true, title: true, required: true, estimatedMinutes: true },
        take: 5,
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.orgEvent.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { type: true, message: true }
      })
    ]);

    return {
      organization,
      agentProfiles: agentProfiles.map((profile) => ({
        id: profile.id,
        name: `${profile.user?.firstName ?? ''} ${profile.user?.lastName ?? ''}`.trim(),
        riskLevel: profile.riskLevel,
        isCompliant: profile.isCompliant,
        requiresAction: profile.requiresAction,
        licenseState: profile.licenseState
      })),
      trainingModules,
      recentEvents
    };
  }

  private async buildListingContext(listingId: string, orgId: string): Promise<JsonValue> {
    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId },
      include: {
        agentProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        },
        documents: {
          include: {
            orgFile: true
          },
          take: 5
        }
      }
    });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }

    const latestDescription = await this.prisma.aiGeneratedContent.findFirst({
      where: {
        organizationId: orgId,
        feature: AiFeature.LISTING_DESCRIPTION,
        entityType: 'listing',
        entityId: listing.id
      },
      orderBy: { createdAt: 'desc' },
      select: { generatedContent: true, createdAt: true, requestId: true }
    });

    return {
      id: listing.id,
      status: listing.status,
      listPrice: listing.listPrice,
      propertyType: listing.propertyType,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      expiresAt: listing.expiresAt,
      listingDescription: latestDescription
        ? {
            text: latestDescription.generatedContent.slice(0, 3500),
            requestId: latestDescription.requestId,
            generatedAt: latestDescription.createdAt.toISOString()
          }
        : null,
      agent: listing.agentProfile
        ? {
            id: listing.agentProfile.id,
            name: `${listing.agentProfile.user?.firstName ?? ''} ${listing.agentProfile.user?.lastName ?? ''}`.trim(),
            email: listing.agentProfile.user?.email
          }
        : null,
      documents: listing.documents.map((doc) => ({
        id: doc.id,
        type: doc.type,
        name: doc.orgFile.name,
        category: doc.orgFile.category
      }))
    };
  }

  private async buildTransactionContext(transactionId: string, orgId: string): Promise<JsonValue> {
    const transaction = await this.prisma.orgTransaction.findUnique({
      where: { id: transactionId },
      include: {
        listing: true,
        agentProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        },
        documents: {
          include: { orgFile: { include: { file: true } } },
          take: 5
        }
      }
    });
    if (!transaction || transaction.organizationId !== orgId) {
      throw new NotFoundException('Transaction not found');
    }

    const timeline = await this.timelines.getTimeline(orgId, 'transaction', transactionId);

    return {
      id: transaction.id,
      status: transaction.status,
      keyDates: {
        contractSignedAt: transaction.contractSignedAt,
        inspectionDate: transaction.inspectionDate,
        financingDate: transaction.financingDate,
        closingDate: transaction.closingDate
      },
      buyerName: transaction.buyerName,
      sellerName: transaction.sellerName,
      isCompliant: transaction.isCompliant,
      requiresAction: transaction.requiresAction,
      listing: transaction.listing ? { id: transaction.listing.id, status: transaction.listing.status } : null,
      agent: transaction.agentProfile
        ? {
            id: transaction.agentProfile.id,
            name: `${transaction.agentProfile.user?.firstName ?? ''} ${transaction.agentProfile.user?.lastName ?? ''}`.trim(),
            email: transaction.agentProfile.user?.email
          }
        : null,
      documents: transaction.documents.map((doc) => ({
        id: doc.id,
        type: doc.type,
        name: doc.orgFile.name,
        complianceStatus: doc.orgFile.complianceStatus,
        documentType: doc.orgFile.documentType,
        storageKey: doc.orgFile.file?.storageKey,
        fileId: doc.orgFile.fileId
      })),
      timeline: timeline.timeline.slice(0, 25)
    };
  }

  private async buildVaultContext(orgId: string): Promise<JsonValue> {
    const files = await this.prisma.orgFile.findMany({
      where: {
        orgId,
        category: { in: ['COMPLIANCE', 'CONTRACT_TEMPLATE', 'TRAINING'] }
      },
      select: {
        id: true,
        name: true,
        category: true,
        description: true
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    return { files };
  }
}
