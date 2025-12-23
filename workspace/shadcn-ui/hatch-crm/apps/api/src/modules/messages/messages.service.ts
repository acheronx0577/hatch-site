import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsentScope, Message, MessageChannel, PersonStage, Prisma } from '@hatch/db';
import sgMail from '@sendgrid/mail';
import type { MailDataRequired } from '@sendgrid/helpers/classes/mail';

import { ComplianceService } from '../compliance/compliance.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingService } from '../routing/routing.service';
import { IndexerProducer } from '../search/indexer.queue';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { SendSmsDto } from './dto/send-sms.dto';
import {
  MessageListResponseDto,
  MessageResponseDto
} from './dto/message-response.dto';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
} from '../common/dto/cursor-pagination-query.dto';

@Injectable()
export class MessagesService {
  private readonly emailSenderDomain: string;
  private readonly sendgridConfigured: boolean;
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly outbox: OutboxService,
    private readonly routing: RoutingService,
    private readonly config: ConfigService,
    private readonly indexer: IndexerProducer
  ) {
    this.emailSenderDomain = this.config.get<string>('EMAIL_SENDER_DOMAIN') ?? 'example.hatchcrm.test';

    const sendgridKey = this.config.get<string>('SENDGRID_API_KEY');
    if (sendgridKey) {
      sgMail.setApiKey(sendgridKey);
      this.sendgridConfigured = true;
    } else {
      this.sendgridConfigured = false;
      if ((process.env.NODE_ENV ?? 'development') !== 'test') {
        this.logger.warn('SENDGRID_API_KEY is not configured; outbound email delivery is disabled.');
      }
    }
  }

  private resolveEntityType(stage?: PersonStage | null): 'client' | 'lead' {
    if (!stage) {
      return 'lead';
    }
    const clientLikeStages = new Set<PersonStage>([
      PersonStage.ACTIVE,
      PersonStage.UNDER_CONTRACT,
      PersonStage.CLOSED
    ]);
    return clientLikeStages.has(stage) ? 'client' : 'lead';
  }

  private async enqueueIndexJob(tenantId: string, personId: string, stageHint?: PersonStage | null) {
    const stage =
      stageHint ??
      (await this.prisma.person.findUnique({
        where: { id: personId },
        select: { stage: true }
      }))?.stage ??
      null;

    await this.indexer.enqueue({
      tenantId,
      entityType: this.resolveEntityType(stage),
      entityId: personId
    });
  }

  private async deliverEmailViaSendgrid(dto: SendEmailDto): Promise<string | undefined> {
    if (!this.sendgridConfigured) {
      return undefined;
    }

    const payload: MailDataRequired = {
      to: dto.to,
      from: dto.from,
      subject: dto.subject,
      text: dto.body,
      html: dto.body,
      customArgs: {
        tenantId: dto.tenantId,
        personId: dto.personId,
        userId: dto.userId
      },
      trackingSettings: dto.includeUnsubscribe
        ? {
            subscriptionTracking: {
              enable: true
            }
          }
        : undefined
    };

    try {
      const [response] = await sgMail.send(payload);
      return this.extractProviderMessageId(response.headers ?? undefined);
    } catch (error) {
      const description =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
      this.logger.error(`SendGrid email send failed: ${description}`);
      throw new BadRequestException('Failed to send email via SendGrid');
    }
  }

  private extractProviderMessageId(headers: Record<string, unknown> | undefined): string | undefined {
    if (!headers) {
      return undefined;
    }
    const headerValue =
      (headers['x-message-id'] as string | string[] | undefined) ??
      (headers['X-Message-Id'] as string | string[] | undefined);
    if (Array.isArray(headerValue)) {
      return headerValue[0];
    }
    return typeof headerValue === 'string' ? headerValue : undefined;
  }

  async sendSms(dto: SendSmsDto): Promise<Message> {
    await this.compliance.enforceConsent({
      tenantId: dto.tenantId,
      personId: dto.personId,
      channel: 'SMS',
      scope: dto.scope,
      actorUserId: dto.userId,
      overrideQuietHours: dto.overrideQuietHours,
      isTransactional: dto.transactional
    });

    const message = await this.prisma.message.create({
      data: {
        tenantId: dto.tenantId,
        personId: dto.personId,
        userId: dto.userId,
        channel: MessageChannel.SMS,
        direction: 'OUTBOUND',
        body: dto.body,
        toAddress: dto.to,
        fromAddress: dto.from,
        status: 'SENT'
      }
    });

    await this.prisma.activity.create({
      data: {
        tenantId: dto.tenantId,
        personId: dto.personId,
        userId: dto.userId,
        type: 'MESSAGE_SENT',
        payload: {
          messageId: message.id,
          channel: 'SMS'
        }
      }
    });

    await this.updateDeliverability(dto.tenantId, dto.userId, MessageChannel.SMS, {
      accepted: 1,
      delivered: 1
    });

    await this.outbox.enqueue({
      tenantId: dto.tenantId,
      eventType: 'message.sent',
      occurredAt: new Date().toISOString(),
      resource: {
        id: message.id,
        type: 'message'
      },
      data: {
        messageId: message.id,
        personId: dto.personId,
        channel: 'SMS'
      }
    });

    await this.routing.recordFirstTouch({
      tenantId: dto.tenantId,
      leadId: dto.personId,
      actorUserId: dto.userId,
      occurredAt: new Date()
    });

    await this.enqueueIndexJob(dto.tenantId, dto.personId);

    return message;
  }

  async sendEmail(dto: SendEmailDto): Promise<Message> {
    // Sanitize accidental model prefixes like "Subject: ..." and remove stray labels from body
    const cleanSubject = (dto.subject ?? '').replace(/^\s*subject\s*:\s*/i, '').trim();
    let cleanBody = dto.body ?? '';
    cleanBody = cleanBody.replace(/^\s*subject\s*:[^\n]*\n?/gim, '');
    cleanBody = cleanBody.replace(/^\s*html\s*:\s*/i, '');
    cleanBody = cleanBody.replace(/^\s*text\s*:\s*/i, '');
    cleanBody = cleanBody.replace(/\n{3,}/g, '\n\n').trim();

    const domain = dto.from.split('@')[1];
    if (!domain || domain !== this.emailSenderDomain) {
      throw new BadRequestException('Sending domain is not authenticated');
    }

    if (dto.scope === ConsentScope.PROMOTIONAL && dto.includeUnsubscribe !== true) {
      throw new BadRequestException('Promotional email must include one-click unsubscribe');
    }

    await this.compliance.enforceConsent({
      tenantId: dto.tenantId,
      personId: dto.personId,
      channel: 'EMAIL',
      scope: dto.scope,
      actorUserId: dto.userId,
      isTransactional: dto.scope === ConsentScope.TRANSACTIONAL
    });

    const providerMessageId = await this.deliverEmailViaSendgrid({ ...dto, subject: cleanSubject, body: cleanBody });

    const message = await this.prisma.message.create({
      data: {
        tenantId: dto.tenantId,
        personId: dto.personId,
        userId: dto.userId,
        channel: MessageChannel.EMAIL,
        direction: 'OUTBOUND',
        subject: cleanSubject,
        body: cleanBody,
        toAddress: dto.to,
        fromAddress: dto.from,
        status: 'SENT',
        providerMessageId: providerMessageId ?? null
      }
    });

    await this.prisma.activity.create({
      data: {
        tenantId: dto.tenantId,
        personId: dto.personId,
        userId: dto.userId,
        type: 'MESSAGE_SENT',
        payload: {
          messageId: message.id,
          channel: 'EMAIL'
        }
      }
    });

    await this.updateDeliverability(dto.tenantId, dto.userId, MessageChannel.EMAIL, {
      accepted: 1,
      delivered: 1
    });

    await this.outbox.enqueue({
      tenantId: dto.tenantId,
      eventType: 'message.sent',
      occurredAt: new Date().toISOString(),
      resource: {
        id: message.id,
        type: 'message'
      },
      data: {
        messageId: message.id,
        personId: dto.personId,
        channel: 'EMAIL'
      }
    });

    await this.routing.recordFirstTouch({
      tenantId: dto.tenantId,
      leadId: dto.personId,
      actorUserId: dto.userId,
      occurredAt: new Date()
    });

    return message;
  }

  async ingestInbound(dto: InboundMessageDto): Promise<Message> {
    const tenant = dto.tenantSlug
      ? await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } })
      : await this.prisma.tenant.findFirst();

    if (!tenant) {
      throw new BadRequestException('Unknown tenant context');
    }

    if (dto.providerId) {
      const existing = await this.prisma.message.findFirst({
        where: {
          tenantId: tenant.id,
          channel: dto.channel,
          direction: 'INBOUND',
          providerMessageId: dto.providerId
        }
      });
      if (existing) {
        return existing;
      }
    }

    const person = await this.prisma.person.findFirst({
      where: dto.channel === MessageChannel.SMS
        ? { tenantId: tenant.id, primaryPhone: dto.from }
        : {
            tenantId: tenant.id,
            OR: [{ primaryEmail: dto.from }, { primaryEmail: dto.to }]
          }
    });

    const message = await this.prisma.message.create({
      data: {
        tenantId: tenant.id,
        personId: person?.id,
        channel: dto.channel,
        direction: 'INBOUND',
        subject: dto.subject,
        body: dto.body,
        toAddress: dto.to,
        fromAddress: dto.from,
        status: 'DELIVERED',
        providerMessageId: dto.providerId
      }
    });

    if (person) {
      await this.prisma.activity.create({
        data: {
          tenantId: tenant.id,
          personId: person.id,
          type: 'MESSAGE_SENT',
          payload: {
            direction: 'INBOUND',
            channel: dto.channel,
            messageId: message.id
          }
        }
      });
    }

    await this.outbox.enqueue({
      tenantId: tenant.id,
      eventType: 'message.sent',
      occurredAt: new Date().toISOString(),
      resource: {
        id: message.id,
        type: 'message'
      },
      data: {
        messageId: message.id,
        direction: 'INBOUND',
        channel: dto.channel
      }
    });

    if (message.channel === MessageChannel.EMAIL && person) {
      await this.enqueueIndexJob(person.tenantId, person.id, person.stage);
    }

    return message;
  }

  private async updateDeliverability(
    tenantId: string,
    agentId: string,
    channel: MessageChannel,
    delta: { accepted?: number; delivered?: number; bounced?: number; complaints?: number; optOuts?: number }
  ) {
    const periodStart = new Date();
    periodStart.setHours(0, 0, 0, 0);

    await this.prisma.deliverabilityMetric.upsert({
      where: {
        tenantId_agentId_channel_recordedAt: {
          tenantId,
          agentId,
          channel,
          recordedAt: periodStart
        }
      },
      update: {
        accepted: { increment: delta.accepted ?? 0 },
        delivered: { increment: delta.delivered ?? 0 },
        bounced: { increment: delta.bounced ?? 0 },
        complaints: { increment: delta.complaints ?? 0 },
        optOuts: { increment: delta.optOuts ?? 0 }
      },
      create: {
        tenantId,
        agentId,
        channel,
        recordedAt: periodStart,
        accepted: delta.accepted ?? 0,
        delivered: delta.delivered ?? 0,
        bounced: delta.bounced ?? 0,
        complaints: delta.complaints ?? 0,
        optOuts: delta.optOuts ?? 0
      }
    });
  }

  async listMessages(
    tenantId: string | undefined,
    query: {
      limit?: number;
      cursor?: string;
      channel?: MessageChannel;
      direction?: 'INBOUND' | 'OUTBOUND';
      q?: string;
    }
  ): Promise<MessageListResponseDto> {
    const take = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const where: Prisma.MessageWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.direction ? { direction: query.direction } : {})
    };

    if (query.q) {
      const search = query.q.trim();
      if (search.length > 0) {
        where.OR = [
          { subject: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
          { toAddress: { contains: search, mode: 'insensitive' } },
          { fromAddress: { contains: search, mode: 'insensitive' } }
        ];
      }
    }

    const messages = await this.prisma.message.findMany({
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
        person: { select: { firstName: true, lastName: true } },
        user: { select: { firstName: true, lastName: true } }
      }
    });

    let nextCursor: string | null = null;
    if (messages.length > take) {
      const next = messages.pop();
      nextCursor = next?.id ?? null;
    }

    return {
      items: messages.map((message) => this.toMessageDto(message)),
      nextCursor
    };
  }

  private toMessageDto(
    message: Prisma.MessageGetPayload<{
      include: {
        person: { select: { firstName: true; lastName: true } };
        user: { select: { firstName: true; lastName: true } };
      };
    }>
  ): MessageResponseDto {
    return {
      id: message.id,
      tenantId: message.tenantId,
      personId: message.personId,
      userId: message.userId,
      channel: message.channel,
      direction: message.direction,
      subject: message.subject,
      body: message.body,
      toAddress: message.toAddress,
      fromAddress: message.fromAddress,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt?.toISOString() ?? null
    };
  }
}
