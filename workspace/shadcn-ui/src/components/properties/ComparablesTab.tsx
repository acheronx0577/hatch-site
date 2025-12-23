import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { FullPropertyComparable } from '@/lib/api/org-listings';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

export function ComparablesTab({ comps }: { comps: FullPropertyComparable[] }) {
  if (!comps || comps.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-white/10 p-4 text-sm text-slate-600 backdrop-blur-md dark:bg-white/5">
        No comparable sales found for this area yet.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comparable sales</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead>Sold price</TableHead>
              <TableHead>$/sqft</TableHead>
              <TableHead>Beds</TableHead>
              <TableHead>Baths</TableHead>
              <TableHead>Sold date</TableHead>
              <TableHead className="text-right">Distance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comps.map((comp) => (
              <TableRow key={`${comp.address}-${comp.soldDate}`}>
                <TableCell className="max-w-[360px] truncate font-medium text-slate-900">{comp.address}</TableCell>
                <TableCell className="font-medium text-slate-900">{currencyFormatter.format(comp.price)}</TableCell>
                <TableCell className="text-slate-700">
                  {comp.pricePerSqft ? currencyFormatter.format(comp.pricePerSqft) : '—'}
                </TableCell>
                <TableCell className="text-slate-700">{comp.bedrooms ?? '—'}</TableCell>
                <TableCell className="text-slate-700">{comp.bathrooms ?? '—'}</TableCell>
                <TableCell className="text-slate-700">{new Date(comp.soldDate).toLocaleDateString()}</TableCell>
                <TableCell className="text-right text-slate-700">
                  {comp.distanceMiles === null ? '—' : `${comp.distanceMiles.toFixed(2)} mi`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

