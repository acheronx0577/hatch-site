import { S3Service } from '../../storage/s3.service';
import type { StorageAdapter, CreateUploadUrlInput, CreateUploadUrlResult } from './storage.adapter';

export class S3StorageAdapter implements StorageAdapter {
  private readonly s3 = new S3Service();

  async createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult> {
    const storageKey = `uploads/org-${input.orgId}/${Date.now()}-${sanitizeFileName(input.fileName)}`;

    const uploadUrl = await this.s3.getPresignedUploadUrl({
      key: storageKey,
      contentType: input.mimeType ?? 'application/octet-stream',
      expiresInSeconds: 15 * 60 // 15 minutes
    });

    return {
      uploadUrl,
      storageKey
    };
  }
}

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-');
