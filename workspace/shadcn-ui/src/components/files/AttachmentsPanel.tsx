import React, { ChangeEvent, useEffect, useState, useTransition } from 'react';

import { deleteFile, createUploadUrl, linkFile, listFilesForRecord, getFileDownloadUrl, type FileLinkRecord } from '@/lib/api/files';

interface AttachmentsPanelProps {
  object: string;
  recordId: string;
  pageSize?: number;
}

export function AttachmentsPanel({
  object,
  recordId,
  pageSize = 25
}: AttachmentsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<FileLinkRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAttachments = async () => {
    if (!object || !recordId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await listFilesForRecord(object, recordId, { limit: pageSize });
      const filtered = (data.items ?? []).filter((item) => {
        const status = (item.file.status ?? '').toUpperCase();
        return status !== 'DELETED';
      });
      setItems(filtered);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object, recordId]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      try {
        setError(null);
        const upload = await createUploadUrl({
          fileName: file.name,
          mimeType: file.type,
          byteSize: file.size
        });
        await uploadToSignedUrl(upload.uploadUrl, file);
        await linkFile({
          fileId: upload.fileId,
          object,
          recordId
        });
        await loadAttachments();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setError(message);
      }
    });
    event.target.value = '';
  };

  const handleDelete = (fileId: string) =>
    startTransition(async () => {
      try {
        setError(null);
        await deleteFile(fileId);
        setItems((prev) => prev.filter((item) => item.file.id !== fileId));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete failed';
        setError(message);
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Attachments</h3>
          <p className="text-xs text-slate-500">Upload supporting documents linked to this record.</p>
        </div>
        <label className="inline-flex cursor-pointer flex-col items-center text-sm font-medium text-brand-600 hover:text-brand-700">
          <span className="rounded border border-dashed border-brand-300 px-3 py-2">
            {isPending ? 'Processing…' : 'Upload file'}
          </span>
          <input type="file" className="hidden" onChange={handleFileChange} disabled={isPending} />
        </label>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white">
        {loading && (
          <p className="p-4 text-sm text-slate-500">Loading attachments…</p>
        )}
        {items.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {items.map((attachment) => (
              <li key={attachment.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{attachment.file.fileName ?? 'Untitled file'}</p>
                  <p className="text-xs text-slate-500">
                    {attachment.file.mimeType ?? 'Unknown type'} •{' '}
                    {attachment.file.byteSize ? formatFileSize(attachment.file.byteSize) : 'Unknown size'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={getFileDownloadUrl(attachment.file.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(attachment.file.id)}
                    disabled={isPending}
                    className="rounded px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : !loading && !isPending ? (
          <p className="p-4 text-sm text-slate-500">No files attached yet.</p>
        ) : null}
      </div>
    </div>
  );
}

const formatFileSize = (bytes: number) => {
  if (Number.isNaN(bytes)) return `${bytes}`;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

async function uploadToSignedUrl(url: string, file: File) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream'
    },
    body: file
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ''}`);
  }
}

export default AttachmentsPanel;
