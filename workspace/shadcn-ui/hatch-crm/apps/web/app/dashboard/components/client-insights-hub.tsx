'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, FilterIcon, Loader2, RefreshCcw, Sparkles, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';

import {
  ClientInsightsPayload,
  ClientInsightsQueryParams,
  ClientInsightsSummary,
  InsightActivityFeedEntry,
  InsightCopilotMessage,
  InsightFilterOption,
  InsightTrendCard,
  InsightQueueBreach,
  getClientInsights,
  startJourney
} from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { EngagementHeatmap, ConversionChart, Leaderboard, ReengagementList } from '@/components/crm/ClientInsights';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { emitPersonaContext } from '@/lib/personas/events';

type ClientInsightsHubProps = {
  tenantId: string;
};

type FilterState = {
  ownerId?: string;
  tier?: string;
  activity?: string;
  viewId?: string;
  period: string;
};

const PERIOD_OPTIONS = [
  { label: '7 days', value: '7d' },
  { label: '14 days', value: '14d' },
  { label: '30 days', value: '30d' },
  { label: '60 days', value: '60d' }
];

const INSIGHTS_LIMIT = 50;

export function ClientInsightsHub({ tenantId }: ClientInsightsHubProps) {
  const [filters, setFilters] = useState<FilterState>({
    period: '7d'
  });

  const queryParams = useMemo<ClientInsightsQueryParams>(
    () => ({
      tenantId,
      ownerId: filters.ownerId,
      tier: filters.tier,
      activity: filters.activity,
      viewId: filters.viewId,
      period: filters.period,
      limit: INSIGHTS_LIMIT
    }),
    [tenantId, filters]
  );

  const queryKey = useMemo(
    () => [
      'insights',
      tenantId,
      filters.ownerId ?? 'all',
      filters.tier ?? 'all',
      filters.activity ?? 'all',
      filters.period,
      INSIGHTS_LIMIT,
      'v1'
    ],
    [tenantId, filters.ownerId, filters.tier, filters.activity, filters.period]
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isRateLimitedError = (error: unknown) => error instanceof ApiError && error.status === 429;

  const { data, isLoading, refetch, isFetching, error, isError } = useQuery({
    queryKey,
    queryFn: () => getClientInsights(queryParams),
    staleTime: 60_000,
    refetchInterval: 30_000,
    retry: (failureCount, error) => {
      if (isRateLimitedError(error)) {
        return false;
      }
      return failureCount < 2;
    }
  });

  useEffect(() => {
    if (isError && error && isRateLimitedError(error)) {
      toast({
        title: 'Too many refreshes',
        description: 'Please wait a moment before refreshing again.'
      });
    }
  }, [isError, error, toast]);

  const payload = data ?? ({} as ClientInsightsPayload);
  const router = useRouter();
  const activityFeedEntries = payload?.feed ?? payload?.activityFeed ?? [];
  const stageMeta = useMemo(() => {
    const map = new Map<string, { avgTimeHours: number | null; conversionRate: number | null }>();
    (payload?.bottlenecks ?? []).forEach((stage) => {
      map.set(stage.stageName, {
        avgTimeHours: stage.avgTimeHours ?? null,
        conversionRate: stage.conversionRate ?? null
      });
    });
    return map;
  }, [payload?.bottlenecks]);

  const handleHeatmapSelect = useCallback(
    (cell?: { key?: string }) => {
      if (!cell?.key) return;
      const params = new URLSearchParams();
      params.set('stageId', cell.key);
      if (filters.ownerId) params.set('ownerId', filters.ownerId);
      router.push(`/people?${params.toString()}`);
    },
    [router, filters.ownerId]
  );

  const handleSendMessage = useCallback(
    (leadId: string) => {
      router.push(`/messages?personId=${leadId}`);
    },
    [router]
  );

  const handleStartNurture = useCallback(
    async (leadId: string) => {
      try {
        await startJourney({ leadId, templateId: 'nurture-7d', source: 'insights' });
        toast({ title: '7-day nurture started' });
        await queryClient.invalidateQueries({ queryKey });
      } catch (error) {
        toast({
          title: 'Failed to start nurture',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive'
        });
      }
    },
    [queryClient, queryKey, toast]
  );

  const reengageList = payload?.queues?.reengage ?? payload?.reengagementQueue ?? [];
  const breachQueue = payload?.queues?.breaches ?? [];
  const liveFeed = activityFeedEntries.slice(0, 5);
  const dataAgeDate = payload?.dataAge ? new Date(payload.dataAge) : null;
  const dataAgeLabel = dataAgeDate ? formatDistanceToNow(dataAgeDate, { addSuffix: true }) : null;
  const isStaleData = dataAgeDate ? Date.now() - dataAgeDate.getTime() > 10 * 60 * 1000 : false;

  const handleBreachAssign = useCallback(
    (leadId: string) => {
      router.push(`/people/${leadId}?panel=assignment`);
    },
    [router]
  );

  const handleSelect = (key: keyof FilterState, value?: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({ period: filters.period });
  };

  useEffect(() => {
    emitPersonaContext({
      surface: 'dashboard',
      summary: `Client insights · ${filters.period}`,
      metadata: {
        tenantId,
        filters,
        reengageQueue: reengageList.length,
        breachQueue: breachQueue.length,
        stageFocus: filters.activity ?? 'all'
      }
    });
  }, [tenantId, filters, reengageList.length, breachQueue.length]);

  const hasFiltersApplied = Boolean(filters.ownerId || filters.tier || filters.activity || filters.viewId);
  const hasData =
    !!payload?.summary ||
    (payload?.trendCards?.length ?? 0) > 0 ||
    reengageList.length > 0 ||
    breachQueue.length > 0 ||
    activityFeedEntries.length > 0 ||
    (payload?.copilotInsights?.length ?? 0) > 0;

  if (isLoading && !data) {
    return <ClientInsightsLoading />;
  }

  if (isError) {
    return <ClientInsightsError onRetry={() => refetch()} />;
  }

  if (!hasData) {
    return (
      <ClientInsightsEmpty
        onRefresh={() => refetch()}
        onResetFilters={resetFilters}
        filtersApplied={hasFiltersApplied}
        isRefreshing={isFetching}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Client Insights</p>
          <h1 className="text-3xl font-semibold text-slate-900">Cohort Intelligence Hub</h1>
          <p className="mt-1 text-sm text-slate-500">
            Answer “who needs attention today?” across pipeline stages, owners, and lead tiers with live behavioral analytics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dataAgeLabel && (
            <Badge variant="outline" className="text-xs">
              Data as of {dataAgeLabel}
            </Badge>
          )}
          {isStaleData && (
            <Badge variant="destructive" className="text-xs">
              Stale data (refreshing…)
            </Badge>
          )}
          <select
            className="w-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={filters.period}
            onChange={(event) => handleSelect('period', event.target.value)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw className={clsx('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="sticky top-20 z-20">
        <FilterToolbar
          filters={payload?.filters}
          selected={filters}
          onChange={handleSelect}
          onReset={resetFilters}
          isStale={!isLoading && !isFetching && !!data}
        />
      </div>

      <TrendCards
        summary={payload?.summary}
        cards={payload?.trendCards ?? []}
        loading={isLoading && !data}
      />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <AttentionPanel entries={liveFeed} />
        <InsightsPanel insights={payload?.copilotInsights ?? []} />
      </div>

      <EngagementHeatmap
        data={payload?.engagement ?? { byStage: [], byOwner: [], byTier: [] }}
        onCellSelect={handleHeatmapSelect}
        stageMeta={stageMeta}
      />

      <ConversionChart data={payload?.bottlenecks ?? []} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <Leaderboard data={payload?.leaderboard ?? []} />
        <div className="space-y-6">
          <ReengagementList
            data={reengageList}
            onSendMessage={handleSendMessage}
            onStartNurture={handleStartNurture}
          />
          <BreachList data={breachQueue} onAssign={handleBreachAssign} onMessage={handleSendMessage} />
        </div>
      </div>

      <ActivityFeed entries={activityFeedEntries} loading={isLoading && !data} />
    </div>
  );
}

function ClientInsightsLoading() {
  return (
    <div className="space-y-6" data-testid="client-insights-loading">
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-100" />
          ))}
        </div>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ClientInsightsError({ onRetry }: { onRetry?: () => void }) {
  return (
    <Card className="space-y-4 border border-rose-200 bg-rose-50/70 p-6 shadow-sm" data-testid="client-insights-error">
      <div className="flex items-center gap-3 text-rose-700">
        <AlertCircle className="h-5 w-5" />
        <div>
          <p className="text-sm font-semibold">Unable to load insights</p>
          <p className="text-xs text-rose-600">Check your connection and retry to keep the dashboard fresh.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button size="sm" className="gap-2" onClick={() => onRetry?.()}>
          <RefreshCcw className="h-4 w-4" />
          Retry
        </Button>
        <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
          Hard reload
        </Button>
      </div>
    </Card>
  );
}

function ClientInsightsEmpty({
  onRefresh,
  onResetFilters,
  filtersApplied,
  isRefreshing
}: {
  onRefresh?: () => void;
  onResetFilters: () => void;
  filtersApplied: boolean;
  isRefreshing: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 border border-dashed border-slate-200 bg-white/80 p-6 shadow-sm" data-testid="client-insights-empty">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-slate-900">No insights yet</p>
          <p className="text-xs text-slate-600">
            {filtersApplied
              ? 'No results match your current filters. Try resetting or widening the timeframe.'
              : 'We have not seen activity for this cohort yet. Refresh to pull the latest events.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button size="sm" className="gap-2" onClick={() => onRefresh?.()} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh data
        </Button>
        {filtersApplied && (
          <Button size="sm" variant="outline" onClick={onResetFilters}>
            Clear filters
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <a href="/people">View people</a>
        </Button>
      </div>
    </Card>
  );
}

type FilterToolbarProps = {
  filters?: ClientInsightsPayload['filters'];
  selected: FilterState;
  onChange: (key: keyof FilterState, value?: string) => void;
  onReset: () => void;
  isStale: boolean;
};

function FilterToolbar({ filters, selected, onChange, onReset, isStale }: FilterToolbarProps) {
  const ownerOptions = filters?.owners ?? [];
  const tierOptions = filters?.tiers ?? [];
  const activityOptions = filters?.activities ?? [];
  const savedViewOptions = filters?.savedViews ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3 text-slate-500">
        <FilterIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Filters</span>
        {isStale && <Badge variant="outline">Live</Badge>}
      </div>
      <div className="flex flex-1 flex-wrap gap-3">
        <FilterSelect
          placeholder="Owner"
          value={selected.ownerId}
          options={ownerOptions}
          onValueChange={(value) => onChange('ownerId', value)}
        />
        <FilterSelect
          placeholder="Tier"
          value={selected.tier}
          options={tierOptions}
          onValueChange={(value) => onChange('tier', value)}
        />
        <FilterSelect
          placeholder="Activity"
          value={selected.activity}
          options={activityOptions}
          onValueChange={(value) => onChange('activity', value)}
        />
        <FilterSelect
          placeholder="Saved view"
          value={selected.viewId}
          options={savedViewOptions}
          onValueChange={(value) => onChange('viewId', value)}
        />
        <Button variant="ghost" size="sm" onClick={onReset} className="text-xs text-slate-500 hover:text-slate-900">
          Reset
        </Button>
      </div>
    </div>
  );
}

function FilterSelect({
  placeholder,
  value,
  options,
  onValueChange
}: {
  placeholder: string;
  value?: string;
  options: InsightFilterOption[];
  onValueChange: (value?: string) => void;
}) {
  return (
    <select
      className="w-48 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
      value={value ?? 'ALL'}
      onChange={(event) => onValueChange(event.target.value === 'ALL' ? undefined : event.target.value)}
    >
      <option value="ALL">All</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type TrendCardRender = {
  key: string;
  label: string;
  value: string;
  delta?: string;
  sparkValue?: number;
};

function TrendCards({
  cards,
  summary,
  loading
}: {
  cards: InsightTrendCard[];
  summary?: ClientInsightsSummary;
  loading: boolean;
}) {
  const summaryCards: TrendCardRender[] =
    summary !== undefined
      ? [
          {
            key: 'active',
            label: 'Active Leads',
            value: summary.activeLeads.toString(),
            delta: summary.avgStageTimeHours ? `${summary.avgStageTimeHours}h avg stage time` : 'No stage timing yet.',
            sparkValue: Math.min(100, summary.activeLeads)
          },
          {
            key: 'conversion',
            label: 'Conversion',
            value: summary.conversionPct !== null ? `${(summary.conversionPct * 100).toFixed(1)}%` : '—',
            delta:
              summary.deltaWoW?.conversionPct != null
                ? `${(summary.deltaWoW.conversionPct * 100).toFixed(1)} pts WoW`
                : 'Trend pending',
            sparkValue: summary.conversionPct !== null ? summary.conversionPct * 100 : undefined
          }
        ]
      : [];

  const displayCards: TrendCardRender[] = [
    ...summaryCards,
    ...cards.map<TrendCardRender>((card) => ({
      key: card.key,
      label: card.label,
      value: card.value,
      delta: card.deltaLabel ?? undefined
    }))
  ];

  if (loading && cards.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="trend-cards">
      {displayCards.map((card) => (
        <div key={card.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{card.label}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{card.value}</p>
          {card.delta && <p className="mt-1 text-xs text-slate-500">{card.delta}</p>}
          {card.sparkValue !== undefined && (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, card.sparkValue))}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function InsightsPanel({ insights }: { insights: InsightCopilotMessage[] }) {
  return (
    <Card className="flex flex-col gap-3 border border-emerald-100 bg-emerald-50/60 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">AI Insights</p>
          <p className="text-xs text-emerald-600/80">Narrative takeaways generated from live analytics.</p>
        </div>
      </div>
      <ul className="space-y-3">
        {insights.length === 0 ? (
          <li className="flex items-center gap-2 text-xs text-emerald-700">
            <AlertTriangle className="h-4 w-4" />
            No insights yet—log activity to train the AI.
          </li>
        ) : (
          insights.map((insight, index) => (
            <li key={index} className="flex items-start gap-3 text-sm text-emerald-900">
              <TrendingUp className="mt-1 h-4 w-4 text-emerald-500" />
              <span>{insight.message}</span>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

function ActivityFeed({ entries, loading }: { entries: InsightActivityFeedEntry[]; loading: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="insights-feed">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">Lead Activity Feed</h2>
        <p className="text-xs text-slate-500">Stage changes, messages, and showings in chronological order.</p>
      </div>
      <div className="flex flex-col gap-0 divide-y divide-slate-100">
        {loading && entries.length === 0 ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="animate-pulse px-6 py-4">
              <div className="h-4 w-40 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-64 rounded bg-slate-100" />
            </div>
          ))
        ) : entries.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            No recent activity in this cohort. Try broadening filters or extending the period.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{entry.leadName}</p>
                <p className="text-xs text-slate-500">
                  {entry.type.toLowerCase().replace(/_/g, ' ')} • {new Date(entry.occurredAt).toLocaleString()}
                </p>
                {entry.summary && <p className="mt-1 text-xs text-slate-600">{entry.summary}</p>}
              </div>
              {entry.ownerName && <span className="text-xs text-slate-400">{entry.ownerName}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AttentionPanel({ entries }: { entries: InsightActivityFeedEntry[] }) {
  return (
    <Card className="flex flex-col gap-4 border border-amber-100 bg-amber-50/50 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Active Right Now</p>
          <p className="text-xs text-amber-700">Live feed of touches in the last few minutes.</p>
        </div>
      </div>
      <ul className="space-y-3">
        {entries.length === 0 ? (
          <li className="text-xs text-amber-700">No live activity yet. Engage leads to see updates here.</li>
        ) : (
          entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-900">{entry.leadName}</p>
                <p className="text-xs text-amber-700">{entry.summary ?? entry.type.toLowerCase()}</p>
              </div>
              <span className="text-xs text-amber-500">
                {formatDistanceToNow(new Date(entry.occurredAt), { addSuffix: true })}
              </span>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

function BreachList({
  data,
  onAssign,
  onMessage
}: {
  data: InsightQueueBreach[];
  onAssign?: (leadId: string) => void;
  onMessage?: (leadId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-rose-100 bg-white shadow-sm">
      <div className="border-b border-rose-100 px-6 py-4">
        <p className="text-sm font-semibold text-rose-700">SLA Breaches</p>
        <p className="text-xs text-rose-500">Leads waiting beyond promised response time.</p>
      </div>
      <ul className="divide-y divide-rose-50">
        {data.length === 0 ? (
          <li className="px-6 py-6 text-center text-xs text-rose-500">No active breaches. Great work!</li>
        ) : (
          data.map((entry) => (
            <li key={entry.leadId} className="flex items-center justify-between gap-3 px-6 py-4">
              <div>
                <p className="text-sm font-semibold text-rose-900">{entry.leadName}</p>
                {entry.ownerName && <p className="text-xs text-rose-500">{entry.ownerName}</p>}
                <p className="text-xs font-semibold text-rose-600">
                  {entry.minutesOverLabel ?? `${entry.minutesOver}m overdue`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => onMessage?.(entry.leadId)}>
                  Message
                </Button>
                <Button variant="outline" size="sm" onClick={() => onAssign?.(entry.leadId)}>
                  Assign
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
