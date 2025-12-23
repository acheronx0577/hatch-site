import fc from 'fast-check';
import { SavedViewScope, LeadScoreTier, UserRole } from '@hatch/db';

import { InsightsService } from './insights.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';

const baseContext: RequestContext = {
  userId: 'user-ctx',
  tenantId: 'tenant-ctx',
  role: UserRole.BROKER,
  teamIds: ['team-1'],
  allowTeamContactActions: true,
  orgId: 'org-ctx',
  assignmentOverride: null
};

const createService = () => {
  const now = new Date('2025-01-01T12:00:00.000Z');
  const prisma = {
    person: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'lead-1',
          firstName: 'Aniya',
          lastName: 'Stone',
          ownerId: 'owner-1',
          owner: { id: 'owner-1', firstName: 'Aniya', lastName: 'Stone', avatarUrl: null },
          stageId: 'stage-a',
          stageEnteredAt: now,
          lastActivityAt: now,
          scoreTier: LeadScoreTier.A,
          pipelineStage: { id: 'stage-a', name: 'Discovery', order: 1 }
        }
      ])
    },
    leadAnalyticsView: {
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 1 },
        _sum: {
          stageMovesTotal: 2,
          stageMovesForward: 1,
          avgStageDurationMs: 60_000
        }
      })
    },
    leadTouchpoint: {
      findMany: jest.fn().mockResolvedValue([])
    },
    tour: {
      findMany: jest.fn().mockResolvedValue([])
    },
    savedView: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'view-1',
          name: 'All Leads',
          scope: SavedViewScope.ORGANIZATION,
          userId: 'user-ctx',
          teamId: null
        }
      ]),
      findUnique: jest.fn().mockResolvedValue(null)
    },
    leadHistory: {
      findMany: jest.fn().mockResolvedValue([])
    },
    stage: {
      findMany: jest.fn().mockResolvedValue([])
    },
    user: {
      findMany: jest.fn().mockResolvedValue([])
    }
  } as unknown as PrismaService;

  return { service: new InsightsService(prisma), prisma };
};

describe('InsightsService stage permutations', () => {
  it('returns identical responses and cache entries regardless of stage order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 10 }), {
          minLength: 1,
          maxLength: 4
        }),
        async (stageIds) => {
          const { service } = createService();
          const ctx: RequestContext = { ...baseContext };
          const normalize = (payload: Record<string, any>) => ({
            ...payload,
            period: payload.period
              ? { ...payload.period, start: 'normalized', end: 'normalized' }
              : payload.period
          });

          const base = await service.getInsights(ctx, {
            tenantId: ctx.tenantId,
            stage: stageIds
          });

          const variants: string[][] = [];
          const seen = new Set<string>();
          const addVariant = (order: string[]) => {
            const key = order.join('|');
            if (!seen.has(key)) {
              seen.add(key);
              variants.push(order);
            }
          };

          addVariant(stageIds);
          if (stageIds.length > 1) {
            addVariant([...stageIds].reverse());
            for (let shift = 1; shift < Math.min(stageIds.length, 4); shift += 1) {
              const rotated = [...stageIds.slice(shift), ...stageIds.slice(0, shift)];
              addVariant(rotated);
            }
          }

          for (const permutation of variants) {
            const next = await service.getInsights(ctx, {
              tenantId: ctx.tenantId,
              stage: permutation
            });
            expect(normalize(next)).toEqual(normalize(base));
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
