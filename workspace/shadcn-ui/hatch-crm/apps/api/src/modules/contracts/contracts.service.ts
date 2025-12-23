import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContractInstanceStatus, OrgListingContactType, Prisma, SignatureEnvelopeStatus } from '@hatch/db';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts, rgb } from 'pdf-lib';
import pdfParseModule from 'pdf-parse';
import { Readable } from 'stream';

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

type PdfParseScreenshotPage = {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  data: Uint8Array;
};

type PdfParseScreenshotResult = {
  total: number;
  pages: PdfParseScreenshotPage[];
};

type PdfParsePageProxy = {
  getViewport: (params: { scale: number }) => { width: number; height: number; transform: number[] };
  getTextContent: (params: { includeMarkedContent: boolean; disableNormalization: boolean }) => Promise<{ items: any[] }>;
  cleanup?: () => void;
};

type PdfParseDocumentProxy = {
  getPage: (pageNumber: number) => Promise<PdfParsePageProxy>;
};

type PdfParseParser = {
  load: () => Promise<unknown>;
  doc?: PdfParseDocumentProxy;
  getScreenshot: (options: { scale?: number; imageBuffer?: boolean; imageDataUrl?: boolean }) => Promise<PdfParseScreenshotResult>;
};

type PdfParseCtor = new (input: { data: Buffer }) => PdfParseParser;

const PdfParseCtor =
  (pdfParseModule as unknown as { PDFParse?: PdfParseCtor }).PDFParse ?? null;

const CONTRACT_PARTY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  primaryEmail: true,
  primaryPhone: true
} as const;

const INSTANCE_INCLUDE = {
  template: true,
  envelope: true,
  buyerPerson: { select: CONTRACT_PARTY_SELECT },
  sellerPerson: { select: CONTRACT_PARTY_SELECT }
} satisfies Prisma.ContractInstanceInclude;

type InstanceWithRelations = Prisma.ContractInstanceGetPayload<{
  include: typeof INSTANCE_INCLUDE;
}>;

const DEFAULT_EDITABLE_KEYS = new Set<string>([
  'PRICE',
  'PURCHASE_PRICE',
  'ESCROW_AMOUNT',
  'CLOSING_DATE',
  'INSPECTION_PERIOD',
  'OFFER_DATE',
  'EFFECTIVE_DATE',
  'SPECIAL_TERMS',
  'PROPERTY_ADDRESS',
  'PROPERTY_CITY',
  'PROPERTY_STATE',
  'PROPERTY_POSTAL_CODE',
  'BUYER_NAME',
  'BUYER_EMAIL',
  'BUYER_PHONE',
  'SELLER_NAME',
  'SELLER_EMAIL',
  'SELLER_PHONE',
  'LISTING_AGENT_NAME',
  'LISTING_AGENT_EMAIL',
  'BROKER_NAME',
  'BROKER_EMAIL'
]);

