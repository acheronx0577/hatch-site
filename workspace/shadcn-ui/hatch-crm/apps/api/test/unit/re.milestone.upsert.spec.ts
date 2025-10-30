import { TransactionsService } from '../../src/modules/re/transactions/transactions.service';

describe('TransactionsService – milestone upsert', () => {
  const ctx = { orgId: 'org-1', tenantId: 'tenant-1', userId: 'user-1' } as any;

  it('emits only on first completion', async () => {
    let checklistState: any = { items: [] };

    const prisma = {
      deal: {
        findFirst: jest.fn().mockImplementation(() => ({
          id: 'txn-1',
          tenantId: 'tenant-1',
          personId: 'person-1',
          listingId: 'listing-1',
          opportunityId: null,
          milestoneChecklist: checklistState
        })),
        update: jest.fn().mockImplementation(({ data }: any) => {
          checklistState = data.milestoneChecklist;
          return {
            id: 'txn-1',
            tenantId: 'tenant-1',
            personId: 'person-1',
            listingId: 'listing-1',
            opportunityId: null,
            milestoneChecklist: checklistState
          };
        })
      }
    } as any;

    const fls = {
      filterWrite: jest.fn(async (_ctx: any, _obj: string, payload: any) => payload),
      filterRead: jest.fn(async (_ctx: any, _obj: string, payload: any) => payload)
    } as any;

    const commissionPlans = {} as any;
    const payouts = {} as any;
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) } as any;

    const service = new TransactionsService(prisma, fls, commissionPlans, payouts, outbox);

    const completedAt = new Date().toISOString();

    await service.updateMilestone(ctx, 'txn-1', {
      name: 'Inspection',
      completedAt,
      notes: 'All good'
    });

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(prisma.deal.update).toHaveBeenCalledTimes(1);

    await service.updateMilestone(ctx, 'txn-1', {
      name: 'Inspection',
      completedAt,
      notes: 'All good'
    });

    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(prisma.deal.update).toHaveBeenCalledTimes(1);
  });
});
