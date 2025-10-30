import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { FlsService } from '../../platform/security/fls.service';
import { OutboxService } from '../outbox/outbox.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';
import { DealDeskListQueryDto } from './dto';

type DealDeskStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

@Injectable()
export class DealDeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fls: FlsService,
    private readonly outbox: OutboxService
  ) {}

  async create(
    ctx: RequestContext,
    payload: Partial<{
      opportunityId: string;
      amount?: number;
      discountPct?: number;
      reason?: string;
    }>
  ) {
    const opportunity = await this.requireOpportunity(ctx, payload.opportunityId);

    const amount =
      payload.amount ?? (opportunity.amount !== null && opportunity.amount !== undefined
        ? Number(opportunity.amount)
        : null);

    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId },
      'deal_desk_requests',
      {
        opportunityId: payload.opportunityId,
        amount,
        discountPct: payload.discountPct ?? null,
        reason: payload.reason ?? null
      }
    );

    const record = await this.prisma.dealDeskRequest.create({
      data: {
        orgId: ctx.orgId,
        requesterId: ctx.userId,
        ...writable
      }
    });

    return this.filterRecord(ctx, record);
  }

  async list(ctx: RequestContext, query: DealDeskListQueryDto) {
    if (!ctx.orgId) {
      return { items: [], nextCursor: null };
    }

    const take = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const items = await this.prisma.dealDeskRequest.findMany({
      where: {
        orgId: ctx.orgId,
        ...(query.status ? { status: query.status as DealDeskStatus } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });

    let nextCursor: string | null = null;
    if (items.length > take) {
      const next = items.pop();
      nextCursor = next?.id ?? null;
    }

    const records = await Promise.all(items.map((item) => this.filterRecord(ctx, item)));
    return { items: records, nextCursor };
  }

  async approve(ctx: RequestContext, id: string) {
    await this.requirePending(ctx, id);

    const updated = await this.prisma.dealDeskRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        decidedAt: new Date(),
        decidedBy: ctx.userId
      }
    });

    await this.emitOutboxEvent(ctx.orgId, 'deal_desk.approved', {
      requestId: updated.id,
      opportunityId: updated.opportunityId,
      amount: updated.amount,
      discountPct: updated.discountPct
    });

    return this.filterRecord(ctx, updated);
  }

  async reject(ctx: RequestContext, id: string) {
    await this.requirePending(ctx, id);

    const updated = await this.prisma.dealDeskRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedAt: new Date(),
        decidedBy: ctx.userId
      }
    });

    return this.filterRecord(ctx, updated);
  }

  private async requireOpportunity(ctx: RequestContext, opportunityId?: string) {
    if (!ctx.orgId) {
      throw new BadRequestException('Missing organisation context');
    }
    if (!opportunityId) {
      throw new BadRequestException('opportunityId is required');
    }

    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, orgId: ctx.orgId, deletedAt: null },
      select: { id: true, amount: true }
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    return opportunity;
  }

  private async requirePending(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      throw new BadRequestException('Missing organisation context');
    }

    const request = await this.prisma.dealDeskRequest.findFirst({
      where: { id, orgId: ctx.orgId }
    });

    if (!request) {
      throw new NotFoundException('Deal desk request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Request already ${request.status.toLowerCase()}`);
    }

    return request;
  }

  private async filterRecord(ctx: RequestContext, record: any) {
    const filtered = await this.fls.filterRead(ctx, 'deal_desk_requests', record);
    return { id: record.id, ...filtered };
  }

  private async emitOutboxEvent(orgId: string, event: string, payload: Record<string, unknown>) {
    const candidate = this.outbox as any;
    if (candidate && typeof candidate.enqueue === 'function') {
      await candidate.enqueue({
        orgId,
        event,
        payload
      });
      return;
    }
    if (candidate && typeof candidate.queue === 'function') {
      await candidate.queue(event, { orgId, payload });
    }
  }
}
