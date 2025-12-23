'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';

import { useAgentPerformance } from './useAgentPerformance';
import type { MonthlyPerformance, PerformanceRange, PipelineStage, WeeklyActivity } from './performanceTypes';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const INTEGER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const EMPTY_MONTHLY: MonthlyPerformance[] = [];
const EMPTY_WEEKLY: WeeklyActivity[] = [];
const EMPTY_PIPELINE: PipelineStage[] = [];

type Props = {
  agentId: string;
  initialRange?: PerformanceRange;
};

export default function AgentPerformanceAnalytics({ agentId, initialRange = 'ytd' }: Props) {
  const [range, setRange] = useState<PerformanceRange>(initialRange);
  const { data, loading, error } = useAgentPerformance(agentId, range);

  const monthly = data?.monthlyPerformance ?? EMPTY_MONTHLY;
  const weekly = data?.weeklyActivity ?? EMPTY_WEEKLY;
  const pipeline = data?.pipeline ?? EMPTY_PIPELINE;

  const trendData = useMemo(() => withVolumeTrendline(monthly), [monthly]);

  const kpis = useMemo(() => {
    const totalVolume = sum(monthly.map((row) => row.volume));
    const totalClosings = sum(monthly.map((row) => row.closings));
    const avgSalePrice = totalClosings > 0 ? totalVolume / totalClosings : 0;
    const brokerageExpectedClosings = monthly.reduce((acc, row) => acc + (Number.isFinite(row.brokerageAvg) ? row.brokerageAvg : 0), 0);
    const vsBrokeragePct =
      brokerageExpectedClosings > 0 ? ((totalClosings - brokerageExpectedClosings) / brokerageExpectedClosings) * 100 : null;
    const deltaClosings = brokerageExpectedClosings > 0 ? totalClosings - brokerageExpectedClosings : null;

    return {
      totalVolume,
      totalClosings,
      avgSalePrice,
      brokerageExpectedClosings,
      vsBrokeragePct,
      deltaClosings,
    };
  }, [monthly]);

  const projectedCloseValue = useMemo(() => {
    const projectedStages = new Set(['Under Contract', 'Pending Close', 'Closed MTD']);
    return sum(pipeline.filter((stage) => projectedStages.has(stage.stage)).map((stage) => stage.value));
  }, [pipeline]);

  const pipelineTotals = useMemo(() => {
    const totalValue = sum(pipeline.map((stage) => stage.value));
    const totalCount = sum(pipeline.map((stage) => stage.count));
    return { totalValue, totalCount };
  }, [pipeline]);

  const brokerageAverageReference = useMemo(() => {
    if (monthly.length === 0) return 0;
    const avg = monthly.reduce((acc, row) => acc + (Number.isFinite(row.brokerageAvg) ? row.brokerageAvg : 0), 0) / monthly.length;
    return Number(avg.toFixed(2));
  }, [monthly]);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-slate-400">Agent Performance Analytics</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-50">
          {data?.agentName ?? 'Agent'}
          <span className="text-slate-400"> · {data?.brokerageName ?? 'Brokerage'}</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 p-1">
        {(
          [
            { key: 'mtd', label: 'MTD' },
            { key: 'qtd', label: 'QTD' },
            { key: 'ytd', label: 'YTD' },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setRange(option.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition',
              range === option.key
                ? 'bg-gradient-to-r from-blue-600 to-emerald-500 text-white'
                : 'text-slate-300 hover:bg-slate-800/70'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-slate-50 shadow-[0_0_0_1px_rgba(15,23,42,0.3),0_16px_60px_rgba(0,0,0,0.55)]">
      {header}

      {error ? (
        <div className="mt-6 rounded-2xl border border-rose-800/50 bg-rose-950/30 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
          Loading performance analytics…
        </div>
      ) : null}

      {data ? (
        <div className="mt-6 space-y-6">
          <RankingBanner
            rank={data.ranking.rank}
            totalAgents={data.ranking.totalAgents}
            percentile={data.ranking.percentile}
          />

          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard title="Total Volume" value={USD.format(kpis.totalVolume)} accent="blue" />
            <KpiCard title="Closings" value={INTEGER.format(kpis.totalClosings)} accent="emerald" />
            <KpiCard title="Avg Sale Price" value={USD.format(kpis.avgSalePrice)} accent="cyan" />
            <KpiCard
              title="Vs Brokerage Avg"
              value={formatDeltaClosings(kpis.deltaClosings)}
              subtitle={
                kpis.brokerageExpectedClosings > 0
                  ? `Avg agent: ${kpis.brokerageExpectedClosings.toFixed(1)} closings`
                  : 'Avg agent: —'
              }
              delta={kpis.vsBrokeragePct}
              accent="violet"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel className="lg:col-span-2" title="Volume & Closings (Trend)">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData} margin={{ top: 10, right: 18, left: 0, bottom: 6 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.16)" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: 'rgba(226,232,240,0.8)', fontSize: 12 }} />
                    <YAxis
                      yAxisId="volume"
                      tick={{ fill: 'rgba(226,232,240,0.8)', fontSize: 12 }}
                      tickFormatter={(v) => USD.format(Number(v))}
                    />
                    <YAxis
                      yAxisId="closings"
                      orientation="right"
                      tick={{ fill: 'rgba(226,232,240,0.8)', fontSize: 12 }}
                      allowDecimals={false}
                    />
                    <Tooltip {...darkTooltipProps} />
                    <Legend wrapperStyle={{ color: 'rgba(226,232,240,0.8)' }} />
                    <Area
                      yAxisId="volume"
                      type="monotone"
                      dataKey="volume"
                      name="Volume"
                      stroke="#3b82f6"
                      fill="rgba(59,130,246,0.25)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Bar yAxisId="closings" dataKey="closings" name="Closings" fill="rgba(34,197,94,0.75)" />
                    <Line
                      yAxisId="volume"
                      type="monotone"
                      dataKey="volumeTrend"
                      name="Trendline"
                      stroke="rgba(148,163,184,0.9)"
                      strokeDasharray="6 4"
                      dot={false}
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel
              title="Current Pipeline"
              subtitle={projectedCloseValue > 0 ? `Projected close: ${USD.format(projectedCloseValue)}` : undefined}
            >
              <PipelineBars stages={pipeline} totalValue={pipelineTotals.totalValue} />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="You vs Brokerage Average (Closings)">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthly} margin={{ top: 10, right: 18, left: 0, bottom: 6 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.16)" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: 'rgba(226,232,240,0.8)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'rgba(226,232,240,0.8)', fontSize: 12 }} allowDecimals={false} />
                    <Tooltip {...darkTooltipProps} />
                    <Legend wrapperStyle={{ color: 'rgba(226,232,240,0.8)' }} />
                    <ReferenceLine
                      y={brokerageAverageReference}
                      stroke="rgba(148,163,184,0.6)"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                    />
                    <Line
                      type="monotone"
                      dataKey="closings"
                      name="You"
                      stroke="#22c55e"
                      strokeWidth={2.5}
                      dot={{ r: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="brokerageAvg"
                      name="Brokerage Avg"
                      stroke="rgba(59,130,246,0.9)"
                      strokeDasharray="6 4"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Weekly Activity Volume">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly} margin={{ top: 10, right: 18, left: 0, bottom: 6 }}>
                    <CartesianGrid stroke="rgba(148,163,184,0.16)" strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fill: 'rgba(226,232,240,0.8)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'rgba(226,232,240,0.8)', fontSize: 12 }} allowDecimals={false} />
                    <Tooltip {...darkTooltipProps} />
                    <Legend wrapperStyle={{ color: 'rgba(226,232,240,0.8)' }} />
                    <Bar dataKey="showings" name="Showings" fill="rgba(59,130,246,0.8)" />
                    <Bar dataKey="openHouses" name="Open Houses" fill="rgba(14,165,233,0.75)" />
                    <Bar dataKey="offers" name="Offers" fill="rgba(34,197,94,0.8)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Panel({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-3xl border border-slate-800 bg-slate-900/40 p-5', className)}>
      <div className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-50">{title}</h2>
          {subtitle ? <p className="text-xs font-medium text-slate-300">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  delta,
  accent,
}: {
  title: string;
  value: string;
  subtitle?: string;
  delta?: number | null;
  accent: 'blue' | 'emerald' | 'cyan' | 'violet';
}) {
  const accentClass =
    accent === 'blue'
      ? 'from-blue-500/25 to-blue-500/5'
      : accent === 'emerald'
        ? 'from-emerald-500/25 to-emerald-500/5'
        : accent === 'cyan'
          ? 'from-cyan-500/25 to-cyan-500/5'
          : 'from-violet-500/25 to-violet-500/5';

  const showDelta = typeof delta === 'number' && Number.isFinite(delta);
  const deltaPositive = showDelta && delta >= 0;
  const DeltaIcon = deltaPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={cn('rounded-3xl border border-slate-800 bg-gradient-to-b p-4', accentClass)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-slate-300">{title}</p>
        {showDelta ? (
          <div
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              deltaPositive
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            )}
          >
            <DeltaIcon className="h-3.5 w-3.5" />
            {formatDeltaPct(delta)}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-300">{subtitle}</p> : null}
    </div>
  );
}

function RankingBanner({ rank, totalAgents, percentile }: { rank: number; totalAgents: number; percentile: number }) {
  const safePercent = clamp(percentile, 0, 100);
  return (
    <div className="rounded-3xl border border-slate-800 bg-gradient-to-r from-blue-600/20 via-slate-900/40 to-emerald-500/15 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-300">Percentile Ranking</p>
          <p className="mt-1 text-lg font-semibold text-slate-50">
            #{rank} <span className="text-slate-300">of {totalAgents}</span>
          </p>
        </div>
        <div className="min-w-[220px]">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>{safePercent}th percentile</span>
            <span className="tabular-nums">{safePercent}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
              style={{ width: `${safePercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineBars({ stages, totalValue }: { stages: PipelineStage[]; totalValue: number }) {
  if (!stages.length) {
    return <p className="text-sm text-slate-300">No pipeline data available.</p>;
  }

  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const pct = totalValue > 0 ? clamp((stage.value / totalValue) * 100, 0, 100) : 0;
        return (
          <div key={stage.stage} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-100">{stage.stage}</div>
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-slate-200">{stage.count}</span> · {USD.format(stage.value)}
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500/80 to-emerald-400/80"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function withVolumeTrendline(rows: MonthlyPerformance[]) {
  if (!rows.length) return [];
  const y = rows.map((row) => (Number.isFinite(row.volume) ? row.volume : 0));
  const { slope, intercept } = linearRegression(y);
  return rows.map((row, index) => ({
    ...row,
    volumeTrend: slope * index + intercept,
  }));
}

function linearRegression(y: number[]) {
  const n = y.length;
  if (n === 0) return { slope: 0, intercept: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i += 1) {
    const x = i;
    sumX += x;
    sumY += y[i] ?? 0;
    sumXY += x * (y[i] ?? 0);
    sumX2 += x * x;
  }

  const denom = n * sumX2 - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function sum(values: Array<number | null | undefined>) {
  return values.reduce<number>((acc, value) => acc + (typeof value === 'number' ? value : 0), 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDeltaPct(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(0)}%`;
}

function formatDeltaClosings(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} closings`;
}

const darkTooltipProps = {
  contentStyle: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: 12,
    color: 'rgba(248, 250, 252, 0.95)',
    fontSize: 12,
  },
  labelStyle: {
    color: 'rgba(226, 232, 240, 0.9)',
    fontWeight: 700,
    marginBottom: 8,
  },
  formatter: (value: unknown, name: unknown): [string, string] => {
    const label = typeof name === 'string' ? name : String(name);
    const numeric = typeof value === 'number' ? value : Number(value);
    if (label === 'Volume' || label === 'Trendline') {
      return [USD.format(numeric), label];
    }
    return [INTEGER.format(numeric), label];
  },
} as const;
