'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { fetchAgentPerformanceLatest, fetchAgentPerformanceTrend } from '@/lib/api/agent-performance';
import { cn } from '@/lib/utils';

type AgentPerformancePanelProps = {
  orgId: string;
  agentProfileId: string;
  riskLevel?: string | null;
  requiresAction?: boolean | null;
};

const bandTone: Record<string, string> = {
  HIGH: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
  DEVELOPING: 'bg-slate-50 text-slate-700 border-slate-200'
};

const bandLabel: Record<string, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  DEVELOPING: 'Developing'
};

const toPct = (score?: number | null) => Math.round(Math.max(0, Math.min(1, score ?? 0)) * 100);

function ScoreBar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={cn('h-2 rounded-full', tone)} style={{ width: `${value}%` }} />
    </div>
  );
}

export function AgentPerformancePanel({ orgId, agentProfileId, riskLevel, requiresAction }: AgentPerformancePanelProps) {
  const [days, setDays] = useState<30 | 60 | 90>(90);

  const latestQuery = useQuery({
    queryKey: ['agent-performance', 'latest', orgId, agentProfileId],
    queryFn: () => fetchAgentPerformanceLatest(orgId, agentProfileId),
    staleTime: 30_000
  });

  const trendQuery = useQuery({
    queryKey: ['agent-performance', 'trend', orgId, agentProfileId, days],
    queryFn: () => fetchAgentPerformanceTrend(orgId, agentProfileId, days),
    staleTime: 30_000,
    enabled: Boolean(agentProfileId)
  });

  const latest = latestQuery.data ?? null;
  const trend = trendQuery.data?.points ?? [];

  const chartData = useMemo(
    () =>
      trend
        .filter((point) => Boolean(point.computedAt))
        .map((point) => ({
          date: point.computedAt ? new Date(point.computedAt).toLocaleDateString() : '',
          overall: toPct(point.overallScore),
          riskDrag: Math.round((point.dimensions?.riskDragPenalty ?? 0) * 100)
        })),
    [trend]
  );

  const coaching = useMemo(() => {
    if (!latest) return [];
    const dims = latest.dimensions;
    const recs: Array<{ label: string; detail: string; href: string }> = [];

    if (dims.responsivenessReliability < 0.6) {
      recs.push({
        label: 'Improve first-touch responsiveness',
        detail: 'Reduce SLA breaches and shorten response time on new leads.',
        href: `/dashboard/leads?agentProfileId=${agentProfileId}&status=NEW`
      });
    }
    if ((dims.riskDragPenalty ?? 0) <= -0.08) {
      recs.push({
        label: 'Resolve risk drag',
        detail: 'Clear open compliance flags and reduce repeated interventions.',
        href: `/dashboard/compliance?agentProfileId=${agentProfileId}`
      });
    }
    if (dims.capacityLoad < 0.5) {
      recs.push({
        label: 'Protect capacity',
        detail: 'Throttle assignments or route new leads to an approval/overflow pool.',
        href: `/dashboard/transactions?agentProfileId=${agentProfileId}&filter=UNDER_CONTRACT&view=table`
      });
    }
    if (dims.historicalEffectiveness < 0.55) {
      recs.push({
        label: 'Boost conversion fundamentals',
        detail: 'Focus on qualification, follow-up, and closing hygiene.',
        href: `/dashboard/agents/${agentProfileId}`
      });
    }
    if (dims.recencyMomentum < 0.55) {
      recs.push({
        label: 'Increase recent momentum',
        detail: 'Increase touches and task completion cadence this week.',
        href: `/dashboard/transactions?agentProfileId=${agentProfileId}&filter=CLOSED&view=table`
      });
    }

    return recs.slice(0, 4);
  }, [agentProfileId, latest]);

  const showHighPerformerRiskBanner =
    latest &&
    latest.overallScore >= 0.75 &&
    (String(riskLevel ?? '').toUpperCase() === 'HIGH' || Boolean(requiresAction) || (latest.dimensions.riskDragPenalty ?? 0) <= -0.1);

  return (
    <Card className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Performance</h2>
          <p className="text-sm text-slate-500">Explainable, versioned Agent Performance Indicator (API_v1).</p>
        </div>

        <div className="flex items-center gap-2">
          {[30, 60, 90].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value as 30 | 60 | 90)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold',
                days === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'
              )}
            >
              {value}d
            </button>
          ))}
        </div>
      </div>

      {latestQuery.isLoading ? (
        <div className="mt-4 text-sm text-slate-400">Loading performance…</div>
      ) : !latest ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No performance snapshot yet. Nightly recompute will populate this panel.
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {showHighPerformerRiskBanner ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-800">High performer with elevated risk</p>
              <p className="text-sm text-rose-700">
                Strong performance signals, but risk drag is material. Resolve open compliance items to protect the score.
              </p>
              <Link href={`/dashboard/compliance?agentProfileId=${agentProfileId}`} className="mt-2 inline-block text-sm font-semibold text-rose-700 hover:underline">
                Review risk drivers
              </Link>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Badge className={cn('border', bandTone[latest.confidenceBand] ?? bandTone.DEVELOPING)}>
              API: {toPct(latest.overallScore)} ({bandLabel[latest.confidenceBand] ?? latest.confidenceBand})
            </Badge>
            <p className="text-xs text-slate-500">
              {latest.modelVersion} · Last updated {latest.lastUpdated ? new Date(latest.lastUpdated).toLocaleString() : '—'}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <DimensionCard
              label="Historical Effectiveness"
              description="Close rate, speed-to-close, and volume (tenure-aware)."
              value={toPct(latest.dimensions.historicalEffectiveness)}
            />
            <DimensionCard
              label="Responsiveness & Reliability"
              description="First-touch SLA health and follow-through signals."
              value={toPct(latest.dimensions.responsivenessReliability)}
            />
            <DimensionCard
              label="Recency & Momentum"
              description="Recent closings + activity trend vs baseline."
              value={toPct(latest.dimensions.recencyMomentum)}
            />
            <DimensionCard
              label="Opportunity Fit"
              description="Baseline fit (context can increase/decrease)."
              value={toPct(latest.dimensions.opportunityFit)}
            />
            <DimensionCard
              label="Capacity & Load"
              description="Current load + overload indicators."
              value={toPct(latest.dimensions.capacityLoad)}
            />
            <RiskDragCard penalty={latest.dimensions.riskDragPenalty} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Trend</p>
                  <p className="text-xs text-slate-500">Overall score (0–100) over {days} days.</p>
                </div>
              </div>
              <div className="mt-3 h-44">
                {trendQuery.isLoading ? (
                  <div className="text-sm text-slate-400">Loading trend…</div>
                ) : chartData.length === 0 ? (
                  <div className="text-sm text-slate-400">Not enough snapshots yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={30} />
                      <RechartsTooltip />
                      <Line
                        type="monotone"
                        dataKey="overall"
                        stroke="#0f172a"
                        strokeWidth={2}
                        dot={(props) => {
                          const { cx, cy, payload } = props as any;
                          const risk = Number(payload?.riskDrag ?? 0);
                          if (!Number.isFinite(risk) || risk > -8) return false;
                          return <circle cx={cx} cy={cy} r={3} fill="#e11d48" stroke="none" />;
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">Red dots mark days with notable risk drag.</p>
            </Card>

            <Card className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Recommended improvements</p>
              <p className="text-xs text-slate-500">What would improve this score next.</p>
              <div className="mt-3 space-y-2">
                {coaching.length === 0 ? (
                  <p className="text-sm text-slate-500">No recommendations right now.</p>
                ) : (
                  coaching.map((rec) => (
                    <div key={rec.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{rec.label}</p>
                      <p className="text-sm text-slate-600">{rec.detail}</p>
                      <Link href={rec.href} className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline">
                        Open workflow
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <details className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">Why this score?</summary>
            <div className="mt-3 space-y-2">
              {(latest.topDrivers ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No drivers available.</p>
              ) : (
                (latest.topDrivers ?? []).map((driver) => (
                  <div key={driver.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">{driver.label}</p>
                    <p className="text-sm text-slate-600">{driver.metricSummary}</p>
                    {driver.deepLink ? (
                      <Link href={driver.deepLink} className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline">
                        View evidence
                      </Link>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}

function DimensionCard({ label, description, value }: { label: string; description: string; value: number }) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <p className="text-sm font-semibold text-slate-900">{value}</p>
      </div>
      <div className="mt-3">
        <ScoreBar value={value} tone="bg-slate-900" />
      </div>
    </Card>
  );
}

function RiskDragCard({ penalty }: { penalty: number }) {
  const points = Math.round((penalty ?? 0) * 100);
  const severity = Math.min(100, Math.round(Math.abs(points) / 25 * 100));
  const hasDrag = points < 0;

  return (
    <Card className={cn('rounded-2xl border bg-white p-4 shadow-sm', hasDrag ? 'border-rose-100' : 'border-slate-100')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Risk Drag</p>
          <p className="text-xs text-slate-500">Penalty applied to overall score.</p>
        </div>
        <p className={cn('text-sm font-semibold', hasDrag ? 'text-rose-700' : 'text-slate-900')}>{points} pts</p>
      </div>
      <div className="mt-3">
        <ScoreBar value={severity} tone={hasDrag ? 'bg-rose-600' : 'bg-slate-300'} />
      </div>
    </Card>
  );
}
