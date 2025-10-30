import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { FlsService } from '../../platform/security/fls.service';
import { CreateCaseDto, UpdateCaseDto } from './dto';

const DEFAULT_LIMIT = 50;
const CLOSING_STATUSES = new Set(['Resolved', 'Closed']);

interface ListParams {
  q?: string;
  status?: string;
  priority?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService, private readonly fls: FlsService) {}

  async list(ctx: RequestContext, params: ListParams = {}) {
    if (!ctx.orgId) {
      return { items: [], nextCursor: null };
    }

    const { q, status, priority, cursor } = params;
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), 200);

    const cases = await this.prisma.case.findMany({
      where: {
        orgId: ctx.orgId,
        deletedAt: null,
        ...(q
          ? {
              subject: {
                contains: q,
                mode: 'insensitive'
              }
            }
          : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {})
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true, primaryEmail: true } }
      }
    });

    const items = await Promise.all(
      cases.map(async (record) => {
        const filtered = await this.fls.filterRead(ctx, 'cases', record);
        const names = [
          record.contact?.firstName,
          record.contact?.lastName
        ]
          .filter(Boolean)
          .join(' ')
          .trim();

        return {
          id: record.id,
          account: record.account ? { id: record.account.id, name: record.account.name } : null,
          contact: record.contact
            ? {
                id: record.contact.id,
                name: names.length > 0 ? names : null,
                email: record.contact.primaryEmail ?? null
              }
            : null,
          ...filtered
        };
      })
    );

    const nextCursor = cases.length === limit ? cases[cases.length - 1].id : null;

    return { items, nextCursor };
  }

  async get(ctx: RequestContext, id: string) {
    const record = await this.requireCase(ctx, id);
    const filtered = await this.fls.filterRead(ctx, 'cases', record);

    const names = [
      record.contact?.firstName,
      record.contact?.lastName
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      id: record.id,
      account: record.account ? { id: record.account.id, name: record.account.name } : null,
      contact: record.contact
        ? {
            id: record.contact.id,
            name: names.length > 0 ? names : null,
            email: record.contact.primaryEmail ?? null
          }
        : null,
      ...filtered
    };
  }

  async create(ctx: RequestContext, dto: CreateCaseDto) {
    if (!ctx.orgId || !ctx.userId) {
      throw new BadRequestException('Missing organisation or user context');
    }

    const assignmentOwnerId = ctx.assignmentOverride?.ownerId ?? null;
    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId },
      'cases',
      dto as unknown as Record<string, unknown>
    );

    const subject = (writable.subject as string | undefined) ?? dto.subject;
    if (!subject || subject.trim().length === 0) {
      throw new BadRequestException('Subject is required');
    }

    const status = ((writable.status as string | undefined) ?? dto.status) ?? 'New';
    const priority = ((writable.priority as string | undefined) ?? dto.priority) ?? 'Medium';
    const description =
      (writable.description as string | undefined) ?? dto.description ?? null;

    if (this.isClosingStatus(status) && !description) {
      throw new BadRequestException(
        'Description is required when resolving or closing a case (TODO: move to validation rules)'
      );
    }

    const created = await this.prisma.case.create({
      data: {
        orgId: ctx.orgId,
        ownerId: assignmentOwnerId ?? ctx.userId,
        subject,
        status,
        priority,
        origin: ((writable.origin as string | undefined) ?? dto.origin) ?? null,
        description,
        accountId:
          (writable.accountId as string | undefined) ?? dto.accountId ?? null,
        contactId:
          (writable.contactId as string | undefined) ?? dto.contactId ?? null
      }
    });

    const filtered = await this.fls.filterRead(ctx, 'cases', created);
    return { id: created.id, ...filtered };
  }

  async update(ctx: RequestContext, id: string, dto: UpdateCaseDto) {
    const existing = await this.requireCase(ctx, id);

    const assignmentOwnerId = ctx.assignmentOverride?.ownerId ?? null;
    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId ?? existing.orgId, userId: ctx.userId ?? existing.ownerId },
      'cases',
      dto as unknown as Record<string, unknown>
    );

    const writableRecord = { ...(writable as Record<string, unknown>) };
    if (assignmentOwnerId) {
      writableRecord.ownerId = assignmentOwnerId;
    }

    if (Object.keys(writableRecord).length === 0) {
      const filtered = await this.fls.filterRead(ctx, 'cases', existing);
      return { id: existing.id, ...filtered };
    }

    const nextStatus =
      (writable.status as string | undefined) ?? dto.status ?? existing.status;
    const nextDescription =
      (writable.description as string | undefined) ??
      dto.description ??
      existing.description;

    if (this.isClosingStatus(nextStatus) && (!nextDescription || nextDescription.trim().length === 0)) {
      throw new BadRequestException(
        'Description is required when resolving or closing a case (TODO: move to validation rules)'
      );
    }

    const updated = await this.prisma.case.update({
      where: { id: existing.id },
      data: writableRecord as Prisma.CaseUncheckedUpdateInput
    });

    const filtered = await this.fls.filterRead(ctx, 'cases', updated);
    return { id: updated.id, ...filtered };
  }

  async remove(ctx: RequestContext, id: string) {
    const existing = await this.requireCase(ctx, id);
    await this.prisma.case.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() }
    });
    return { id };
  }

  private async requireCase(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const record = await this.prisma.case.findFirst({
      where: { id, orgId: ctx.orgId, deletedAt: null },
      include: {
        account: { select: { id: true, name: true } },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryEmail: true
          }
        }
      }
    });

    if (!record) {
      throw new NotFoundException('Case not found');
    }

    return record;
  }

  private isClosingStatus(status: string) {
    return CLOSING_STATUSES.has(status);
  }
}
