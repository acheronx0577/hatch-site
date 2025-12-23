import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  LeadSource,
  LeadStatus,
  NotificationType,
  OfferIntentStatus,
  OrgConversationType,
  OrgEventType,
  UserRole
} from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { OrgEventsService } from '../org-events/org-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOfferIntentDto } from './dto/create-offer-intent.dto';
import { UpdateOfferIntentStatusDto } from './dto/update-offer-intent-status.dto';

@Injectable()
export class OrgLoisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgEvents: OrgEventsService,
    private readonly notifications: NotificationsService
  ) {}

  private async assertUserInOrg(userId: string, orgId: string) {
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { user: { select: { role: true } } }
    });
    if (!membership) {
      throw new ForbiddenException('User is not part of this organization');
    }
    return membership.user?.role ?? null;
  }

  private async assertListing(orgId: string, listingId: string) {
    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId },
      include: { agentProfile: { include: { user: true } } }
    });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  private normalizeStatus(status: string) {
    const normalized = status.toUpperCase().trim();
    const allowed: OfferIntentStatus[] = [
      OfferIntentStatus.DRAFT,
      OfferIntentStatus.SENT,
      OfferIntentStatus.RECEIVED,
      OfferIntentStatus.COUNTERED,
      OfferIntentStatus.ACCEPTED,
      OfferIntentStatus.REJECTED
    ];

    if (allowed.includes(normalized as OfferIntentStatus)) {
      return normalized as OfferIntentStatus;
    }

    // Backward compatibility: map legacy statuses into the new lifecycle.
    switch (normalized) {
      case OfferIntentStatus.SUBMITTED:
        return OfferIntentStatus.SENT;
      case OfferIntentStatus.UNDER_REVIEW:
        return OfferIntentStatus.RECEIVED;
      case OfferIntentStatus.DECLINED:
      case OfferIntentStatus.WITHDRAWN:
        return OfferIntentStatus.REJECTED;
      default:
        throw new ForbiddenException('Invalid offer intent status');
    }
  }

  private async ensureLeadForOfferIntent(orgId: string, listingId: string, consumerId: string | null) {
    if (consumerId) {
      const existing = await this.prisma.lead.findFirst({
        where: { organizationId: orgId, listingId, consumerId }
      });
      if (existing) {
        return existing.id;
      }
    }
    const lead = await this.prisma.lead.create({
      data: {
        organizationId: orgId,
        listingId,
        consumerId: consumerId ?? undefined,
        source: LeadSource.LOI_SUBMISSION,
        status: LeadStatus.NEW
      }
    });
    return lead.id;
  }

  private async maybeCreateConversation(orgId: string, listing: { agentProfile?: { userId?: string | null } | null }, consumerId: string | null) {
    if (!consumerId || !listing.agentProfile?.userId) {
      return null;
    }
    const existing = await this.prisma.orgConversation.findFirst({
      where: {
        organizationId: orgId,
        type: OrgConversationType.DIRECT,
        participants: {
          every: {
            userId: { in: [consumerId, listing.agentProfile.userId] }
          }
        }
      }
    });
    if (existing) {
      return existing.id;
    }
    const conversation = await this.prisma.orgConversation.create({
      data: {
        organizationId: orgId,
        type: OrgConversationType.DIRECT,
        createdByUserId: consumerId,
        participants: {
          create: [{ userId: consumerId }, { userId: listing.agentProfile.userId }]
        }
      }
    });
    return conversation.id;
  }

  async createOfferIntentForConsumer(orgId: string, consumerId: string | null, dto: CreateOfferIntentDto) {
    const listing = await this.assertListing(orgId, dto.listingId);
    const leadId = await this.ensureLeadForOfferIntent(orgId, listing.id, consumerId);
    const conversationId = await this.maybeCreateConversation(orgId, listing, consumerId);

    const offerIntent = await this.prisma.offerIntent.create({
      data: {
        organizationId: orgId,
        listingId: dto.listingId,
        consumerId: consumerId ?? undefined,
        leadId: leadId ?? undefined,
        status: OfferIntentStatus.RECEIVED,
        buyerName: dto.buyerName ?? undefined,
        sellerName: dto.sellerName ?? undefined,
        offeredPrice: dto.offeredPrice ?? undefined,
        financingType: dto.financingType ?? undefined,
        closingTimeline: dto.closingTimeline ?? undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        contingencies: dto.contingencies ?? undefined,
        comments: dto.comments ?? undefined,
        conversationId: conversationId ?? undefined
      }
    });

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: consumerId ?? null,
      type: OrgEventType.ORG_OFFER_INTENT_CREATED,
      payload: {
        offerIntentId: offerIntent.id,
        listingId: offerIntent.listingId,
        consumerId: offerIntent.consumerId ?? null
      }
    });

    const agentUserId = listing.agentProfile?.user?.id;
    if (agentUserId) {
      await this.notifications.createNotification({
        organizationId: orgId,
        userId: agentUserId,
        type: NotificationType.OFFER_INTENT,
        title: 'New offer intent submitted',
        message: `Listing ${listing.addressLine1 ?? listing.id} received a new offer intent.`,
        listingId: listing.id,
        offerIntentId: offerIntent.id
      });
    }

    return offerIntent;
  }

  async createOfferIntentInternal(orgId: string, userId: string, dto: CreateOfferIntentDto) {
    const role = await this.assertUserInOrg(userId, orgId);
    if (!role || (role !== UserRole.BROKER && role !== UserRole.AGENT && role !== UserRole.TEAM_LEAD)) {
      throw new ForbiddenException('Broker or agent access required');
    }

    await this.assertListing(orgId, dto.listingId);
    const normalizedStatus = dto.status ? this.normalizeStatus(dto.status) : OfferIntentStatus.DRAFT;

    const offerIntent = await this.prisma.offerIntent.create({
      data: {
        organizationId: orgId,
        listingId: dto.listingId,
        status: normalizedStatus,
        buyerName: dto.buyerName ?? undefined,
        sellerName: dto.sellerName ?? undefined,
        offeredPrice: dto.offeredPrice ?? undefined,
        financingType: dto.financingType ?? undefined,
        closingTimeline: dto.closingTimeline ?? undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        contingencies: dto.contingencies ?? undefined,
        comments: dto.comments ?? undefined
      }
    });

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: userId,
      type: OrgEventType.ORG_OFFER_INTENT_CREATED,
      payload: {
        offerIntentId: offerIntent.id,
        listingId: offerIntent.listingId,
        status: offerIntent.status
      }
    });

    return offerIntent;
  }

  async listOfferIntentsForOrg(orgId: string, userId: string, filters: { status?: string; listingId?: string } = {}) {
    const role = await this.assertUserInOrg(userId, orgId);
    if (!role || (role !== UserRole.BROKER && role !== UserRole.AGENT && role !== UserRole.TEAM_LEAD)) {
      throw new ForbiddenException('Broker or agent access required');
    }

    const where: Parameters<typeof this.prisma.offerIntent.findMany>[0]['where'] = {
      organizationId: orgId
    };

    if (filters.status) {
      where.status = this.normalizeStatus(filters.status);
    }
    if (filters.listingId) {
      where.listingId = filters.listingId;
    }

    if (role === UserRole.AGENT) {
      const agentProfile = await this.prisma.agentProfile.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } }
      });
      if (!agentProfile) {
        return [];
      }
      where.listing = { agentProfileId: agentProfile.id };
    }

    return this.prisma.offerIntent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            addressLine1: true,
            city: true,
            state: true,
            postalCode: true,
            agentProfileId: true
          }
        },
        consumer: { select: { firstName: true, lastName: true, email: true } },
        lead: { select: { name: true, email: true } }
      }
    });
  }

  async updateOfferIntentStatus(orgId: string, userId: string, offerId: string, dto: UpdateOfferIntentStatusDto) {
    const role = await this.assertUserInOrg(userId, orgId);
    if (!role || (role !== UserRole.BROKER && role !== UserRole.AGENT && role !== UserRole.TEAM_LEAD)) {
      throw new ForbiddenException('Broker or agent access required');
    }

    const offerIntent = await this.prisma.offerIntent.findUnique({
      where: { id: offerId },
      include: { listing: true }
    });
    if (!offerIntent || offerIntent.organizationId !== orgId) {
      throw new NotFoundException('Offer intent not found');
    }

    if (role === UserRole.AGENT) {
      const agentProfile = await this.prisma.agentProfile.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } }
      });
      if (!agentProfile || offerIntent.listing.agentProfileId !== agentProfile.id) {
        throw new ForbiddenException('Not allowed to update this offer');
      }
    }

    let transactionId: string | null | undefined = undefined;
    if (dto.transactionId !== undefined) {
      if (dto.transactionId === null) {
        transactionId = null;
      } else {
        const transaction = await this.prisma.orgTransaction.findUnique({ where: { id: dto.transactionId } });
        if (!transaction || transaction.organizationId !== orgId) {
          throw new NotFoundException('Transaction not found');
        }
        transactionId = transaction.id;
      }
    }

    const normalizedStatus = this.normalizeStatus(dto.status);

    const updated = await this.prisma.offerIntent.update({
      where: { id: offerId },
      data: {
        status: normalizedStatus,
        transactionId: transactionId === undefined ? undefined : transactionId
      }
    });

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: userId,
      type: OrgEventType.ORG_OFFER_INTENT_STATUS_CHANGED,
      payload: {
        offerIntentId: updated.id,
        status: updated.status,
        transactionId: updated.transactionId ?? null
      }
    });

    return updated;
  }
}
