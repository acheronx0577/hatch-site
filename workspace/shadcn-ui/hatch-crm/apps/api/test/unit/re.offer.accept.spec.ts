import { OfferStatus, DealStage, Prisma } from '@hatch/db';

import { OffersService } from '../../src/modules/re/offers/offers.service';

describe('OffersService – accept idempotency', () => {
  const ctx = { orgId: 'org-1', tenantId: 'tenant-1', userId: 'user-1' } as any;

  const listing = {
    id: 'listing-1',
    tenantId: 'tenant-1',
    status: 'ACTIVE',
    opportunityId: null,
    price: new Prisma.Decimal(250000)
  };

  let offerState: any;

  beforeEach(() => {
    offerState = {
      id: 'offer-1',
      tenantId: 'tenant-1',
      listingId: 'listing-1',
      personId: 'person-1',
      status: OfferStatus.SUBMITTED,
      listing,
      deal: null,
      terms: { amount: 250000 }
    };
  });

  it('only creates the transaction once', async () => {
    const txOfferFindUnique = jest.fn().mockImplementation(() => offerState);
    const txOfferFindFirst = jest.fn().mockResolvedValue(null);
    const txOfferUpdate = jest.fn().mockImplementation(({ data }) => {
      if ('status' in data) {
        offerState = {
          ...offerState,
          status: data.status,
          metadata: data.metadata,
          deal: data.status === OfferStatus.ACCEPTED ? { id: 'txn-1' } : offerState.deal
        };
        return { ...offerState }; // ensure listing present
      }

      offerState = {
        ...offerState,
        dealId: data.dealId,
        deal: { id: data.dealId }
      };
      return { ...offerState };
    });

    const txMock = {
      offer: {
        findUnique: txOfferFindUnique,
        findFirst: txOfferFindFirst,
        update: txOfferUpdate
      }
    } as any;

    const prisma = {
      $transaction: jest.fn(async (fn) => fn(txMock)),
      offer: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn()
      }
    } as any;

    const fls = {
      filterWrite: jest.fn(async (_ctx, _obj, payload) => payload),
      filterRead: jest.fn(async (_ctx, _obj, payload) => payload)
    } as any;

    const transactionRecord = {
      id: 'txn-1',
      stage: DealStage.UNDER_CONTRACT,
      opportunityId: 'opp-1'
    };

    const transactions = {
      ensureForAcceptedOffer: jest.fn().mockResolvedValue(transactionRecord),
      toTransactionView: jest.fn().mockResolvedValue({ id: 'txn-1' })
    } as any;

    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) } as any;

    const service = new OffersService(prisma, fls, transactions, outbox);

    const first = await service.decide(ctx, 'offer-1', { status: 'ACCEPTED' });
    expect(first.offer.status).toBe(OfferStatus.ACCEPTED);
    expect(transactions.ensureForAcceptedOffer).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);

    const second = await service.decide(ctx, 'offer-1', { status: 'ACCEPTED' });
    expect(second.offer.status).toBe(OfferStatus.ACCEPTED);
    expect(transactions.ensureForAcceptedOffer).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(transactions.toTransactionView).toHaveBeenCalledTimes(2);
  });
});
