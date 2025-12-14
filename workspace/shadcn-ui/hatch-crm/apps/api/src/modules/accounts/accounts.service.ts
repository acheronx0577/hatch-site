import { Injectable } from '@nestjs/common';

import { Prisma, type Account } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { FlsService } from '../../platform/security/fls.service';

interface ListOptions {
  q?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService, private readonly fls: FlsService) {}

  async list(ctx: RequestContext, options: ListOptions = {}) {
    if (!ctx.orgId) {
      return { items: [], nextCursor: null };
    }
    const { q, limit = 50, cursor } = options;
    const take = Math.min(Math.max(limit, 1), 200);
    const records = await this.prisma.account.findMany({
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
          : {})
      },
      orderBy: { updatedAt: 'desc' },
      take,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined
    });

    const items = await Promise.all(records.map((record) => this.toResponse(ctx, record)));
    const nextCursor = records.length === take ? records[records.length - 1]?.id ?? null : null;

    return { items, nextCursor };
  }

  async get(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      return null;
    }
    const record = await this.prisma.account.findFirst({
      where: {
        id,
        orgId: ctx.orgId,
        deletedAt: null
      }
    });

    if (!record) {
      return null;
    }

    return this.toResponse(ctx, record);
  }

  async create(ctx: RequestContext, dto: Record<string, unknown>) {
    if (!ctx.orgId || !ctx.userId) {
      throw new Error('Missing org or user context');
    }
    const assignmentOwnerId = ctx.assignmentOverride?.ownerId ?? null;
    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId },
      'accounts',
      dto
    );

    const writableRecord = { ...(writable as Record<string, unknown>) };
    if ('ownerId' in writableRecord) {
      delete writableRecord.ownerId;
    }

    const createData = {
      orgId: ctx.orgId,
      ownerId: assignmentOwnerId ?? ctx.userId,
      ...writableRecord
    } as Prisma.AccountUncheckedCreateInput;

    const created = await this.prisma.account.create({
      data: createData
    });

    return this.toResponse(ctx, created);
  }

  async update(ctx: RequestContext, id: string, dto: Record<string, unknown>) {
    if (!ctx.orgId) {
      return null;
    }
    const current = await this.prisma.account.findFirst({
      where: {
        id,
        orgId: ctx.orgId,
        deletedAt: null
      }
    });
    if (!current) {
      return null;
    }

    const assignmentOwnerId = ctx.assignmentOverride?.ownerId ?? null;
    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: current.ownerId ?? ctx.userId },
      'accounts',
      dto
    );

    const writableRecord = { ...(writable as Record<string, unknown>) };
    if (assignmentOwnerId) {
      writableRecord.ownerId = assignmentOwnerId;
    }

    if (Object.keys(writableRecord).length === 0) {
      const filteredCurrent = await this.fls.filterRead(ctx, 'accounts', current);
      return { id: current.id, ...filteredCurrent };
    }

    const updated = await this.prisma.account.update({
      where: { id },
      data: writableRecord as Prisma.AccountUncheckedUpdateInput
    });

    return this.toResponse(ctx, updated);
  }

  async softDelete(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      return null;
    }
    const current = await this.prisma.account.findFirst({
      where: {
        id,
        orgId: ctx.orgId,
        deletedAt: null
      }
    });
    if (!current) {
      return null;
    }

    await this.prisma.account.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { id };
  }

  private async toResponse(ctx: RequestContext, record: Account) {
    const filtered = await this.fls.filterRead(ctx, 'accounts', record);
    const response: Record<string, unknown> = { id: record.id, ...(filtered ?? {}) };

    if ('annualRevenue' in response) {
      response.annualRevenue =
        record.annualRevenue !== null && record.annualRevenue !== undefined
          ? Number(record.annualRevenue)
          : null;
    }

    if ('ownerId' in response || 'owner' in response) {
      response.owner = record.ownerId ? { id: record.ownerId } : null;
    }

    return response;
  }
}
