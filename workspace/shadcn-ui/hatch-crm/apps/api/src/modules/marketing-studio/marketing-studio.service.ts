import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MarketingStudioTemplateVariant, Prisma } from '@hatch/db';
import { randomUUID } from 'crypto';
import {
  PDFDocument,
  StandardFonts,
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb
} from 'pdf-lib';

import { z } from 'zod';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import {
  ORG_ADDON_MARKETING_STUDIO
} from './constants';
import { CreateMarketingStudioTemplateDto } from './dto/create-template.dto';
import { GenerateMarketingStudioAssetDto } from './dto/generate-asset.dto';
import { PresignMarketingStudioTemplateDto } from './dto/presign-template.dto';

const templateSchema = z.object({
  page: z
    .object({
      width: z.number().positive(),
      height: z.number().positive()
    })
    .optional(),
  imageSlots: z
    .array(
      z.object({
        id: z.string().min(1),
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
        fit: z.enum(['cover', 'contain']).optional().default('cover')
      })
    )
    .default([]),
  textSlots: z
    .array(
      z.object({
        id: z.string().min(1),
        x: z.number(),
        y: z.number(),
        size: z.number().positive().optional().default(12),
        color: z.string().optional(),
        maxWidth: z.number().positive().optional(),
        align: z.enum(['left', 'center', 'right']).optional().default('left')
      })
    )
    .default([]),
  watermark: z
    .object({
      enabled: z.boolean().optional().default(false),
      text: z.string().optional().default(''),
      opacity: z.number().min(0).max(1).optional().default(0.12),
      size: z.number().positive().optional().default(42),
      x: z.number().optional(),
      y: z.number().optional()
    })
    .optional()
});

const generateSchema = z.object({
  templateId: z.string().min(1),
  text: z.record(z.string()).optional(),
  images: z
    .record(
      z.object({
        url: z.string().url().optional(),
        s3Key: z.string().min(1).optional()
      })
    )
    .optional()
});

type MarketingStudioTemplateSchema = z.infer<typeof templateSchema>;

type Entitlements = {
  marketingStudio: boolean;
  whiteLabelMarketing: boolean;
};

const DEFAULT_PAGE = { width: 612, height: 792 };
const MAX_REMOTE_IMAGE_BYTES = Number(process.env.MARKETING_STUDIO_MAX_IMAGE_BYTES ?? 15 * 1024 * 1024);
const REMOTE_IMAGE_TIMEOUT_MS = Number(process.env.MARKETING_STUDIO_REMOTE_IMAGE_TIMEOUT_MS ?? 15_000);

@Injectable()
export class MarketingStudioService {
  private readonly permissionsDisabled =
    process.env.NODE_ENV !== 'production' &&
    (process.env.DISABLE_PERMISSIONS_GUARD ?? 'true').toLowerCase() === 'true';

  constructor(private readonly prisma: PrismaService, private readonly s3: S3Service) {}

