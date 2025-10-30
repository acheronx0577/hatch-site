import { getMetricsSeries } from '@/lib/api/reporting';

const METRIC_DEFAULT_RANGE_DAYS = 7;

export default async function MetricsCards() {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - (METRIC_DEFAULT_RANGE_DAYS - 1));

  const rangeParams = {
    from: defaultFrom.toISOString(),
    to: today.toISOString()
  };

  const [conversion, deliverability, ccRisk, pipeline] = await Promise.all([
    getMetricsSeries('leads.conversion', rangeParams),
    getMetricsSeries('messaging.deliverability', rangeParams),
    getMetricsSeries('cc.risk', rangeParams),
    getMetricsSeries('pipeline.value', rangeParams)
  ]);

  const conversionLatest = latestPoint(conversion);
  const conversionPrevious = previousPoint(conversion);

  const deliverabilityLatest = latestPoint(deliverability);
  const ccRiskLatest = latestPoint(ccRisk);
  const pipelineLatest = latestPoint(pipeline);

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Lead Conversion</h2>
        <p className="mt-3 text-3xl font-bold text-brand-600">
          {formatPercent(conversionLatest?.valueNum)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {conversionPrevious && conversionLatest?.valueNum !== null
            ? renderDelta(conversionLatest.valueNum, conversionPrevious.valueNum ?? 0)
            : 'No historical comparison available yet.'}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Messaging Deliverability</h2>
        <p className="mt-3 text-3xl font-bold text-emerald-600">
          {formatPercent(deliverabilityLatest?.valueNum)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {deliverabilityLatest?.valueJson
            ? formatDeliverabilitySummary(deliverabilityLatest.valueJson)
            : 'No messages sent in the selected range.'}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Clear Cooperation Risk</h2>
        <p className={`mt-3 text-2xl font-semibold ${riskTone(ccRiskLatest?.valueNum)}`}>
          {formatRisk(ccRiskLatest?.valueNum)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {ccRiskLatest?.valueJson
            ? formatRiskBreakdown(ccRiskLatest.valueJson)
            : 'No active timers recorded.'}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Pipeline Value by Stage</h2>
        {pipelineLatest?.valueJson && Object.keys(pipelineLatest.valueJson).length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {Object.entries(pipelineLatest.valueJson)
              .slice(0, 5)
              .map(([stage, value]) => (
                <li key={stage} className="flex justify-between">
                  <span className="font-medium text-slate-600">{stage}</span>
                  <span>{formatCurrency(Number(value))}</span>
                </li>
              ))}
            {Object.keys(pipelineLatest.valueJson).length > 5 && (
              <li className="text-xs text-slate-500">Additional stages truncated…</li>
            )}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No open opportunities yet.</p>
        )}
      </div>
    </section>
  );
}

const latestPoint = (series: { valueNum: number | null; valueJson: Record<string, unknown> | null }[]) =>
  series.length > 0 ? series[series.length - 1] : undefined;

const previousPoint = (series: { valueNum: number | null }[]) =>
  series.length > 1 ? series[series.length - 2] : undefined;

const formatPercent = (value?: number | null) =>
  value !== null && value !== undefined
    ? `${(value * 100).toFixed(1)}%`
    : 'No data';

const renderDelta = (current: number, previous: number) => {
  const delta = current - previous;
  if (!Number.isFinite(delta) || previous === 0) {
    return 'Trend unavailable.';
  }
  const percentage = delta * 100;
  const direction = delta >= 0 ? '▲' : '▼';
  return `${direction} ${Math.abs(percentage).toFixed(1)} pts vs prior day`;
};

const formatDeliverabilitySummary = (valueJson: Record<string, unknown>) => {
  const total = Number(valueJson.total ?? 0);
  const success = Number(valueJson.success ?? 0);
  const failed = Number(valueJson.failed ?? 0);

  if (total === 0) {
    return 'No outbound messages in range.';
  }

  return `${success}/${total} successful • ${failed} failed`;
};

const formatRisk = (value?: number | null) => {
  if (value === null || value === undefined) {
    return 'No data';
  }
  if (value >= 0.75) {
    return 'High Risk';
  }
  if (value >= 0.4) {
    return 'Moderate Risk';
  }
  return 'Low Risk';
};

const riskTone = (value?: number | null) => {
  if (value === null || value === undefined) {
    return 'text-slate-600';
  }
  if (value >= 0.75) {
    return 'text-rose-600';
  }
  if (value >= 0.4) {
    return 'text-amber-600';
  }
  return 'text-emerald-600';
};

const formatRiskBreakdown = (valueJson: Record<string, unknown>) => {
  const green = Number(valueJson.GREEN ?? 0);
  const yellow = Number(valueJson.YELLOW ?? 0);
  const red = Number(valueJson.RED ?? 0);
  const total = green + yellow + red;
  if (total === 0) {
    return 'No timers recorded.';
  }
  return `${red} red • ${yellow} yellow • ${green} green`;
};

const formatCurrency = (value?: number | null) =>
  value !== null && value !== undefined
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
    : '$0';
