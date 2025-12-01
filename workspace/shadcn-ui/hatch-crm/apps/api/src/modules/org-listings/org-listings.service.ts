import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { OrgListingStatus, PlaybookTriggerType, UserRole } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
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
        agentProfileId: nextAgentProfile ?? undefined,
        listPrice: dto.listPrice === null ? null : dto.listPrice ?? undefined,
        propertyType: dto.propertyType === null ? null : dto.propertyType ?? undefined,
        bedrooms: dto.bedrooms === null ? null : dto.bedrooms ?? undefined,
        bathrooms: dto.bathrooms === null ? null : dto.bathrooms ?? undefined,
        squareFeet: dto.squareFeet === null ? null : dto.squareFeet ?? undefined,
        expiresAt: dto.expiresAt === null ? null : dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        status: dto.status ? (dto.status as OrgListingStatus) : undefined
      }
    });
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
    return this.prisma.orgListing.update({
      where: { id: listingId },
      data: {
        status: OrgListingStatus.PENDING_BROKER_APPROVAL,
        brokerApproved: false,
        brokerApprovedAt: null,
        brokerApprovedByUserId: null
      }
    });
  }

  async approveListing(orgId: string, brokerUserId: string, listingId: string) {
    await this.assertBroker(brokerUserId, orgId);
    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    return this.prisma.orgListing.update({
      where: { id: listingId },
      data: {
        status: OrgListingStatus.ACTIVE,
        brokerApproved: true,
        brokerApprovedAt: new Date(),
        brokerApprovedByUserId: brokerUserId,
        listedAt: listing.listedAt ?? new Date()
      }
    });
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
}
