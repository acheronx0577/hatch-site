import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Multipart, MultipartFile } from '@fastify/multipart';
import type { DraftMappingResult, ExtractedLabelValue } from '@hatch/shared';

import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { resolveRequestContext } from '../common/request-context';
import { DraftsService } from './drafts.service';

interface DraftUploadOptions {
  vendor?: string;
  documentVersion?: string;
}

interface DraftUploadResponse {
  tenantId: string | null;
  filename: string;
  mimeType: string;
  draft: DraftMappingResult['draft'];
  matches: DraftMappingResult['matches'];
  extracted: ExtractedLabelValue[];
}

@Controller('drafts')
@UseGuards(JwtAuthGuard)
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() req: FastifyRequest): Promise<DraftUploadResponse> {
    const ctx = resolveRequestContext(req);
    const file = await this.consumeFile(req);

    if (!file) {
      throw new BadRequestException('file is required');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are supported at this time');
    }

    const buffer = await file.toBuffer();

    const options = this.parseOptions(file);

    const result = await this.drafts.ingestPdf(buffer, {
      tenantId: ctx.tenantId ?? 'tenant-hatch',
      filename: file.filename,
      vendor: options.vendor,
      documentVersion: options.documentVersion
    });

    return {
      tenantId: ctx.tenantId ?? null,
      filename: file.filename,
      mimeType: file.mimetype,
      draft: result.draft,
      matches: result.matches,
      extracted: result.extracted
    };
  }

  private async consumeFile(req: FastifyRequest): Promise<MultipartFile | undefined> {
    try {
      return await (req as FastifyRequest & { file: () => Promise<MultipartFile> }).file();
    } catch (error) {
      throw new BadRequestException(`Unable to process uploaded file: ${(error as Error).message}`);
    }
  }

  private parseOptions(file: MultipartFile): DraftUploadOptions {
    const rawFields = file.fields ?? {};
    const options: DraftUploadOptions = {};

    const getFieldValue = (entry: Multipart | Multipart[] | undefined): string | undefined => {
      if (!entry) {
        return undefined;
      }
      const candidate = Array.isArray(entry) ? entry[0] : entry;
      if (!candidate || candidate.type !== 'field') {
        return undefined;
      }
      return typeof candidate.value === 'string' ? candidate.value : undefined;
    };

    const vendor = getFieldValue(rawFields.vendor);
    if (vendor) {
      options.vendor = vendor;
    }

    const documentVersion = getFieldValue(rawFields.documentVersion);
    if (documentVersion) {
      options.documentVersion = documentVersion;
    }

    return options;
  }
}
