import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, Prisma } from '@hatch/db';

import { PrismaService } from '../../prisma/prisma.service';
import { FlsService } from '../../../platform/security/fls.service';
import type { RequestContext } from '../../common/request-context';
import { OutboxService } from '../../outbox/outbox.service';
import { OffersService } from '../offers/offers.service';

const STATUS_TO_OPPORTUNITY_STAGE: Record<string, string> = {
  [ListingStatus.COMING_SOON]: 'Prospecting',
  [ListingStatus.ACTIVE]: 'Qualification',
  [ListingStatus.PENDING]: 'Negotiation',
  [ListingStatus.CLOSED]: 'Closed Won',
  [ListingStatus.WITHDRAWN]: 'Closed Lost'
};

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fls: FlsService,
    private readonly offers: OffersService,
    private readonly outbox: OutboxService
  ) {}

  async get(ctx: RequestContext, id: string) {
    if (!ctx.tenantId) {
      throw new BadRequestException('Tenant context required');
    }

    const listing = await this.prisma.listing.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        opportunity: {
          select: { id: true, stage: true }
        }
      }
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const filtered = await this.fls.filterRead(ctx, 're_listings', listing);
    const { items: offers } = await this.offers.list(ctx, { listingId: id, limit: 100 });

    const transaction = await this.prisma.deal.findFirst({
      where: {
        listingId: id,
        tenantId: ctx.tenantId
      },
      orderBy: { createdAt: 'desc' }
    });

    return {
      id: listing.id,
      status: listing.status,
      opportunityId: listing.opportunityId ?? null,
      opportunityStage: listing.opportunity?.stage ?? null,
      offers,
      transactionId: transaction?.id ?? null,
      ...filtered
    };
  }

  async updateStatus(ctx: RequestContext, id: string, status: string) {
    if (!ctx.tenantId || !ctx.orgId) {
      throw new BadRequestException('Tenant context required');
    }

    const normalizedStatus = status.toUpperCase();
    if (!(normalizedStatus in ListingStatus)) {
      throw new BadRequestException('Invalid listing status');
    }

    const listing = await this.prisma.listing.findFirst({
      where: { id, tenantId: ctx.tenantId }
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId },
      're_listings',
      { status: normalizedStatus }
    );

    const updated = await this.prisma.listing.update({
      where: { id },
      data: writable as Prisma.ListingUncheckedUpdateInput
    });

    const mappedStage = STATUS_TO_OPPORTUNITY_STAGE[normalizedStatus];
    if (mappedStage && updated.opportunityId) {
      await this.prisma.opportunity.updateMany({
        where: { id: updated.opportunityId, orgId: ctx.orgId },
        data: { stage: mappedStage }
      });
    }

    await this.outbox.enqueue({
      tenantId: ctx.tenantId,
      eventType: 're.listing.status.changed',
      resource: { id: updated.id, type: 're.listing' },
      occurredAt: new Date().toISOString(),
      data: {
        listingId: updated.id,
        status: normalizedStatus,
        opportunityId: updated.opportunityId ?? null
      }
    });

    return this.get(ctx, id);
  }
}
