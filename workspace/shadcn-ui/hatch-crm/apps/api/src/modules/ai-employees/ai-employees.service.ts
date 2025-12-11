import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import {
  Prisma,
  UserRole,
  AiEmployeeInstance,
  AiEmployeeTemplate,
  AiProposedAction,
  PlaybookActionType
} from '@hatch/db';

import { AiService } from '@/modules/ai/ai.service';
import { AiPersonasService } from '@/modules/ai/personas/ai-personas.service';
import { RequestContext } from '@/modules/common';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { subDays } from 'date-fns';

import {
  AdminAiEmployeeTemplateUpdateDto,
  AiEmployeeActionDto,
  AiEmployeeChatResponseDto,
  AiEmployeeInstanceDto,
  AiEmployeeInstanceUpdateDto,
  AiEmployeeTemplateDto,
  AiEmployeeUsageStatsDto
} from './dto/ai-employee.dto';
import { AiToolContext, AiToolRegistry } from './ai-tool.registry';
import { AiContextCollectors } from './context/collectors';
import { AI_PERSONA_REGISTRY, AiPersonaConfig, AiPersonaId } from './personas/registry';

const ACTION_STATUS = {
  PROPOSED: 'proposed',
  REQUIRES_APPROVAL: 'requires-approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTED: 'executed',
  FAILED: 'failed'
} as const;

const MAX_EXECUTIONS_PER_TENANT_PER_DAY = Number(process.env.AI_EMPLOYEE_MAX_EXECUTIONS_PER_DAY ?? '500');

const ADMIN_ROLES: UserRole[] = [UserRole.BROKER, UserRole.TEAM_LEAD];

type ActionStatus = (typeof ACTION_STATUS)[keyof typeof ACTION_STATUS];

type AssistantPlanAction = {
  tool: string;
  input?: Record<string, unknown>;
  requiresApproval?: boolean;
  summary?: string;
};

type AssistantPlan = {
  reply: string;
  actions: AssistantPlanAction[];
};

type AiProposedActionWithDryRun = AiProposedAction & { dryRun?: boolean | null };

interface SendMessageInput {
  tenantId: string;
  orgId: string;
  employeeInstanceId: string;
  userId: string;
  actorRole?: UserRole;
  channel: string;
  contextType?: string;
  contextId?: string;
  message: string;
}

const MAX_CONVERSATION_HISTORY = 12;
type EmployeeWithTemplate = AiEmployeeInstance & { template: AiEmployeeTemplate };

type RunPersonaParams = {
  organizationId: string;
  userId?: string;
  agentProfileId?: string;
  leadId?: string;
  listingId?: string;
  transactionId?: string;
  leaseId?: string;
  input?: Record<string, any> | null;
};

export type PersonaAction = {
  type: PlaybookActionType | string;
  params?: Record<string, unknown>;
  summary?: string;
};

export type PersonaRunResult = {
  persona: AiPersonaConfig;
  context: Record<string, unknown>;
  input?: Record<string, any> | null;
  rawText: string | null;
  structured?: any;
  actions: PersonaAction[];
};

