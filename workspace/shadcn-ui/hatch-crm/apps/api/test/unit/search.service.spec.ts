import { PersonStage, UserRole } from '@hatch/db';

import { SearchService } from '../../src/modules/search/search.service';

describe('SearchService helpers', () => {
  it('highlights query terms and aggregates facets', async () => {
    const prisma = {
      person: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'person-1',
            tenantId: 'tenant-hatch',
            organizationId: 'org-hatch',
            ownerId: 'user-broker',
            firstName: 'Alex',
            lastName: 'Smith',
            primaryEmail: 'alex.smith@example.com',
            primaryPhone: null,
            stage: PersonStage.ACTIVE,
            updatedAt: new Date('2024-01-02T12:00:00Z')
          }
        ])
      },
      account: { findMany: jest.fn().mockResolvedValue([]) },
      opportunity: { findMany: jest.fn().mockResolvedValue([]) },
      case: { findMany: jest.fn().mockResolvedValue([]) },
      listing: { findMany: jest.fn().mockResolvedValue([]) },
      offer: { findMany: jest.fn().mockResolvedValue([]) },
      deal: { findMany: jest.fn().mockResolvedValue([]) }
    } as any;

    const fls = {
      filterRead: jest.fn().mockImplementation(async (_ctx, _object, payload) => payload)
    } as any;

    const can = {
      can: jest.fn().mockResolvedValue(true)
    } as any;

    const service = new SearchService(prisma, fls, can);

    const result = await service.search(
      {
        orgId: 'org-hatch',
        tenantId: 'tenant-hatch',
        userId: 'user-broker',
        role: UserRole.BROKER,
        teamIds: [],
        allowTeamContactActions: true
      },
      { q: 'smith', types: ['contacts'], limit: 5 }
    );

    expect(result.items).toHaveLength(1);
    expect(result.facets.byType.contacts).toBe(1);
    expect(result.items[0].snippet ?? result.items[0].title).toMatch(/<mark>smith<\/mark>/i);
    expect(can.can).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-hatch', userId: 'user-broker' }),
      'read',
      'contacts',
      expect.objectContaining({ id: 'person-1' })
    );
  });
});
