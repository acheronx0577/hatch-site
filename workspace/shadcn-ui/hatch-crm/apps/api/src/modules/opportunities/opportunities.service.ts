import { BadRequestException, Injectable } from '@nestjs/common';

import { Prisma } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { FlsService } from '../../platform/security/fls.service';

interface ListOptions {
  q?: string;
  stage?: string;
  accountId?: string;
  limit?: number;
  cursor?: string;
}

const toDate = (value?: unknown) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService, private readonly fls: FlsService) {}

  async list(ctx: RequestContext, options: ListOptions = {}) {
    if (!ctx.orgId) {
      return [];
    }
    const { q, stage, accountId, limit = 50, cursor } = options;
    const items = await this.prisma.opportunity.findMany({
      where: {
        orgId: ctx.orgId,
        deletedAt: null,
        ...(q
          ? {
              name: {
                contains: q,
                mode: 'insensitive'
              }
            }
          : {}),
        ...(stage ? { stage } : {}),
        ...(accountId ? { accountId } : {})
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined
    });

    return Promise.all(
      items.map(async (item) => {
        const filtered = await this.fls.filterRead(ctx, 'opportunities', item);
        return { id: item.id, ...filtered };
      })
    );
  }

  async get(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      return null;
    }
    const record = await this.prisma.opportunity.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null },
      include: {
        account: {
          select: {
            id: true,
            name: true
          }
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            stage: true
          }
        }
      }
    });
    if (!record) {
      return null;
    }

    const filteredRaw = await this.fls.filterRead(ctx, 'opportunities', record);
    const { transactions, ...filtered } = (filteredRaw ?? {}) as Record<string, unknown>;
    const transaction = record.transactions?.[0] ?? null;
    return {
      id: record.id,
      ...filtered,
      account: record.account ? { id: record.account.id, name: record.account.name } : null,
      transaction: transaction
        ? {
            id: transaction.id,
            stage: transaction.stage
          }
        : null
    };
  }

  async create(ctx: RequestContext, dto: Record<string, unknown>) {
    if (!ctx.orgId || !ctx.userId) {
      throw new Error('Missing org or user context');
    }

    await this.assertAccountOwnership(ctx, dto.accountId as string | undefined);

    const normalised: Record<string, unknown> = { ...dto };
    if (dto.closeDate) {
      const close = toDate(dto.closeDate);
      if (!close) {
        throw new BadRequestException('closeDate must be a valid date');
      }
      normalised.closeDate = close;
    }

    const assignmentOwnerId = ctx.assignmentOverride?.ownerId ?? null;
    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId },
      'opportunities',
      normalised
    );

    const writableRecord = { ...(writable as Record<string, unknown>) };
    if ('ownerId' in writableRecord) {
      delete writableRecord.ownerId;
    }

    const created = await this.prisma.opportunity.create({
      data: {
        orgId: ctx.orgId,
        ownerId: assignmentOwnerId ?? ctx.userId,
        ...writableRecord
      } as Prisma.OpportunityUncheckedCreateInput,
      include: {
        account: { select: { id: true, name: true } }
      }
    });

    const filtered = await this.fls.filterRead(ctx, 'opportunities', created);
    return {
      id: created.id,
      ...filtered,
      account: created.account ? { id: created.account.id, name: created.account.name } : null
    };
  }

  async update(ctx: RequestContext, id: string, dto: Record<string, unknown>) {
    if (!ctx.orgId) {
      return null;
    }
    const current = await this.prisma.opportunity.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null },
      include: { account: { select: { id: true, name: true } } }
    });
    if (!current) {
      return null;
    }

    await this.assertAccountOwnership(ctx, dto.accountId as string | undefined);

    const normalised: Record<string, unknown> = { ...dto };
    if (dto.closeDate) {
      const close = toDate(dto.closeDate);
      if (!close) {
        throw new BadRequestException('closeDate must be a valid date');
      }
      normalised.closeDate = close;
    }

    const assignmentOwnerId = ctx.assignmentOverride?.ownerId ?? null;
    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: current.ownerId ?? ctx.userId },
      'opportunities',
      normalised
    );

    const writableRecord = { ...(writable as Record<string, unknown>) };
    if (assignmentOwnerId) {
      writableRecord.ownerId = assignmentOwnerId;
    }

    if (Object.keys(writableRecord).length === 0) {
      const filteredCurrent = await this.fls.filterRead(ctx, 'opportunities', current);
      return {
        id: current.id,
        ...filteredCurrent,
        account: current.account ? { id: current.account.id, name: current.account.name } : null
      };
    }

    const updated = await this.prisma.opportunity.update({
      where: { id },
      data: writableRecord as Prisma.OpportunityUncheckedUpdateInput,
      include: {
        account: { select: { id: true, name: true } }
      }
    });

    const filtered = await this.fls.filterRead(ctx, 'opportunities', updated);
    return {
      id: updated.id,
      ...filtered,
      account: updated.account ? { id: updated.account.id, name: updated.account.name } : null
    };
  }

  async softDelete(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      return null;
    }
    const current = await this.prisma.opportunity.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null }
    });
    if (!current) {
      return null;
    }
    await this.prisma.opportunity.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { id };
  }

  private async assertAccountOwnership(ctx: RequestContext, accountId?: string) {
    if (!accountId) {
      return;
    }
    if (!ctx.orgId) {
      throw new BadRequestException('Missing org context');
    }
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, orgId: ctx.orgId, deletedAt: null },
      select: { id: true }
    });
    if (!account) {
      throw new BadRequestException('Account not found for this organisation');
    }
  }
}
