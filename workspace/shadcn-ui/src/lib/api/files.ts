import { apiFetch, API_BASE_URL } from './hatch';

export interface FileMetadata {
  id: string;
  fileName?: string;
  mimeType?: string | null;
  byteSize?: number | null;
  storageKey?: string;
  status?: string;
  createdAt?: string;
}

export interface FileLinkRecord {
  id: string;
  object: string;
  recordId: string;
  createdAt?: string;
  file: FileMetadata;
}

export interface FileLinkListResponse {
  items: FileLinkRecord[];
  nextCursor: string | null;
}

export interface UploadUrlResponse {
  fileId: string;
  storageKey: string;
  uploadUrl: string;
  metadata: FileMetadata;
}

export async function createUploadUrl(payload: {
  fileName: string;
  mimeType?: string;
  byteSize: number;
}): Promise<UploadUrlResponse> {
  return apiFetch<UploadUrlResponse>('files/upload-url', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function linkFile(payload: {
  fileId: string;
  object: string;
  recordId: string;
}): Promise<FileLinkRecord> {
  return apiFetch<FileLinkRecord>('files/link', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function listFilesForRecord(
  object: string,
  recordId: string,
  params: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {}
): Promise<FileLinkListResponse> {
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (typeof params.limit === 'number') search.set('limit', params.limit.toString());
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const response = await apiFetch<FileLinkListResponse | FileLinkRecord[]>(
    `files/${object}/${recordId}${suffix}`,
    { signal: params.signal }
  );
  if (Array.isArray(response)) {
    return { items: response, nextCursor: null };
  }
  return {
    items: response.items ?? [],
    nextCursor: response.nextCursor ?? null
  };
}

export async function deleteFile(fileId: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`files/${fileId}`, {
    method: 'DELETE'
  });
}

export const getFileDownloadUrl = (fileId: string) => {
  const path = `files/${fileId}/download`;
  if (API_BASE_URL.startsWith('http')) {
    return new URL(path, API_BASE_URL).toString();
  }
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`;
  return `${base}${path}`.replace(/\/\/+/, '/');
};
