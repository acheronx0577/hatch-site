import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { BulkDeleteInstancesDto } from './dto/contracts.dto';
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
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly autofill: ContractsAutofillService,
    private readonly recommendations: ContractsRecommendationService,
    private readonly docusign: ContractsDocuSignService,
    private readonly config: ConfigService
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
    const tokens = (text ?? '')
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
        OR:
          text && text.length
            ? [
                { name: { contains: text, mode: Prisma.QueryMode.insensitive } },
                { code: { contains: text, mode: Prisma.QueryMode.insensitive } },
                { description: { contains: text, mode: Prisma.QueryMode.insensitive } },
                tokens.length
                  ? {
                      tags: {
                        hasSome: tokens
                      }
                    }
                  : undefined
              ].filter(Boolean)
            : undefined
      },
      orderBy: { updatedAt: 'desc' }
    });

    const includeUrl = (query.includeUrl ?? '').toLowerCase() === 'true';

    const prefixes = ['contracts/', 'contracts/templates/', 'forms/contracts/', 'forms/', undefined];
    const keySet = new Set<string>();

    const maxKeys = 400;

    for (const prefix of prefixes) {
      const keys = await this.safeSearchS3Keys(prefix, tokens, maxKeys);
      keys.forEach((key) => keySet.add(key));
      if (keySet.size >= maxKeys) break;
    }

    const s3Keys = Array.from(keySet).slice(0, maxKeys);

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
        templateUrl: includeUrl ? await this.safePresignUrl(key) : null,
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
        templateUrl: template.s3Key ? await this.safePresignUrl(template.s3Key) : null
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

  private async safeSearchS3Keys(prefix: string | undefined, tokens: string[], maxKeys: number) {
    try {
      return await this.s3.searchKeys({
        prefix,
        contains: tokens,
        maxKeys
      });
    } catch (error) {
      this.logger.warn(`Skipping S3 contract template search for prefix "${prefix ?? '(none)'}": ${this.formatError(error)}`);
      return [];
    }
  }

  private async safePresignUrl(key: string): Promise<string | null> {
    try {
      return await this.s3.getPresignedUrl(key);
    } catch (error) {
      this.logger.warn(`Failed to presign S3 key "${key}": ${this.formatError(error)}`);
      return null;
    }
  }

  private formatError(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
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
    let template = await this.prisma.contractTemplate.findFirst({
      where: { id: dto.templateId, organizationId: orgId }
    });

    // If this is an S3-only template (id starts with s3:...), create a backing DB row on the fly.
    if (!template && dto.templateId.startsWith('s3:')) {
      const s3Key = dto.templateId.replace(/^s3:/, '');
      template =
        (await this.prisma.contractTemplate.findFirst({
          where: { organizationId: orgId, s3Key }
        })) ??
        (await this.prisma.contractTemplate.create({
          data: {
            organizationId: orgId,
            name: this.prettyNameFromKey(s3Key),
            code: this.codeFromKey(s3Key),
            description: 'Imported from S3',
            s3Key,
            isActive: true,
            version: 1
          }
        }));
    }

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

    const draftKey = instance.draftS3Key ?? '';
    const templateKey = (instance.template as any)?.s3Key ?? '';
    const draftIsPdf = draftKey.toLowerCase().endsWith('.pdf');
    const templateIsPdf = templateKey.toLowerCase().endsWith('.pdf');
    const pdfKey = draftIsPdf ? draftKey : templateIsPdf ? templateKey : null;

    if (!pdfKey) {
      throw new NotFoundException('No PDF available to send for signature');
    }

    const { envelopeId, senderViewUrl } = await this.docusign.createEnvelopeWithSenderView({
      contractInstanceId: instance.id,
      pdfS3Key: pdfKey,
      signers,
      returnUrl: dto.returnUrl ?? this.config.get<string>('DOCUSIGN_RETURN_URL', 'http://localhost:3000')
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
      senderViewUrl
    };
  }

  async deleteInstance(orgId: string, id: string) {
    const existing = await this.prisma.contractInstance.findFirst({
      where: { id, organizationId: orgId }
    });
    if (!existing) {
      throw new NotFoundException('Contract not found');
    }

    await this.prisma.signatureEnvelope.deleteMany({
      where: { contractInstanceId: id }
    });
    await this.prisma.contractInstance.delete({
      where: { id }
    });

    return { deleted: 1 };
  }

  async deleteInstances(orgId: string, ids: string[]) {
    const validIds = ids?.filter(Boolean) ?? [];
    if (validIds.length === 0) return { deleted: 0 };

    const existing = await this.prisma.contractInstance.findMany({
      where: { id: { in: validIds }, organizationId: orgId },
      select: { id: true }
    });
    const targetIds = existing.map((x) => x.id);
    if (targetIds.length === 0) return { deleted: 0 };

    await this.prisma.signatureEnvelope.deleteMany({
      where: { contractInstanceId: { in: targetIds } }
    });
    const result = await this.prisma.contractInstance.deleteMany({
      where: { id: { in: targetIds } }
    });
    return { deleted: result.count };
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
