import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@hatch/db';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiComplianceService } from '@/modules/ai/foundation/services/ai-compliance.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';
import type { RequestContext } from '@/modules/common/request-context';
import { listingDescriptionPrompt } from './listing-description.prompt';
import type { GenerateListingDescriptionRequest, ListingDescriptionResult } from './listing-description.types';

@Injectable()
export class ListingDescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly compliance: AiComplianceService,
    private readonly prompts: AiPromptService
  ) {}

  async generate(
    ctx: RequestContext,
    request: GenerateListingDescriptionRequest,
    meta?: { parentRequestId?: string | null }
  ): Promise<ListingDescriptionResult> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) {
      throw new BadRequestException('Missing organization context');
    }
    const userId = ctx.userId?.trim();
    if (!userId) {
      throw new BadRequestException('Missing user context');
    }

    const listingId = request.listingId?.trim();
    if (!listingId) {
      throw new BadRequestException('listingId is required');
    }

    const listing = await this.prisma.orgListing.findFirst({
      where: { id: listingId, organizationId },
      select: {
        id: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        listPrice: true,
        propertyType: true,
        bedrooms: true,
        bathrooms: true,
        squareFeet: true
      }
    });

    if (!listing) {
      throw new BadRequestException('Listing not found');
    }

    await this.ensureListingDescriptionPrompt(organizationId, userId);

    const variables = {
      property: {
        address: formatAddress(listing),
        price: formatMoney(listing.listPrice),
        bedrooms: typeof listing.bedrooms === 'number' ? String(listing.bedrooms) : '',
        bathrooms: typeof listing.bathrooms === 'number' ? String(listing.bathrooms) : '',
        sqft: typeof listing.squareFeet === 'number' ? formatNumber(listing.squareFeet) : '',
        yearBuilt: request.yearBuilt ? String(request.yearBuilt) : '',
        propertyType: (request.propertyType ?? listing.propertyType ?? '').toString(),
        features: Array.isArray(request.features) ? request.features.filter(Boolean) : [],
        recentUpdates: request.recentUpdates ?? '',
        neighborhood: request.neighborhood ?? '',
        views: request.views ?? ''
      },
      agent: {
        notes: request.agentNotes ?? ''
      },
      options: {
        tone: request.tone?.trim() ? request.tone.trim() : 'professional',
        maxLength: request.maxLength && Number.isFinite(request.maxLength) ? request.maxLength : undefined
      }
    };

    const response = await this.ai.complete({
      feature: AiFeature.LISTING_DESCRIPTION,
      promptTemplate: 'listing-description',
      variables,
      userId,
      brokerageId: organizationId,
      context: { entityType: 'listing', entityId: listing.id },
      options: { provider: 'grok', temperature: 0.6, maxTokens: 650 }
    });

    const complianceResult = await this.compliance.checkListingDescription(response.content);

    await this.prisma.aiGeneratedContent.create({
      data: {
        organizationId,
        userId,
        feature: AiFeature.LISTING_DESCRIPTION,
        promptTemplate: 'listing-description',
        requestId: response.id,
        generatedContent: response.content,
        originalRequest: request as unknown as Prisma.InputJsonValue,
        entityType: 'listing',
        entityId: listing.id,
        parentRequestId: meta?.parentRequestId ?? null
      }
    });

    return {
      description: response.content,
      compliance: complianceResult,
      usage: response.usage,
      requestId: response.id
    };
  }

  async regenerate(ctx: RequestContext, requestId: string, feedback?: string | null): Promise<ListingDescriptionResult> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const id = (requestId ?? '').trim();
    if (!id) throw new BadRequestException('requestId is required');

    const prior = await this.prisma.aiGeneratedContent.findFirst({
      where: { organizationId, requestId: id, feature: AiFeature.LISTING_DESCRIPTION },
      select: { generatedContent: true, originalRequest: true, entityId: true }
    });

    if (!prior) {
      throw new BadRequestException('AI request not found');
    }

    const original = coerceGenerateRequest(prior.originalRequest, prior.entityId);
    const regenerationNotes = buildRegenerationNotes({
      originalAgentNotes: original.agentNotes,
      feedback: feedback ?? undefined,
      previousDescription: prior.generatedContent
    });

    const nextRequest: GenerateListingDescriptionRequest = {
      ...original,
      agentNotes: regenerationNotes
    };

    return this.generate(ctx, nextRequest, { parentRequestId: id });
  }

  async submitFeedback(
    ctx: RequestContext,
    requestId: string,
    feedback: { rating?: number; comment?: string }
  ): Promise<void> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const id = (requestId ?? '').trim();
    if (!id) throw new BadRequestException('requestId is required');

    const exists = await this.prisma.aiGeneratedContent.findFirst({
      where: { organizationId, requestId: id, feature: AiFeature.LISTING_DESCRIPTION },
      select: { id: true }
    });
    if (!exists) {
      throw new BadRequestException('AI request not found');
    }

    const rating = typeof feedback.rating === 'number' && Number.isFinite(feedback.rating) ? Math.trunc(feedback.rating) : null;
    const comment = feedback.comment?.trim() ? feedback.comment.trim() : null;

    await this.prisma.aiFeedback.upsert({
      where: { requestId_userId: { requestId: id, userId } },
      create: {
        organizationId,
        userId,
        feature: AiFeature.LISTING_DESCRIPTION,
        requestId: id,
        rating,
        comment
      },
      update: {
        rating,
        comment
      }
    });
  }

  private async ensureListingDescriptionPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.LISTING_DESCRIPTION, name: 'listing-description' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.LISTING_DESCRIPTION, {
        organizationId,
        name: 'listing-description',
        systemPrompt: listingDescriptionPrompt.systemPrompt,
        userPromptTemplate: listingDescriptionPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 650,
        temperature: 0.6,
        description: 'Generates a Florida-compliant listing description from listing details.',
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.LISTING_DESCRIPTION, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.LISTING_DESCRIPTION, organizationId, existing.version);
    }
  }
}

