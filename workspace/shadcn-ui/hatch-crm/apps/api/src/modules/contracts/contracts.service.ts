import { Injectable, NotFoundException } from '@nestjs/common';
import { ContractInstanceStatus, Prisma, SignatureEnvelopeStatus } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { ContractsAutofillService } from './contracts-autofill.service';
import {
  ContractsRecommendationService,
  type RecommendationFilters
} from './contracts-recommendation.service';
import { ContractsDocuSignService, type ContractSigner } from './contracts.docusign.service';
import type {
  CreateContractInstanceDto,
  ListInstancesQueryDto,
  ListTemplatesQueryDto,
  SendForSignatureDto,
  UpdateContractInstanceDto,
  SearchTemplatesQueryDto
} from './dto/contracts.dto';
import type { ContractTemplate } from '@hatch/db';

type InstanceWithRelations = Prisma.ContractInstanceGetPayload<{
  include: { template: true; envelope: true };
}>;

const DEFAULT_EDITABLE_KEYS = new Set<string>([
  'PRICE',
  'PURCHASE_PRICE',
  'ESCROW_AMOUNT',
  'CLOSING_DATE',
  'INSPECTION_PERIOD',
  'EFFECTIVE_DATE',
  'SPECIAL_TERMS'
]);

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly autofill: ContractsAutofillService,
    private readonly recommendations: ContractsRecommendationService,
    private readonly docusign: ContractsDocuSignService
  ) {}

  async listTemplates(orgId: string, query: ListTemplatesQueryDto) {
    const activeOnly = (query.active ?? 'true').toLowerCase() !== 'false';
    return this.prisma.contractTemplate.findMany({
      where: {
        organizationId: orgId,
        isActive: activeOnly ? true : undefined,
        propertyType: query.propertyType ?? undefined,
        side: query.side ?? undefined,
        jurisdiction: query.jurisdiction ?? undefined
      },
      include: { fieldMappings: true },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async recommendTemplates(orgId: string, filters: RecommendationFilters) {
    return this.recommendations.recommend(orgId, filters);
  }

  async searchTemplates(orgId: string, query: SearchTemplatesQueryDto) {
    const text = query.query?.trim();
    if (!text) {
      return [];
    }
    const tokens = text
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const matches = await this.prisma.contractTemplate.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        propertyType: query.propertyType ?? undefined,
        side: query.side ?? undefined,
        jurisdiction: query.jurisdiction ?? undefined,
        OR: [
          { name: { contains: text, mode: 'insensitive' } },
          { code: { contains: text, mode: 'insensitive' } },
          { description: { contains: text, mode: 'insensitive' } },
          tokens.length
            ? {
                tags: {
                  hasSome: tokens
                }
              }
            : undefined
        ].filter(Boolean) as any[]
      },
      orderBy: { updatedAt: 'desc' }
    });

    const includeUrl = (query.includeUrl ?? '').toLowerCase() === 'true';

    const s3Keys = await this.s3.searchKeys({
      prefix: 'contracts/',
      contains: tokens,
      maxKeys: 50
    });

    const fromS3: Array<ContractTemplate & { templateUrl?: string | null }> = [];
    for (const key of s3Keys) {
      if (key.endsWith('/')) continue;
      const name = this.prettyNameFromKey(key);
      fromS3.push({
        id: `s3:${key}`,
        organizationId: orgId,
        name,
        code: this.codeFromKey(key),
        description: 'S3 template',
        jurisdiction: null,
        propertyType: null,
        side: null,
        s3Key: key,
        editableKeys: null,
        tags: [],
        templateUrl: includeUrl ? await this.s3.getPresignedUrl(key) : null,
        isActive: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);
    }

    if (!includeUrl) return [...matches, ...fromS3];

    const withUrls = await Promise.all(
      matches.map(async (template) => ({
        ...template,
        templateUrl: template.s3Key ? await this.s3.getPresignedUrl(template.s3Key) : null
      }))
    );

    return [...withUrls, ...fromS3];
  }

  private prettyNameFromKey(key: string): string {
    const base = key.split('/').pop() ?? key;
    return base
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\.pdf$/i, '')
      .trim();
  }

  private codeFromKey(key: string): string {
    const base = key.split('/').pop() ?? key;
    return base.replace(/\.pdf$/i, '').toUpperCase();
  }

  async listInstances(orgId: string, query: ListInstancesQueryDto) {
    const instances = await this.prisma.contractInstance.findMany({
      where: {
        organizationId: orgId,
        orgListingId: query.propertyId ?? undefined,
        orgTransactionId: query.transactionId ?? undefined,
        status: query.status ?? undefined
      },
      include: {
        template: true,
        envelope: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    return Promise.all(instances.map((instance) => this.toInstanceView(instance)));
  }

  async getInstance(orgId: string, id: string) {
    const instance = await this.prisma.contractInstance.findFirst({
      where: { id, organizationId: orgId },
      include: { template: true, envelope: true }
    });
    if (!instance) {
      throw new NotFoundException('Contract not found');
    }
    return this.toInstanceView(instance, true);
  }

  async createInstance(orgId: string, userId: string, dto: CreateContractInstanceDto) {
    const template = await this.prisma.contractTemplate.findFirst({
      where: { id: dto.templateId, organizationId: orgId }
    });
    if (!template) {
      throw new NotFoundException('Template not found for this organization');
    }

    await this.assertListing(orgId, dto.propertyId);
    await this.assertTransaction(orgId, dto.transactionId);

    const autofillResult = await this.autofill.autofillTemplateToDraft({
      orgId,
      templateId: template.id,
      listingId: dto.propertyId,
      transactionId: dto.transactionId,
      overrideFieldValues: dto.overrideFieldValues
    });

    const created = await this.prisma.contractInstance.create({
      data: {
        organizationId: orgId,
        templateId: template.id,
        orgListingId: dto.propertyId ?? undefined,
        orgTransactionId: dto.transactionId ?? undefined,
        createdByUserId: userId,
        title: dto.title ?? template.name,
        status: ContractInstanceStatus.DRAFT,
        draftS3Key: autofillResult.draftS3Key ?? template.s3Key ?? null,
        fieldValues: autofillResult.fieldValues as Prisma.InputJsonValue,
        recommendationReason: dto.recommendationReason ?? null
      },
      include: {
        template: true,
        envelope: true
      }
    });

    return {
      ...(await this.toInstanceView(created, true)),
      missingRequired: autofillResult.missingRequired
    };
  }

  async updateInstance(orgId: string, id: string, dto: UpdateContractInstanceDto) {
    const existing = await this.prisma.contractInstance.findFirst({
      where: { id, organizationId: orgId },
      include: { template: true }
    });
    if (!existing) {
      throw new NotFoundException('Contract not found');
    }

    const editableKeys = Array.isArray((existing.template as any)?.editableKeys)
      ? new Set((existing.template as any).editableKeys as string[])
      : DEFAULT_EDITABLE_KEYS;

    const currentFields = (existing.fieldValues as Record<string, unknown>) ?? {};
    const nextFieldValues = { ...currentFields };

    if (dto.fieldValues) {
      for (const [key, value] of Object.entries(dto.fieldValues)) {
        if (!editableKeys.has(key)) continue;
        nextFieldValues[key] = value;
      }
    }

    const updated = await this.prisma.contractInstance.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        fieldValues: nextFieldValues as Prisma.InputJsonValue
      },
      include: { template: true, envelope: true }
    });

    return this.toInstanceView(updated);
  }

  async sendForSignature(orgId: string, id: string, dto: SendForSignatureDto) {
    const instance = await this.prisma.contractInstance.findFirst({
      where: { id, organizationId: orgId },
      include: { template: true, envelope: true }
    });
    if (!instance) {
      throw new NotFoundException('Contract not found');
    }

    if (!instance.draftS3Key) {
      throw new NotFoundException('Contract draft PDF not found');
    }

    if (instance.status !== ContractInstanceStatus.DRAFT) {
      throw new Error('Only DRAFT contracts can be sent for signature');
    }

    const signers: ContractSigner[] = (dto.signers ?? []).map((s) => ({
      name: s.name ?? '',
      email: s.email ?? '',
      role: s.role ?? 'signer'
    }));

    const { envelopeId, recipientViewUrl } = await this.docusign.createEnvelopeFromInstance({
      contractInstanceId: instance.id,
      draftS3Key: instance.draftS3Key,
      signers
    }).then(async ({ envelopeId }) => {
      let recipientViewUrl: string | undefined;
      if (dto.returnUrl && signers.length > 0) {
        const view = await this.docusign.createRecipientView({
          envelopeId,
          returnUrl: dto.returnUrl,
          signer: { name: signers[0].name, email: signers[0].email }
        });
        recipientViewUrl = view.url;
      }
      return { envelopeId, recipientViewUrl };
    });

    await this.prisma.signatureEnvelope.upsert({
      where: { contractInstanceId: instance.id },
      update: {
        provider: 'DOCUSIGN',
        providerEnvelopeId: envelopeId,
        status: SignatureEnvelopeStatus.SENT,
        signers: signers as unknown as Prisma.InputJsonValue
      },
      create: {
        contractInstanceId: instance.id,
        provider: 'DOCUSIGN',
        providerEnvelopeId: envelopeId,
        status: SignatureEnvelopeStatus.SENT,
        signers: signers as unknown as Prisma.InputJsonValue
      }
    });

    const updated = await this.prisma.contractInstance.update({
      where: { id: instance.id },
      data: { status: ContractInstanceStatus.OUT_FOR_SIGNATURE },
      include: { template: true, envelope: true }
    });

    const view = await this.toInstanceView(updated, true);
    return {
      ...view,
      envelopeId,
      recipientViewUrl
    };
  }

  private async assertListing(orgId: string, listingId?: string | null) {
    if (!listingId) return null;
    const listing = await this.prisma.orgListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Property not found in this organization');
    }
    return listing;
  }

  private async assertTransaction(orgId: string, transactionId?: string | null) {
    if (!transactionId) return null;
    const transaction = await this.prisma.orgTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction || transaction.organizationId !== orgId) {
      throw new NotFoundException('Transaction not found in this organization');
    }
    return transaction;
  }

  private async toInstanceView(instance: InstanceWithRelations, withUrls = false) {
    const draftUrl =
      withUrls && instance.draftS3Key ? await this.s3.getPresignedUrl(instance.draftS3Key) : null;
    const signedUrl =
      withUrls && instance.signedS3Key ? await this.s3.getPresignedUrl(instance.signedS3Key) : null;

    return {
      id: instance.id,
      organizationId: instance.organizationId,
      templateId: instance.templateId,
      orgListingId: instance.orgListingId,
      orgTransactionId: instance.orgTransactionId,
      title: instance.title,
      status: instance.status,
      fieldValues: (instance.fieldValues as Record<string, unknown>) ?? {},
      draftS3Key: instance.draftS3Key,
      signedS3Key: instance.signedS3Key,
      recommendationReason: instance.recommendationReason,
      template: instance.template
        ? {
            id: instance.template.id,
            name: instance.template.name,
            code: instance.template.code,
            version: instance.template.version,
            propertyType: instance.template.propertyType,
            side: instance.template.side
          }
        : null,
      envelope: instance.envelope ?? null,
      draftUrl,
      signedUrl,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt
    };
  }
}
