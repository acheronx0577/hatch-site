import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ComplianceStatus, DocumentType, OrgEventType, OrgTransactionStatus, PlaybookTriggerType, UserRole } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { DocumentsAiService } from '@/modules/documents-ai/documents-ai.service';
import { PlaybookRunnerService } from '../playbooks/playbook-runner.service';
import { OrgEventsService } from '../org-events/org-events.service';
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
    private readonly playbooks: PlaybookRunnerService,
    private readonly orgEvents: OrgEventsService
  ) {}

  private isValidStatusTransition(from: OrgTransactionStatus, to: OrgTransactionStatus): boolean {
    const transitions: Record<OrgTransactionStatus, OrgTransactionStatus[]> = {
      PRE_CONTRACT: [OrgTransactionStatus.UNDER_CONTRACT, OrgTransactionStatus.CANCELLED],
      UNDER_CONTRACT: [OrgTransactionStatus.PRE_CONTRACT, OrgTransactionStatus.CONTINGENT, OrgTransactionStatus.CLOSED, OrgTransactionStatus.CANCELLED],
      CONTINGENT: [OrgTransactionStatus.UNDER_CONTRACT, OrgTransactionStatus.CLOSED, OrgTransactionStatus.CANCELLED],
      CLOSED: [],
      CANCELLED: [OrgTransactionStatus.PRE_CONTRACT]
    };

    return transitions[from]?.includes(to) ?? false;
  }

  private async checkStageRequirements(params: {
    orgId: string;
    transactionId: string;
    nextStatus: OrgTransactionStatus;
    contractSignedAt: Date | null;
    closingDate: Date | null;
  }): Promise<{ met: boolean; missing: string[] }> {
    const { orgId, transactionId, nextStatus, contractSignedAt, closingDate } = params;

    const NON_PASSING = new Set<ComplianceStatus>([
      ComplianceStatus.UNKNOWN,
      ComplianceStatus.PENDING,
      ComplianceStatus.FAILED,
      ComplianceStatus.NEEDS_REVIEW
    ]);

    const files = await this.prisma.orgFile.findMany({
      where: { orgId, transactionId },
      select: { id: true, documentType: true, complianceStatus: true }
    });

    const docsByType = new Map<DocumentType, Array<{ id: string; complianceStatus: ComplianceStatus }>>();
    for (const file of files) {
      const list = docsByType.get(file.documentType) ?? [];
      list.push({ id: file.id, complianceStatus: file.complianceStatus });
      docsByType.set(file.documentType, list);
    }

    const missing: string[] = [];

    if (nextStatus === OrgTransactionStatus.UNDER_CONTRACT) {
      const contractExists = contractSignedAt instanceof Date && !Number.isNaN(contractSignedAt.getTime());
      const purchaseContracts = docsByType.get(DocumentType.PURCHASE_CONTRACT) ?? [];
      const hasPassingPurchaseContract = purchaseContracts.some((doc) => !NON_PASSING.has(doc.complianceStatus));
      if (!contractExists && !hasPassingPurchaseContract) {
        missing.push('Contract signed date or passing purchase contract');
      }
    }

    if (nextStatus === OrgTransactionStatus.CONTINGENT) {
      const requiredDocs: DocumentType[] = [DocumentType.PURCHASE_CONTRACT, DocumentType.PROOF_OF_FUNDS];
      for (const type of requiredDocs) {
        const docs = docsByType.get(type) ?? [];
        if (docs.length === 0) {
          missing.push(type);
          continue;
        }

        const hasPassing = docs.some((doc) => !NON_PASSING.has(doc.complianceStatus));
        if (!hasPassing) {
          missing.push(`Passing ${type}`);
        }
      }
    }

    if (nextStatus === OrgTransactionStatus.CLOSED) {
      if (!closingDate || Number.isNaN(closingDate.getTime())) {
        missing.push('Closing date');
      }

      const closingDocs = docsByType.get(DocumentType.CLOSING_DOC) ?? [];
      const hasPassingClosingDoc = closingDocs.some((doc) => !NON_PASSING.has(doc.complianceStatus));
      if (!hasPassingClosingDoc) {
        missing.push(DocumentType.CLOSING_DOC);
      }
    }

    return { met: missing.length === 0, missing };
  }

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

  private async assertPerson(personId: string, orgId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: orgId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true }
    });
    if (!person) {
      throw new NotFoundException('Contact not found');
    }
    return person;
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

    let buyerPersonId = dto.buyerPersonId ?? undefined;
    let sellerPersonId = dto.sellerPersonId ?? undefined;
    let buyerName = dto.buyerName ?? undefined;
    let sellerName = dto.sellerName ?? undefined;

    if (buyerPersonId) {
      const buyer = await this.assertPerson(buyerPersonId, orgId);
      buyerPersonId = buyer.id;
      buyerName ??= `${buyer.firstName} ${buyer.lastName}`.trim();
    }
    if (sellerPersonId) {
      const seller = await this.assertPerson(sellerPersonId, orgId);
      sellerPersonId = seller.id;
      sellerName ??= `${seller.firstName} ${seller.lastName}`.trim();
    }

    const created = await this.prisma.orgTransaction.create({
      data: {
        organizationId: orgId,
        listingId,
        agentProfileId,
        buyerPersonId,
        sellerPersonId,
        buyerName,
        sellerName,
        contractSignedAt: dto.contractSignedAt ? new Date(dto.contractSignedAt) : undefined,
        inspectionDate: dto.inspectionDate ? new Date(dto.inspectionDate) : undefined,
        financingDate: dto.financingDate ? new Date(dto.financingDate) : undefined,
        closingDate: dto.closingDate ? new Date(dto.closingDate) : undefined,
        createdByUserId: creatorUserId
      }
    });

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: creatorUserId,
      type: OrgEventType.ORG_TRANSACTION_CREATED,
      message: 'Transaction created',
      payload: {
        transactionId: created.id,
        status: created.status,
        listingId: created.listingId ?? null,
        agentProfileId: created.agentProfileId ?? null
      }
    });

    return created;
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

    const beforeStatus = transaction.status;
    const data: Record<string, unknown> = {
      buyerName: dto.buyerName === null ? null : dto.buyerName ?? undefined,
      sellerName: dto.sellerName === null ? null : dto.sellerName ?? undefined,
      contractSignedAt: dto.contractSignedAt === null ? null : dto.contractSignedAt ? new Date(dto.contractSignedAt) : undefined,
      inspectionDate: dto.inspectionDate === null ? null : dto.inspectionDate ? new Date(dto.inspectionDate) : undefined,
      financingDate: dto.financingDate === null ? null : dto.financingDate ? new Date(dto.financingDate) : undefined,
      closingDate: dto.closingDate === null ? null : dto.closingDate ? new Date(dto.closingDate) : undefined
    };

    if (dto.buyerPersonId !== undefined) {
      if (dto.buyerPersonId === null) {
        data.buyerPersonId = null;
      } else {
        const buyer = await this.assertPerson(dto.buyerPersonId, orgId);
        data.buyerPersonId = buyer.id;
        if (dto.buyerName === undefined) {
          data.buyerName = `${buyer.firstName} ${buyer.lastName}`.trim();
        }
      }
    }

    if (dto.sellerPersonId !== undefined) {
      if (dto.sellerPersonId === null) {
        data.sellerPersonId = null;
      } else {
        const seller = await this.assertPerson(dto.sellerPersonId, orgId);
        data.sellerPersonId = seller.id;
        if (dto.sellerName === undefined) {
          data.sellerName = `${seller.firstName} ${seller.lastName}`.trim();
        }
      }
    }

    if ((isBroker || isAgent) && dto.status && dto.status !== transaction.status) {
      const nextStatus = dto.status as OrgTransactionStatus;
      if (!this.isValidStatusTransition(transaction.status, nextStatus)) {
        throw new BadRequestException(`Cannot move from ${transaction.status} to ${nextStatus}`);
      }

      const requirements = await this.checkStageRequirements({
        orgId,
        transactionId,
        nextStatus,
        contractSignedAt: (data.contractSignedAt as Date | null | undefined) ?? transaction.contractSignedAt ?? null,
        closingDate: (data.closingDate as Date | null | undefined) ?? transaction.closingDate ?? null
      });

      if (!requirements.met) {
        throw new UnprocessableEntityException({
          message: 'Requirements not met for stage change',
          details: requirements
        });
      }

      data.status = nextStatus;
    }

    if (isBroker) {
      data.isCompliant = dto.isCompliant ?? undefined;
      data.requiresAction = dto.requiresAction ?? undefined;
      data.complianceNotes = dto.complianceNotes === null ? null : dto.complianceNotes ?? undefined;
    }

    const updated = await this.prisma.orgTransaction.update({
      where: { id: transactionId },
      data
    });

    const changedFields = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    const statusChanged = changedFields.includes('status') && updated.status !== beforeStatus;
    if (changedFields.length > 0) {
      const nextLabel = String(updated.status ?? '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (char) => char.toUpperCase());
      await this.orgEvents.logOrgEvent({
        organizationId: orgId,
        actorId: userId,
        type: statusChanged
          ? OrgEventType.ORG_TRANSACTION_STATUS_CHANGED
          : OrgEventType.ORG_TRANSACTION_UPDATED,
        message: statusChanged
          ? `Transaction moved to ${nextLabel}`
          : `Transaction updated${changedFields.length > 0 ? ` (${changedFields.join(', ')})` : ''}`,
        payload: {
          transactionId: updated.id,
          beforeStatus,
          afterStatus: updated.status,
          listingId: updated.listingId ?? null,
          agentProfileId: updated.agentProfileId ?? null,
          changedFields
        }
      });
    }

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

    await this.orgEvents.logOrgEvent({
      organizationId: orgId,
      actorId: userId,
      type: OrgEventType.ORG_TRANSACTION_UPDATED,
      message: 'Transaction document attached',
      payload: {
        transactionId: transaction.id,
        orgFileId: dto.orgFileId,
        documentType: dto.type ?? null
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
        buyerPerson: { select: { id: true, firstName: true, lastName: true, primaryEmail: true, primaryPhone: true } },
        sellerPerson: { select: { id: true, firstName: true, lastName: true, primaryEmail: true, primaryPhone: true } },
        agentProfile: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        },
        contractInstances: {
          select: {
            id: true,
            status: true,
            title: true,
            updatedAt: true,
            template: { select: { id: true, code: true, name: true } }
          },
          orderBy: { updatedAt: 'desc' }
        },
        documents: {
          include: { orgFile: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async listTransactionActivity(orgId: string, userId: string, transactionId: string) {
    await this.assertUserInOrg(userId, orgId);
    const transaction = await this.prisma.orgTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction || transaction.organizationId !== orgId) {
      throw new NotFoundException('Transaction not found');
    }

    const events = await this.prisma.orgEvent.findMany({
      where: {
        organizationId: orgId,
        payload: {
          path: ['transactionId'],
          equals: transactionId
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      payload: event.payload as any,
      createdAt: event.createdAt.toISOString()
    }));
  }
}