const MAX_OVERLAY_BOXES = 2000;

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private s3NotConfiguredPdf: Buffer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly autofill: ContractsAutofillService,
    private readonly recommendations: ContractsRecommendationService,
    private readonly docusign: ContractsDocuSignService,
    private readonly config: ConfigService
  ) {}

  private async getS3NotConfiguredPdf(): Promise<Buffer> {
    if (this.s3NotConfiguredPdf) return this.s3NotConfiguredPdf;

    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await doc.embedFont(StandardFonts.Helvetica);

    const title = 'PDF unavailable in local dev';
    const lines = [
      'This contract PDF is stored in S3, but the API is not configured with a bucket.',
      '',
      'Set `AWS_S3_BUCKET_DOCS` (or `AWS_S3_BUCKET`) and AWS credentials, then restart the API.',
      '',
      'Once configured, reload this page.'
    ];

    let y = 740;
    page.drawText(title, { x: 54, y, size: 18, font: titleFont, color: rgb(0.12, 0.12, 0.12) });
    y -= 32;

    for (const line of lines) {
      page.drawText(line, { x: 54, y, size: 12, font: bodyFont, color: rgb(0.2, 0.2, 0.2) });
      y -= 18;
    }

    this.s3NotConfiguredPdf = Buffer.from(await doc.save());
    return this.s3NotConfiguredPdf;
  }

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

  private draftS3KeyForInstance(orgId: string, instanceId: string) {
    return `contracts/${orgId}/drafts/${instanceId}.pdf`;
  }

  private normalizePdfFieldName(value: string) {
    return value.replace(/[^a-z0-9]+/gi, '').toUpperCase();
  }

  private coercePdfValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private isTruthyPdfValue(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['true', 'yes', 'y', '1', 'on', 'checked', 'x'].includes(normalized);
    }
    return Boolean(value);
  }

  private multiplyPdfTransforms(a: number[], b: number[]) {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5]
    ];
  }

  private truncateTextToWidth(value: string, maxWidth: number, font: any, fontSize: number) {
    if (!value || !Number.isFinite(maxWidth) || maxWidth <= 0) return '';
    if (!font || typeof font.widthOfTextAtSize !== 'function') return value;
    if (font.widthOfTextAtSize(value, fontSize) <= maxWidth) return value;
    let next = value;
    while (next.length > 0 && font.widthOfTextAtSize(next, fontSize) > maxWidth) {
      next = next.slice(0, -1);
    }
    return next.trim();
  }

  private buildRasterOverlayValues(fieldValues: Record<string, unknown>) {
    const pick = (key: string) => {
      const raw = fieldValues?.[key];
      const value = this.coercePdfValue(raw).trim();
      return value.length > 0 ? value : null;
    };

    const values: Record<string, string> = {};
    const seller = pick('SELLER_NAME');
    const buyer = pick('BUYER_NAME');
    const property = pick('PROPERTY_ADDRESS');

    if (seller) values.SELLER_NAME = seller;
    if (buyer) values.BUYER_NAME = buyer;
    if (property) values.PROPERTY_ADDRESS = property;

    return values;
  }

  private readOverlayBoxes(fieldValues: Record<string, unknown>) {
    const raw = (fieldValues as any)?.__overlay;
    if (!raw || typeof raw !== 'object') return null;
    const version = (raw as any)?.version;
    if (version !== 1) return null;
    const boxesRaw = (raw as any)?.boxes;
    if (!Array.isArray(boxesRaw)) return null;

    const boxes: Array<{
      id: string;
      page: number;
      x: number;
      y: number;
      w: number;
      h: number;
      key?: string | null;
      value?: unknown;
      fontSize?: number | null;
      erase?: boolean;
    }> = [];

    for (const entry of boxesRaw.slice(0, MAX_OVERLAY_BOXES)) {
      if (!entry || typeof entry !== 'object') continue;
      const id = typeof (entry as any).id === 'string' ? (entry as any).id : '';
      const page = (entry as any).page;
      const x = (entry as any).x;
      const y = (entry as any).y;
      const w = (entry as any).w;
      const h = (entry as any).h;
      if (!id) continue;
      if (typeof page !== 'number' || !Number.isFinite(page) || page < 1) continue;
      if (typeof x !== 'number' || !Number.isFinite(x)) continue;
      if (typeof y !== 'number' || !Number.isFinite(y)) continue;
      if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) continue;
      if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) continue;

      const key = typeof (entry as any).key === 'string' ? (entry as any).key : null;
      const eraseRaw = (entry as any).erase;
      const erase = typeof eraseRaw === 'boolean' ? eraseRaw : false;
      const fontSizeRaw = (entry as any).fontSize;
      const fontSize =
        typeof fontSizeRaw === 'number' && Number.isFinite(fontSizeRaw) && fontSizeRaw > 0
          ? fontSizeRaw
          : null;

      boxes.push({
        id,
        page: Math.floor(page),
        x,
        y,
        w,
        h,
        key: key?.trim() ? key.trim() : null,
        value: (entry as any).value,
        fontSize,
        erase
      });
    }

    return boxes;
  }

  private async tryRenderAcroformDraftPdf(params: {
    orgId: string;
    instanceId: string;
    templateS3Key: string;
    fieldValues: Record<string, unknown>;
  }): Promise<string | null> {
    const templateKey = params.templateS3Key?.trim();
    if (!templateKey || !templateKey.toLowerCase().endsWith('.pdf')) {
      return null;
    }

    try {
      const bytes = await this.s3.getObjectBuffer(templateKey);
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      if (fields.length === 0) {
        return null;
      }

      const byName = new Map<string, (typeof fields)[number]>();
      const byNormalized = new Map<string, (typeof fields)[number]>();

      for (const field of fields) {
        const name = field.getName();
        byName.set(name, field);
        const normalized = this.normalizePdfFieldName(name);
        if (normalized && !byNormalized.has(normalized)) {
          byNormalized.set(normalized, field);
        }
      }

      const values = params.fieldValues ?? {};
      for (const [rawKey, rawValue] of Object.entries(values)) {
        const key = rawKey ?? '';
        if (!key) continue;
        const field =
          byName.get(key) ??
          byNormalized.get(this.normalizePdfFieldName(key)) ??
          null;
        if (!field) continue;

        try {
          if (field instanceof PDFTextField) {
            field.setText(this.coercePdfValue(rawValue));
          } else if (field instanceof PDFCheckBox) {
            if (this.isTruthyPdfValue(rawValue)) field.check();
            else field.uncheck();
          } else if (field instanceof PDFDropdown || field instanceof PDFOptionList || field instanceof PDFRadioGroup) {
            const text = this.coercePdfValue(rawValue).trim();
            if (text.length > 0) {
              (field as PDFDropdown | PDFOptionList | PDFRadioGroup).select(text);
            }
          } else if (typeof (field as any)?.setText === 'function') {
            (field as any).setText(this.coercePdfValue(rawValue));
          }
        } catch (error) {
          this.logger.warn(`Failed to fill PDF field "${key}": ${this.formatError(error)}`);
        }
      }

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      form.updateFieldAppearances(font);

      const overlayBoxes = this.readOverlayBoxes(values) ?? [];
      if (overlayBoxes.length > 0) {
        const pages = pdfDoc.getPages();
        const padding = 6;
        const defaultFontSize = 10;

        for (const box of overlayBoxes) {
          const resolvedKey = box.key?.trim() ?? '';
          const hasKey = resolvedKey.length > 0;
          const isManualOverride = hasKey && box.value !== undefined;
          const isFreeText = !hasKey;
          if (!isManualOverride && !isFreeText) continue;

          const page = pages[box.page - 1];
          if (!page) continue;

          if (box.value === undefined) continue;
          const rawValue = this.coercePdfValue(box.value);
          const value = rawValue.replace(/\s+/g, ' ').trim();
          if (!value) continue;

          const fontSize = box.fontSize ?? defaultFontSize;
          const erase = Boolean(box.erase);
          const boxPadding = erase ? 0 : padding;
          const maxWidth = Math.max(0, box.w - boxPadding * 2);
          const drawnValue = maxWidth > 0 ? this.truncateTextToWidth(value, maxWidth, font, fontSize) : value;
          if (!drawnValue) continue;

          const pageHeight = page.getHeight();
          const pageWidth = page.getWidth();
          const x = box.x + boxPadding;
          const y = pageHeight - box.y - boxPadding - fontSize;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          if (x < 0 || y < 0 || x > pageWidth || y > pageHeight) continue;

          if (erase) {
            const rectX = box.x;
            const rectY = pageHeight - box.y - box.h;
            if (Number.isFinite(rectX) && Number.isFinite(rectY)) {
              page.drawRectangle({ x: rectX, y: rectY, width: box.w, height: box.h, color: rgb(1, 1, 1) });
            }
          }

          page.drawText(drawnValue, { x, y, size: fontSize, font });
        }
      }

      const outputKey = this.draftS3KeyForInstance(params.orgId, params.instanceId);
      const filledBytes = await pdfDoc.save();

      await this.s3.putObject({
        key: outputKey,
        body: Buffer.from(filledBytes),
        contentType: 'application/pdf'
      });

      return outputKey;
    } catch (error) {
      this.logger.warn(`Failed to render filled draft PDF for template "${templateKey}": ${this.formatError(error)}`);
      return null;
    }
  }

  private async tryRenderRasterizedDraftPdf(params: {
    orgId: string;
    instanceId: string;
    templateS3Key: string;
    fieldValues: Record<string, unknown>;
  }): Promise<string | null> {
    if (!PdfParseCtor) {
      return null;
    }

    const templateKey = params.templateS3Key?.trim();
    if (!templateKey || !templateKey.toLowerCase().endsWith('.pdf')) {
      return null;
    }

    const fieldValues = params.fieldValues ?? {};
    const overlayBoxes = this.readOverlayBoxes(fieldValues) ?? [];
    const overlayValues = this.buildRasterOverlayValues(fieldValues);
    const boxKeys = new Set(
      overlayBoxes
        .map((box) => box.key)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    );

    const hasBoxes = overlayBoxes.length > 0;
    const hasOverlayValues = Object.keys(overlayValues).length > 0;
    if (!hasBoxes && !hasOverlayValues) {
      return null;
    }

    try {
      const bytes = await this.s3.getObjectBuffer(templateKey);
      const parser = new PdfParseCtor({ data: bytes });
      await parser.load();

      const screenshots = await parser.getScreenshot({
        scale: 2,
        imageBuffer: true,
        imageDataUrl: false
      });

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const defaultFontSize = 10;
      const padding = 6;

      for (const pageInfo of screenshots.pages ?? []) {
        const scale = Number.isFinite(pageInfo.scale) && pageInfo.scale > 0 ? pageInfo.scale : 1;
        const pageWidth = pageInfo.width / scale;
        const pageHeight = pageInfo.height / scale;

        const png = await pdfDoc.embedPng(Buffer.from(pageInfo.data));
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        page.drawImage(png, { x: 0, y: 0, width: pageWidth, height: pageHeight });

        const boxesForPage = overlayBoxes.filter((box) => box.page === pageInfo.pageNumber);
        if (boxesForPage.length > 0) {
          for (const box of boxesForPage) {
            const erase = Boolean(box.erase);
            const boxPadding = erase ? 0 : padding;
            const resolvedKey = box.key?.trim() ?? '';
            const keyValue =
              resolvedKey.length > 0 ? this.coercePdfValue(fieldValues?.[resolvedKey]).trim() : '';
            const boxValueRaw = box.value;
            const rawValue = boxValueRaw === undefined ? keyValue : this.coercePdfValue(boxValueRaw);
            const value = rawValue.replace(/\s+/g, ' ').trim();
            if (!value) continue;

            const fontSize = box.fontSize ?? defaultFontSize;
            const maxWidth = Math.max(0, box.w - boxPadding * 2);
            const drawnValue = maxWidth > 0 ? this.truncateTextToWidth(value, maxWidth, font, fontSize) : value;
            if (!drawnValue) continue;

            const x = box.x + boxPadding;
            const y = pageHeight - box.y - boxPadding - fontSize;
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < 0 || y < 0 || x > pageWidth || y > pageHeight) continue;

            if (erase) {
              const rectX = box.x;
              const rectY = pageHeight - box.y - box.h;
              if (Number.isFinite(rectX) && Number.isFinite(rectY)) {
                page.drawRectangle({ x: rectX, y: rectY, width: box.w, height: box.h, color: rgb(1, 1, 1) });
              }
            }

            page.drawText(drawnValue, { x, y, size: fontSize, font });
          }
        }

        const originalPage = parser.doc?.getPage ? await parser.doc.getPage(pageInfo.pageNumber) : null;
        if (!originalPage) {
          continue;
        }

        const viewport = originalPage.getViewport({ scale: 1 });
        const content = await originalPage.getTextContent({ includeMarkedContent: false, disableNormalization: false });

        const rules = [
          { key: 'SELLER_NAME', label: 'SELLER:', match: (text: string) => text.toUpperCase().startsWith('SELLER:') },
          { key: 'BUYER_NAME', label: 'BUYER:', match: (text: string) => text.toUpperCase().startsWith('BUYER:') },
          { key: 'PROPERTY_ADDRESS', label: 'PROPERTY:', match: (text: string) => text.toUpperCase().startsWith('PROPERTY:') }
        ] as const;

        for (const rule of rules) {
          if (boxKeys.has(rule.key)) continue;
          const value = overlayValues[rule.key];
          if (!value) continue;

          const anchor = (content.items ?? []).find((item: any) => {
            const raw = typeof item?.str === 'string' ? item.str.trim() : '';
            return raw.length > 0 && rule.match(raw);
          });

          if (!anchor || !Array.isArray(anchor.transform)) {
            continue;
          }

          const transform = this.multiplyPdfTransforms(viewport.transform, anchor.transform);
          const x0 = transform[4];
          const y0 = transform[5];
          const labelWidth = font.widthOfTextAtSize(rule.label, defaultFontSize);
          const maxWidth =
            typeof anchor.width === 'number' && Number.isFinite(anchor.width)
              ? Math.max(0, anchor.width - labelWidth - padding * 2)
              : null;
          const drawnValue = maxWidth ? this.truncateTextToWidth(value, maxWidth, font, defaultFontSize) : value;

          if (!drawnValue) continue;

          const x = x0 + labelWidth + padding;
          const y = pageHeight - y0 - defaultFontSize;

          page.drawText(drawnValue, { x, y, size: defaultFontSize, font });
        }

        originalPage.cleanup?.();
      }

      const outputKey = this.draftS3KeyForInstance(params.orgId, params.instanceId);
      const filledBytes = await pdfDoc.save();

      await this.s3.putObject({
        key: outputKey,
        body: Buffer.from(filledBytes),
        contentType: 'application/pdf'
      });

      return outputKey;
    } catch (error) {
      this.logger.warn(`Failed to render rasterized draft PDF for template "${templateKey}": ${this.formatError(error)}`);
      return null;
    }
  }

  private async tryRenderFilledDraftPdf(params: {
    orgId: string;
    instanceId: string;
    templateS3Key: string;
    fieldValues: Record<string, unknown>;
  }): Promise<string | null> {
    const acroKey = await this.tryRenderAcroformDraftPdf(params);
    if (acroKey) {
      return acroKey;
    }

    return this.tryRenderRasterizedDraftPdf(params);
  }

  async listInstances(orgId: string, query: ListInstancesQueryDto) {
    const instances = await this.prisma.contractInstance.findMany({
      where: {
        organizationId: orgId,
        orgListingId: query.propertyId ?? undefined,
        orgTransactionId: query.transactionId ?? undefined,
        ...(query.contactId
          ? {
              OR: [{ buyerPersonId: query.contactId }, { sellerPersonId: query.contactId }]
            }
          : {}),
        status: query.status ?? undefined
      },
      include: INSTANCE_INCLUDE,
      orderBy: { updatedAt: 'desc' }
    });

    return Promise.all(instances.map((instance) => this.toInstanceView(instance)));
  }

  async getInstance(orgId: string, id: string) {
    const instance = await this.prisma.contractInstance.findFirst({
      where: { id, organizationId: orgId },
      include: INSTANCE_INCLUDE
    });
    if (!instance) {
      throw new NotFoundException('Contract not found');
    }
    return this.toInstanceView(instance, true);
  }

  async getInstancePdfStream(orgId: string, id: string, kind?: string) {
    const instance = await this.prisma.contractInstance.findFirst({
      where: { id, organizationId: orgId },
      include: { template: true }
    });
    if (!instance) {
      throw new NotFoundException('Contract not found');
    }

    const normalizedKind = (kind ?? 'draft').toLowerCase();
    const templateKey = (instance.template as any)?.s3Key ?? null;

    let key: string | null = null;
    if (normalizedKind === 'signed') {
      key = instance.signedS3Key ?? null;
    } else if (normalizedKind === 'template') {
      key = templateKey;
    } else {
      key = instance.draftS3Key ?? templateKey;
    }

    if (!key) {
      throw new NotFoundException('Contract PDF not found');
    }

    const baseName = String(instance.title ?? 'contract')
      .replace(/[\\/:*?"<>|]+/g, '')
      .trim();
    const fileName = (baseName.length ? baseName : 'contract').toLowerCase().endsWith('.pdf')
      ? baseName
      : `${baseName || 'contract'}.pdf`;

    if (!this.s3.isConfigured()) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'Contract PDFs are unavailable because AWS_S3_BUCKET is not configured.'
        );
      }

      this.logger.warn('AWS_S3_BUCKET is not configured; serving placeholder PDF.');
      const placeholder = await this.getS3NotConfiguredPdf();
      return {
        stream: Readable.from(placeholder),
        mimeType: 'application/pdf',
        fileName,
        s3Key: key
      };
    }

    const stream = await this.s3.getObjectStream(key);
    return {
      stream,
      mimeType: 'application/pdf',
      fileName,
      s3Key: key
    };
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

    const transaction = await this.assertTransaction(orgId, dto.transactionId);
    const listing = dto.propertyId
      ? await this.assertListing(orgId, dto.propertyId)
      : transaction?.listingId
        ? await this.assertListing(orgId, transaction.listingId)
        : null;

    const listingId = listing?.id ?? undefined;
    const transactionId = transaction?.id ?? (dto.transactionId ?? undefined);

    const { buyerPersonId, sellerPersonId } = await this.resolveContractPartyIds({
      orgId,
      listingId,
      transaction,
      buyerPersonId: dto.buyerPersonId,
      sellerPersonId: dto.sellerPersonId
    });

    const autofillResult = await this.autofill.autofillTemplateToDraft({
      orgId,
      templateId: template.id,
      listingId,
      transactionId,
      buyerPersonId,
      sellerPersonId,
      overrideFieldValues: dto.overrideFieldValues
    });

    const created = await this.prisma.contractInstance.create({
      data: {
        organizationId: orgId,
        templateId: template.id,
        orgListingId: listingId,
        orgTransactionId: transactionId,
        buyerPersonId,
        sellerPersonId,
        createdByUserId: userId,
        title: dto.title ?? template.name,
        status: ContractInstanceStatus.DRAFT,
        draftS3Key: autofillResult.draftS3Key ?? template.s3Key ?? null,
        fieldValues: autofillResult.fieldValues as Prisma.InputJsonValue,
        recommendationReason: dto.recommendationReason ?? null
      },
      include: INSTANCE_INCLUDE
    });

    let instanceWithDraft = created;
    const renderedDraftKey = await this.tryRenderFilledDraftPdf({
      orgId,
      instanceId: created.id,
      templateS3Key: template.s3Key,
      fieldValues: (autofillResult.fieldValues ?? {}) as Record<string, unknown>
    });

    if (renderedDraftKey) {
      instanceWithDraft = await this.prisma.contractInstance.update({
        where: { id: created.id },
        data: { draftS3Key: renderedDraftKey },
        include: INSTANCE_INCLUDE
      });
    }

    return {
      ...(await this.toInstanceView(instanceWithDraft, true)),
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
        if (key === '__overlay') {
          nextFieldValues.__overlay = value;
          continue;
        }
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
      include: INSTANCE_INCLUDE
    });

    let instanceWithDraft = updated;
    const templateKey = updated.template?.s3Key;
    if (templateKey) {
      const renderedDraftKey = await this.tryRenderFilledDraftPdf({
        orgId,
        instanceId: updated.id,
        templateS3Key: templateKey,
        fieldValues: nextFieldValues
      });
      if (renderedDraftKey) {
        instanceWithDraft = await this.prisma.contractInstance.update({
          where: { id },
          data: { draftS3Key: renderedDraftKey },
          include: INSTANCE_INCLUDE
        });
      }
    }

    return this.toInstanceView(instanceWithDraft, true);
  }

  async sendForSignature(orgId: string, id: string, dto: SendForSignatureDto) {
    const instance = await this.prisma.contractInstance.findFirst({
      where: { id, organizationId: orgId },
      include: INSTANCE_INCLUDE
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
      include: INSTANCE_INCLUDE
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

  private async resolveContractPartyIds(params: {
    orgId: string;
    listingId?: string;
    transaction: { buyerPersonId?: string | null; sellerPersonId?: string | null } | null;
    buyerPersonId?: string | null;
    sellerPersonId?: string | null;
  }) {
    let buyerPersonId = params.buyerPersonId ?? params.transaction?.buyerPersonId ?? undefined;
    let sellerPersonId = params.sellerPersonId ?? params.transaction?.sellerPersonId ?? undefined;

    if (params.listingId && (!buyerPersonId || !sellerPersonId)) {
      const links = await this.prisma.orgListingContact.findMany({
        where: {
          listingId: params.listingId,
          type: { in: [OrgListingContactType.BUYING, OrgListingContactType.SELLING] }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!buyerPersonId) {
        buyerPersonId = links.find((link) => link.type === OrgListingContactType.BUYING)?.personId ?? undefined;
      }
      if (!sellerPersonId) {
        sellerPersonId = links.find((link) => link.type === OrgListingContactType.SELLING)?.personId ?? undefined;
      }
    }

    const buyer = await this.assertActivePersonInOrg(params.orgId, buyerPersonId);
    const seller = await this.assertActivePersonInOrg(params.orgId, sellerPersonId);

    return {
      buyerPersonId: buyer?.id ?? undefined,
      sellerPersonId: seller?.id ?? undefined
    };
  }

  private async assertActivePersonInOrg(orgId: string, personId?: string | null) {
    if (!personId) return null;
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: orgId, deletedAt: null },
      select: { id: true }
    });
    if (!person) {
      throw new NotFoundException('Contact not found in this organization');
    }
    return person;
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
      withUrls && instance.draftS3Key ? await this.safePresignUrl(instance.draftS3Key) : null;
    const signedUrl =
      withUrls && instance.signedS3Key ? await this.safePresignUrl(instance.signedS3Key) : null;

    const templateEditable = (instance.template as any)?.editableKeys;
    const editableKeys = Array.isArray(templateEditable)
      ? (templateEditable as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : Array.from(DEFAULT_EDITABLE_KEYS);

    const toContact = (person: typeof instance.buyerPerson | null | undefined) =>
      person
        ? {
            id: person.id,
            firstName: person.firstName,
            lastName: person.lastName,
            fullName: `${person.firstName} ${person.lastName}`.trim(),
            primaryEmail: person.primaryEmail ?? null,
            primaryPhone: person.primaryPhone ?? null
          }
        : null;

    return {
      id: instance.id,
      organizationId: instance.organizationId,
      templateId: instance.templateId,
      orgListingId: instance.orgListingId,
      orgTransactionId: instance.orgTransactionId,
      buyerPersonId: instance.buyerPersonId ?? null,
      sellerPersonId: instance.sellerPersonId ?? null,
      buyerPerson: toContact(instance.buyerPerson),
      sellerPerson: toContact(instance.sellerPerson),
      title: instance.title,
      status: instance.status,
      editableKeys,
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
