import { Injectable, Logger } from '@nestjs/common';
import { ContractFieldSourceType, type ContractFieldMapping } from '@hatch/db';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';

export interface ContractContextParties {
  buyer?: any;
  seller?: any;
  listingAgent?: any;
  buyerAgent?: any;
  brokerage?: any;
}

export interface ContractContext {
  org: any;
  property?: any;
  transaction?: any;
  parties: ContractContextParties;
  system: {
    generatedDate: string;
    effectiveDate?: string;
  };
}

@Injectable()
export class ContractsAutofillService {
  private readonly logger = new Logger(ContractsAutofillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service
  ) {}

  async buildContext(params: {
    orgId: string;
    listingId?: string | null;
    transactionId?: string | null;
  }): Promise<ContractContext> {
    const { orgId, listingId, transactionId } = params;

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId }
    });

    const property = listingId
      ? await this.prisma.orgListing.findUnique({
          where: { id: listingId },
          include: {
            agentProfile: true
          }
        })
      : null;

    const transaction = transactionId
      ? await this.prisma.orgTransaction.findUnique({
          where: { id: transactionId },
          include: {
            listing: true
          }
        })
      : null;

    const now = new Date().toISOString().slice(0, 10);

    return {
      org,
      property,
      transaction,
      parties: {
        buyer: (transaction as any)?.buyer ?? null,
        seller: (transaction as any)?.seller ?? null,
        listingAgent: (property as any)?.agentProfile ?? null,
        buyerAgent: null,
        brokerage: org
      },
      system: {
        generatedDate: now,
        effectiveDate: now
      }
    };
  }

  async autofillTemplateToDraft(params: {
    orgId: string;
    templateId: string;
    listingId?: string | null;
    transactionId?: string | null;
    overrideFieldValues?: Record<string, unknown>;
  }): Promise<{ fieldValues: Record<string, unknown>; draftS3Key: string; missingRequired: string[] }> {
    const { orgId, templateId, listingId, transactionId, overrideFieldValues } = params;
    const template = await this.prisma.contractTemplate.findUniqueOrThrow({
      where: { id: templateId }
    });

    const context = await this.buildContext({
      orgId,
      listingId,
      transactionId
    });

    const mappings = await this.prisma.contractFieldMapping.findMany({
      where: { templateId },
      orderBy: { templateFieldKey: 'asc' }
    });

    const { fieldValues, missingRequired } = this.applyMappings(mappings, overrideFieldValues, context);

    // Use the template PDF already in S3 instead of generating a JSON “draft”.
    // DocuSign requires a real document bytes payload, so we keep fieldValues in DB
    // but point draftS3Key to the template PDF.
    const draftS3Key = template.s3Key;

    return { fieldValues, draftS3Key, missingRequired };
  }

  applyMappings(
    mappings: ContractFieldMapping[],
    overrides: Record<string, unknown> | undefined,
    context: ContractContext
  ): { fieldValues: Record<string, unknown>; missingRequired: string[] } {
    const fieldValues: Record<string, unknown> = {};
    const missingRequired: string[] = [];
    const overrideValues = overrides ?? {};

    for (const mapping of mappings) {
      const hasOverride = Object.prototype.hasOwnProperty.call(overrideValues, mapping.templateFieldKey);
      if (hasOverride) {
        const override = overrideValues[mapping.templateFieldKey];
        if (override !== undefined) {
          fieldValues[mapping.templateFieldKey] = override;
        }
        continue;
      }

      const resolved = this.resolveValueFromContext(mapping, context);
      if (resolved !== undefined && resolved !== null) {
        fieldValues[mapping.templateFieldKey] = resolved;
        continue;
      }

      if (mapping.defaultValue !== null && mapping.defaultValue !== undefined) {
        fieldValues[mapping.templateFieldKey] = mapping.defaultValue;
        continue;
      }

      if (mapping.required) {
        missingRequired.push(mapping.templateFieldKey);
      }
    }

    // Apply system defaults for dates to keep drafts usable even when data is sparse.
    const today = context.system.generatedDate ?? new Date().toISOString().slice(0, 10);
    fieldValues['EFFECTIVE_DATE'] ??= context.system.effectiveDate ?? today;
    fieldValues['OFFER_DATE'] ??= today;

    // Preserve any override keys that do not have an explicit mapping row.
    for (const [key, value] of Object.entries(overrideValues)) {
      if (!(key in fieldValues)) {
        fieldValues[key] = value;
      }
    }

    return { fieldValues, missingRequired };
  }

  private resolveValueFromContext(mapping: ContractFieldMapping, context: ContractContext): unknown {
    switch (mapping.sourceType) {
      case ContractFieldSourceType.PROPERTY:
        return this.deepGet(context.property, mapping.sourcePath);
      case ContractFieldSourceType.PARTY:
        return this.resolvePartyPath(context.parties, mapping.sourcePath);
      case ContractFieldSourceType.BROKERAGE:
      case ContractFieldSourceType.ORG:
        return this.deepGet(context.org, mapping.sourcePath);
      case ContractFieldSourceType.STATIC:
        return mapping.defaultValue ?? null;
      default:
        return null;
    }
  }

  private resolvePartyPath(parties: ContractContextParties, path: string | null | undefined): any {
    if (!path) return null;
    const [role, ...rest] = path.split('.');
    const base = (parties as any)[role];
    if (!base) return null;
    return this.deepGet(base, rest.join('.'));
  }

  private deepGet(obj: any, path: string | null | undefined): any {
    if (!obj || !path) return null;
    return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
  }
}