  private async assertUserInOrg(userId: string, orgId: string) {
    if (this.permissionsDisabled) {
      return;
    }
    const membership = await this.prisma.userOrgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { userId: true }
    });
    if (!membership) {
      throw new ForbiddenException('User is not part of this organization');
    }
  }

  private async getEntitlements(orgId: string): Promise<Entitlements> {
    const globalStudio = (process.env.ADDON_MARKETING_STUDIO ?? 'false').toLowerCase() === 'true';
    if (globalStudio) {
      return { marketingStudio: true, whiteLabelMarketing: true };
    }

    const rows = await this.prisma.organizationAddon.findMany({
      where: {
        organizationId: orgId,
        enabled: true,
        key: { in: [ORG_ADDON_MARKETING_STUDIO] }
      },
      select: { key: true }
    });

    const enabled = new Set(rows.map((row) => row.key));
    return {
      marketingStudio: enabled.has(ORG_ADDON_MARKETING_STUDIO),
      whiteLabelMarketing: true
    };
  }

  async listTemplates(orgId: string, userId: string) {
    await this.assertUserInOrg(userId, orgId);
    const entitlements = await this.getEntitlements(orgId);

    const templates = await this.prisma.marketingStudioTemplate.findMany({
      where: { OR: [{ organizationId: orgId }, { organizationId: null }] },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }]
    });

    const filtered = templates.filter((template) => template.variant === MarketingStudioTemplateVariant.WHITE_LABEL);

    const withUrls = await Promise.all(
      filtered.map(async (template) => ({
        ...template,
        overlayUrl: template.overlayS3Key ? await this.s3.getPresignedUrl(template.overlayS3Key) : null
      }))
    );

    return { entitlements, templates: withUrls };
  }

  async seedDefaultTemplates(orgId: string, userId: string) {
    await this.assertUserInOrg(userId, orgId);
    const entitlements = await this.getEntitlements(orgId);
    if (!entitlements.marketingStudio) {
      throw new ForbiddenException('Marketing Studio is not enabled for this organization');
    }

    const flyerSchema: MarketingStudioTemplateSchema = {
      page: DEFAULT_PAGE,
      imageSlots: [
        { id: 'hero', x: 36, y: 330, width: 540, height: 420, fit: 'cover' }
      ],
      textSlots: [
        { id: 'address', x: 36, y: 300, size: 18, maxWidth: 540 },
        { id: 'cityStateZip', x: 36, y: 280, size: 12, maxWidth: 540 },
        { id: 'price', x: 36, y: 252, size: 16, maxWidth: 540 },
        { id: 'agentName', x: 36, y: 200, size: 12, maxWidth: 540 },
        { id: 'agentPhone', x: 36, y: 182, size: 12, maxWidth: 540 },
        { id: 'agentEmail', x: 36, y: 164, size: 12, maxWidth: 540 },
        { id: 'brokerageName', x: 36, y: 120, size: 10, maxWidth: 540 }
      ],
      watermark: { enabled: false }
    };

    const flyerTemplate = await this.prisma.marketingStudioTemplate.upsert({
      where: { key: 'flyer_basic_white_label' },
      create: {
        key: 'flyer_basic_white_label',
        organizationId: null,
        name: 'Flyer (Default)',
        description: '1-page listing flyer.',
        variant: MarketingStudioTemplateVariant.WHITE_LABEL,
        overlayS3Key: null,
        overlayPageIndex: 0,
        schema: flyerSchema as unknown as Prisma.InputJsonValue,
        isSystem: true
      },
      update: {
        name: 'Flyer (Default)',
        description: '1-page listing flyer.',
        variant: MarketingStudioTemplateVariant.WHITE_LABEL,
        schema: flyerSchema as unknown as Prisma.InputJsonValue,
        isSystem: true
      }
    });

    const socialSchema: MarketingStudioTemplateSchema = {
      page: { width: 612, height: 612 },
      imageSlots: [{ id: 'hero', x: 36, y: 170, width: 540, height: 380, fit: 'cover' }],
      textSlots: [
        { id: 'address', x: 36, y: 145, size: 16, maxWidth: 540 },
        { id: 'cityStateZip', x: 36, y: 125, size: 12, maxWidth: 540 },
        { id: 'price', x: 36, y: 102, size: 14, maxWidth: 540 },
        { id: 'agentName', x: 36, y: 68, size: 10, maxWidth: 540 },
        { id: 'agentPhone', x: 36, y: 54, size: 10, maxWidth: 540 },
        { id: 'agentEmail', x: 36, y: 40, size: 10, maxWidth: 540 },
        { id: 'brokerageName', x: 36, y: 20, size: 9, maxWidth: 540 }
      ],
      watermark: { enabled: false }
    };

    const socialTemplate = await this.prisma.marketingStudioTemplate.upsert({
      where: { key: 'social_post_square_white_label' },
      create: {
        key: 'social_post_square_white_label',
        organizationId: null,
        name: 'Social Post (Square)',
        description: 'Square social post layout for IG/FB.',
        variant: MarketingStudioTemplateVariant.WHITE_LABEL,
        overlayS3Key: null,
        overlayPageIndex: 0,
        schema: socialSchema as unknown as Prisma.InputJsonValue,
        isSystem: true
      },
      update: {
        name: 'Social Post (Square)',
        description: 'Square social post layout for IG/FB.',
        variant: MarketingStudioTemplateVariant.WHITE_LABEL,
        schema: socialSchema as unknown as Prisma.InputJsonValue,
        isSystem: true
      }
    });

    const storySchema: MarketingStudioTemplateSchema = {
      page: { width: 612, height: 1088 },
      imageSlots: [{ id: 'hero', x: 36, y: 430, width: 540, height: 610, fit: 'cover' }],
      textSlots: [
        { id: 'address', x: 36, y: 395, size: 18, maxWidth: 540 },
        { id: 'cityStateZip', x: 36, y: 370, size: 12, maxWidth: 540 },
        { id: 'price', x: 36, y: 342, size: 16, maxWidth: 540 },
        { id: 'agentName', x: 36, y: 275, size: 12, maxWidth: 540 },
        { id: 'agentPhone', x: 36, y: 252, size: 12, maxWidth: 540 },
        { id: 'agentEmail', x: 36, y: 230, size: 12, maxWidth: 540 },
        { id: 'brokerageName', x: 36, y: 200, size: 10, maxWidth: 540 }
      ],
      watermark: { enabled: false }
    };

    const storyTemplate = await this.prisma.marketingStudioTemplate.upsert({
      where: { key: 'story_vertical_white_label' },
      create: {
        key: 'story_vertical_white_label',
        organizationId: null,
        name: 'Story (Vertical)',
        description: 'Vertical story layout (IG/FB story).',
        variant: MarketingStudioTemplateVariant.WHITE_LABEL,
        overlayS3Key: null,
        overlayPageIndex: 0,
        schema: storySchema as unknown as Prisma.InputJsonValue,
        isSystem: true
      },
      update: {
        name: 'Story (Vertical)',
        description: 'Vertical story layout (IG/FB story).',
        variant: MarketingStudioTemplateVariant.WHITE_LABEL,
        schema: storySchema as unknown as Prisma.InputJsonValue,
        isSystem: true
      }
    });

    return { templates: [flyerTemplate, socialTemplate, storyTemplate] };
  }

  async presignTemplateUpload(orgId: string, userId: string, dto: PresignMarketingStudioTemplateDto) {
    await this.assertUserInOrg(userId, orgId);
    const entitlements = await this.getEntitlements(orgId);
    if (!entitlements.marketingStudio) {
      throw new ForbiddenException('Marketing Studio is not enabled for this organization');
    }
    if (!dto?.fileName) {
      throw new Error('fileName is required');
    }

    const safeFileName = this.sanitizeFileName(dto.fileName);
    const key = `marketing-templates/${orgId}/${Date.now()}-${safeFileName}`;

    const uploadUrl = await this.s3.getPresignedUploadUrl({
      key,
      contentType: dto.mimeType ?? 'application/pdf'
    });
    const publicUrl = this.s3.buildPublicUrl(key);

    return { uploadUrl, publicUrl, key };
  }

  async createTemplate(orgId: string, userId: string, dto: CreateMarketingStudioTemplateDto) {
    await this.assertUserInOrg(userId, orgId);
    const entitlements = await this.getEntitlements(orgId);
    if (!entitlements.marketingStudio) {
      throw new ForbiddenException('Marketing Studio is not enabled for this organization');
    }

    const variant = MarketingStudioTemplateVariant.WHITE_LABEL;
    if (dto.overlayS3Key) {
      const expectedPrefix = `marketing-templates/${orgId}/`;
      if (!dto.overlayS3Key.startsWith(expectedPrefix)) {
        throw new ForbiddenException('Invalid overlay key');
      }
    }

    const parsed = templateSchema.parse(dto.schema);

    const created = await this.prisma.marketingStudioTemplate.create({
      data: {
        key: dto.key ?? null,
        organizationId: orgId,
        name: dto.name,
        description: dto.description ?? null,
        variant,
        overlayS3Key: dto.overlayS3Key ?? null,
        overlayPageIndex: dto.overlayPageIndex ?? 0,
        schema: parsed as unknown as Prisma.InputJsonValue,
        isSystem: dto.isSystem ?? false
      }
    });

    return { template: created };
  }

  async listAssets(orgId: string, listingId: string, userId: string) {
    await this.assertUserInOrg(userId, orgId);
    const entitlements = await this.getEntitlements(orgId);
    if (!entitlements.marketingStudio) {
      throw new ForbiddenException('Marketing Studio is not enabled for this organization');
    }
    await this.getOrgListingOrThrow(orgId, listingId);

    const assets = await this.prisma.marketingStudioAsset.findMany({
      where: { organizationId: orgId, listingId },
      include: { template: true },
      orderBy: { createdAt: 'desc' }
    });

    const items = await Promise.all(
      assets.map(async (asset) => ({
        ...asset,
        downloadUrl: await this.s3.getPresignedUrl(asset.outputS3Key),
        publicUrl: this.s3.buildPublicUrl(asset.outputS3Key)
      }))
    );

    return { assets: items };
  }

  async listListingImages(orgId: string, listingId: string, userId: string) {
    await this.assertUserInOrg(userId, orgId);
    const entitlements = await this.getEntitlements(orgId);
    if (!entitlements.marketingStudio) {
      throw new ForbiddenException('Marketing Studio is not enabled for this organization');
    }
    await this.getOrgListingOrThrow(orgId, listingId);

    const keys = await this.discoverPropertyImages(orgId, listingId);
    const images = await Promise.all(
      keys.map(async (s3Key) => ({
        s3Key,
        url: await this.s3.getPresignedUrl(s3Key)
      }))
    );

    return { images };
  }

  async generateAsset(orgId: string, listingId: string, userId: string, dto: GenerateMarketingStudioAssetDto) {
    await this.assertUserInOrg(userId, orgId);

    const entitlements = await this.getEntitlements(orgId);
    if (!entitlements.marketingStudio) {
      throw new ForbiddenException('Marketing Studio is not enabled for this organization');
    }

    const listing = await this.getOrgListingOrThrow(orgId, listingId);
    const organization = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const payload = generateSchema.parse(dto);

    const template = await this.prisma.marketingStudioTemplate.findUnique({
      where: { id: payload.templateId }
    });
    if (!template || (template.organizationId && template.organizationId !== orgId)) {
      throw new NotFoundException('Template not found');
    }
    if (template.variant !== MarketingStudioTemplateVariant.WHITE_LABEL) {
      throw new NotFoundException('Template not found');
    }

    const templateLayout = templateSchema.parse(template.schema);

    const propertyImages = await this.discoverPropertyImages(orgId, listingId);

    const resolvedText = this.resolveText({
      listing,
      organizationName: organization.name,
      overrides: payload.text ?? {}
    });

    const resolvedImages = await this.resolveImages({
      template: templateLayout,
      overrides: payload.images ?? {},
      propertyImages
    });

    const pdfBytes = await this.renderPdf({
      template,
      templateLayout,
      text: resolvedText,
      images: resolvedImages
    });

    const outputS3Key = `marketing-assets/${orgId}/${listingId}/${randomUUID()}.pdf`;
    await this.s3.putObject({
      key: outputS3Key,
      body: Buffer.from(pdfBytes),
      contentType: 'application/pdf'
    });

    const asset = await this.prisma.marketingStudioAsset.create({
      data: {
        organizationId: orgId,
        listingId,
        templateId: template.id,
        createdByUserId: userId,
        outputS3Key,
        metadata: {
          text: resolvedText,
          images: Object.fromEntries(
            Object.entries(resolvedImages).map(([slotId, image]) => [slotId, image?.source ?? null])
          )
        } as unknown as Prisma.InputJsonValue
      }
    });

    const downloadUrl = await this.s3.getPresignedUrl(asset.outputS3Key);
    const publicUrl = this.s3.buildPublicUrl(asset.outputS3Key);

    return { asset: { ...asset, downloadUrl, publicUrl } };
  }

  private async getOrgListingOrThrow(orgId: string, listingId: string) {
    const listing = await this.prisma.orgListing.findUnique({
      where: { id: listingId },
      include: { agentProfile: { include: { user: true } } }
    });
    if (!listing || listing.organizationId !== orgId) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  private async discoverPropertyImages(orgId: string, listingId: string): Promise<string[]> {
    const prefix = `property-images/${orgId}/${listingId}/`;
    try {
      const keys = await this.s3.searchKeys({ prefix, contains: [], maxKeys: 25 });
      return keys.filter((key) => /\.(png|jpe?g)$/i.test(key)).slice(0, 25);
    } catch {
      return [];
    }
  }

  private resolveText(params: {
    listing: Awaited<ReturnType<MarketingStudioService['getOrgListingOrThrow']>>;
    organizationName: string;
    overrides: Record<string, string>;
  }): Record<string, string> {
    const { listing, organizationName, overrides } = params;

    const address = listing.addressLine2 ? `${listing.addressLine1}, ${listing.addressLine2}` : listing.addressLine1;
    const cityStateZip = `${listing.city}, ${listing.state} ${listing.postalCode}`;

    const formattedPrice =
      listing.listPrice && Number.isFinite(listing.listPrice)
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
            listing.listPrice
          )
        : '';

    const agentUser = listing.agentProfile?.user ?? null;
    const agentName =
      agentUser && agentUser.firstName
        ? `${agentUser.firstName}${agentUser.lastName ? ` ${agentUser.lastName}` : ''}`.trim()
        : '';
    const agentEmail = agentUser?.email ?? '';

    const base: Record<string, string> = {
      address,
      cityStateZip,
      price: formattedPrice,
      agentName,
      agentEmail,
      agentPhone: '',
      brokerageName: organizationName ?? ''
    };

    return { ...base, ...overrides };
  }

  private async resolveImages(params: {
    template: MarketingStudioTemplateSchema;
    overrides: Record<string, { url?: string; s3Key?: string }>;
    propertyImages: string[];
  }): Promise<Record<string, { bytes: Uint8Array; source: { url?: string; s3Key?: string } } | null>> {
    const { template, overrides, propertyImages } = params;
    const results: Record<string, { bytes: Uint8Array; source: { url?: string; s3Key?: string } } | null> = {};

    const slotIds = template.imageSlots.map((slot) => slot.id);
    const heroSlotId = template.imageSlots.find((slot) => slot.id === 'hero')?.id ?? null;
    const heroOverride = heroSlotId ? overrides[heroSlotId] : undefined;
    const heroIsOverridden = Boolean(heroOverride?.s3Key?.trim() || heroOverride?.url?.trim());
    const canUseDefaultHero = Boolean(heroSlotId && !heroIsOverridden && propertyImages[0]);

    let fallbackIndex = canUseDefaultHero ? 1 : 0;

    for (const slotId of slotIds) {
      const override = overrides[slotId];
      const candidate = override?.s3Key
        ? { s3Key: override.s3Key }
        : override?.url
          ? { url: override.url }
          : canUseDefaultHero && slotId === heroSlotId
            ? { s3Key: propertyImages[0] }
            : propertyImages[fallbackIndex]
              ? { s3Key: propertyImages[fallbackIndex++] }
            : null;

      if (!candidate) {
        results[slotId] = null;
        continue;
      }

      const bytes = candidate.s3Key
        ? await this.s3.getObjectBuffer(candidate.s3Key)
        : await this.fetchRemoteImage(candidate.url!);

      results[slotId] = { bytes, source: candidate };
    }

    return results;
  }

  private async renderPdf(params: {
    template: { variant: MarketingStudioTemplateVariant; overlayS3Key: string | null; overlayPageIndex: number };
    templateLayout: MarketingStudioTemplateSchema;
    text: Record<string, string>;
    images: Record<string, { bytes: Uint8Array } | null>;
  }): Promise<Uint8Array> {
    const { template, templateLayout, text, images } = params;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const overlay = template.overlayS3Key
      ? await this.loadOverlayPage(pdfDoc, template.overlayS3Key, template.overlayPageIndex)
      : null;

    const pageSize = overlay
      ? { width: overlay.width, height: overlay.height }
      : templateLayout.page ?? DEFAULT_PAGE;

    const page = pdfDoc.addPage([pageSize.width, pageSize.height]);

    for (const slot of templateLayout.imageSlots) {
      const imageData = images[slot.id];
      if (!imageData) continue;
      const image = await this.embedImage(pdfDoc, imageData.bytes);
      this.drawImageInRect(page, image, slot);
    }

    if (overlay) {
      page.drawPage(overlay.embed, { x: 0, y: 0, width: overlay.width, height: overlay.height });
    }

    for (const slot of templateLayout.textSlots) {
      const value = (text[slot.id] ?? '').toString();
      if (!value) continue;

      const color = slot.color ? this.parseHexColor(slot.color) : rgb(0.1, 0.1, 0.1);
      const size = slot.size ?? 12;
      const maxWidth = slot.maxWidth;
      const align = slot.align ?? 'left';

      const finalValue = maxWidth ? this.truncateToWidth(value, maxWidth, font, size) : value;
      const textWidth = font.widthOfTextAtSize(finalValue, size);

      const drawX =
        align === 'center' && maxWidth
          ? slot.x + Math.max(0, (maxWidth - textWidth) / 2)
          : align === 'right' && maxWidth
            ? slot.x + Math.max(0, maxWidth - textWidth)
            : slot.x;

      page.drawText(finalValue, { x: drawX, y: slot.y, size, font, color });
    }

    if (template.variant === MarketingStudioTemplateVariant.HATCH_BRANDED) {
      const watermark = templateLayout.watermark ?? { enabled: true };
      if (watermark.enabled !== false) {
        const textValue = (watermark.text ?? '').trim();
        if (textValue) {
          const size = watermark.size ?? 42;
          const opacity = watermark.opacity ?? 0.12;
          const x = watermark.x ?? pageSize.width - 36 - font.widthOfTextAtSize(textValue, size);
          const y = watermark.y ?? 36;
          page.drawText(textValue, { x, y, size, font, color: rgb(0, 0, 0), opacity });
        }
      }
    }

    return pdfDoc.save();
  }

  private sanitizeFileName(name: string): string {
    const trimmed = name.trim();
    const replaced = trimmed.replace(/[^\w.\-]+/g, '-');
    return replaced.length > 0 ? replaced : 'upload.bin';
  }

  private parseHexColor(hex: string) {
    const normalized = hex.trim().replace(/^#/, '');
    if (normalized.length !== 6) {
      return rgb(0.1, 0.1, 0.1);
    }
    const num = Number.parseInt(normalized, 16);
    if (!Number.isFinite(num)) {
      return rgb(0.1, 0.1, 0.1);
    }
    const r = ((num >> 16) & 0xff) / 255;
    const g = ((num >> 8) & 0xff) / 255;
    const b = (num & 0xff) / 255;
    return rgb(r, g, b);
  }

  private truncateToWidth(value: string, maxWidth: number, font: any, size: number) {
    const clean = value.trim();
    if (!clean) return '';
    if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;

    const ellipsis = '…';
    const safeMax = Math.max(0, maxWidth - font.widthOfTextAtSize(ellipsis, size));
    if (safeMax <= 0) return ellipsis;

    let lo = 0;
    let hi = clean.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const candidate = clean.slice(0, mid);
      if (font.widthOfTextAtSize(candidate, size) <= safeMax) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    return `${clean.slice(0, lo)}${ellipsis}`;
  }

  private async fetchRemoteImage(url: string): Promise<Buffer> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Unsupported image URL protocol');
    }
    const blockedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
    if (blockedHosts.has(parsed.hostname.toLowerCase())) {
      throw new Error('Blocked image URL host');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal }).finally(() =>
      clearTimeout(timeout)
    );
    if (!response.ok) {
      throw new Error(`Failed to download image (${response.status})`);
    }
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
    const allowedTypes = new Set(['image/jpeg', 'image/jpg', 'image/png']);
    if (!contentType || !allowedTypes.has(contentType)) {
      throw new Error('URL did not return an image');
    }

    const lengthHeader = response.headers.get('content-length');
    const contentLength = lengthHeader ? Number.parseInt(lengthHeader, 10) : null;
    if (
      MAX_REMOTE_IMAGE_BYTES > 0 &&
      contentLength !== null &&
      Number.isFinite(contentLength) &&
      contentLength > MAX_REMOTE_IMAGE_BYTES
    ) {
      throw new Error('Remote image exceeds size limit');
    }

    const arrayBuffer = await response.arrayBuffer();
    if (MAX_REMOTE_IMAGE_BYTES > 0 && arrayBuffer.byteLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error('Remote image exceeds size limit');
    }
    return Buffer.from(arrayBuffer);
  }

  private async embedImage(pdfDoc: PDFDocument, bytes: Uint8Array) {
    if (this.isPng(bytes)) {
      return pdfDoc.embedPng(bytes);
    }
    return pdfDoc.embedJpg(bytes);
  }

  private isPng(bytes: Uint8Array): boolean {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  private drawImageInRect(
    page: any,
    image: any,
    rect: { x?: number; y?: number; width?: number; height?: number; fit?: 'cover' | 'contain' }
  ) {
    if (
      rect.x === undefined ||
      rect.y === undefined ||
      rect.width === undefined ||
      rect.height === undefined ||
      !Number.isFinite(rect.x) ||
      !Number.isFinite(rect.y) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    const iw = image.width;
    const ih = image.height;
    const scaleX = rect.width / iw;
    const scaleY = rect.height / ih;
    const scale = rect.fit === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
    const dw = iw * scale;
    const dh = ih * scale;
    const x = rect.x + (rect.width - dw) / 2;
    const y = rect.y + (rect.height - dh) / 2;

    page.pushOperators(
      pushGraphicsState(),
      moveTo(rect.x, rect.y),
      lineTo(rect.x + rect.width, rect.y),
      lineTo(rect.x + rect.width, rect.y + rect.height),
      lineTo(rect.x, rect.y + rect.height),
      closePath(),
      clip(),
      endPath()
    );
    page.drawImage(image, { x, y, width: dw, height: dh });
    page.pushOperators(popGraphicsState());
  }

  private async loadOverlayPage(pdfDoc: PDFDocument, s3Key: string, pageIndex: number) {
    const overlayBytes = await this.s3.getObjectBuffer(s3Key);
    const overlayDoc = await PDFDocument.load(overlayBytes, { ignoreEncryption: true, updateMetadata: false });
    const maxIndex = Math.max(0, overlayDoc.getPageCount() - 1);
    const resolvedIndex = Math.min(Math.max(0, pageIndex ?? 0), maxIndex);
    const overlayPage = overlayDoc.getPage(resolvedIndex);
    const { width, height } = overlayPage.getSize();
    const [embed] = await pdfDoc.embedPdf(overlayBytes, [resolvedIndex]);
    return { width, height, embed };
  }
}
