import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgListingDocumentType, OrgListingStatus } from '@hatch/db';

import { AiService } from '@/modules/ai/ai.service';
import { PrismaService } from '@/modules/prisma/prisma.service';

export type ListingRecommendationPriority = 'high' | 'medium' | 'low';
export type ListingComplianceIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type ListingComplianceIssueCode =
  | 'BROKER_APPROVAL_PENDING'
  | 'ACTIVE_MISSING_BROKER_APPROVAL'
  | 'MISSING_REQUIRED_DOCUMENTS';

export type ListingRecommendation = {
  type: 'action' | 'fill_field' | 'add_document' | 'ai';
  title: string;
  description: string;
  priority: ListingRecommendationPriority;
  field?: string;
  documentType?: OrgListingDocumentType;
};

export type ListingComplianceIssue = {
  code: ListingComplianceIssueCode;
  severity: ListingComplianceIssueSeverity;
  title: string;
  description: string;
  resolutionSteps: string[];
  metadata?: Record<string, unknown>;
};

export type ListingRecommendationsResponse = {
  stageRecommendations: ListingRecommendation[];
  missingFields: string[];
  contractGaps: string[];
  aiRecommendations: ListingRecommendation[];
  complianceIssues: ListingComplianceIssue[];
  nextActions: ListingRecommendation[];
};

const PRIORITY_SCORE: Record<ListingRecommendationPriority, number> = {
  high: 0,
  medium: 1,
  low: 2
};

const safeString = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
};

const uniqueBy = <T>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    result.push(item);
  }
  return result;
};

@Injectable()
export class OrgListingRecommendationsService {
  private readonly permissionsDisabled =
    process.env.NODE_ENV !== 'production' &&
    (process.env.DISABLE_PERMISSIONS_GUARD ?? 'true').toLowerCase() === 'true';

