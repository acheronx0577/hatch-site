import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DealStage, Prisma } from '@hatch/db';

import { PrismaService } from '../../prisma/prisma.service';
import { FlsService } from '../../../platform/security/fls.service';
import { CommissionPlansService } from '../../commission-plans/commission-plans.service';
import { PayoutsService } from '../../payouts/payouts.service';
import { OutboxService } from '../../outbox/outbox.service';
import type { RequestContext } from '../../common/request-context';
import { UpdateMilestoneDto } from './dto';

type TxClient = Prisma.TransactionClient;

interface CommissionPreview {
  gross: number;
  brokerAmount: number;
  agentAmount: number;
  schedule: Array<{ payee: string; amount: number }>;
  planId?: string | null;
}

const DEFAULT_CHECKLIST = {
  items: [] as Array<{
    name: string;
    completedAt?: string | null;
    notes?: string | null;
    updatedBy?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
  }>
};

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fls: FlsService,
    private readonly commissionPlans: CommissionPlansService,
    private readonly payouts: PayoutsService,
    private readonly outbox: OutboxService
  ) {}

  async get(ctx: RequestContext, id: string) {
    const transaction = await this.requireTransaction(ctx, id, {
      include: {
        listing: {
          select: {
            id: true,
            status: true,
            opportunityId: true,
            price: true,
            addressLine1: true,
            city: true,
            state: true,
            postalCode: true
          }
        },
        offers: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    return this.toTransactionView(ctx, id, transaction);
  }

  async ensureForAcceptedOffer(
    ctx: RequestContext,
    offer: {
      id: string;
      tenantId: string;
      personId: string;
      listingId: string;
      dealId: string | null;
      terms?: Prisma.JsonValue | null;
      listing?: {
        id: string;
        opportunityId: string | null;
        price: Prisma.Decimal | null;
      } | null;
    },
    listing?: {
      id: string;
      opportunityId: string | null;
      price: Prisma.Decimal | null;
    } | null,
    tx?: TxClient
  ) {
    const client = tx ?? this.prisma;

    const resolvedListing = listing ?? offer.listing ?? null;
    const amount = extractAmount({
      terms: offer.terms,
      listing: resolvedListing
    }) ?? 0;

    let transaction = offer.dealId
      ? await client.deal.findUnique({ where: { id: offer.dealId } })
      : null;

    const resolvedOpportunity = transaction?.opportunityId ?? resolvedListing?.opportunityId ?? null;

    if (!transaction) {
      transaction = await client.deal.create({
        data: {
          tenantId: offer.tenantId,
          personId: offer.personId,
          listingId: offer.listingId,
          opportunityId: resolvedOpportunity,
          stage: DealStage.UNDER_CONTRACT,
          milestoneChecklist: DEFAULT_CHECKLIST,
          commissionSnapshot: null,
          splitPlanRef: null,
          expectedNet: null,
          forecastGci: amount ? new Prisma.Decimal(amount) : null
        }
      });
    } else {
      const nextOpportunity = transaction.opportunityId ?? resolvedOpportunity ?? null;
      if (transaction.stage !== DealStage.UNDER_CONTRACT || transaction.opportunityId !== nextOpportunity) {
        transaction = await client.deal.update({
          where: { id: transaction.id },
          data: {
            stage: DealStage.UNDER_CONTRACT,
            opportunityId: nextOpportunity
          }
        });
      }
    }

    const opportunityId = transaction.opportunityId ?? resolvedOpportunity ?? null;

    if (resolvedListing && opportunityId && resolvedListing.opportunityId !== opportunityId) {
      await client.listing.update({
        where: { id: resolvedListing.id },
        data: { opportunityId }
      });
    }

    const preview = await this.computeCommissionInternal(
      ctx,
      {
        transaction,
        offerAmount: amount,
        opportunityId
      },
      client
    );

    if (preview) {
      const previousSnapshot = transaction.commissionSnapshot ? JSON.stringify(transaction.commissionSnapshot) : null;
      const nextSnapshot = JSON.stringify(preview);
      if (nextSnapshot !== previousSnapshot) {
        transaction = await client.deal.update({
          where: { id: transaction.id },
          data: {
            commissionSnapshot: preview as unknown as Prisma.InputJsonValue,
            splitPlanRef: preview.planId ?? transaction.splitPlanRef ?? null
          }
        });
      }
    }

    if (offer.dealId !== transaction.id) {
      await client.offer.update({
        where: { id: offer.id },
        data: {
          dealId: transaction.id
        }
      });
    }

    return transaction;
  }

  async updateMilestone(ctx: RequestContext, id: string, dto: UpdateMilestoneDto) {
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const transaction = await this.requireTransaction(ctx, id);

    const checklist = normaliseChecklist(transaction.milestoneChecklist);
    const existingIndex = checklist.items.findIndex((item) => item.name === dto.name);
    const existingItem = existingIndex >= 0 ? checklist.items[existingIndex] : null;

    const nowIso = new Date().toISOString();
    const updatedEntry = {
      name: dto.name,
      completedAt: dto.completedAt ?? null,
      notes: dto.notes ?? null,
      updatedBy: ctx.userId ?? null,
      updatedAt: nowIso
    };

    let emitCompletion = false;

    if (existingItem) {
      const unchanged = (existingItem.completedAt ?? null) === updatedEntry.completedAt && (existingItem.notes ?? null) === updatedEntry.notes;
      if (unchanged) {
        return this.toTransactionView(ctx, id, transaction);
      }

      emitCompletion = !existingItem.completedAt && !!updatedEntry.completedAt;
      checklist.items[existingIndex] = {
        ...existingItem,
        ...updatedEntry
      };
    } else {
      emitCompletion = !!updatedEntry.completedAt;
      checklist.items.push({
        ...updatedEntry,
        createdAt: nowIso
      });
    }

    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId },
      're_transactions',
      {
        milestoneChecklist: checklist
      }
    );

    if (Object.keys(writable).length === 0) {
      return this.toTransactionView(ctx, id, transaction);
    }

    const updated = await this.prisma.deal.update({
      where: { id },
      data: writable
    });

    if (emitCompletion && dto.completedAt) {
      await this.outbox.enqueue({
        tenantId: ctx.tenantId,
        eventType: 're.transaction.milestone.completed',
        resource: { id, type: 're.transaction' },
        occurredAt: dto.completedAt,
        data: {
          transactionId: id,
          name: dto.name
        }
      });
    }

    return this.toTransactionView(ctx, id, updated);
  }

  async computeCommission(ctx: RequestContext, id: string) {
    const transaction = await this.requireTransaction(ctx, id, {
      include: {
        listing: {
          select: {
            id: true,
            opportunityId: true,
            price: true
          }
        },
        offers: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const amount = extractAmount({
      terms: transaction.offers[0]?.terms ?? null,
      listing: transaction.listing
    }) ?? 0;

    const preview = await this.computeCommissionInternal(
      ctx,
      {
        transaction,
        offerAmount: amount,
        opportunityId: transaction.opportunityId ?? transaction.listing?.opportunityId ?? null
      }
    );

    return preview ?? {
      gross: 0,
      brokerAmount: 0,
      agentAmount: 0,
      schedule: [],
      planId: null
    };
  }

  async generatePayouts(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const transaction = await this.requireTransaction(ctx, id, {
      include: {
        listing: {
          select: {
            id: true,
            opportunityId: true,
            price: true
          }
        },
        offers: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const opportunityId = transaction.opportunityId ?? transaction.listing?.opportunityId ?? null;

    let payouts;
    if (opportunityId) {
      await this.prisma.deal.update({
        where: { id },
        data: { opportunityId }
      });
      payouts = await this.payouts.generateForOpportunity(ctx, opportunityId);
    } else {
      const amount = extractAmount({
        terms: transaction.offers[0]?.terms ?? null,
        listing: transaction.listing
      }) ?? 0;

      const preview =
        (await this.computeCommissionInternal(
          ctx,
          {
            transaction,
            offerAmount: amount,
            opportunityId: null
          }
        )) ?? {
          gross: amount,
          brokerAmount: amount * 0.3,
          agentAmount: amount * 0.7,
          schedule: [
            { payee: 'BROKER', amount: amount * 0.3 },
            { payee: 'AGENT', amount: amount * 0.7 }
          ]
        };

      payouts = await this.createManualPayouts(ctx, id, preview);
    }

    await this.outbox.enqueue({
      tenantId: ctx.tenantId,
      eventType: 're.payouts.generated',
      resource: { id, type: 're.transaction' },
      occurredAt: new Date().toISOString(),
      data: {
        transactionId: id,
        payoutIds: payouts.map((payout) => payout.id)
      }
    });

    return payouts;
  }

  async toTransactionView(
    ctx: RequestContext,
    id: string,
    preload?: Prisma.DealGetPayload<{
      include?: {
        listing?: {
          select: {
            id: true;
            status: true;
            opportunityId: true;
            price: true;
            addressLine1: true;
            city: true;
            state: true;
            postalCode: true;
          };
        };
      };
    }>
  ) {
    const deal =
      preload ??
      (await this.prisma.deal.findUnique({
        where: { id },
        include: {
          listing: {
            select: {
              id: true,
              status: true,
              opportunityId: true,
              price: true,
              addressLine1: true,
              city: true,
              state: true,
              postalCode: true
            }
          }
        }
      }));

    if (!deal) {
      throw new NotFoundException('Transaction not found');
    }

    type DealWithListing = Prisma.DealGetPayload<{
      include: {
        listing: {
          select: {
            id: true;
            status: true;
            opportunityId: true;
            price: true;
            addressLine1: true;
            city: true;
            state: true;
            postalCode: true;
          };
        };
      };
    }>;

    const dealRecord = deal as DealWithListing;

    const filtered = await this.fls.filterRead(ctx, 're_transactions', dealRecord);

    return {
      id: dealRecord.id,
      stage: dealRecord.stage,
      listingId: dealRecord.listingId,
      personId: dealRecord.personId,
      opportunityId: dealRecord.opportunityId ?? null,
      milestoneChecklist: normaliseChecklist(dealRecord.milestoneChecklist),
      commissionSnapshot: dealRecord.commissionSnapshot ?? null,
      listing: dealRecord.listing
        ? {
            id: dealRecord.listing.id,
            status: dealRecord.listing.status,
            opportunityId: dealRecord.listing.opportunityId ?? null,
            price: dealRecord.listing.price ? Number(dealRecord.listing.price) : null,
            addressLine1: dealRecord.listing.addressLine1,
            city: dealRecord.listing.city,
            state: dealRecord.listing.state,
            postalCode: dealRecord.listing.postalCode
          }
        : null,
      ...filtered
    };
  }

  private async createManualPayouts(ctx: RequestContext, transactionId: string, preview: CommissionPreview) {
    if (!ctx.orgId) {
      throw new BadRequestException('Organisation context required');
    }

    const brokerPayeeId = ctx.orgId;
    const agentPayeeId = ctx.userId ?? ctx.orgId;

    const payloads = [
      {
        orgId: ctx.orgId,
        transactionId,
        payeeId: brokerPayeeId,
        grossAmount: preview.gross,
        brokerAmount: preview.brokerAmount,
        agentAmount: preview.agentAmount,
        status: 'PENDING' as const
      },
      {
        orgId: ctx.orgId,
        transactionId,
        payeeId: agentPayeeId,
        grossAmount: preview.gross,
        brokerAmount: preview.brokerAmount,
        agentAmount: preview.agentAmount,
        status: 'PENDING' as const
      }
    ];

    const writablePayloads = await Promise.all(
      payloads.map((payload) =>
        this.fls.filterWrite({ orgId: ctx.orgId, userId: ctx.userId }, 'payouts', payload)
      )
    );

    const created = await this.prisma.$transaction(
      writablePayloads.map((data) =>
        this.prisma.payout.create({
          data: data as Prisma.PayoutUncheckedCreateInput
        })
      )
    );

    return Promise.all(
      created.map(async (record) => {
        const filtered = await this.fls.filterRead(ctx, 'payouts', record);
        return { id: record.id, ...filtered };
      })
    );
  }

  private async computeCommissionInternal(
    ctx: RequestContext,
    params: {
      transaction: Prisma.DealUncheckedCreateInput | Prisma.DealGetPayload<{ include?: any }>;
      offerAmount: number;
      opportunityId: string | null;
    },
    tx?: TxClient
  ): Promise<CommissionPreview | null> {
    const { opportunityId, offerAmount } = params;
    if (opportunityId) {
      const resolved = await this.commissionPlans.resolveForOpportunity(ctx, opportunityId);
      return {
        gross: resolved.gross,
        brokerAmount: resolved.brokerAmount,
        agentAmount: resolved.agentAmount,
        schedule: resolved.schedule ?? [],
        planId: resolved.planId ?? null
      };
    }

    const orgId = ctx.orgId;
    if (!orgId || offerAmount <= 0) {
      return null;
    }

    const client = tx ?? this.prisma;
    const plan = await client.orgCommissionPlan.findFirst({
      where: { orgId },
      orderBy: { createdAt: 'desc' }
    });

    const brokerSplit = plan ? Number(plan.brokerSplit) : 0.3;
    const agentSplit = plan ? Number(plan.agentSplit) : 0.7;

    const brokerAmount = roundCurrency(offerAmount * brokerSplit);
    const agentAmount = roundCurrency(offerAmount * agentSplit);

    return {
      gross: roundCurrency(offerAmount),
      brokerAmount,
      agentAmount,
      schedule: [
        { payee: 'BROKER', amount: brokerAmount },
        { payee: 'AGENT', amount: agentAmount }
      ],
      planId: plan?.id ?? null
    };
  }

  private async requireTransaction<T extends Prisma.DealFindFirstArgs = Prisma.DealFindFirstArgs>(
    ctx: RequestContext,
    id: string,
    args?: T
  ): Promise<Prisma.DealGetPayload<T>> {
    const transaction = await this.prisma.deal.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId ?? undefined
      },
      ...(args ?? {})
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction as Prisma.DealGetPayload<T>;
  }
}

function extractAmount(offer: { terms: Prisma.JsonValue | null | undefined; listing?: { price: Prisma.Decimal | null } | null }) {
  if (offer.terms && typeof offer.terms === 'object') {
    const amount = (offer.terms as Record<string, unknown>).amount;
    if (typeof amount === 'number') {
      return amount;
    }
    if (typeof amount === 'string') {
      const parsed = Number(amount);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  if (offer.listing?.price) {
    return Number(offer.listing.price);
  }
  return null;
}

function normaliseChecklist(value: Prisma.JsonValue | null | undefined) {
  if (value && typeof value === 'object' && 'items' in (value as Record<string, unknown>)) {
    const cast = value as { items?: unknown };
    if (Array.isArray(cast.items)) {
      return {
        items: cast.items.map((item) => {
          if (!item || typeof item !== 'object') {
            return { name: 'unknown', completedAt: null, notes: null };
          }
          const entry = item as Record<string, unknown>;
          return {
            name: typeof entry.name === 'string' ? entry.name : 'unnamed',
            completedAt: typeof entry.completedAt === 'string' ? entry.completedAt : null,
            notes: typeof entry.notes === 'string' ? entry.notes : null,
            updatedBy: typeof entry.updatedBy === 'string' ? entry.updatedBy : null,
            updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
            createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : null
          };
        })
      };
    }
  }
  return {
    items: [...DEFAULT_CHECKLIST.items]
  };
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
