import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { resolveRequestContext } from '../common/request-context';
import { S3Service } from '../storage/s3.service';

interface PresignRequestBody {
  fileName: string;
  mimeType?: string;
  propertyId?: string;
}

@ApiTags('property-media')
@Controller('property-media')
export class PropertyMediaController {
  constructor(private readonly s3: S3Service) {}

  @Post('presign')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fileName'],
      properties: {
        fileName: { type: 'string' },
        mimeType: { type: 'string' },
        propertyId: { type: 'string', description: 'Listing/draft identifier for prefixing uploads' }
      }
    }
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        uploadUrl: { type: 'string' },
        publicUrl: { type: 'string' },
        key: { type: 'string' }
      }
    }
  })
  async presign(@Req() req: FastifyRequest, @Body() body: PresignRequestBody) {
    if (!body?.fileName) {
      throw new Error('fileName is required');
    }

    const ctx = resolveRequestContext(req);
    const orgSegment = (ctx.orgId ?? ctx.tenantId ?? process.env.DEFAULT_ORG_ID ?? 'tenant-hatch').trim();
    const propertySegment = (body.propertyId ?? 'draft').trim();
    const safeFileName = this.sanitizeFileName(body.fileName);
    const key = `property-images/${orgSegment}/${propertySegment}/${Date.now()}-${safeFileName}`;

    const uploadUrl = await this.s3.getPresignedUploadUrl({
      key,
      contentType: body.mimeType ?? 'application/octet-stream'
    });
    const publicUrl = this.s3.buildPublicUrl(key);

    return { uploadUrl, publicUrl, key };
  }

  private sanitizeFileName(name: string): string {
    const trimmed = name.trim();
    const replaced = trimmed.replace(/[^\w.\-]+/g, '-');
    return replaced.length > 0 ? replaced : 'upload.bin';
  }
}
