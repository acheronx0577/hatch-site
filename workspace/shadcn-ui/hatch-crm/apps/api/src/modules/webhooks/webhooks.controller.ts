import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiModule, ApiStandardErrors } from '../common';
import {
  WebhookStatusResponseDto,
  WebhookSubscriptionDto,
  WebhookSubscriptionListResponseDto
} from './dto/webhook-response.dto';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
} from '../common/dto/cursor-pagination-query.dto';

@ApiModule('Webhooks')
@ApiStandardErrors()
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService
  ) {}

  @Get('subscriptions')
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE }
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Opaque cursor pointing at the next window'
  })
  @ApiQuery({
    name: 'active',
    required: false,
    description: 'Filter subscriptions by active status (true/false)'
  })
  @ApiOkResponse({ type: WebhookSubscriptionListResponseDto })
  async listSubscriptions(
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('active') active: string | undefined
  ): Promise<WebhookSubscriptionListResponseDto> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const take = Math.min(
      Number.isFinite(parsedLimit ?? NaN) ? (parsedLimit as number) : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE
    );

    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where:
        active === 'true'
          ? { isActive: true }
          : active === 'false'
            ? { isActive: false }
            : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor }
          }
        : {})
    });

    let nextCursor: string | null = null;

    if (subscriptions.length > take) {
      const next = subscriptions.pop();
      nextCursor = next?.id ?? null;
    }

    const items = subscriptions.map((subscription) => ({
      id: subscription.id,
      tenantId: subscription.tenantId,
      eventTypes: subscription.eventTypes,
      url: subscription.url,
      isActive: subscription.isActive,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString()
    } satisfies WebhookSubscriptionDto));

    return { items, nextCursor };
  }

  @Post('outbox/flush')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1 } },
      required: []
    }
  })
  @ApiOkResponse({ type: WebhookStatusResponseDto })
  async flushOutbox(@Body('limit') limit?: number): Promise<WebhookStatusResponseDto> {
    await this.outbox.processPending(limit ?? 5);
    return { status: 'ok' };
  }

  @Post('simulate/:eventType')
  @ApiParam({ name: 'eventType', description: 'Event type to enqueue' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
      description: 'Payload delivered to webhook subscribers'
    }
  })
  @ApiOkResponse({ type: WebhookStatusResponseDto })
  async simulateDeliver(
    @Param('eventType') eventType: string,
    @Body() payload: Record<string, unknown>
  ): Promise<WebhookStatusResponseDto> {
    await this.outbox.enqueue({
      eventType: eventType as any,
      occurredAt: new Date().toISOString(),
      tenantId: String(payload?.tenantId ?? ''),
      resource: {
        id: String(payload?.resourceId ?? 'resource'),
        type: String(payload?.resourceType ?? 'generic')
      },
      data: payload
    });
    await this.outbox.processPending(1);
    return { status: 'queued' };
  }
}
