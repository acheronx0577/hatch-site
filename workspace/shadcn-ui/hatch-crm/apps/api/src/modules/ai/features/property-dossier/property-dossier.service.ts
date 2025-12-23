import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@hatch/db';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';

import { PrismaService } from '@/modules/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { AiPromptService } from '@/modules/ai/foundation/services/ai-prompt.service';
import { AiFeature } from '@/modules/ai/foundation/types/ai-request.types';
import type { RequestContext } from '@/modules/common/request-context';
import { DocumentQaService } from '../document-qa/document-qa.service';
import { propertyDossierPrompt } from './property-dossier.prompt';
import type { GenerateDossierRequest, PropertyDossierResult } from './property-dossier.types';

type ListingData = {
  address: string;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
};

@Injectable()
export class PropertyDossierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly prompts: AiPromptService,
    private readonly documentQa: DocumentQaService
  ) {}

  async generate(ctx: RequestContext, request: GenerateDossierRequest): Promise<PropertyDossierResult> {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');
    const userId = ctx.userId?.trim();
    if (!userId) throw new BadRequestException('Missing user context');

    const listingId = request.listingId?.trim() || null;
    const addressInput = request.address?.trim() || null;

    const [listingData, documentSummaries] = await Promise.all([
      listingId ? this.getListingData(organizationId, listingId) : Promise.resolve(null),
      this.summarizeDocuments(ctx, organizationId, Array.isArray(request.documentIds) ? request.documentIds : [])
    ]);

    const address = addressInput || listingData?.address || '';
    if (!address) {
      throw new BadRequestException('address is required (or provide listingId)');
    }

    await this.ensurePropertyDossierPrompt(organizationId, userId);

    const variables = {
      address,
      listingData: listingData
        ? {
            price: listingData.price,
            bedrooms: listingData.bedrooms,
            bathrooms: listingData.bathrooms,
            sqft: listingData.sqft,
            yearBuilt: listingData.yearBuilt ?? 'Unknown',
            propertyType: listingData.propertyType ?? 'Unknown'
          }
        : null,
      inspectionSummary: documentSummaries.inspection,
      appraisalSummary: documentSummaries.appraisal,
      hoaSummary: documentSummaries.hoa,
      additionalNotes: request.notes?.trim() || ''
    };

    const completion = await this.ai.complete({
      feature: AiFeature.PROPERTY_DOSSIER,
      promptTemplate: 'property-dossier',
      variables,
      userId,
      brokerageId: organizationId,
      context: listingId ? { entityType: 'listing', entityId: listingId } : undefined,
      options: { provider: 'grok', responseFormat: 'json_object', temperature: 0.25, maxTokens: 1300 }
    });

    const dossier = safeJsonParse(completion.content);

    const saved = await this.prisma.propertyDossier.create({
      data: {
        organizationId,
        listingId,
        address,
        dossier: dossier as unknown as Prisma.InputJsonValue,
        sourceDocumentIds: Array.isArray(request.documentIds) ? request.documentIds.filter(Boolean) : [],
        generatedById: userId
      }
    });

    return { dossier: saved, requestId: completion.id };
  }

  async getById(ctx: RequestContext, dossierId: string) {
    const organizationId = ctx.orgId?.trim();
    if (!organizationId) throw new BadRequestException('Missing organization context');

    const id = (dossierId ?? '').trim();
    if (!id) throw new BadRequestException('id is required');

    const dossier = await this.prisma.propertyDossier.findFirst({
      where: { id, organizationId }
    });
    if (!dossier) throw new BadRequestException('Dossier not found');
    return dossier;
  }

  async exportDossier(ctx: RequestContext, dossierId: string, format: 'pdf' | 'docx'): Promise<Buffer> {
    const dossierRecord = await this.getById(ctx, dossierId);
    const dossier = (dossierRecord.dossier as any) ?? {};
    const lines = renderDossierLines(dossierRecord.address, dossier);

    if (format === 'pdf') {
      return this.renderPdf(lines);
    }
    if (format === 'docx') {
      return this.renderDocx(lines);
    }
    throw new BadRequestException('Invalid export format');
  }

  private async ensurePropertyDossierPrompt(organizationId: string, userId: string) {
    const existing = await this.prisma.aiPromptTemplate.findFirst({
      where: { organizationId, feature: AiFeature.PROPERTY_DOSSIER, name: 'property-dossier' },
      orderBy: { version: 'desc' },
      select: { version: true, isActive: true }
    });

    if (!existing) {
      const created = await this.prompts.createVersion(AiFeature.PROPERTY_DOSSIER, {
        organizationId,
        name: 'property-dossier',
        systemPrompt: propertyDossierPrompt.systemPrompt,
        userPromptTemplate: propertyDossierPrompt.userPromptTemplate,
        provider: 'grok',
        model: null,
        maxTokens: 1300,
        temperature: 0.25,
        description: 'Generates a structured property dossier JSON from listing and document summaries.',
        createdByUserId: userId,
        isDefault: true
      });
      await this.prompts.activateVersion(AiFeature.PROPERTY_DOSSIER, organizationId, created.version);
      return;
    }

    if (!existing.isActive) {
      await this.prompts.activateVersion(AiFeature.PROPERTY_DOSSIER, organizationId, existing.version);
    }
  }

  private async getListingData(organizationId: string, listingId: string): Promise<ListingData> {
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

    return {
      address: formatAddress(listing),
      price: typeof listing.listPrice === 'number' ? listing.listPrice : null,
      bedrooms: typeof listing.bedrooms === 'number' ? listing.bedrooms : null,
      bathrooms: typeof listing.bathrooms === 'number' ? listing.bathrooms : null,
      sqft: typeof listing.squareFeet === 'number' ? listing.squareFeet : null,
      yearBuilt: null,
      propertyType: listing.propertyType ?? null
    };
  }

  private async summarizeDocuments(ctx: RequestContext, organizationId: string, documentIds: string[]) {
    const ids = Array.from(new Set(documentIds.map((id) => (id ?? '').trim()).filter(Boolean))).slice(0, 8);
    if (!ids.length) {
      return { inspection: '', appraisal: '', hoa: '' };
    }

    const docs = await this.prisma.documentUpload.findMany({
      where: { id: { in: ids }, organizationId, status: 'ready' },
      select: { id: true, documentType: true }
    });

    const summariesByType: Record<'inspection' | 'appraisal' | 'hoa', string[]> = {
      inspection: [],
      appraisal: [],
      hoa: []
    };

    for (const doc of docs) {
      const type = (doc.documentType ?? '').trim().toLowerCase();
      if (type !== 'inspection' && type !== 'appraisal' && type !== 'hoa') {
        continue;
      }

      const summary = await this.documentQa.summarizeDocument(ctx, { documentId: doc.id });
      summariesByType[type].push(summary.summary);
    }

    return {
      inspection: summariesByType.inspection.join('\n\n---\n\n').trim(),
      appraisal: summariesByType.appraisal.join('\n\n---\n\n').trim(),
      hoa: summariesByType.hoa.join('\n\n---\n\n').trim()
    };
  }

  private async renderPdf(lines: string[]): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 48;
    const fontSize = 11;
    const lineHeight = 14;

    let page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    for (const line of lines) {
      const isHeader = line.startsWith('## ');
      const text = isHeader ? line.slice(3) : line;
      const useFont = isHeader ? fontBold : font;
      const useSize = isHeader ? 13 : fontSize;
      const wrapped = wrapLine(text, useFont, useSize, pageWidth - margin * 2);

      for (const segment of wrapped) {
        if (y < margin) {
          page = doc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }

        page.drawText(segment, {
          x: margin,
          y,
          size: useSize,
          font: useFont,
          color: rgb(0.1, 0.1, 0.1)
        });
        y -= lineHeight;
      }

      if (isHeader) {
        y -= 6;
      }
    }

    return Buffer.from(await doc.save());
  }

  private async renderDocx(lines: string[]): Promise<Buffer> {
    const children: Paragraph[] = [];

    for (const line of lines) {
      const isHeader = line.startsWith('## ');
      const text = isHeader ? line.slice(3) : line;
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: isHeader
            })
          ]
        })
      );
    }

    const doc = new DocxDocument({
      sections: [
        {
          properties: {},
          children
        }
      ]
    });

    return Packer.toBuffer(doc);
  }
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new BadRequestException(`Invalid JSON returned by AI: ${(error as Error).message}`);
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

