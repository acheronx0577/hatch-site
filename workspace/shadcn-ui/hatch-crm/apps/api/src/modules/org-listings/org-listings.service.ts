import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { OrgEventType, OrgListingContactType, OrgListingStatus, PlaybookTriggerType, UserRole } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { OrgEventsService } from '../org-events/org-events.service';
import { DocumentsAiService } from '@/modules/documents-ai/documents-ai.service';
import { PlaybookRunnerService } from '../playbooks/playbook-runner.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { AttachListingDocumentDto } from './dto/attach-listing-document.dto';

@Injectable()
export class OrgListingsService {
  private readonly permissionsDisabled =
    process.env.NODE_ENV !== 'production' &&
    (process.env.DISABLE_PERMISSIONS_GUARD ?? 'true').toLowerCase() === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OrgEventsService,
    private readonly documentsAi: DocumentsAiService,
    private readonly playbooks: PlaybookRunnerService
  ) {}

  private async assertUserInOrg(userId: string, orgId: string) {
    if (this.permissionsDisabled) {
      return { userId, orgId };
    }
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } }
    });
    if (!membership) {
      throw new ForbiddenException('User is not part of this organization');
    }
    return membership;
  }

  private async assertBroker(userId: string, orgId: string) {
    if (this.permissionsDisabled) return;
    await this.assertUserInOrg(userId, orgId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    if (!user || user.role !== UserRole.BROKER) {
      throw new ForbiddenException('Broker access required');
    }
  }

  private async assertAgentProfile(agentProfileId: string, orgId: string) {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId }
    });
    if (!profile || profile.organizationId !== orgId) {
      throw new NotFoundException('Agent profile not found in this organization');
    }
    return profile;
  }

  async createListing(orgId: string, creatorUserId: string, dto: CreateListingDto) {
    await this.assertUserInOrg(creatorUserId, orgId);
    let agentProfileId: string | undefined;
    if (dto.agentProfileId) {
      agentProfileId = (await this.assertAgentProfile(dto.agentProfileId, orgId)).id;
    }

    const created = await this.prisma.orgListing.create({
      data: {
        organizationId: orgId,
        agentProfileId,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2 ?? undefined,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country ?? undefined,
        mlsNumber: dto.mlsNumber ?? undefined,
        listPrice: dto.listPrice ?? undefined,
        propertyType: dto.propertyType ?? undefined,
        bedrooms: dto.bedrooms ?? undefined,
        bathrooms: dto.bathrooms ?? undefined,
        squareFeet: dto.squareFeet ?? undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        createdByUserId: creatorUserId
      }
    });
    try {
      await this.events.logOrgEvent({
        organizationId: orgId,
        actorId: creatorUserId,
        type: OrgEventType.ORG_LISTING_CREATED,
        message: `Listing created: ${created.addressLine1}, ${created.city}`,
        payload: { listingId: created.id, status: created.status }
      });
    } catch {}
    void this.playbooks
      .runTrigger(orgId, PlaybookTriggerType.LISTING_CREATED, { listingId: created.id })
      .catch(() => undefined);
    return created;
  }

  async updateListing(orgId: string, userId: string, listingId: string, dto: UpdateListingDto) {
    await this.assertUserInOrg(userId, orgId);
    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId },
      include: { agentProfile: true }
    });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    const isBroker = user?.role === UserRole.BROKER;
    const isListingAgent = listing.agentProfile?.userId === userId;
    if (!isBroker && !isListingAgent) {
      throw new ForbiddenException('Not authorized to update this listing');
    }
    if (!isBroker && (dto.status !== undefined || dto.agentProfileId !== undefined)) {
      throw new ForbiddenException('Agents cannot modify status or assignment');
    }

    let nextAgentProfile = listing.agentProfileId;
    if (dto.agentProfileId !== undefined) {
      nextAgentProfile =
        dto.agentProfileId === null ? null : (await this.assertAgentProfile(dto.agentProfileId, orgId)).id;
    }

    const updated = await this.prisma.orgListing.update({
      where: { id: listingId },
      data: {
        agentProfileId: nextAgentProfile === null ? null : nextAgentProfile ?? undefined,
        listPrice: dto.listPrice === null ? null : dto.listPrice ?? undefined,
        propertyType: dto.propertyType === null ? null : dto.propertyType ?? undefined,
        bedrooms: dto.bedrooms === null ? null : dto.bedrooms ?? undefined,
        bathrooms: dto.bathrooms === null ? null : dto.bathrooms ?? undefined,
        squareFeet: dto.squareFeet === null ? null : dto.squareFeet ?? undefined,
        expiresAt: dto.expiresAt === null ? null : dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        status: dto.status ? (dto.status as OrgListingStatus) : undefined
      }
    });
    const changedFields: string[] = [];
    if (updated.agentProfileId !== listing.agentProfileId) changedFields.push('agentProfileId');
    if (updated.listPrice !== listing.listPrice) changedFields.push('listPrice');
    if (updated.propertyType !== listing.propertyType) changedFields.push('propertyType');
    if (updated.bedrooms !== listing.bedrooms) changedFields.push('bedrooms');
    if (updated.bathrooms !== listing.bathrooms) changedFields.push('bathrooms');
    if (updated.squareFeet !== listing.squareFeet) changedFields.push('squareFeet');
    if (updated.expiresAt?.getTime() !== listing.expiresAt?.getTime()) changedFields.push('expiresAt');

    const statusChanged = updated.status !== listing.status;
    try {
      await this.events.logOrgEvent({
        organizationId: orgId,
        actorId: userId,
        type: statusChanged ? OrgEventType.ORG_LISTING_STATUS_CHANGED : OrgEventType.ORG_LISTING_UPDATED,
        message: statusChanged
          ? `Listing status changed: ${listing.status} → ${updated.status}`
          : `Listing updated (${changedFields.length ? changedFields.join(', ') : 'details'})`,
        payload: {
          listingId: updated.id,
          statusFrom: listing.status,
          statusTo: updated.status,
          changedFields
        }
      });
    } catch {}
    void this.playbooks
      .runTrigger(orgId, PlaybookTriggerType.LISTING_UPDATED, { listingId: updated.id, status: updated.status })
      .catch(() => undefined);
    return updated;
  }

  async requestListingApproval(orgId: string, userId: string, listingId: string) {
    await this.assertUserInOrg(userId, orgId);
    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    const updated = await this.prisma.orgListing.update({
      where: { id: listingId },
      data: {
        status: OrgListingStatus.PENDING_BROKER_APPROVAL,
        brokerApproved: false,
        brokerApprovedAt: null,
        brokerApprovedByUserId: null
      }
    });
    try {
      await this.events.logOrgEvent({
        organizationId: orgId,
        actorId: userId,
        type: OrgEventType.ORG_LISTING_APPROVAL_REQUESTED,
        message: `Broker approval requested`,
        payload: { listingId, statusFrom: listing.status, statusTo: updated.status }
      });
    } catch {}
    return updated;
  }

  async approveListing(orgId: string, brokerUserId: string, listingId: string, note?: string) {
    await this.assertBroker(brokerUserId, orgId);
    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    const updated = await this.prisma.orgListing.update({
      where: { id: listingId },
      data: {
        status: OrgListingStatus.ACTIVE,
        brokerApproved: true,
        brokerApprovedAt: new Date(),
        brokerApprovedByUserId: brokerUserId,
        listedAt: listing.listedAt ?? new Date()
      }
    });
    try {
      await this.events.logOrgEvent({
        organizationId: orgId,
        actorId: brokerUserId,
        type: OrgEventType.ORG_LISTING_APPROVED,
        message: note?.trim()
          ? `Listing approved · ${note.trim()}`
          : `Listing approved`,
        payload: { listingId, statusFrom: listing.status, statusTo: updated.status, note: note?.trim() || null }
      });
    } catch {}
    return updated;
  }

  async requestListingChanges(orgId: string, brokerUserId: string, listingId: string, note?: string) {
    await this.assertBroker(brokerUserId, orgId);
    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status !== OrgListingStatus.PENDING_BROKER_APPROVAL) {
      throw new BadRequestException('Listing is not pending broker approval');
    }

    const updated = await this.prisma.orgListing.update({
      where: { id: listingId },
      data: {
        status: OrgListingStatus.DRAFT,
        brokerApproved: false,
        brokerApprovedAt: null,
        brokerApprovedByUserId: null
      }
    });

    try {
      await this.events.logOrgEvent({
        organizationId: orgId,
        actorId: brokerUserId,
        type: OrgEventType.ORG_LISTING_CHANGES_REQUESTED,
        message: note?.trim()
          ? `Changes requested · ${note.trim()}`
          : `Changes requested`,
        payload: { listingId, statusFrom: listing.status, statusTo: updated.status, note: note?.trim() || null }
      });
    } catch {}

    return updated;
  }

  async rejectListing(orgId: string, brokerUserId: string, listingId: string, note?: string) {
    await this.assertBroker(brokerUserId, orgId);
    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status !== OrgListingStatus.PENDING_BROKER_APPROVAL) {
      throw new BadRequestException('Listing is not pending broker approval');
    }

    const updated = await this.prisma.orgListing.update({
      where: { id: listingId },
      data: {
        status: OrgListingStatus.DRAFT,
        brokerApproved: false,
        brokerApprovedAt: null,
        brokerApprovedByUserId: null
      }
    });

    try {
      await this.events.logOrgEvent({
        organizationId: orgId,
        actorId: brokerUserId,
        type: OrgEventType.ORG_LISTING_REJECTED,
        message: note?.trim()
          ? `Listing rejected · ${note.trim()}`
          : `Listing rejected`,
        payload: { listingId, statusFrom: listing.status, statusTo: updated.status, note: note?.trim() || null }
      });
    } catch {}

    return updated;
  }

  async attachListingDocument(orgId: string, userId: string, listingId: string, dto: AttachListingDocumentDto) {
    await this.assertUserInOrg(userId, orgId);
    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    const orgFile = await this.prisma.orgFile.findFirst({
      where: { id: dto.orgFileId, orgId }
    });
    if (!orgFile) {
      throw new NotFoundException('Org file not found in this organization');
    }
    await this.prisma.orgFile.update({
      where: { id: orgFile.id },
      data: { listingId: listing.id }
    });

    const result = await this.prisma.orgListingDocument.create({
      data: {
        listingId: listing.id,
        orgFileId: dto.orgFileId,
        type: dto.type ?? undefined
      }
    });

    void this.documentsAi.refreshFile(orgId, orgFile.id).catch(() => undefined);
    return result;
  }

  async listListingActivity(orgId: string, userId: string, listingId: string, limit = 50) {
    await this.assertUserInOrg(userId, orgId);
    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId },
      select: { organizationId: true }
    });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }

    const events = await this.prisma.orgEvent.findMany({
      where: {
        organizationId: orgId,
        OR: [{ payload: { path: ['listingId'], equals: listingId } }]
      } as any,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { firstName: true, lastName: true, email: true } }
      }
    });

    return events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
      actor: event.actor
        ? {
            firstName: event.actor.firstName,
            lastName: event.actor.lastName,
            email: event.actor.email
          }
        : null,
      payload: event.payload
    }));
  }

  async listListingsForOrg(orgId: string, userId: string) {
    await this.assertUserInOrg(userId, orgId);
    return this.prisma.orgListing.findMany({
      where: { organizationId: orgId },
      include: {
        agentProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        },
        documents: {
          include: { orgFile: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async listListingsPublic(orgId: string) {
    return this.prisma.orgListing.findMany({
      where: {
        organizationId: orgId,
        status: OrgListingStatus.ACTIVE
      },
      select: {
        id: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        listPrice: true,
        bedrooms: true,
        bathrooms: true,
        squareFeet: true,
        propertyType: true,
        agentProfile: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getPublicListing(orgId: string, listingId: string) {
    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId },
      include: {
        agentProfile: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } }
        },
        documents: {
          include: { orgFile: true }
        }
      }
    });
    if (!listing || listing.organizationId !== orgId || listing.status !== OrgListingStatus.ACTIVE) {
      throw new NotFoundException('Listing not available');
    }
    return listing;
  }

  async listListingContacts(orgId: string, userId: string, listingId: string, type?: OrgListingContactType) {
    await this.assertUserInOrg(userId, orgId);

    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }

    return this.prisma.orgListingContact.findMany({
      where: {
        listingId: listing.id,
        type: type ?? undefined
      },
      include: {
        person: { select: { id: true, firstName: true, lastName: true, primaryEmail: true, primaryPhone: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async attachListingContact(
    orgId: string,
    userId: string,
    listingId: string,
    personId: string,
    type: OrgListingContactType
  ) {
    await this.assertUserInOrg(userId, orgId);

    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }

    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: orgId, deletedAt: null },
      select: { id: true }
    });
    if (!person) {
      throw new NotFoundException('Contact not found in this organization');
    }

    const existing = await this.prisma.orgListingContact.findFirst({
      where: { listingId: listing.id, personId: person.id, type }
    });
    if (existing) return existing;

    return this.prisma.orgListingContact.create({
      data: {
        listingId: listing.id,
        personId: person.id,
        type
      }
    });
  }

  async detachListingContact(
    orgId: string,
    userId: string,
    listingId: string,
    personId: string,
    type?: OrgListingContactType
  ) {
    await this.assertUserInOrg(userId, orgId);

    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }

    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: orgId },
      select: { id: true }
    });
    if (!person) {
      throw new NotFoundException('Contact not found in this organization');
    }

    const result = await this.prisma.orgListingContact.deleteMany({
      where: { listingId: listing.id, personId: person.id, type: type ?? undefined }
    });
    return { deleted: result.count };
  }
}
