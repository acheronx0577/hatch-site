import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { FlsService } from '../../platform/security/fls.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';
import {
  CommissionPlanListQueryDto,
  CreateCommissionPlanDto,
  UpdateCommissionPlanDto
} from './dto';

interface CommissionComputation {
  gross: number;
  brokerAmount: number;
  agentAmount: number;
  schedule: Array<{ payee: 'BROKER' | 'AGENT'; amount: number }>;
  planId?: string;
}

const DEFAULT_BROKER_SPLIT = 0.3;
const DEFAULT_AGENT_SPLIT = 0.7;

@Injectable()
export class CommissionPlansService {
  constructor(private readonly prisma: PrismaService, private readonly fls: FlsService) {}

  async list(ctx: RequestContext, query: CommissionPlanListQueryDto) {
    if (!ctx.orgId) {
      return { items: [], nextCursor: null };
    }

    const take = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const plans = await this.prisma.orgCommissionPlan.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });

    let nextCursor: string | null = null;
    if (plans.length > take) {
      const next = plans.pop();
      nextCursor = next?.id ?? null;
    }

    const items = await Promise.all(plans.map((plan) => this.filterRecord(ctx, plan)));
    return { items, nextCursor };
  }

  async get(ctx: RequestContext, id: string) {
    const plan = await this.requirePlan(ctx, id);
    return this.filterRecord(ctx, plan);
  }

  async create(ctx: RequestContext, dto: CreateCommissionPlanDto) {
    if (!ctx.orgId || !ctx.userId) {
      throw new BadRequestException('Missing org or user context');
    }

    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId },
      'commission_plans',
      dto
    );

    const plan = await this.prisma.orgCommissionPlan.create({
      data: {
        orgId: ctx.orgId,
        name: writable.name ?? dto.name,
        brokerSplit: writable.brokerSplit ?? dto.brokerSplit ?? DEFAULT_BROKER_SPLIT,
        agentSplit: writable.agentSplit ?? dto.agentSplit ?? DEFAULT_AGENT_SPLIT,
        tiers: writable.tiers !== undefined
          ? ((writable.tiers ?? null) as unknown as Prisma.InputJsonValue | null)
          : ((dto.tiers ?? null) as unknown as Prisma.InputJsonValue | null)
      }
    });

    return this.filterRecord(ctx, plan);
  }

  async update(ctx: RequestContext, id: string, dto: UpdateCommissionPlanDto) {
    const plan = await this.requirePlan(ctx, id);

    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId ?? plan.orgId },
      'commission_plans',
      dto
    );

    const updateData: Prisma.OrgCommissionPlanUncheckedUpdateInput = {};

    if (writable.name !== undefined) {
      updateData.name = writable.name;
    }
    if (writable.brokerSplit !== undefined) {
      updateData.brokerSplit = writable.brokerSplit;
    }
    if (writable.agentSplit !== undefined) {
      updateData.agentSplit = writable.agentSplit;
    }
    if (writable.tiers !== undefined) {
      updateData.tiers = (writable.tiers ?? null) as unknown as Prisma.InputJsonValue | null;
    }

    if (Object.keys(updateData).length === 0) {
      return this.filterRecord(ctx, plan);
    }

    const updated = await this.prisma.orgCommissionPlan.update({
      where: { id },
      data: updateData
    });

    return this.filterRecord(ctx, updated);
  }

  async resolveForOpportunity(ctx: RequestContext, opportunityId: string): Promise<CommissionComputation> {
    if (!ctx.orgId) {
      throw new BadRequestException('Missing organisation context');
    }

    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, orgId: ctx.orgId, deletedAt: null },
      select: { id: true, amount: true }
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    const plan =
      (await this.prisma.orgCommissionPlan.findFirst({
        where: { orgId: ctx.orgId },
        orderBy: { createdAt: 'desc' }
      })) ?? null;

    const brokerSplit = plan ? Number(plan.brokerSplit) : DEFAULT_BROKER_SPLIT;
    const agentSplit = plan ? Number(plan.agentSplit) : DEFAULT_AGENT_SPLIT;
    const gross = Number(opportunity.amount ?? 0);

    const brokerAmount = roundCurrency(gross * brokerSplit);
    const agentAmount = roundCurrency(gross * agentSplit);

    return {
      gross,
      brokerAmount,
      agentAmount,
      schedule: [
        { payee: 'BROKER', amount: brokerAmount },
        { payee: 'AGENT', amount: agentAmount }
      ],
      planId: plan?.id
    };
  }

  private async requirePlan(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      throw new BadRequestException('Missing organisation context');
    }
    const plan = await this.prisma.orgCommissionPlan.findFirst({
      where: { id, orgId: ctx.orgId }
    });
    if (!plan) {
      throw new NotFoundException('Commission plan not found');
    }
    return plan;
  }

  private async filterRecord(ctx: RequestContext, record: any) {
    const filtered = await this.fls.filterRead(ctx, 'commission_plans', record);
    return { id: record.id, ...filtered };
  }
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
