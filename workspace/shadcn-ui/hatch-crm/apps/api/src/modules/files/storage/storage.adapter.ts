import { LocalStorageAdapter } from './local.adapter';
import { S3StorageAdapter } from './s3.adapter';

export interface CreateUploadUrlInput {
  orgId: string;
  fileName: string;
  mimeType?: string;
  byteSize: number;
}

export interface CreateUploadUrlResult {
  uploadUrl: string;
  storageKey: string;
}

export interface StorageAdapter {
  createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult>;
}

export function createStorageAdapter(kind?: string): StorageAdapter {
  if ((kind ?? '').toLowerCase() === 's3') {
    return new S3StorageAdapter();
  }

  return new LocalStorageAdapter();
}
