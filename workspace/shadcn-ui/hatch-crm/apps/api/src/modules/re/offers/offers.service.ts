import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OfferStatus, Prisma } from '@hatch/db';

import { PrismaService } from '../../prisma/prisma.service';
import { FlsService } from '../../../platform/security/fls.service';
import { OutboxService } from '../../outbox/outbox.service';
import type { RequestContext } from '../../common/request-context';
import { TransactionsService } from '../transactions/transactions.service';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../common/dto/cursor-pagination-query.dto';
import { CreateOfferDto, DecideOfferDto, ListOffersQueryDto } from './dto';

type OfferWithListing = Prisma.OfferGetPayload<{
  include: {
    listing: {
      select: {
        id: true;
        status: true;
        opportunityId: true;
        price: true;
      };
    };
    deal: {
      select: {
        id: true;
        stage: true;
      };
    };
  };
}>;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fls: FlsService,
    private readonly transactions: TransactionsService,
    private readonly outbox: OutboxService
  ) {}

  async create(ctx: RequestContext, dto: CreateOfferDto) {
    if (!ctx.tenantId || !ctx.orgId || !ctx.userId) {
      throw new BadRequestException('Missing tenant or user context');
    }

    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listingId, tenantId: ctx.tenantId },
      select: { id: true, tenantId: true, opportunityId: true }
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const buyer = await this.prisma.person.findFirst({
      where: {
        id: dto.buyerContactId,
        organizationId: ctx.orgId
      },
      select: { id: true }
    });

    if (!buyer) {
      throw new NotFoundException('Buyer contact not found');
    }

    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId },
      're_offers',
      {
        terms: {
          amount: dto.amount,
          contingencies: dto.contingencies ?? []
        },
        metadata: {
          contingencies: dto.contingencies ?? [],
          createdBy: ctx.userId
        }
      }
    );

    const terms =
      (writable.terms as Prisma.InputJsonValue | undefined) ?? {
        amount: dto.amount,
        contingencies: dto.contingencies ?? []
      };

    const metadata =
      (writable.metadata as Prisma.InputJsonValue | undefined) ?? {
        contingencies: dto.contingencies ?? [],
        createdBy: ctx.userId
      };

    const created = await this.prisma.offer.create({
      data: {
        tenantId: ctx.tenantId,
        listingId: dto.listingId,
        personId: buyer.id,
        status: OfferStatus.SUBMITTED,
        terms,
        metadata
      }
    });

    await this.outbox.enqueue({
      tenantId: ctx.tenantId,
      eventType: 're.offer.created',
      resource: { id: created.id, type: 're.offer' },
      occurredAt: new Date().toISOString(),
      data: {
        offerId: created.id,
        listingId: created.listingId,
        buyerId: created.personId,
        amount: dto.amount
      }
    });

    return this.toOfferView(ctx, created);
  }

  async list(ctx: RequestContext, query?: ListOffersQueryDto) {
    if (!ctx.tenantId) {
      return { items: [], nextCursor: null };
    }

    const listingId = query?.listingId;
    const status = query?.status;
    const cursor = query?.cursor;
    const take = Math.min(query?.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const offers = await this.prisma.offer.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(listingId ? { listingId } : {}),
        ...(status ? { status: status.toUpperCase() as OfferStatus } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    let nextCursor: string | null = null;
    if (offers.length > take) {
      const next = offers.pop();
      nextCursor = next?.id ?? null;
    }

    const items = await Promise.all(offers.map((offer) => this.toOfferView(ctx, offer)));

    return { items, nextCursor };
  }

  async decide(ctx: RequestContext, id: string, dto: DecideOfferDto) {
    if (!ctx.tenantId || !ctx.orgId || !ctx.userId) {
      throw new BadRequestException('Missing tenant or user context');
    }

    const targetStatus = dto.status.toUpperCase() as OfferStatus;
    if (targetStatus !== OfferStatus.ACCEPTED && targetStatus !== OfferStatus.REJECTED) {
      throw new BadRequestException('Invalid status transition');
    }

    const { offer, transactionId, listingId, opportunityId, accepted } = await this.prisma.$transaction(async (tx) => {
      const current = await tx.offer.findUnique({
        where: { id },
        include: {
          listing: {
            select: {
              id: true,
              tenantId: true,
              opportunityId: true,
              price: true
            }
          },
          deal: {
            select: { id: true }
          }
        }
      });

      if (!current || current.tenantId !== ctx.tenantId) {
        throw new NotFoundException('Offer not found');
      }

      if (current.status !== OfferStatus.SUBMITTED && current.status !== OfferStatus.COUNTERED) {
        return {
          offer: current,
          transactionId: current.deal?.id ?? null,
          listingId: current.listingId,
          opportunityId: current.listing?.opportunityId ?? null,
          accepted: false
        };
      }

      if (targetStatus === OfferStatus.ACCEPTED) {
        const existingAccepted = await tx.offer.findFirst({
          where: {
            listingId: current.listingId,
            status: OfferStatus.ACCEPTED,
            NOT: { id: current.id }
          }
        });
        if (existingAccepted) {
          throw new BadRequestException('Listing already has an accepted offer');
        }
      }

      const updated = await tx.offer.update({
        where: { id: current.id },
        data: {
          status: targetStatus,
          metadata: mergeMetadata(current.metadata, {
            decisionNote: dto.decisionNote ?? null,
            decidedBy: ctx.userId
          }) as Prisma.InputJsonValue
        }
      });

      if (targetStatus !== OfferStatus.ACCEPTED) {
        return {
          offer: { ...updated, listing: current.listing },
          transactionId: current.deal?.id ?? null,
          listingId: current.listingId,
          opportunityId: current.listing?.opportunityId ?? null,
          accepted: false
        };
      }

      const transaction = await this.transactions.ensureForAcceptedOffer(ctx, updated, current.listing, tx);

      return {
        offer: { ...updated, listing: current.listing, deal: { id: transaction.id, stage: transaction.stage } },
        transactionId: transaction.id,
        listingId: current.listingId,
        opportunityId: transaction.opportunityId ?? current.listing?.opportunityId ?? null,
        accepted: true
      };
    });

    if (accepted) {
      await this.outbox.enqueue({
        tenantId: ctx.tenantId,
        eventType: 're.offer.accepted',
        resource: { id: offer.id, type: 're.offer' },
        occurredAt: new Date().toISOString(),
        data: {
          offerId: offer.id,
          listingId,
          transactionId: transactionId!,
          opportunityId: opportunityId ?? null
        }
      });
    }

    return {
      offer: await this.toOfferView(ctx, offer),
      transaction: transactionId ? await this.transactions.toTransactionView(ctx, transactionId) : null
    };
  }

  private async toOfferView(ctx: RequestContext, offer: Prisma.OfferUncheckedCreateInput | OfferWithListing) {
    const record =
      'listing' in offer
        ? offer
        : await this.prisma.offer.findUnique({
            where: { id: (offer as any).id },
            include: {
              listing: {
                select: {
                  id: true,
                  status: true,
                  opportunityId: true,
                  price: true
                }
              },
              deal: {
                select: { id: true, stage: true }
              }
            }
          });

    const filtered = await this.fls.filterRead(ctx, 're_offers', record);
    const amount = extractAmount(record);

    return {
      id: record.id,
      status: record.status,
      listingId: record.listingId,
      personId: record.personId,
      amount,
      contingencies: extractContingencies(record),
      decisionNote: (record.metadata as Record<string, unknown> | null | undefined)?.decisionNote ?? null,
      dealId: record.dealId ?? record.deal?.id ?? null,
      listing: record.listing
        ? {
            id: record.listing.id,
            status: record.listing.status,
            opportunityId: record.listing.opportunityId ?? null
          }
        : null,
      ...filtered
    };
  }
}

function extractAmount(offer: { terms?: Prisma.JsonValue | null; listing?: { price: Prisma.Decimal | null } | null }) {
  if (offer?.terms && typeof offer.terms === 'object') {
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

function extractContingencies(offer: { terms?: Prisma.JsonValue | null }) {
  if (offer?.terms && typeof offer.terms === 'object') {
    const contingencies = (offer.terms as Record<string, unknown>).contingencies;
    if (Array.isArray(contingencies)) {
      return contingencies.filter((item): item is string => typeof item === 'string');
    }
  }
  return [];
}

function mergeMetadata(metadata: Prisma.JsonValue | null | undefined, updates: Record<string, unknown>) {
  const base = metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
  return { ...base, ...updates };
}
