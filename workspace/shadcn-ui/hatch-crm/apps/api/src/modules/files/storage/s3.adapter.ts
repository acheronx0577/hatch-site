import { StorageAdapter, CreateUploadUrlInput, CreateUploadUrlResult } from './storage.adapter';

export class S3StorageAdapter implements StorageAdapter {
  async createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult> {
    const storageKey = `org/${input.orgId}/files/${Date.now()}-${sanitizeFileName(input.fileName)}`;

    // TODO: Integrate AWS SDK (S3) signed URL generation.
    const uploadUrl = `https://s3.mock.invalid/${storageKey}`;

    return {
      uploadUrl,
      storageKey
    };
  }
}

const sanitizeFileName = (value: string) => value.replace(/\s+/g, '-');