function formatAddress(listing: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
}) {
  const line2 = listing.addressLine2?.trim();
  const street = line2 ? `${listing.addressLine1}, ${line2}` : listing.addressLine1;
  return `${street}, ${listing.city}, ${listing.state} ${listing.postalCode}`.trim();
}

function formatMoney(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `$${value}`;
  }
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  } catch {
    return String(value);
  }
}

function coerceGenerateRequest(input: unknown, fallbackListingId: string | null): GenerateListingDescriptionRequest {
  const base = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const listingId = typeof base.listingId === 'string' && base.listingId.trim() ? base.listingId.trim() : fallbackListingId?.trim() ?? '';
  if (!listingId) {
    throw new BadRequestException('Unable to regenerate: missing listingId');
  }

  const features = Array.isArray(base.features) ? base.features.map((item) => String(item)).filter(Boolean) : undefined;

  return {
    listingId,
    tone: typeof base.tone === 'string' ? base.tone : undefined,
    maxLength: typeof base.maxLength === 'number' ? base.maxLength : undefined,
    agentNotes: typeof base.agentNotes === 'string' ? base.agentNotes : undefined,
    features,
    recentUpdates: typeof base.recentUpdates === 'string' ? base.recentUpdates : undefined,
    neighborhood: typeof base.neighborhood === 'string' ? base.neighborhood : undefined,
    views: typeof base.views === 'string' ? base.views : undefined,
    yearBuilt: typeof base.yearBuilt === 'number' ? base.yearBuilt : undefined,
    propertyType: typeof base.propertyType === 'string' ? base.propertyType : undefined
  };
}

function buildRegenerationNotes(params: {
  originalAgentNotes?: string;
  feedback?: string;
  previousDescription: string;
}): string {
  const originalNotes = params.originalAgentNotes?.trim();
  const feedback = params.feedback?.trim();
  const previous = params.previousDescription?.trim();

  const parts: string[] = [];
  if (originalNotes) parts.push(originalNotes);

  const regenParts: string[] = [
    'Regeneration request:',
    '- Rewrite the listing description based on the feedback.',
    '- Keep all strict rules (Fair Housing, no guarantees, accuracy).',
    '- Do not invent features or amenities.',
    '- Do not include the previous description verbatim.'
  ];
  if (feedback) {
    regenParts.push('', 'Feedback:', feedback);
  }
  if (previous) {
    regenParts.push('', 'Previous description (for reference):', previous);
  }

  parts.push(regenParts.join('\n'));
  return parts.join('\n\n---\n\n').trim();
}
