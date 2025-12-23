import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FullPropertyAreaMetrics } from '@/lib/api/org-listings';
import { cn } from '@/lib/utils';

import { DetailRow } from './DetailRow';

const numberFormatter = new Intl.NumberFormat('en-US');
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

export function AreaMetricsTab({ metrics }: { metrics: FullPropertyAreaMetrics | null }) {
  if (!metrics) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-white/10 p-4 text-sm text-slate-600 backdrop-blur-md dark:bg-white/5">
        No area metrics available yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Market statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DetailRow
            label="Median home value"
            value={metrics.medianHomeValue ? currencyFormatter.format(metrics.medianHomeValue) : '—'}
          />
          <DetailRow
            label="Avg $/sqft"
            value={metrics.avgPricePerSqft ? currencyFormatter.format(metrics.avgPricePerSqft) : '—'}
          />
          <DetailRow label="Avg days on market" value={metrics.avgDaysOnMarket ?? '—'} />
          <DetailRow
            label="List/Sale ratio"
            value={metrics.listToSaleRatio ? `${(metrics.listToSaleRatio * 100).toFixed(1)}%` : '—'}
          />
          <DetailRow
            label="Inventory"
            value={metrics.inventoryMonths ? `${metrics.inventoryMonths.toFixed(1)} months` : '—'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price trends</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DetailRow
            label="1 year change"
            value={
              metrics.priceChange1Year === null ? (
                '—'
              ) : (
                <span className={metrics.priceChange1Year >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {metrics.priceChange1Year >= 0 ? '+' : ''}
                  {metrics.priceChange1Year.toFixed(1)}%
                </span>
              )
            }
          />
          <DetailRow
            label="5 year change"
            value={
              metrics.priceChange5Year === null ? (
                '—'
              ) : (
                <span className={metrics.priceChange5Year >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {metrics.priceChange5Year >= 0 ? '+' : ''}
                  {metrics.priceChange5Year.toFixed(1)}%
                </span>
              )
            }
          />
          <div className="pt-3 text-xs text-slate-500">
            <p>Trends are computed from recent comparable sales when available.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Walkability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScoreBar label="Walk score" score={metrics.walkScore} />
          <ScoreBar label="Transit score" score={metrics.transitScore} />
          <ScoreBar label="Bike score" score={metrics.bikeScore} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Demographics</CardTitle>
          <Badge variant="secondary">Provider integration pending</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Metric label="Population" value={metrics.population ? numberFormatter.format(metrics.population) : '—'} />
          <Metric label="Median age" value={metrics.medianAge ? metrics.medianAge.toFixed(0) : '—'} />
          <Metric label="Median income" value={metrics.medianIncome ? currencyFormatter.format(metrics.medianIncome) : '—'} />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white/15 p-4 text-sm backdrop-blur-md dark:bg-white/5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const resolvedScore = score ?? null;
  const percent = resolvedScore === null ? 0 : Math.max(0, Math.min(100, resolvedScore));
  const color =
    resolvedScore === null
      ? 'bg-slate-200'
      : percent >= 70
        ? 'bg-emerald-500'
        : percent >= 50
          ? 'bg-amber-500'
          : 'bg-rose-500';

  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{resolvedScore === null ? '—' : resolvedScore}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', color)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

