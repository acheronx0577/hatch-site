import { Injectable } from '@nestjs/common';

import { Prisma } from '@hatch/db';

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
      return [];
    }
    const { q, limit = 50, cursor } = options;
    const items = await this.prisma.account.findMany({
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
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined
    });

    return Promise.all(
      items.map(async (item) => {
        const filtered = await this.fls.filterRead(ctx, 'accounts', item);
        return { id: item.id, ...filtered };
      })
    );
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

    const filtered = await this.fls.filterRead(ctx, 'accounts', record);
    return { id: record.id, ...filtered };
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

    const filtered = await this.fls.filterRead(ctx, 'accounts', created);
    return { id: created.id, ...filtered };
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

    const filtered = await this.fls.filterRead(ctx, 'accounts', updated);
    return { id: updated.id, ...filtered };
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
}
