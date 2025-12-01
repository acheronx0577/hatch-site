import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { OrgTransactionStatus, PlaybookTriggerType, UserRole } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { DocumentsAiService } from '@/modules/documents-ai/documents-ai.service';
import { PlaybookRunnerService } from '../playbooks/playbook-runner.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { AttachTransactionDocumentDto } from './dto/attach-transaction-document.dto';

@Injectable()
export class OrgTransactionsService {
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
      throw new NotFoundException('Agent profile not found');
    }
    return profile;
  }

  private async assertListing(listingId: string, orgId: string) {
    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId }
    });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  async createTransaction(orgId: string, creatorUserId: string, dto: CreateTransactionDto) {
    await this.assertUserInOrg(creatorUserId, orgId);
    let listingId = dto.listingId ?? undefined;
    if (listingId) {
      await this.assertListing(listingId, orgId);
    }
    let agentProfileId = dto.agentProfileId ?? undefined;
    if (agentProfileId) {
      await this.assertAgentProfile(agentProfileId, orgId);
    }

    return this.prisma.orgTransaction.create({
      data: {
        organizationId: orgId,
        listingId,
        agentProfileId,
        buyerName: dto.buyerName ?? undefined,
        sellerName: dto.sellerName ?? undefined,
        contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : undefined,
        inspectionDate: dto.inspectionDate ? new Date(dto.inspectionDate) : undefined,
        financingDate: dto.financingDate ? new Date(dto.financingDate) : undefined,
        closingDate: dto.closingDate ? new Date(dto.closingDate) : undefined,
        createdByUserId: creatorUserId
      }
    });
  }

  async updateTransaction(orgId: string, userId: string, transactionId: string, dto: UpdateTransactionDto) {
    await this.assertUserInOrg(userId, orgId);
    const transaction = await this.prisma.orgTransaction.findUnique({
      where: { id: transactionId },
      include: { agentProfile: true }
    });
    if (!transaction || transaction.organizationId !== orgId) {
      throw new NotFoundException('Transaction not found');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    const isBroker = user?.role === UserRole.BROKER;
    const isAgent = transaction.agentProfile?.userId === userId;
    if (!isBroker && !isAgent) {
      throw new ForbiddenException('Not authorized to update this transaction');
    }

    const data: Record<string, unknown> = {
      buyerName: dto.buyerName ?? undefined,
      sellerName: dto.sellerName ?? undefined,
      contractSignedAt: dto.contractSignedAt === null ? null : dto.contractSignedAt ? new Date(dto.contractSignedAt) : undefined,
      inspectionDate: dto.inspectionDate === null ? null : dto.inspectionDate ? new Date(dto.inspectionDate) : undefined,
      financingDate: dto.financingDate === null ? null : dto.financingDate ? new Date(dto.financingDate) : undefined,
      closingDate: dto.closingDate === null ? null : dto.closingDate ? new Date(dto.closingDate) : undefined
    };

    if (isBroker) {
      data.status = dto.status ? (dto.status as OrgTransactionStatus) : undefined;
      data.isCompliant = dto.isCompliant ?? undefined;
      data.requiresAction = dto.requiresAction ?? undefined;
      data.complianceNotes = dto.complianceNotes === null ? null : dto.complianceNotes ?? undefined;
    }

    const updated = await this.prisma.orgTransaction.update({
      where: { id: transactionId },
      data
    });
    void this.playbooks
      .runTrigger(orgId, PlaybookTriggerType.TRANSACTION_UPDATED, { transactionId: updated.id, status: updated.status })
      .catch(() => undefined);
    return updated;
  }

  async attachTransactionDocument(
    orgId: string,
    userId: string,
    transactionId: string,
    dto: AttachTransactionDocumentDto
  ) {
    await this.assertUserInOrg(userId, orgId);
    const transaction = await this.prisma.orgTransaction.findUnique({
      where: { id: transactionId }
    });
    if (!transaction || transaction.organizationId !== orgId) {
      throw new NotFoundException('Transaction not found');
    }
    const orgFile = await this.prisma.orgFile.findFirst({
      where: { id: dto.orgFileId, orgId }
    });
    if (!orgFile) {
      throw new NotFoundException('Org file not found in this organization');
    }
    await this.prisma.orgFile.update({
      where: { id: orgFile.id },
      data: { transactionId: transaction.id }
    });

    const result = await this.prisma.orgTransactionDocument.create({
      data: {
        transactionId: transaction.id,
        orgFileId: dto.orgFileId,
        type: dto.type ?? undefined
      }
    });

    void this.documentsAi.refreshFile(orgId, orgFile.id).catch(() => undefined);
    return result;
  }

  async listTransactions(orgId: string, userId: string) {
    await this.assertUserInOrg(userId, orgId);
    return this.prisma.orgTransaction.findMany({
      where: { organizationId: orgId },
      include: {
        listing: true,
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
}
