import { FlsService } from '../../src/platform/security/fls.service';

describe('FLS defaults for real-estate objects', () => {
  const membership = { isOrgAdmin: false, profileId: null };
  const prisma = {
    userOrgMembership: { findUnique: jest.fn().mockResolvedValue(membership) },
    permissionSetAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    fieldPermission: { findMany: jest.fn().mockResolvedValue([]) }
  } as any;

  const service = new FlsService(prisma);
  const ctx = { orgId: 'org-1', userId: 'user-1' } as any;

  it('strips unwritable offer fields on write', async () => {
    const payload = await service.filterWrite(ctx, 're_offers', {
      listingId: 'listing-1',
      amount: 250000,
      contingencies: ['finance'],
      status: 'ACCEPTED'
    });

    expect(payload).toEqual({ amount: 250000, contingencies: ['finance'] });
  });

  it('redacts unknown transaction fields on read', async () => {
    const payload = await service.filterRead(ctx, 're_transactions', {
      id: 'txn-1',
      commissionSnapshot: { gross: 1000 },
      secret: 'hidden'
    });

    expect(payload).toEqual({
      id: 'txn-1',
      commissionSnapshot: { gross: 1000 }
    });
  });
});
