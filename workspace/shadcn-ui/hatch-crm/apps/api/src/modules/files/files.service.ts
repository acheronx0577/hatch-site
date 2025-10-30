import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { FlsService } from '../../platform/security/fls.service';
import {
  createStorageAdapter,
  StorageAdapter
} from './storage/storage.adapter';

interface UploadPayload {
  fileName: string;
  mimeType?: string;
  byteSize: number;
}

interface LinkPayload {
  fileId: string;
  object: string;
  recordId: string;
}

@Injectable()
export class FilesService {
  private readonly storage: StorageAdapter;

  constructor(private readonly prisma: PrismaService, private readonly fls: FlsService) {
    this.storage = createStorageAdapter(process.env.FILES_STORAGE_ADAPTER);
  }

  async createUploadUrl(ctx: RequestContext, payload: UploadPayload) {
    if (!ctx.orgId || !ctx.userId) {
      throw new BadRequestException('Missing org or user context');
    }

    if (!payload.fileName || !payload.byteSize) {
      throw new BadRequestException('fileName and byteSize are required');
    }

    const storageResult = await this.storage.createUploadUrl({
      orgId: ctx.orgId,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      byteSize: payload.byteSize
    });

    const writable = await this.fls.filterWrite(
      { orgId: ctx.orgId, userId: ctx.userId },
      'files',
      {
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        byteSize: payload.byteSize,
        storageKey: storageResult.storageKey,
        status: 'READY'
      }
    );

    const record = await this.prisma.fileObject.create({
      data: {
        orgId: ctx.orgId,
        ownerId: ctx.userId,
        ...writable
      }
    });

    const filtered = await this.fls.filterRead(ctx, 'files', record);
    return {
      fileId: record.id,
      storageKey: record.storageKey,
      uploadUrl: storageResult.uploadUrl,
      metadata: { id: record.id, ...filtered }
    };
  }

  async link(ctx: RequestContext, payload: LinkPayload) {
    if (!ctx.orgId) {
      throw new BadRequestException('Missing org context');
    }
    const file = await this.prisma.fileObject.findFirst({
      where: { id: payload.fileId, orgId: ctx.orgId }
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }

    const link = await this.prisma.fileLink.create({
      data: {
        orgId: ctx.orgId,
        fileId: payload.fileId,
        object: payload.object,
        recordId: payload.recordId
      },
      include: {
        file: true
      }
    });

    const filtered = await this.fls.filterRead(ctx, 'files', link.file);
    return {
      id: link.id,
      object: link.object,
      recordId: link.recordId,
      file: { id: link.file.id, ...filtered }
    };
  }

  async listForRecord(ctx: RequestContext, object: string, recordId: string) {
    if (!ctx.orgId) {
      return [];
    }
    const links = await this.prisma.fileLink.findMany({
      where: {
        orgId: ctx.orgId,
        object,
        recordId
      },
      orderBy: { createdAt: 'desc' },
      include: {
        file: true
      }
    });

    return Promise.all(
      links.map(async (link) => {
        const filtered = await this.fls.filterRead(ctx, 'files', link.file);
        return {
          id: link.id,
          object: link.object,
          recordId: link.recordId,
          createdAt: link.createdAt,
          file: { id: link.file.id, ...filtered }
        };
      })
    );
  }

  async softDelete(ctx: RequestContext, id: string) {
    if (!ctx.orgId) {
      return null;
    }
    const record = await this.prisma.fileObject.findFirst({
      where: { id, orgId: ctx.orgId }
    });
    if (!record) {
      return null;
    }
    await this.prisma.fileObject.update({
      where: { id },
      data: { status: 'DELETED' }
    });
    return { id };
  }
}