function renderDossierLines(address: string, dossier: any): string[] {
  const lines: string[] = [];

  lines.push('## Property Dossier');
  lines.push(`Address: ${address}`);
  lines.push('');

  if (typeof dossier?.summary === 'string' && dossier.summary.trim()) {
    lines.push('## Executive Summary');
    lines.push(dossier.summary.trim());
    lines.push('');
  }

  lines.push('## Property Overview');
  lines.push(...renderKeyValues(dossier?.propertyOverview));
  lines.push('');

  lines.push('## Financials');
  lines.push(...renderKeyValues(dossier?.financials));
  lines.push('');

  lines.push('## Condition');
  lines.push(...renderKeyValues(dossier?.condition));
  lines.push('');

  lines.push('## Location');
  lines.push(...renderKeyValues(dossier?.location));
  lines.push('');

  lines.push('## Risks');
  if (Array.isArray(dossier?.risks) && dossier.risks.length) {
    for (const risk of dossier.risks) {
      lines.push(`- ${risk?.type ?? 'Risk'} (${risk?.severity ?? 'unknown'}): ${risk?.description ?? ''}`.trim());
      if (risk?.recommendation) {
        lines.push(`  Recommendation: ${risk.recommendation}`);
      }
    }
  } else {
    lines.push('No risks listed.');
  }
  lines.push('');

  lines.push('## Questions To Ask');
  if (Array.isArray(dossier?.questionsToAsk) && dossier.questionsToAsk.length) {
    for (const q of dossier.questionsToAsk) {
      lines.push(`- ${String(q ?? '').trim()}`.trim());
    }
  } else {
    lines.push('No questions listed.');
  }

  return lines.filter((line) => line !== undefined);
}

function renderKeyValues(section: any): string[] {
  if (!section || typeof section !== 'object') {
    return ['Not provided.'];
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(section)) {
    if (Array.isArray(value)) {
      const items = value.map((item) => String(item)).filter(Boolean);
      lines.push(`${humanizeKey(key)}: ${items.length ? items.join(', ') : 'None'}`);
      continue;
    }
    if (value && typeof value === 'object') {
      lines.push(`${humanizeKey(key)}: ${JSON.stringify(value)}`);
      continue;
    }
    lines.push(`${humanizeKey(key)}: ${value ?? 'Unknown'}`);
  }

  return lines.length ? lines : ['Not provided.'];
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function wrapLine(text: string, font: any, size: number, maxWidth: number): string[] {
  const raw = (text ?? '').toString();
  if (!raw) return [''];

  const words = raw.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines: string[] = [];
  let current = '';

  const push = () => {
    if (current.trim()) lines.push(current.trim());
    current = '';
  };

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth) {
      current = next;
      continue;
    }

    if (!current) {
      lines.push(word);
      continue;
    }

    push();
    current = word;
  }

  push();

  return lines.length ? lines : [raw];
}

