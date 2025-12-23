import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FullPropertyMlsDetails, OrgListingRecord } from '@/lib/api/org-listings';

import { DetailRow } from './DetailRow';

const numberFormatter = new Intl.NumberFormat('en-US');
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' && value.trim().length === 0) return '—';
  return String(value);
};

export function MlsDetailsTab({
  listing,
  details
}: {
  listing: OrgListingRecord;
  details: FullPropertyMlsDetails | null;
}) {
  const propertyType = details?.propertyType ?? listing.propertyType ?? null;
  const yearBuilt = details?.yearBuilt ?? listing.yearBuilt ?? null;
  const sqft = details?.sqft ?? listing.squareFeet ?? null;
  const lotSize = details?.lotSize ?? listing.lotSizeSqFt ?? null;
  const bedrooms = details?.bedrooms ?? listing.bedrooms ?? null;
  const bathrooms = details?.bathrooms ?? listing.bathrooms ?? null;
  const listDate = details?.listDate ?? null;
  const daysOnMarket = details?.daysOnMarket ?? null;

  const remarks = details?.publicRemarks ?? listing.publicRemarks ?? null;
  const hasAnyDetails =
    propertyType ||
    yearBuilt ||
    sqft ||
    lotSize ||
    bedrooms ||
    bathrooms ||
    listDate ||
    daysOnMarket ||
    Boolean(remarks);

  if (!hasAnyDetails) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-white/10 p-4 text-sm text-slate-600 backdrop-blur-md dark:bg-white/5">
        No MLS details available yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Property information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DetailRow label="Property type" value={formatValue(propertyType)} />
          <DetailRow label="Year built" value={formatValue(yearBuilt)} />
          <DetailRow label="Square feet" value={sqft ? numberFormatter.format(sqft) : '—'} />
          <DetailRow label="Lot size" value={lotSize ? numberFormatter.format(lotSize) : '—'} />
          <DetailRow label="Bedrooms" value={formatValue(bedrooms)} />
          <DetailRow label="Bathrooms" value={formatValue(bathrooms)} />
          <DetailRow label="List date" value={listDate ? new Date(listDate).toLocaleDateString() : '—'} />
          <DetailRow label="Days on market" value={formatValue(daysOnMarket)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DetailRow
            label="List price"
            value={listing.listPrice ? currencyFormatter.format(Number(listing.listPrice)) : '—'}
          />
          <DetailRow
            label="Tax amount"
            value={details?.taxAmount ? currencyFormatter.format(details.taxAmount) : '—'}
          />
          <DetailRow label="Tax year" value={formatValue(details?.taxYear ?? null)} />
          <DetailRow
            label="Assessed value"
            value={details?.assessedValue ? currencyFormatter.format(details.assessedValue) : '—'}
          />
          <DetailRow
            label="HOA"
            value={
              details?.hoa === null || details?.hoa === undefined
                ? '—'
                : details.hoa
                  ? 'Yes'
                  : 'No'
            }
          />
          <DetailRow
            label="HOA fee"
            value={details?.hoaFee ? currencyFormatter.format(details.hoaFee) : '—'}
          />
          <DetailRow label="HOA frequency" value={formatValue(details?.hoaFrequency ?? null)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DetailRow
            label="Virtual tour"
            value={
              details?.virtualTourUrl ? (
                <a
                  className="text-brand-blue-600 underline-offset-4 hover:underline"
                  href={details.virtualTourUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
              ) : (
                '—'
              )
            }
          />
          {listing.mlsNumber ? (
            <div className="pt-2">
              <Badge variant="outline">MLS #{listing.mlsNumber}</Badge>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {remarks ? (
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Remarks</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
            {remarks}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

