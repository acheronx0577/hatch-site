import { notFound } from 'next/navigation';

import OffersClient from '@/components/re/offers-client';
import { getReListing } from '@/lib/api/re.listings';
import { listReOffers } from '@/lib/api/re.offers';

interface ListingOffersPageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

const OFFERS_PAGE_SIZE = 50;

export default async function ListingOffersPage({ params }: ListingOffersPageProps) {
  try {
    const [listing, offers] = await Promise.all([
      getReListing(params.id),
      listReOffers(params.id, { limit: OFFERS_PAGE_SIZE })
    ]);

    return (
      <div className="space-y-6">
        <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Listing Offers</h1>
          <p className="text-sm text-slate-500">
            Review inbound offers, accept or reject them, and monitor the resulting transaction.
          </p>
        </header>

        <OffersClient
          listingId={listing.id}
          listingStatus={listing.status}
          transactionId={listing.transactionId ?? null}
          initialOffers={offers.items}
          initialNextCursor={offers.nextCursor ?? null}
          pageSize={OFFERS_PAGE_SIZE}
        />
      </div>
    );
  } catch (error) {
    notFound();
  }
}
