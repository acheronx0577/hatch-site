import { Injectable } from '@nestjs/common';

import type { AuditAction, Prisma } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';
import { AuditEventDto, AuditListQueryDto } from './dto';

const ACTOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true
} as const;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, query: AuditListQueryDto) {
    const take = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const where: Prisma.AuditEventWhereInput = {
      orgId
    };

    if (query.actorId) {
      where.actorId = query.actorId;
    }

    if (query.object) {
      where.object = query.object;
    }

    if (query.objectId) {
      where.recordId = query.objectId;
    }

    if (query.action) {
      where.action = query.action as AuditAction;
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.createdAt.lte = new Date(query.to);
      }
    }

    const records = await this.prisma.auditEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor }
          }
        : {}),
      include: {
        actor: {
          select: ACTOR_SELECT
        }
      }
    });

    const hasNextPage = records.length > take;
    const pageRecords = hasNextPage ? records.slice(0, take) : records;
    const nextCursor = hasNextPage ? pageRecords[pageRecords.length - 1]?.id ?? null : null;

    return {
      items: pageRecords.map((record) => this.toDto(record)),
      nextCursor
    };
  }

  private toDto(
    record: Prisma.AuditEventGetPayload<{ include: { actor: { select: typeof ACTOR_SELECT } } }>
  ): AuditEventDto {
    return {
      id: record.id,
      action: record.action,
      object: record.object,
      objectId: record.recordId,
      createdAt: record.createdAt.toISOString(),
      diff: record.diff ?? null,
      ip: record.ip ?? null,
      userAgent: record.userAgent ?? null,
      actor: record.actor
        ? {
            id: record.actor.id,
            firstName: record.actor.firstName,
            lastName: record.actor.lastName,
            email: record.actor.email
          }
        : null
    };
  }
}
