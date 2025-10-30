import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { FlsService } from '../../platform/security/fls.service';
import { CommissionPlansService } from '../commission-plans/commission-plans.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';
import { MarkPaidDto, PayoutListQueryDto } from './dto';

type PayoutStatus = 'PENDING' | 'PAID';

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fls: FlsService,
    private readonly commissionPlans: CommissionPlansService
  ) {}

  async list(ctx: RequestContext, query: PayoutListQueryDto) {
    if (!ctx.orgId) {
      return { items: [], nextCursor: null };
    }

    const take = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const payouts = await this.prisma.payout.findMany({
      where: {
        orgId: ctx.orgId,
        ...(query.status ? { status: query.status as PayoutStatus } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });

    let nextCursor: string | null = null;
    if (payouts.length > take) {
      const next = payouts.pop();
      nextCursor = next?.id ?? null;
    }

    const items = await Promise.all(payouts.map((payout) => this.filterRecord(ctx, payout)));
    return { items, nextCursor };
  }

  async generateForOpportunity(ctx: RequestContext, opportunityId: string) {
    if (!ctx.orgId) {
      throw new BadRequestException('Missing organisation context');
    }

    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, orgId: ctx.orgId, deletedAt: null },
      select: { id: true, ownerId: true }
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    const computation = await this.commissionPlans.resolveForOpportunity(ctx, opportunityId);

    const brokerPayeeId = ctx.orgId;
    const agentPayeeId = opportunity.ownerId ?? ctx.userId ?? ctx.orgId;

    const payloads = [
      {
        orgId: ctx.orgId,
        opportunityId,
        payeeId: brokerPayeeId,
        grossAmount: computation.gross,
        brokerAmount: computation.brokerAmount,
        agentAmount: computation.agentAmount,
        status: 'PENDING' as PayoutStatus
      },
      {
        orgId: ctx.orgId,
        opportunityId,
        payeeId: agentPayeeId,
        grossAmount: computation.gross,
        brokerAmount: computation.brokerAmount,
        agentAmount: computation.agentAmount,
        status: 'PENDING' as PayoutStatus
      }
    ];

    const created = await this.prisma.$transaction(
      payloads.map((data) =>
        this.prisma.payout.create({
          data
        })
      )
    );

    return Promise.all(created.map((payout) => this.filterRecord(ctx, payout)));
  }

  async markPaid(ctx: RequestContext, id: string, dto: MarkPaidDto) {
    const payout = await this.requirePayout(ctx, id);

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException('paidAt must be a valid ISO date string');
    }

    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId ?? payout.payeeId },
      'payouts',
      {
        status: 'PAID',
        paidAt
      }
    );

    const updated = await this.prisma.payout.update({
      where: { id },
      data: writable
    });

    return this.filterRecord(ctx, updated);
  }

  private async requirePayout(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      throw new BadRequestException('Missing organisation context');
    }
    const payout = await this.prisma.payout.findFirst({
      where: { id, orgId: ctx.orgId }
    });
    if (!payout) {
      throw new NotFoundException('Payout not found');
    }
    return payout;
  }

  private async filterRecord(ctx: RequestContext, record: any) {
    const filtered = await this.fls.filterRead(ctx, 'payouts', record);
    return { id: record.id, ...filtered };
  }
}
