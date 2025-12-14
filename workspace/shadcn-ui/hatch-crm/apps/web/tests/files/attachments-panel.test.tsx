import React from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/api/files', (): Record<string, unknown> => ({
  listFilesForRecord: vi.fn(),
  createUploadUrl: vi.fn(),
  linkFile: vi.fn(),
  deleteFile: vi.fn(),
  getFileDownloadUrl: vi.fn((id: string) => `/files/${id}`)
}));

// eslint-disable-next-line import/first
import { AttachmentsPanel } from '@/components/files/attachments-panel';
import { listFilesForRecord } from '@/lib/api/files';

const listMock = listFilesForRecord as vi.MockedFunction<typeof listFilesForRecord>;

beforeEach(() => {
  vi.clearAllMocks();
});

test('attachments panel load more appends without duplicates', async () => {
  const itemA = {
    id: 'file-a',
    object: 'accounts',
    recordId: 'acc-1',
    file: { id: 'f-a', fileName: 'Budget.pdf', mimeType: 'application/pdf', byteSize: 1024 }
  };
  const itemB = {
    id: 'file-b',
    object: 'accounts',
    recordId: 'acc-1',
    file: { id: 'f-b', fileName: 'Contract.pdf', mimeType: 'application/pdf', byteSize: 2048 }
  };

  listMock.mockResolvedValueOnce({ items: [itemA, itemB], nextCursor: null });

  const user = userEvent.setup();
  render(
    <AttachmentsPanel
      object="accounts"
      recordId="acc-1"
      initialItems={[itemA]}
      initialNextCursor="cursor-2"
    />
  );

  // initial item visible
  expect(screen.getByText('Budget.pdf')).toBeInTheDocument();

  await user.click(await screen.findByRole('button', { name: /load more/i }));

  await waitFor(() => expect(screen.getByText('Contract.pdf')).toBeInTheDocument());
  const list = screen.getByRole('list');
  const rows = within(list).getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
  );

  expect(listMock).toHaveBeenCalledWith(
    'accounts',
    'acc-1',
    expect.objectContaining({ cursor: 'cursor-2', limit: expect.any(Number) })
  );
});
