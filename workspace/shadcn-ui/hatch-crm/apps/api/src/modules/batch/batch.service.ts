import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/modules/shared-prisma';
import { BatchClient, BatchEventDto } from './batch.client';

export interface BatchSyncResult {
  totalImported: number;
  pagesProcessed: number;
}

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);
  private readonly defaultLimit = 100;

  constructor(
    private readonly batchClient: BatchClient,
    private readonly prisma: PrismaService
  ) {}

  async syncEvents(limit = this.defaultLimit): Promise<BatchSyncResult> {
    if (!this.batchClient.isEnabled()) {
      this.logger.debug('Skipping Batch sync; integration is disabled.');
      return { totalImported: 0, pagesProcessed: 0 };
    }

    let page = 1;
    let totalImported = 0;
    let pagesProcessed = 0;

    while (true) {
      const { events } = await this.batchClient.fetchEvents(page, limit);
      if (!events.length) {
        break;
      }

      for (const event of events) {
        await this.upsertEvent(event);
        totalImported += 1;
      }

      pagesProcessed += 1;

      if (events.length < limit) {
        break;
      }

      page += 1;
    }

    this.logger.log(`Batch sync complete: ${totalImported} events across ${pagesProcessed} page(s)`);

    return {
      totalImported,
      pagesProcessed
    };
  }

  private resolveOccurredAt(event: BatchEventDto): Date {
    const candidate =
      (event.occurredAt as string | undefined) ??
      (event.occurred_at as string | undefined) ??
      (event.createdAt as string | undefined) ??
      (event.created_at as string | undefined);

    const parsed = candidate ? new Date(candidate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private normalizeEventType(type: unknown): string {
    return typeof type === 'string' && type.trim().length > 0 ? type : 'unknown';
  }

  private async upsertEvent(event: BatchEventDto) {
    if (!event.id) {
      this.logger.warn('Skipping Batch event without an id');
      return;
    }

    const externalId = String(event.id);
    const occurredAt = this.resolveOccurredAt(event);
    const type = this.normalizeEventType(event.type);

    await this.prisma.batchEvent.upsert({
      where: { externalId },
      create: {
        externalId,
        type,
        occurredAt,
        payload: event as Prisma.InputJsonValue
      },
      update: {
        type,
        occurredAt,
        payload: event as Prisma.InputJsonValue
      }
    });
  }
}
