import { StorageAdapter, CreateUploadUrlInput, CreateUploadUrlResult } from './storage.adapter';

export class LocalStorageAdapter implements StorageAdapter {
  async createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult> {
    const storageKey = `local/${input.orgId}/${Date.now()}-${sanitizeFileName(input.fileName)}`;

    return {
      uploadUrl: `http://localhost:9000/upload/${storageKey}`,
      storageKey
    };
  }
}

const sanitizeFileName = (value: string) => value.replace(/\s+/g, '-');
