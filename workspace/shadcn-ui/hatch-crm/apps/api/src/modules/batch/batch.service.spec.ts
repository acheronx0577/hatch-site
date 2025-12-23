import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '@/modules/shared-prisma';
import { BatchClient } from './batch.client';
import { BatchService } from './batch.service';

describe('BatchService', () => {
  let service: BatchService;

  const mockBatchClient = {
    isEnabled: jest.fn().mockReturnValue(true),
    fetchEvents: jest.fn()
  };

  const mockPrismaService = {
    batchEvent: {
      upsert: jest.fn()
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchService,
        { provide: BatchClient, useValue: mockBatchClient },
        { provide: PrismaService, useValue: mockPrismaService }
      ]
    }).compile();

    service = module.get(BatchService);
    jest.clearAllMocks();
  });

  it('syncEvents upserts fetched events and returns counts', async () => {
    mockBatchClient.fetchEvents
      .mockResolvedValueOnce({
        events: [
          { id: 'evt1', type: 'signup', occurredAt: '2024-01-01T00:00:00.000Z' },
          { id: 'evt2', type: 'login', occurred_at: '2024-01-02T00:00:00.000Z' }
        ],
        page: 1,
        limit: 2
      })
      .mockResolvedValueOnce({
        events: [],
        page: 2,
        limit: 2
      });

    const result = await service.syncEvents(2);

    expect(mockPrismaService.batchEvent.upsert).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      totalImported: 2,
      pagesProcessed: 1
    });
  });
});
