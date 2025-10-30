"use client";

import { ChangeEvent, useCallback, useTransition } from 'react';

import { ErrorBanner } from '@/components/error-banner';
import { LoadMoreButton } from '@/components/load-more-button';
import { useApiError } from '@/hooks/use-api-error';
import { useCursorPager } from '@/lib/pagination/useCursorPager';
import {
  deleteFile,
  createUploadUrl,
  linkFile,
  listFilesForRecord,
  type FileLinkRecord
} from '@/lib/api/files';

interface AttachmentsPanelProps {
  object: string;
  recordId: string;
  initialItems?: FileLinkRecord[];
  initialNextCursor?: string | null;
  pageSize?: number;
}

export function AttachmentsPanel({
  object,
  recordId,
  initialItems = [],
  initialNextCursor = null,
  pageSize = 25
}: AttachmentsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const errors = useApiError();

  const fetchAttachments = useCallback(
    (cursor: string | null, signal?: AbortSignal) =>
      listFilesForRecord(object, recordId, {
        cursor: cursor ?? undefined,
        limit: pageSize,
        signal
      }),
    [object, pageSize, recordId]
  );

  const { items, nextCursor, load, reset, loading, error: pagingError } = useCursorPager<FileLinkRecord>(
    fetchAttachments,
    {
      initialItems,
      initialCursor: initialNextCursor
    }
  );

  const loadInitial = useCallback(async () => {
    try {
      const data = await listFilesForRecord(object, recordId, { limit: pageSize });
      reset(data.items, data.nextCursor ?? null);
      errors.clearError();
    } catch (err) {
      errors.showError(err);
      reset([], null);
    }
  }, [errors, object, pageSize, recordId, reset]);

  const loadMore = useCallback(async () => {
    if (loading || nextCursor === null || isPending) {
      return;
    }
    await load();
  }, [isPending, load, loading, nextCursor]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      try {
        errors.clearError();
        const upload = await createUploadUrl({
          fileName: file.name,
          mimeType: file.type,
          byteSize: file.size
        });
        // TODO: integrate actual upload to storage provider using upload.uploadUrl.
        await linkFile({
          fileId: upload.fileId,
          object,
          recordId
        });
        await loadInitial();
      } catch (err) {
        errors.showError(err);
      }
    });
    event.target.value = '';
  };

  const handleDelete = (fileId: string) =>
    startTransition(async () => {
      try {
        errors.clearError();
        await deleteFile(fileId);
        await loadInitial();
      } catch (err) {
        errors.showError(err);
      }
    });

  const pagingBanner = pagingError ? errors.map(pagingError) : null;

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

      {errors.banner && <ErrorBanner {...errors.banner} onDismiss={errors.clearError} />}

      <div className="rounded-lg border border-slate-200 bg-white">
        {items.length === 0 && !loading && !isPending ? (
          <p className="p-4 text-sm text-slate-500">No files attached yet.</p>
        ) : (
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
        )}

        {Boolean(nextCursor) || pagingBanner ? (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-right">
            {pagingBanner && (
              <ErrorBanner {...pagingBanner} className="mb-3 inline-block max-w-md text-left" />
            )}
            <LoadMoreButton
              hasNext={Boolean(nextCursor)}
              isLoading={loading || isPending}
              onClick={() => {
                void loadMore();
              }}
            />
          </div>
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

export default AttachmentsPanel;