  private readonly guardFallbackEnabled =
    (process.env.GUARD_FALLBACK_ENABLED ?? 'true').toLowerCase() === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService
  ) {}

  private async assertUserInOrg(userId: string, orgId: string) {
    if (this.permissionsDisabled) {
      return { userId, orgId };
    }

    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } }
    });

    if (!membership) {
      if (this.guardFallbackEnabled) {
        return { userId, orgId };
      }
      throw new ForbiddenException('User is not part of this organization');
    }

    return membership;
  }

  async getRecommendations(orgId: string, userId: string, listingId: string): Promise<ListingRecommendationsResponse> {
    await this.assertUserInOrg(userId, orgId);

    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId },
      include: {
        documents: true,
        contractInstances: { include: { template: true } }
      }
    });

    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }

    const missingFields = this.checkRequiredFields(listing);
    const contractGaps = this.checkDocumentGaps(listing.status, listing.documents);
    const stageRecommendations = this.getStageRecommendations(listing.status, contractGaps);
    const complianceIssues = this.checkComplianceIssues(listing, contractGaps);
    const aiRecommendations = await this.getAiRecommendationsSafe({
      listing,
      missingFields,
      contractGaps,
      complianceIssues
    });

    const missingFieldActions: ListingRecommendation[] = missingFields.map((field) => ({
      type: 'fill_field',
      field,
      title: `Fill "${field}"`,
      description: 'Required to publish and keep MLS data consistent.',
      priority: 'high'
    }));

    const documentGapActions: ListingRecommendation[] = contractGaps.map((type) => ({
      type: 'add_document',
      documentType: type as OrgListingDocumentType,
      title: `Upload ${formatDocumentType(type)}`,
      description: 'Attach the required document for this listing stage.',
      priority: 'high'
    }));

    const combined = uniqueBy(
      [...stageRecommendations, ...missingFieldActions, ...documentGapActions, ...aiRecommendations],
      (item) => `${item.type}:${item.title}`
    );

    const nextActions = combined
      .slice()
      .sort((a, b) => PRIORITY_SCORE[a.priority] - PRIORITY_SCORE[b.priority])
      .slice(0, 8);

    return {
      stageRecommendations,
      missingFields,
      contractGaps,
      aiRecommendations,
      complianceIssues,
      nextActions
    };
  }

  private getStageRecommendations(status: OrgListingStatus, documentGaps: string[]): ListingRecommendation[] {
    const recs: ListingRecommendation[] = [];

    if (status === OrgListingStatus.DRAFT) {
      recs.push({
        type: 'action',
        title: 'Complete listing details',
        description: 'Add pricing, property type, and core MLS fields before requesting approval.',
        priority: 'high'
      });
    }

    if (status === OrgListingStatus.PENDING_BROKER_APPROVAL) {
      recs.push({
        type: 'action',
        title: 'Follow up on broker approval',
        description: 'Broker approval is required before the listing can go live.',
        priority: 'high'
      });
    }

    if (status === OrgListingStatus.ACTIVE) {
      recs.push({
        type: 'action',
        title: 'Review listing performance',
        description: 'Track showings, inquiries, and adjust pricing strategy if needed.',
        priority: 'medium'
      });
    }

    if (status === OrgListingStatus.PENDING) {
      recs.push({
        type: 'action',
        title: 'Track contingencies and deadlines',
        description: 'Make sure critical dates and required documents are attached and shared.',
        priority: 'high'
      });
    }

    if (status === OrgListingStatus.EXPIRED) {
      recs.push({
        type: 'action',
        title: 'Renew or relaunch listing',
        description: 'Confirm pricing, update photos/remarks, and set a new expiration date.',
        priority: 'medium'
      });
    }

    if (status === OrgListingStatus.WITHDRAWN) {
      recs.push({
        type: 'action',
        title: 'Document withdrawal reason',
        description: 'Log the withdrawal context and next steps for the seller and team.',
        priority: 'low'
      });
    }

    if (documentGaps.length > 0 && status !== OrgListingStatus.DRAFT) {
      recs.push({
        type: 'action',
        title: 'Resolve missing listing documents',
        description: 'Upload the required documents to reduce compliance risk.',
        priority: 'high'
      });
    }

    return recs;
  }

  private checkRequiredFields(listing: {
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    listPrice: number | null;
    propertyType: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    squareFeet: number | null;
    mlsNumber: string | null;
  }): string[] {
    const required: Array<[string, unknown]> = [
      ['address', listing.addressLine1],
      ['city', listing.city],
      ['state', listing.state],
      ['postalCode', listing.postalCode],
      ['listPrice', listing.listPrice],
      ['propertyType', listing.propertyType],
      ['bedrooms', listing.bedrooms],
      ['bathrooms', listing.bathrooms],
      ['squareFeet', listing.squareFeet]
    ];

    const missing: string[] = [];
    for (const [field, value] of required) {
      if (value === null || value === undefined) {
        missing.push(field);
        continue;
      }
      if (typeof value === 'string' && value.trim().length === 0) {
        missing.push(field);
      }
    }

    // MLS number is optional in draft, but recommended before going live.
    if (!listing.mlsNumber || listing.mlsNumber.trim().length === 0) {
      missing.push('mlsNumber');
    }

    return missing;
  }

  private checkDocumentGaps(status: OrgListingStatus, documents: Array<{ type: OrgListingDocumentType }>): string[] {
    const present = new Set(documents.map((doc) => doc.type));
    const required: OrgListingDocumentType[] = [];

    if (status === OrgListingStatus.ACTIVE || status === OrgListingStatus.PENDING || status === OrgListingStatus.CLOSED) {
      required.push(OrgListingDocumentType.LISTING_AGREEMENT);
      required.push(OrgListingDocumentType.PHOTOS);
    }

    if (status === OrgListingStatus.PENDING || status === OrgListingStatus.CLOSED) {
      required.push(OrgListingDocumentType.DISCLOSURE);
    }

    return required.filter((type) => !present.has(type));
  }

  private checkComplianceIssues(
    listing: { status: OrgListingStatus; brokerApproved: boolean },
    documentGaps: string[]
  ): ListingComplianceIssue[] {
    const issues: ListingComplianceIssue[] = [];

    if (listing.status === OrgListingStatus.PENDING_BROKER_APPROVAL) {
      issues.push({
        code: 'BROKER_APPROVAL_PENDING',
        severity: 'HIGH',
        title: 'Broker approval pending',
        description: 'A broker must approve this listing before it can go live.',
        resolutionSteps: ['Broker: review and approve or request changes.', 'Agent: fix missing fields/documents, then re-request approval.']
      });
    }

    if (listing.status === OrgListingStatus.ACTIVE && !listing.brokerApproved) {
      issues.push({
        code: 'ACTIVE_MISSING_BROKER_APPROVAL',
        severity: 'HIGH',
        title: 'Active without broker approval',
        description: 'This listing is active but still missing a broker approval record.',
        resolutionSteps: ['Broker: approve the listing to reconcile compliance.', 'Confirm who is responsible for approvals in your workflow.']
      });
    }

    if (documentGaps.length > 0 && listing.status !== OrgListingStatus.DRAFT) {
      issues.push({
        code: 'MISSING_REQUIRED_DOCUMENTS',
        severity: 'MEDIUM',
        title: 'Required listing documents missing',
        description: `Missing ${documentGaps.length} required document(s): ${documentGaps.map(formatDocumentType).join(', ')}`,
        resolutionSteps: ['Open the Documents tab and upload the missing items.', 'Re-run the listing compliance check after uploading.'],
        metadata: { missingDocumentTypes: documentGaps }
      });
    }

    return issues;
  }

  private async getAiRecommendationsSafe(input: {
    listing: {
      id: string;
      status: OrgListingStatus;
      addressLine1: string;
      city: string;
      state: string;
      postalCode: string;
      listPrice: number | null;
      propertyType: string | null;
      bedrooms: number | null;
      bathrooms: number | null;
      squareFeet: number | null;
    };
    missingFields: string[];
    contractGaps: string[];
    complianceIssues: ListingComplianceIssue[];
  }): Promise<ListingRecommendation[]> {
    const systemPrompt = [
      'You are a real estate listing operations assistant.',
      'Return a JSON object with an "items" array.',
      'Each item must have: title (string), description (string), priority ("high"|"medium"|"low").',
      'Focus on concrete next steps (documents, deadlines, field completeness, compliance).',
      'Max 5 items. Do not return markdown.'
    ].join('\n');

    const listingSummary = {
      status: input.listing.status,
      address: `${input.listing.addressLine1}, ${input.listing.city}, ${input.listing.state} ${input.listing.postalCode}`,
      listPrice: input.listing.listPrice,
      propertyType: input.listing.propertyType,
      bedrooms: input.listing.bedrooms,
      bathrooms: input.listing.bathrooms,
      squareFeet: input.listing.squareFeet,
      missingFields: input.missingFields,
      missingDocuments: input.contractGaps,
      complianceIssues: input.complianceIssues
    };

    try {
      const response = await this.ai.runStructuredChat({
        systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Generate recommended actions for this listing:\n${JSON.stringify(listingSummary, null, 2)}`
          }
        ],
        responseFormat: 'json_object',
        temperature: 0.2
      });

      const raw = safeString(response.text).trim();
      if (!raw) return [];

      const parsed = JSON.parse(raw) as unknown;
      const items = (parsed as any)?.items;
      if (!Array.isArray(items)) {
        return [];
      }

      return items
        .slice(0, 5)
        .map((item: any) => ({
          type: 'ai' as const,
          title: safeString(item?.title) || 'Suggested action',
          description: safeString(item?.description) || safeString(item?.reason) || 'Review recommended next steps.',
          priority: normalizePriority(item?.priority)
        }));
    } catch {
      return [];
    }
  }
}

function normalizePriority(value: unknown): ListingRecommendationPriority {
  const normalized = safeString(value).trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'medium';
}

function formatDocumentType(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}
