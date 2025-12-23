import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@hatch/db';
import { DomainEvent, makeDomainEvent, signPayload } from '@hatch/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly maxAttempts: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    this.maxAttempts = Number(this.config.get('outbox.maxAttempts') ?? 5);
  }

  async enqueue(event: DomainEvent) {
    const parsed = makeDomainEvent({
      ...event,
      occurredAt: event.occurredAt ?? new Date().toISOString()
    });

    await this.prisma.outbox.create({
      data: {
        tenantId: parsed.tenantId,
        eventType: parsed.eventType,
        payload: parsed as Prisma.JsonObject
      }
    });
  }

  async processPending(batchSize = 10, options: { tenantId?: string } = {}) {
    const pending = await this.prisma.outbox.findMany({
      where: {
        status: 'PENDING',
        ...(options.tenantId ? { tenantId: options.tenantId } : {})
      },
      take: batchSize,
      orderBy: [{ createdAt: 'asc' }]
    });

    for (const record of pending) {
      await this.deliver(record);
    }
  }

  private async deliver(record: Prisma.OutboxGetPayload<{ include: { tenant: false } }>) {
    const webhooks = await this.prisma.webhookSubscription.findMany({
      where: {
        tenantId: record.tenantId,
        isActive: true,
        eventTypes: { has: record.eventType }
      }
    });

    if (webhooks.length === 0) {
      await this.prisma.outbox.update({
        where: { id: record.id },
        data: { status: 'SUCCESS', updatedAt: new Date() }
      });
      return;
    }

    const payload = JSON.stringify(record.payload);

    for (const webhook of webhooks) {
      const signature = signPayload(payload, webhook.secret);
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hatch-Event': record.eventType,
            'X-Hatch-Signature': signature
          },
          body: payload
        });

        const success = response.status >= 200 && response.status < 300;
        await this.prisma.webhookDelivery.upsert({
          where: { id: `${webhook.id}-${record.id}` },
          create: {
            id: `${webhook.id}-${record.id}`,
            webhookId: webhook.id,
            outboxId: record.id,
            status: success ? 'SUCCESS' : 'FAILED',
            attempts: 1,
            lastError: success ? undefined : `HTTP ${response.status}`,
            deliveredAt: success ? new Date() : undefined
          },
          update: {
            status: success ? 'SUCCESS' : 'FAILED',
            attempts: { increment: 1 },
            lastError: success ? undefined : `HTTP ${response.status}`,
            deliveredAt: success ? new Date() : undefined
          }
        });

        if (!success) {
          throw new Error(`Webhook delivery failed: ${response.status}`);
        }
      } catch (error) {
        this.logger.error(`Failed to deliver webhook ${webhook.id}`, error as Error);
        await this.prisma.outbox.update({
          where: { id: record.id },
          data: {
            status: record.attempts + 1 >= this.maxAttempts ? 'FAILED' : 'PENDING',
            attempts: { increment: 1 },
            lastError: (error as Error).message,
            nextRetryAt: record.attempts + 1 >= this.maxAttempts ? undefined : this.nextRetry(record.attempts + 1)
          }
        });
        return;
      }
    }

    await this.prisma.outbox.update({
      where: { id: record.id },
      data: {
        status: 'SUCCESS',
        attempts: { increment: 1 },
        lastError: null,
        updatedAt: new Date()
      }
    });
  }

  private nextRetry(attempts: number) {
    const delaySeconds = Math.min(60 * 60, 2 ** attempts);
    return new Date(Date.now() + delaySeconds * 1000);
  }
}