@Injectable()
export class AiEmployeesService {
  private readonly log = new Logger(AiEmployeesService.name);
  private readonly collectors: AiContextCollectors;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly tools: AiToolRegistry,
    private readonly audit: AuditService,
    private readonly personas: AiPersonasService
  ) {
    this.collectors = new AiContextCollectors(this.prisma);
  }

  async listInstances(ctx: RequestContext): Promise<AiEmployeeInstanceDto[]> {
    await this.ensureInstancesForTenant(ctx);
    const rows = await this.prisma.aiEmployeeInstance.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { not: 'deleted' },
        template: { isActive: true }
      },
      include: { template: true },
      orderBy: { createdAt: 'asc' }
    });

    return rows.map((row) => this.toInstanceDto(row));
  }

  private async ensureInstancesForTenant(ctx: RequestContext) {
    const [templates, existingInstances] = await Promise.all([
      this.prisma.aiEmployeeTemplate.findMany({
        where: { isActive: true },
        select: { id: true, defaultSettings: true }
      }),
      this.prisma.aiEmployeeInstance.findMany({
        where: { tenantId: ctx.tenantId },
        select: { templateId: true }
      })
    ]);

    const existingTemplateIds = new Set(existingInstances.map((instance) => instance.templateId));
    const missingTemplates = templates.filter((template) => !existingTemplateIds.has(template.id));
    if (!missingTemplates.length) {
      return;
    }

    await this.prisma.$transaction(
      missingTemplates.map((template) =>
        this.prisma.aiEmployeeInstance.create({
          data: {
            templateId: template.id,
            tenantId: ctx.tenantId,
            status: 'enabled',
            autoMode: 'requires-approval',
            settings: this.toJsonValue(template.defaultSettings),
            nameOverride: null,
            userId: null
          }
        })
      )
    );
  }

  async listTemplates(_ctx: RequestContext): Promise<AiEmployeeTemplateDto[]> {
    const rows = await this.prisma.aiEmployeeTemplate.findMany({
      where: { isActive: true },
      orderBy: { displayName: 'asc' }
    });
    return rows.map((row) => this.toTemplateDto(row));
  }

  async getUsageStatsForTenant(
    tenantId: string,
    from?: Date,
    to?: Date
  ): Promise<AiEmployeeUsageStatsDto[]> {
    const windowEnd = to ?? new Date();
    const windowStart = from ?? subDays(windowEnd, 30);
    if (windowStart > windowEnd) {
      throw new BadRequestException('from date must be before to date');
    }

    const grouped = await this.prisma.aiExecutionLog.groupBy({
      by: ['employeeInstanceId', 'toolKey', 'success'],
      where: {
        tenantId,
        createdAt: {
          gte: windowStart,
          lte: windowEnd
        }
      },
      _count: { _all: true }
    });

    if (grouped.length === 0) {
      return [];
    }

    const instanceIds = Array.from(new Set(grouped.map((row) => row.employeeInstanceId)));
    const instances = await this.prisma.aiEmployeeInstance.findMany({
      where: { id: { in: instanceIds } },
      select: {
        id: true,
        template: {
          select: { key: true, displayName: true }
        }
      }
    });

    const templateByInstance = new Map(instances.map((instance) => [instance.id, instance.template]));

    const stats = new Map<
      string,
      {
        personaKey: string;
        personaName: string;
        total: number;
        success: number;
        failed: number;
        tools: Map<string, number>;
      }
    >();

    grouped.forEach((row) => {
      const template = templateByInstance.get(row.employeeInstanceId);
      if (!template) {
        return;
      }
      const existing = stats.get(template.key) ?? {
        personaKey: template.key,
        personaName: template.displayName,
        total: 0,
        success: 0,
        failed: 0,
        tools: new Map<string, number>()
      };

      const count = row._count._all;
      existing.total += count;
      if (row.success) {
        existing.success += count;
      } else {
        existing.failed += count;
      }

      const toolKey = row.toolKey ?? 'unknown';
      existing.tools.set(toolKey, (existing.tools.get(toolKey) ?? 0) + count);
      stats.set(template.key, existing);
    });

    return Array.from(stats.values()).map((entry) => ({
      personaKey: entry.personaKey,
      personaName: entry.personaName,
      totalActions: entry.total,
      successfulActions: entry.success,
      failedActions: entry.failed,
      toolsUsed: Array.from(entry.tools.entries()).map(([toolKey, count]) => ({
        toolKey,
        count
      })),
      timeWindow: {
        from: windowStart.toISOString(),
        to: windowEnd.toISOString()
      }
    }));
  }

  async updateTemplate(
    templateId: string,
    ctx: RequestContext,
    dto: AdminAiEmployeeTemplateUpdateDto
  ): Promise<AiEmployeeTemplateDto> {
    if (!ctx.role || !ADMIN_ROLES.includes(ctx.role)) {
      throw new ForbiddenException('Admin role required to edit personas');
    }

    const template = await this.prisma.aiEmployeeTemplate.findUnique({
      where: { id: templateId }
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    const updates: Prisma.AiEmployeeTemplateUpdateInput = {};
    if (dto.displayName !== undefined) {
      updates.displayName = dto.displayName.trim();
    }
    if (dto.description !== undefined) {
      updates.description = dto.description.trim();
    }
    if (dto.systemPrompt !== undefined) {
      updates.systemPrompt = dto.systemPrompt.trim();
    }
    if (dto.allowedTools !== undefined) {
      const tools = dto.allowedTools.map((tool) => tool.trim()).filter((tool) => tool.length > 0);
      updates.allowedTools = Array.from(new Set(tools)) as Prisma.JsonValue;
    }

    const baseSettings = normalizeTemplateSettings(template.defaultSettings);
    const nextSettings: Record<string, unknown> = { ...baseSettings };
    let settingsChanged = false;

    const mergeSetting = (key: string, value: unknown | undefined, transform?: (value: unknown) => unknown) => {
      if (value === undefined) {
        return;
      }
      settingsChanged = true;
      nextSettings[key] = transform ? transform(value) : value;
    };

    if (dto.defaultSettings !== undefined) {
      Object.assign(nextSettings, dto.defaultSettings);
      settingsChanged = true;
    }

    mergeSetting('personaColor', dto.personaColor, (value) => String(value));
    mergeSetting('avatarShape', dto.avatarShape);
    mergeSetting('avatarIcon', dto.avatarIcon, (value) => String(value).trim());
    mergeSetting('avatarInitial', dto.avatarInitial, (value) => String(value).trim());
    mergeSetting('tone', dto.tone, (value) => String(value).trim());

    if (settingsChanged) {
      updates.defaultSettings = nextSettings as Prisma.JsonValue;
    }

    if (Object.keys(updates).length === 0) {
      return this.toTemplateDto(template);
    }

    const updated = await this.prisma.aiEmployeeTemplate.update({
      where: { id: templateId },
      data: updates
    });
    return this.toTemplateDto(updated);
  }

  async updateInstanceAutoMode(
    instanceId: string,
    ctx: RequestContext,
    dto: AiEmployeeInstanceUpdateDto
  ): Promise<AiEmployeeInstanceDto> {
    if (!ctx.role || !ADMIN_ROLES.includes(ctx.role)) {
      throw new ForbiddenException('Admin role required to edit personas');
    }

    const instance = await this.prisma.aiEmployeeInstance.findFirst({
      where: { id: instanceId, tenantId: ctx.tenantId },
      include: { template: true }
    });
    if (!instance) {
      throw new NotFoundException('AI employee instance not found');
    }

    const updated = await this.prisma.aiEmployeeInstance.update({
      where: { id: instanceId },
      data: {
        autoMode: dto.autoMode
      },
      include: { template: true }
    });

    return this.toInstanceDto(updated);
  }

  async listActions(ctx: RequestContext): Promise<AiEmployeeActionDto[]> {
    const rows = await this.prisma.aiProposedAction.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: [ACTION_STATUS.PROPOSED, ACTION_STATUS.REQUIRES_APPROVAL] }
      },
      orderBy: { createdAt: 'desc' }
    });

    return rows.map((row) => this.toActionDto(row));
  }

  async approveAction(
    actionId: string,
    reviewerId: string,
    tenantId: string,
    orgId: string,
    note?: string,
    reviewerRole: UserRole = UserRole.BROKER
  ): Promise<AiEmployeeActionDto> {
    const action = await this.prisma.aiProposedAction.findFirst({
      where: { id: actionId, tenantId },
      include: { employeeInstance: true }
    });
    if (!action) {
      throw new NotFoundException('Action not found');
    }
    if (action.status === ACTION_STATUS.REJECTED) {
      throw new BadRequestException('Rejected actions cannot be approved');
    }

    await this.logActionReview(action, reviewerId, 'approved', note);

    const executed = await this.executeProposedAction({
      actionId,
      tenantId,
      orgId,
      approverId: reviewerId,
      approverRole: reviewerRole
    });
    return executed;
  }

  async rejectAction(
    actionId: string,
    reviewerId: string,
    tenantId: string,
    _orgId: string,
    reason?: string
  ): Promise<AiEmployeeActionDto> {
    const action = await this.prisma.aiProposedAction.findFirst({
      where: { id: actionId, tenantId }
    });
    if (!action) {
      throw new NotFoundException('Action not found');
    }

    const updated = await this.prisma.aiProposedAction.update({
      where: { id: action.id },
      data: {
        status: ACTION_STATUS.REJECTED,
        approvedByUserId: reviewerId,
        errorMessage: reason ?? null
      }
    });

    await this.logActionReview(updated, reviewerId, 'rejected', reason);

    return this.toActionDto(updated);
  }

  async sendMessage(input: SendMessageInput): Promise<AiEmployeeChatResponseDto> {
    if (!input.message?.trim()) {
      throw new BadRequestException('Message is required');
    }

    const instance = await this.prisma.aiEmployeeInstance.findFirst({
      where: { id: input.employeeInstanceId, tenantId: input.tenantId },
      include: { template: true }
    });
    if (!instance) {
      throw new NotFoundException('AI employee not found');
    }
    if (instance.status !== 'active') {
      throw new ForbiddenException('AI employee is not active');
    }

    const session = await this.upsertSession({
      employeeInstanceId: instance.id,
      tenantId: input.tenantId,
      orgId: input.orgId,
      userId: input.userId,
      channel: input.channel,
      contextType: input.contextType,
      contextId: input.contextId
    });

    await this.recordConversationLog({
      employeeInstanceId: instance.id,
      sessionId: session.id,
      tenantId: input.tenantId,
      userId: input.userId,
      role: 'user',
      message: input.message,
      metadata: { channel: input.channel, contextType: input.contextType, contextId: input.contextId }
    });

    const history = await this.loadConversationHistory(session.id);
    const allowedTools = this.extractAllowedTools(instance.template.allowedTools);

    // Check if this is a contract/forms query and delegate to personas service
    const lowerMsg = input.message.toLowerCase();
    const isContractQuery = ['form', 'forms', 'contract', 'contracts', 'document', 'documents', 'paperwork'].some(kw => lowerMsg.includes(kw));

    let reply: string;
    let plan: AssistantPlan;
    if (isContractQuery && instance.template.key === 'hatch_assistant') {
      // Delegate to personas service for grounded docs search
      reply = await this.personas['answerWithGroundedDocs']({ tenantId: input.tenantId, query: input.message });
      plan = { reply, actions: [] };
    } else {
      const systemPrompt = this.buildSystemPrompt(instance, allowedTools);
      const completion = await this.ai.runStructuredChat({
        systemPrompt,
        messages: [...history, { role: 'user', content: input.message }],
        responseFormat: 'json_object'
      });

      plan = this.parseAssistantPlan(completion.text, allowedTools);
      reply = plan.reply;
    }

    await this.recordConversationLog({
      employeeInstanceId: instance.id,
      sessionId: session.id,
      tenantId: input.tenantId,
      userId: instance.userId ?? input.userId,
      role: 'assistant',
      message: reply
    });

    await this.prisma.aiEmployeeSession.update({
      where: { id: session.id },
      data: { lastInteractionAt: new Date() }
    });

    const actions = await this.handlePlanActions({
      plan,
      sessionId: session.id,
      instance,
      tenantId: input.tenantId,
      orgId: input.orgId,
      actorId: input.userId,
      actorRole: input.actorRole ?? UserRole.AGENT,
      allowedTools
    });

    return {
      sessionId: session.id,
      employeeInstanceId: instance.id,
      reply,
      actions
    };
  }

  private async handlePlanActions(params: {
    plan: AssistantPlan;
    sessionId: string;
    instance: EmployeeWithTemplate;
    tenantId: string;
    orgId: string;
    actorId: string;
    actorRole: UserRole;
    allowedTools: string[];
  }): Promise<AiEmployeeActionDto[]> {
    const { plan, sessionId, instance, tenantId, orgId, actorId, actorRole, allowedTools } = params;
    const results: AiEmployeeActionDto[] = [];

    for (const action of plan.actions) {
      if (!allowedTools.includes(action.tool)) {
        this.log.warn(`Tool ${action.tool} is not allowed for employee ${instance.id}`);
        continue;
      }

      const toolDef = this.tools.get(action.tool);
      if (!toolDef) {
        this.log.warn(`Tool ${action.tool} is not registered`);
        continue;
      }

      const toolAllowsAuto = toolDef.allowAutoRun ?? false;
      const toolDefaultApproval = toolDef.defaultRequiresApproval ?? true;
      let requiresApproval = action.requiresApproval ?? toolDefaultApproval;

      if (!toolAllowsAuto) {
        requiresApproval = true;
      }

      if (instance.autoMode === 'suggest-only') {
        requiresApproval = true;
      } else if (instance.autoMode === 'requires-approval') {
        requiresApproval = true;
      }

      const initialStatus =
        instance.autoMode === 'suggest-only'
          ? ACTION_STATUS.PROPOSED
          : requiresApproval
            ? ACTION_STATUS.REQUIRES_APPROVAL
            : ACTION_STATUS.APPROVED;

      const record = await this.prisma.aiProposedAction.create({
        data: {
          employeeInstanceId: instance.id,
          tenantId,
          userId: actorId,
          sessionId,
          actionType: action.tool,
          payload: (action.input ?? {}) as Prisma.InputJsonValue,
          status: initialStatus,
          requiresApproval,
          errorMessage: null
        }
      });

      let dto = this.toActionDto(record);

      if (!requiresApproval && instance.autoMode === 'auto-run') {
        const executed = await this.executeProposedAction({
          actionId: record.id,
          tenantId,
          orgId,
          approverId: actorId,
          approverRole: actorRole
        });
        dto = executed;
      }

      results.push(dto);
    }

    return results;
  }

  async executeProposedAction(params: {
    actionId: string;
    tenantId: string;
    orgId: string;
    approverId: string;
    approverRole?: UserRole;
  }): Promise<AiEmployeeActionDto> {
    const action = await this.prisma.aiProposedAction.findFirst({
      where: { id: params.actionId, tenantId: params.tenantId }
    });
    if (!action) {
      throw new NotFoundException('Action not found');
    }
    if (action.status === ACTION_STATUS.REJECTED) {
      throw new BadRequestException('Rejected actions cannot be executed');
    }
    if (action.status === ACTION_STATUS.EXECUTED || action.status === ACTION_STATUS.FAILED) {
      return this.toActionDto(action);
    }

    const update: Prisma.AiProposedActionUpdateInput = {
      requiresApproval: false
    };
    if (!action.approvedByUserId) {
      update.approvedBy = { connect: { id: params.approverId } };
    }
    if (action.status !== ACTION_STATUS.APPROVED) {
      update.status = ACTION_STATUS.APPROVED;
    }

    const updatedAction =
      Object.keys(update).length > 0
        ? await this.prisma.aiProposedAction.update({
            where: { id: action.id },
            data: update
          })
        : action;

    try {
      await this.executeActionRecord(updatedAction, {
        actorId: params.approverId,
        actorRole: params.approverRole ?? UserRole.BROKER,
        orgId: params.orgId
      });
    } catch (error) {
      this.log.error(`Execution of proposed action ${action.id} failed`, error as Error);
    }

    const refreshed = await this.prisma.aiProposedAction.findUnique({ where: { id: action.id } });
    return this.toActionDto(refreshed ?? updatedAction);
  }

  private async executeActionRecord(
    action: AiProposedAction,
    context: { actorId: string; actorRole: UserRole; orgId: string }
  ): Promise<void> {
    const aiContext: AiToolContext = {
      tenantId: action.tenantId,
      orgId: context.orgId,
      actorId: context.actorId,
      actorRole: context.actorRole,
      sessionId: action.sessionId ?? 'unknown',
      employeeInstanceId: action.employeeInstanceId
    };
    const actionWithDryRun = action as AiProposedActionWithDryRun;

    if (await this.isTenantOverRateLimit(action.tenantId)) {
      const message = 'AI execution rate limit exceeded for this tenant. Try again later.';
      await this.prisma.aiExecutionLog.create({
        data: {
          employeeInstanceId: action.employeeInstanceId,
          sessionId: action.sessionId,
          tenantId: action.tenantId,
          userId: context.actorId,
          proposedActionId: action.id,
          toolKey: action.actionType,
          input: action.payload,
          output: Prisma.JsonNull,
          success: false,
          errorMessage: message
        }
      });
      await this.prisma.aiProposedAction.update({
        where: { id: action.id },
        data: {
          status: ACTION_STATUS.FAILED,
          errorMessage: message
        }
      });
      return;
    }

    if (actionWithDryRun.dryRun) {
      await this.prisma.aiExecutionLog.create({
        data: {
          employeeInstanceId: action.employeeInstanceId,
          sessionId: action.sessionId,
          tenantId: action.tenantId,
          userId: context.actorId,
          proposedActionId: action.id,
          toolKey: action.actionType,
          input: action.payload,
          output: this.toJsonValue({ dryRun: true, message: 'Dry run – no changes applied.' }),
          success: true
        }
      });
      await this.prisma.aiProposedAction.update({
        where: { id: action.id },
        data: {
          status: ACTION_STATUS.EXECUTED,
          executedAt: new Date(),
          errorMessage: null
        }
      });
      return;
    }

    try {
      const output = await this.tools.execute(action.actionType, action.payload, aiContext);
      await this.prisma.aiExecutionLog.create({
        data: {
          employeeInstanceId: action.employeeInstanceId,
          sessionId: action.sessionId,
          tenantId: action.tenantId,
          userId: context.actorId,
          proposedActionId: action.id,
          toolKey: action.actionType,
          input: action.payload,
          output: this.toJsonValue(output),
          success: true
        }
      });
      await this.prisma.aiProposedAction.update({
        where: { id: action.id },
        data: {
          status: ACTION_STATUS.EXECUTED,
          executedAt: new Date(),
          errorMessage: null,
          requiresApproval: false
        }
      });
    } catch (error) {
      await this.prisma.aiExecutionLog.create({
        data: {
          employeeInstanceId: action.employeeInstanceId,
          sessionId: action.sessionId,
          tenantId: action.tenantId,
          userId: context.actorId,
          proposedActionId: action.id,
          toolKey: action.actionType,
          input: action.payload,
          output: Prisma.JsonNull,
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Execution failed'
        }
      });
      await this.prisma.aiProposedAction.update({
        where: { id: action.id },
        data: {
          status: ACTION_STATUS.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Execution failed'
        }
      });
      throw error;
    }
  }

  private async recordConversationLog(params: {
    employeeInstanceId: string;
    sessionId: string;
    tenantId: string;
    userId: string;
    role: 'user' | 'assistant';
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.aiExecutionLog.create({
      data: {
        employeeInstanceId: params.employeeInstanceId,
        sessionId: params.sessionId,
        tenantId: params.tenantId,
        userId: params.userId,
        toolKey: `conversation:${params.role}`,
        input: { message: params.message, ...(params.metadata ?? {}) },
        success: true
      }
    });
  }

  private async loadConversationHistory(sessionId: string) {
    const rows = await this.prisma.aiExecutionLog.findMany({
      where: {
        sessionId,
        toolKey: { startsWith: 'conversation:' }
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_CONVERSATION_HISTORY
    });

    return rows
      .reverse()
      .map((row) => ({
        role: row.toolKey?.endsWith('assistant') ? ('assistant' as const) : ('user' as const),
        content: this.extractMessage(row.input)
      }));
  }

  private extractMessage(input: Prisma.JsonValue | null): string {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return '';
    }
    const message = (input as Record<string, unknown>).message;
    return typeof message === 'string' ? message : '';
  }

  private async upsertSession(params: {
    employeeInstanceId: string;
    tenantId: string;
    orgId: string;
    userId: string;
    channel: string;
    contextType?: string;
    contextId?: string;
  }) {
    await this.ensureUserExists(params.userId, params.orgId, params.tenantId);

    const existing = await this.prisma.aiEmployeeSession.findFirst({
      where: {
        employeeInstanceId: params.employeeInstanceId,
        tenantId: params.tenantId,
        userId: params.userId,
        channel: params.channel,
        contextType: params.contextType ?? null,
        contextId: params.contextId ?? null
      }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.aiEmployeeSession.create({
      data: {
        employeeInstanceId: params.employeeInstanceId,
        tenantId: params.tenantId,
        userId: params.userId,
        channel: params.channel,
        contextType: params.contextType ?? null,
        contextId: params.contextId ?? null
      }
    });
  }

  private async ensureUserExists(userId: string, orgId: string, tenantId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) return;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { organization: true }
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found for AI session');
    }
    const organization =
      (await this.prisma.organization.findUnique({ where: { id: orgId } })) ?? tenant.organization;

    const createdUser = await this.prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@autogen.local`,
        firstName: 'AI',
        lastName: 'User',
        role: UserRole.BROKER,
        organizationId: organization.id,
        tenantId: tenant.id
      }
    });

    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId: createdUser.id, orgId: organization.id } }
    });
    if (!membership) {
      await this.prisma.userOrgMembership.create({
        data: {
          userId: createdUser.id,
          orgId: organization.id,
          isOrgAdmin: true
        }
      });
    }
  }

  private buildSystemPrompt(instance: EmployeeWithTemplate, allowedTools: string[]): string {
    const personaPrompt =
      instance.template.systemPrompt ||
      `You are ${instance.template.displayName}, an AI employee inside Hatch CRM.`;
    const mergedSettings = this.mergeSettings(instance.template.defaultSettings, instance.settings);

    const toolList = allowedTools.length > 0 ? allowedTools.join(', ') : 'none';

    return [
      personaPrompt,
      '',
      `Instance name: ${instance.nameOverride ?? instance.template.displayName}`,
      `Behavior mode: ${instance.autoMode}`,
      `Allowed tools: ${toolList}`,
      'Always respond with strict JSON: {"reply":"...","actions":[{"tool":"tool_key","input":{...}}]}',
      'reply is concise (<= 4 sentences).',
      'actions is optional but must only include allowed tools. Each action input must be valid JSON.',
      'If no action is required, set actions to an empty array.',
      `Settings: ${JSON.stringify(mergedSettings ?? {})}`,
      'Never produce markdown or emojis. No motivational slogans.'
    ].join('\n');
  }

  private parseAssistantPlan(text: string | null, allowedTools: string[]): AssistantPlan {
    if (!text) {
      return { reply: 'I do not have enough context yet.', actions: [] };
    }

    try {
      const parsed = JSON.parse(text);
      const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : text;
      const actionsInput = Array.isArray(parsed.actions) ? parsed.actions : [];
      const actions = actionsInput
        .map((item: any) => ({
          tool: typeof item?.tool === 'string' ? item.tool : '',
          input: typeof item?.input === 'object' && item?.input !== null ? item.input : {},
          requiresApproval: typeof item?.requiresApproval === 'boolean' ? item.requiresApproval : undefined
        }))
        .filter((action) => action.tool && allowedTools.includes(action.tool));

      return {
        reply,
        actions
      };
    } catch (err) {
      this.log.warn('Failed to parse assistant plan', err as Error);
      return {
        reply: text,
        actions: []
      };
    }
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }

  listPersonas() {
    return Object.values(AI_PERSONA_REGISTRY);
  }

  async runPersona(personaId: AiPersonaId, params: RunPersonaParams): Promise<PersonaRunResult> {
    const persona = AI_PERSONA_REGISTRY[personaId];
    if (!persona) {
      throw new NotFoundException(`Persona ${personaId} not registered`);
    }

    const context: Record<string, unknown> = {};
    for (const name of persona.collectors) {
      const collected = await this.collectors.collect(name as any, params);
      if (collected) {
        context[name] = collected;
      }
    }

    const payload = {
      personaId: persona.id,
      personaName: persona.name,
      description: persona.description,
      tools: persona.tools,
      organizationId: params.organizationId,
      userId: params.userId ?? null,
      agentProfileId: params.agentProfileId ?? null,
      listingId: params.listingId ?? null,
      leadId: params.leadId ?? null,
      transactionId: params.transactionId ?? null,
      leaseId: params.leaseId ?? null,
      context,
      input: params.input ?? null
    };

    const aiResult = await this.ai.runStructuredChat({
      systemPrompt: this.buildPersonaPrompt(persona),
      responseFormat: 'json_object',
      temperature: persona.temperature,
      messages: [{ role: 'user', content: JSON.stringify(payload) }]
    });

    const rawText = aiResult.text ?? null;
    let structured: any;
    if (rawText) {
      try {
        structured = JSON.parse(rawText);
      } catch {
        structured = undefined;
      }
    }
    const actions = this.parsePersonaActions(structured);

    await this.audit.log({
      organizationId: params.organizationId,
      userId: params.userId ?? null,
      actionType: 'AI_PERSONA_RUN',
      summary: `AI persona ${persona.id} executed`,
      metadata: {
        personaId: persona.id,
        agentProfileId: params.agentProfileId ?? null
      }
    });

    return {
      persona,
      context,
      input: params.input ?? null,
      rawText,
      structured,
      actions
    };
  }

  private buildPersonaPrompt(persona: AiPersonaConfig) {
    const toolLine =
      persona.tools.length > 0 ? `You may reference tools: ${persona.tools.join(', ')}.` : 'You have no automated tools.';
    return [
      `You are ${persona.name}.`,
      persona.description,
      toolLine,
      'Always respond with valid JSON including: {"summary": string, "insights": any[], "actions": any[]}.',
      'If the user payload includes "availableActions", only propose actions using those definitions with exact "type" values and a JSON "params" object.',
      'Actions should be concrete Playbook steps like CREATE_TASK, ASSIGN_LEAD, SEND_NOTIFICATION, or FLAG_ENTITY. Do not invent new action types.',
      'Format actions as [{"type":"ACTION_KEY","summary":"why","params":{...}}] with ids like leadId/listingId/transactionId populated when known.',
      'If context is missing, state the limitation and recommend the highest leverage next step.'
    ]
      .filter(Boolean)
      .join(' ');
  }

  private parsePersonaActions(structured: any): PersonaAction[] {
    if (!structured) {
      return [];
    }
    const input = Array.isArray(structured?.actions) ? structured.actions : [];
    return input
      .map((action: any) => {
        const typeValue =
          typeof action?.type === 'string'
            ? action.type
            : typeof action?.actionType === 'string'
              ? action.actionType
              : typeof action?.tool === 'string'
                ? action.tool
                : '';
        if (!typeValue) {
          return null;
        }
        const normalized = this.normalizeActionType(typeValue) ?? typeValue;
        const params = action?.params && typeof action.params === 'object' ? action.params : {};
        const summary = typeof action?.summary === 'string' ? action.summary : undefined;
        return { type: normalized, params, summary };
      })
      .filter(Boolean) as PersonaAction[];
  }

  private normalizeActionType(value: string): PlaybookActionType | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const candidates = [
      trimmed,
      trimmed.toUpperCase(),
      trimmed.toLowerCase(),
      trimmed.replace(/[_\s-]+/g, '').toLowerCase()
    ];
    for (const candidate of candidates) {
      const match = (Object.values(PlaybookActionType) as string[]).find((entry) => {
        const normalized = entry.replace(/[_\s-]+/g, '').toLowerCase();
        return normalized === candidate.replace(/[_\s-]+/g, '').toLowerCase();
      });
      if (match) {
        return match as PlaybookActionType;
      }
    }
    return null;
  }

  private toTemplateDto(row: AiEmployeeTemplate): AiEmployeeTemplateDto {
    const meta = this.extractPersonaMeta(row);
    return {
      id: row.id,
      key: row.key,
      displayName: row.displayName,
      description: row.description,
      systemPrompt: row.systemPrompt,
      defaultSettings: this.toRecord(row.defaultSettings),
      allowedTools: this.extractAllowedTools(row.allowedTools),
      canonicalKey: meta.canonicalKey,
      personaColor: meta.personaColor,
      avatarShape: meta.avatarShape,
      avatarIcon: meta.avatarIcon,
      avatarInitial: meta.avatarInitial,
      tone: meta.tone
    };
  }

  private toInstanceDto(row: EmployeeWithTemplate): AiEmployeeInstanceDto {
    const settings = this.mergeSettings(row.template.defaultSettings, row.settings);
    const template = this.toTemplateDto(row.template);

    return {
      id: row.id,
      name: row.nameOverride ?? row.template.displayName,
      status: row.status,
      autoMode: (row.autoMode as AiEmployeeInstanceDto['autoMode']) ?? 'requires-approval',
      template,
      settings: settings ?? {},
      allowedTools: template.allowedTools,
      userId: row.userId ?? null
    };
  }

  private toActionDto(row: AiProposedAction): AiEmployeeActionDto {
    const actionWithDryRun = row as AiProposedActionWithDryRun;
    return {
      id: row.id,
      employeeInstanceId: row.employeeInstanceId,
      actionType: row.actionType,
      payload: this.toRecord(row.payload),
      status: row.status as ActionStatus,
      requiresApproval: row.requiresApproval,
      errorMessage: row.errorMessage ?? null,
      executedAt: row.executedAt ? row.executedAt.toISOString() : null,
      sessionId: row.sessionId ?? null,
      dryRun: Boolean(actionWithDryRun.dryRun)
    };
  }

  private async logActionReview(
    action: AiProposedAction,
    reviewerId: string,
    decision: 'approved' | 'rejected',
    note?: string
  ) {
    await this.prisma.aiExecutionLog.create({
      data: {
        employeeInstanceId: action.employeeInstanceId,
        sessionId: action.sessionId,
        tenantId: action.tenantId,
        userId: reviewerId,
        proposedActionId: action.id,
        toolKey: 'action.review',
        input: {
          decision,
          note: note ?? null
        },
        success: decision === 'approved',
        errorMessage: decision === 'rejected' ? note ?? null : null
      }
    });
  }

  private async isTenantOverRateLimit(tenantId: string): Promise<boolean> {
    if (!MAX_EXECUTIONS_PER_TENANT_PER_DAY || MAX_EXECUTIONS_PER_TENANT_PER_DAY <= 0) {
      return false;
    }
    const windowStart = subDays(new Date(), 1);
    const count = await this.prisma.aiExecutionLog.count({
      where: {
        tenantId,
        createdAt: { gte: windowStart },
        NOT: { toolKey: { startsWith: 'conversation:' } }
      }
    });
    return count >= MAX_EXECUTIONS_PER_TENANT_PER_DAY;
  }

  private mergeSettings<T extends Prisma.JsonValue | null>(templateSettings: T, instanceSettings: T) {
    const templateObj = this.toRecord(templateSettings);
    const instanceObj = this.toRecord(instanceSettings);
    return { ...templateObj, ...instanceObj };
  }

  private extractPersonaMeta(row: AiEmployeeTemplate) {
    const defaults = this.toRecord(row.defaultSettings);
    const canonicalKey = this.mapToCanonicalPersona(row.key, row.displayName);

    const trim = (value: unknown): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const v = value.trim();
      return v.length ? v : undefined;
    };

    const canonicalDefaults: Record<
      string,
      Partial<Record<'personaColor' | 'avatarShape' | 'avatarIcon' | 'avatarInitial' | 'tone', string>>
    > = {
      hatch_assistant: { personaColor: '#2563EB', avatarShape: 'circle', avatarIcon: 'robot', avatarInitial: 'H', tone: 'professional' },
      agent_copilot: { personaColor: '#EAB308', avatarShape: 'circle', avatarIcon: 'brain', avatarInitial: 'E', tone: 'balanced' },
      lead_nurse: { personaColor: '#FF8A80', avatarShape: 'circle', avatarIcon: 'stethoscope', avatarInitial: 'L', tone: 'warm' },
      listing_concierge: { personaColor: '#9B5BFF', avatarShape: 'circle', avatarIcon: 'sparkles', avatarInitial: 'H', tone: 'creative' },
      market_analyst: { personaColor: '#FF9F43', avatarShape: 'circle', avatarIcon: 'chart-bar', avatarInitial: 'A', tone: 'analytical' },
      transaction_coordinator: { personaColor: '#F368E0', avatarShape: 'circle', avatarIcon: 'clipboard', avatarInitial: 'N', tone: 'precise' }
    };

    const canonDefaults = canonicalKey ? canonicalDefaults[canonicalKey] ?? {} : {};

    return {
      canonicalKey,
      personaColor: trim(defaults.personaColor) ?? (canonDefaults.personaColor as string | undefined),
      avatarShape: (trim(defaults.avatarShape) ?? (canonDefaults.avatarShape as string | undefined)) as
        | 'circle'
        | 'square'
        | 'rounded-square'
        | 'hexagon'
        | 'pill'
        | undefined,
      avatarIcon: trim(defaults.avatarIcon) ?? (canonDefaults.avatarIcon as string | undefined),
      avatarInitial: trim(defaults.avatarInitial) ?? (canonDefaults.avatarInitial as string | undefined),
      tone: trim(defaults.tone) ?? (canonDefaults.tone as string | undefined)
    };
  }

  private mapToCanonicalPersona(key: string, displayName?: string | null): string | null {
    const normalize = (value?: string | null) => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidates = [normalize(key), normalize(displayName)];
    const map: Record<string, string> = {
      hatchassistant: 'hatch_assistant',
      hatch: 'hatch_assistant',
      aibroker: 'hatch_assistant',
      switchboard: 'hatch_assistant',
      agentcopilot: 'agent_copilot',
      echo: 'agent_copilot',
      leadnurse: 'lead_nurse',
      lumen: 'lead_nurse',
      listingconcierge: 'listing_concierge',
      haven: 'listing_concierge',
      marketanalyst: 'market_analyst',
      atlas: 'market_analyst',
      transactioncoordinator: 'transaction_coordinator',
      nova: 'transaction_coordinator'
    };

    for (const candidate of candidates) {
      if (map[candidate]) return map[candidate];
      const partial = Object.keys(map).find((keyPart) => candidate.includes(keyPart));
      if (partial) return map[partial];
    }
    return null;
  }

  private extractAllowedTools(payload: Prisma.JsonValue | null): string[] {
    if (!payload) return [];
    if (Array.isArray(payload)) {
      return payload.filter((item): item is string => typeof item === 'string');
    }
    if (typeof payload === 'object') {
      return Object.values(payload)
        .filter((item): item is string => typeof item === 'string')
        .map((value) => value.toString());
    }
    return [];
  }

  private toRecord(payload: Prisma.JsonValue | null): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    return payload as Record<string, unknown>;
  }
}

function normalizeTemplateSettings(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}
