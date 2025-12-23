import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import type { AiPendingAction, Prisma } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiFeature } from '../types/ai-request.types';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired'
  | 'superseded';

export type QueueApprovalRequest = {
  feature: AiFeature;
  actionType: string;
  generatedContent: string;
  organizationId: string;
  requestedById: string;
  entityType?: string;
  entityId?: string;
  originalRequest: Prisma.InputJsonValue;
  expiresAt?: Date;
};

export type ApprovalFilters = {
  status?: ApprovalStatus;
  feature?: AiFeature;
  actionType?: string;
};

export type PaginatedResult<T> = { items: T[]; nextCursor: string | null };

export type RegenerateRequest = {
  generatedContent: string;
  notes?: string;
};

export type ExecutionResult = {
  ok: boolean;
  executionResult?: Prisma.InputJsonValue | null;
};

@Injectable()
export class AiApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async queueForApproval(request: QueueApprovalRequest): Promise<AiPendingAction> {
    const preview = buildPreview(request.generatedContent);
    const expiresAt = request.expiresAt ?? defaultExpiry();

    return this.prisma.aiPendingAction.create({
      data: {
        organizationId: request.organizationId,
        feature: request.feature,
        actionType: request.actionType,
        generatedContent: request.generatedContent,
        contentPreview: preview,
        requestedById: request.requestedById,
        entityType: request.entityType ?? null,
        entityId: request.entityId ?? null,
        originalRequest: request.originalRequest,
        status: 'pending',
        expiresAt
      }
    });
  }

  async getPending(organizationId: string, params?: { limit?: number; cursor?: string; filters?: ApprovalFilters }) {
    const limit = Math.max(1, Math.min(params?.limit ?? 25, 100));
    const cursor = params?.cursor;
    const filters = params?.filters ?? {};

    const rows = await this.prisma.aiPendingAction.findMany({
      where: {
        organizationId,
        ...(filters.status ? { status: filters.status } : { status: 'pending' }),
        ...(filters.feature ? { feature: filters.feature } : {}),
        ...(filters.actionType ? { actionType: filters.actionType } : {})
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });

    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? rows[limit]?.id ?? null : null;

    return { items, nextCursor } satisfies PaginatedResult<AiPendingAction>;
  }

  async approve(actionId: string, reviewerId: string, notes?: string): Promise<void> {
    await this.prisma.aiPendingAction.updateMany({
      where: { id: actionId, status: 'pending' },
      data: {
        status: 'approved',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes ?? null
      }
    });
  }

  async reject(actionId: string, reviewerId: string, reason: string): Promise<void> {
    await this.prisma.aiPendingAction.updateMany({
      where: { id: actionId, status: 'pending' },
      data: {
        status: 'rejected',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: reason
      }
    });
  }

  async regenerate(actionId: string, modifications: RegenerateRequest): Promise<AiPendingAction> {
    const existing = await this.prisma.aiPendingAction.findUnique({ where: { id: actionId } });
    if (!existing) {
      throw new Error('Pending action not found');
    }

    await this.prisma.aiPendingAction.updateMany({
      where: { id: existing.id, status: { in: ['pending', 'approved'] } },
      data: { status: 'superseded' }
    });

    return this.prisma.aiPendingAction.create({
      data: {
        organizationId: existing.organizationId,
        feature: existing.feature,
        actionType: existing.actionType,
        generatedContent: modifications.generatedContent,
        contentPreview: buildPreview(modifications.generatedContent),
        requestedById: existing.requestedById,
        entityType: existing.entityType,
        entityId: existing.entityId,
        originalRequest: existing.originalRequest as Prisma.InputJsonValue,
        status: 'pending',
        expiresAt: defaultExpiry(),
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: modifications.notes ?? null
      }
    });
  }

  async execute(actionId: string): Promise<ExecutionResult> {
    const action = await this.prisma.aiPendingAction.findUnique({ where: { id: actionId } });
    if (!action) {
      throw new Error('Pending action not found');
    }

    if (action.status !== 'approved') {
      return { ok: false, executionResult: null };
    }

    const executionResult: Prisma.InputJsonValue = { ok: true };

    await this.prisma.aiPendingAction.update({
      where: { id: actionId },
      data: {
        status: 'executed',
        executedAt: new Date(),
        executionResult: executionResult as any
      }
    });

    return { ok: true, executionResult };
  }

  @Cron('0 * * * *')
  async cleanupExpired(): Promise<void> {
    const now = new Date();
    await this.prisma.aiPendingAction.updateMany({
      where: { status: 'pending', expiresAt: { lt: now } },
      data: { status: 'expired' }
    });
  }
}

function buildPreview(text: string) {
  const trimmed = (text ?? '').trim().replace(/\s+/g, ' ');
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function defaultExpiry() {
  const ttlHours = Number(process.env.AI_PENDING_ACTION_TTL_HOURS ?? 72);
  const ms = Number.isFinite(ttlHours) ? ttlHours * 60 * 60 * 1000 : 72 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

