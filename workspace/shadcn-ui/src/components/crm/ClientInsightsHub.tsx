"use client";

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FilterIcon, RefreshCcw, Sparkles, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
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
  InsightReengagementLead,
  InsightStageBottleneck,
  InsightAgentPerformance,
  InsightHeatmapCell,
  getClientInsights,
  startJourney,
  type LeadSummary
} from '@/lib/api/hatch';
import { ApiError } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useLeadMessaging } from '@/contexts/LeadMessagingContext';

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
const FORCE_INSIGHTS_DEMO =
  (import.meta.env.VITE_CLIENT_INSIGHTS_DEMO ?? '').toString().toLowerCase() === 'true' ||
  import.meta.env.VITE_CLIENT_INSIGHTS_DEMO === '1';

const splitLeadName = (fullName: string): { firstName: string | null; lastName: string | null } => {
  const value = fullName?.trim();
  if (!value) {
    return { firstName: null, lastName: null };
  }
  const parts = value.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || null };
};

const breachEntryToLeadSummary = (entry: InsightQueueBreach): LeadSummary => {
  const timestamp = new Date().toISOString();
  const { firstName, lastName } = splitLeadName(entry.leadName);
  return {
    id: entry.leadId,
    firstName,
    lastName,
    email: null,
    phone: null,
    score: 0,
    scoreTier: '—',
    owner: entry.ownerName
      ? {
          id: `insight-owner-${entry.leadId}`,
          name: entry.ownerName,
          email: '',
          role: 'OWNER'
        }
      : undefined,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

const createFallbackInsights = (): ClientInsightsPayload => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

  const feed: InsightActivityFeedEntry[] = [
    {
      id: 'feed-1',
      type: 'STAGE_MOVED',
      occurredAt: hoursAgo(1),
      leadId: 'lead-101',
      leadName: 'Nina Carey',
      ownerName: 'Alex Agent',
      summary: 'Moved from New Inquiry → Touring',
      metadata: { stage: 'Touring' }
    },
    {
      id: 'feed-2',
      type: 'EMAIL_OPEN',
      occurredAt: hoursAgo(3),
      leadId: 'lead-205',
      leadName: 'Andre Keller',
      ownerName: 'Jordan Reed',
      summary: 'Opened market update email twice',
      metadata: { channel: 'email' }
    },
    {
      id: 'feed-3',
      type: 'SHOWING_BOOKED',
      occurredAt: hoursAgo(6),
      leadId: 'lead-330',
      leadName: 'Lia Monroe',
      ownerName: 'Casey Wong',
      summary: 'Booked tour for 7420 Palm Ave',
      metadata: { listing: '7420 Palm Ave' }
    }
  ];

  const reengage: InsightReengagementLead[] = [
    {
      leadId: 'lead-401',
      leadName: 'Sean Patel',
      stageId: 'stage-nurture',
      stageName: 'Nurture',
      ownerName: 'Jordan Reed',
      daysDormant: 12,
      lastActivityAt: hoursAgo(24 * 12)
    },
    {
      leadId: 'lead-402',
      leadName: 'Emily Gomez',
      stageId: 'stage-prequal',
      stageName: 'Pre-Qual',
      ownerName: 'Alex Agent',
      daysDormant: 8,
      lastActivityAt: hoursAgo(24 * 8)
    }
  ];

  return {
    v: 2,
    period: {
      label: 'Last 7 days',
      days: 7,
      start: sevenDaysAgo.toISOString(),
      end: now.toISOString()
    },
    summary: {
      activeLeads: 42,
      avgStageTimeHours: 48,
      conversionPct: 0.34,
      deltaWoW: { conversionPct: 0.05 }
    },
    dataAge: now.toISOString(),
    filters: {
      owners: [
        { id: 'owner-alex', label: 'Alex Agent' },
        { id: 'owner-jordan', label: 'Jordan Reed' },
        { id: 'owner-casey', label: 'Casey Wong' }
      ],
      tiers: [
        { id: 'tier-a', label: 'Tier A' },
        { id: 'tier-b', label: 'Tier B' },
        { id: 'tier-c', label: 'Tier C' }
      ],
      activities: [
        { id: 'active', label: 'Active last 7d' },
        { id: 'idle', label: 'Idle >7d' },
        { id: 'no-touch', label: 'No touches logged' }
      ],
      savedViews: [
        { id: 'view-hot', label: 'Hot pipeline' },
        { id: 'view-coverage', label: 'Coverage gaps' }
      ]
    },
    heatmap: [],
    engagement: {
      byStage: [
        { key: 'stage-new', label: 'New Inquiry', leads: 9, engaged: 6, touchpoints: 24, intensity: 0.78 },
        { key: 'stage-tour', label: 'Touring', leads: 7, engaged: 5, touchpoints: 21, intensity: 0.74 },
        { key: 'stage-offer', label: 'Offer', leads: 4, engaged: 3, touchpoints: 15, intensity: 0.69 }
      ],
      byOwner: [
        { key: 'owner-alex', label: 'Alex Agent', leads: 14, engaged: 11, touchpoints: 52, intensity: 0.88 },
        { key: 'owner-jordan', label: 'Jordan Reed', leads: 12, engaged: 8, touchpoints: 33, intensity: 0.7 },
        { key: 'owner-casey', label: 'Casey Wong', leads: 10, engaged: 6, touchpoints: 28, intensity: 0.63 }
      ],
      byTier: [
        { key: 'tier-a', label: 'Tier A', leads: 15, engaged: 13, touchpoints: 61, intensity: 0.9 },
        { key: 'tier-b', label: 'Tier B', leads: 17, engaged: 9, touchpoints: 34, intensity: 0.58 },
        { key: 'tier-c', label: 'Tier C', leads: 10, engaged: 4, touchpoints: 11, intensity: 0.32 }
      ]
    },
    bottlenecks: [
      {
        stageId: 'stage-tour',
        stageName: 'Touring',
        avgTimeHours: 64,
        conversionRate: 0.41,
        stalled: 3,
        touchpointsPerLead: 5
      },
      {
        stageId: 'stage-nurture',
        stageName: 'Nurture',
        avgTimeHours: 92,
        conversionRate: 0.22,
        stalled: 5,
        touchpointsPerLead: 3
      }
    ],
    leaderboard: [
      {
        agentId: 'owner-alex',
        agentName: 'Alex Agent',
        avatarUrl: null,
        activeLeads: 16,
        touchpoints: 58,
        slaBreaches: 0,
        avgResponseMinutes: 12,
        conversionRate: 0.46
      },
      {
        agentId: 'owner-jordan',
        agentName: 'Jordan Reed',
        avatarUrl: null,
        activeLeads: 14,
        touchpoints: 37,
        slaBreaches: 1,
        avgResponseMinutes: 28,
        conversionRate: 0.31
      },
      {
        agentId: 'owner-casey',
        agentName: 'Casey Wong',
        avatarUrl: null,
        activeLeads: 12,
        touchpoints: 33,
        slaBreaches: 2,
        avgResponseMinutes: 35,
        conversionRate: 0.29
      }
    ],
    feed,
    activityFeed: feed,
    reengagementQueue: reengage,
    queues: {
      reengage,
      breaches: [
        {
          leadId: 'lead-501',
          leadName: 'Lena Ortiz',
          ownerName: 'Casey Wong',
          minutesOver: 210,
          minutesOverLabel: '3.5h overdue'
        }
      ]
    },
    trendCards: [
      {
        key: 'high-intent',
        label: 'High-intent leads',
        value: '18',
        deltaLabel: '+5 vs last week',
        trend: 7
      },
      {
        key: 'stalled',
        label: 'Stalled pipeline',
        value: '7',
        deltaLabel: '-2 vs last week',
        trend: -3
      },
      {
        key: 'tours',
        label: 'Tours booked',
        value: '11',
        deltaLabel: '+4 WoW',
        trend: 8
      }
    ],
    copilotInsights: [
      {
        message:
          'Tours scheduled jumped 22% after Tuesday drip—extend the cadence to the entire Tier A cohort today.'
      },
      {
        message: 'Three dormant leads reopened email threads after market snapshots. Send personalized comps.'
      }
    ]
  };
};

export function ClientInsightsHub({ tenantId }: ClientInsightsHubProps) {
  const [filters, setFilters] = useState<FilterState>({
    period: '7d'
  });

  const fallbackPayload = useMemo(() => createFallbackInsights(), []);

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

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => getClientInsights(queryParams),
    keepPreviousData: true,
    staleTime: 60_000,
    refetchInterval: 30_000,
    retry: (failureCount, error) => {
      if (isRateLimitedError(error)) {
        return false;
      }
      return failureCount < 2;
    },
    onError: (error) => {
      if (isRateLimitedError(error)) {
        toast({
          title: 'Too many refreshes',
          description: 'Please wait a moment before refreshing again.'
        });
      }
    }
  });

  const usingFallback = FORCE_INSIGHTS_DEMO || (!data && !isLoading && !isFetching);
  const payload = (usingFallback ? fallbackPayload : data) ?? ({} as ClientInsightsPayload);
  const navigate = useNavigate();
  const { openForLead } = useLeadMessaging();
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
      navigate(`/broker/crm?${params.toString()}`);
    },
    [navigate, filters.ownerId]
  );

  const handleSendMessage = useCallback(
    (leadId: string) => {
      openForLead(leadId);
    },
    [openForLead]
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
    (entry: InsightQueueBreach) => {
      navigate(`/broker/crm/leads/${entry.leadId}?panel=assignment`, {
        state: { lead: breachEntryToLeadSummary(entry), skipRemoteFetch: usingFallback }
      });
    },
    [navigate, usingFallback]
  );

  const handleSelect = (key: keyof FilterState, value?: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({ period: filters.period });
  };

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
          {usingFallback && (
            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 border-amber-200">
              Demo data preview
            </Badge>
          )}
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
          <Select value={filters.period} onValueChange={(value) => handleSelect('period', value)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <CopilotPanel insights={payload?.copilotInsights ?? []} />
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
          placeholder="Licensee"
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
    <Select value={value ?? 'ALL'} onValueChange={(next) => onValueChange(next === 'ALL' ? undefined : next)}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type EngagementHeatmapProps = {
  data: {
    byStage: InsightHeatmapCell[];
    byOwner: InsightHeatmapCell[];
    byTier: InsightHeatmapCell[];
  };
  stageMeta?: Map<string, { avgTimeHours: number | null; conversionRate: number | null }>;
  onCellSelect?: (cell?: { key?: string }) => void;
};

function EngagementHeatmap({ data, stageMeta = new Map(), onCellSelect }: EngagementHeatmapProps) {
  const sections = [
    { title: 'By Stage', cells: data.byStage },
    { title: 'By Licensee', cells: data.byOwner },
    { title: 'By Tier', cells: data.byTier }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="engagement-heatmap">
      {sections.map((section) => (
        <Card key={section.title} className="border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">{section.title}</p>
            <Badge variant="outline">{section.cells.length}</Badge>
          </div>
          <div className="space-y-3">
            {section.cells.length === 0 ? (
              <p className="text-xs text-slate-500">No data yet.</p>
            ) : (
              section.cells.slice(0, 5).map((cell) => {
                const meta = stageMeta.get(cell.key);
                return (
                  <button
                    key={cell.key}
                    className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm hover:border-slate-300"
                    onClick={() => onCellSelect?.({ key: cell.key })}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">{cell.label}</span>
                      <span className="text-xs text-slate-500">{cell.leads} leads</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{cell.engaged} engaged</span>
                      {meta?.avgTimeHours != null && <span>{meta?.avgTimeHours}h avg</span>}
                      {meta?.conversionRate != null && (
                        <span>{Math.round((meta?.conversionRate ?? 0) * 100)}%</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ConversionChart({ data }: { data: InsightStageBottleneck[] }) {
  return (
    <Card className="border border-slate-200 p-5" data-testid="conversion-chart">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Pipeline Bottlenecks</p>
          <p className="text-xs text-slate-500">Stages with the longest dwell time or slowest conversion.</p>
        </div>
      </div>
      <div className="space-y-3">
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">No bottlenecks detected.</p>
        ) : (
          data.slice(0, 5).map((stage) => (
            <div key={stage.stageId} className="rounded-xl border border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                <span>{stage.stageName}</span>
                <span>{stage.avgTimeHours ? `${stage.avgTimeHours}h` : '—'}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>{stage.stalled} stalled</span>
                <span>
                  Conversion {stage.conversionRate !== null ? `${Math.round(stage.conversionRate * 100)}%` : '—'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function Leaderboard({ data }: { data: InsightAgentPerformance[] }) {
  return (
    <Card className="border border-blue-100 bg-white p-5 shadow-sm" data-testid="insights-leaderboard">
      <div className="mb-4">
        <p className="text-sm font-semibold text-blue-900">Agent Leaderboard</p>
        <p className="text-xs text-blue-700">Touches, SLA discipline, and conversion rates.</p>
      </div>
      <div className="space-y-3">
        {data.length === 0 ? (
          <p className="text-xs text-blue-700">No agent activity for this cohort.</p>
        ) : (
          data.slice(0, 5).map((agent) => (
            <div key={agent.agentId} className="rounded-xl border border-blue-100 px-4 py-3">
              <div className="flex items-center justify-between text-sm font-semibold text-blue-900">
                <span>{agent.agentName}</span>
                <span>{agent.activeLeads} leads</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-blue-700">
                <span>{agent.touchpoints} touches</span>
                <span>SLA breaches: {agent.slaBreaches}</span>
                <span>
                  {agent.conversionRate !== null ? `${Math.round(agent.conversionRate * 100)}%` : '—'} convo
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function ReengagementList({
  data,
  onSendMessage,
  onStartNurture
}: {
  data: InsightReengagementLead[];
  onSendMessage?: (leadId: string) => void;
  onStartNurture?: (leadId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="reengagement-list">
      <div className="border-b border-slate-100 px-6 py-4">
        <p className="text-sm font-semibold text-slate-900">Re-engage Queue</p>
        <p className="text-xs text-slate-500">Dormant leads that need follow-up.</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {data.length === 0 ? (
          <li className="px-6 py-6 text-center text-xs text-slate-500">All quiet. No dormant leads right now.</li>
        ) : (
          data.slice(0, 5).map((lead) => (
            <li key={lead.leadId} className="flex items-center justify-between gap-3 px-6 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{lead.leadName}</p>
                <p className="text-xs text-slate-500">
                  {lead.stageName ?? 'No stage'} • {lead.daysDormant}d dormant
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => onSendMessage?.(lead.leadId)}>
                  Message
                </Button>
                <Button variant="outline" size="sm" onClick={() => onStartNurture?.(lead.leadId)}>
                  Nurture
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function TrendCards({
  cards,
  summary,
  loading
}: {
  cards: InsightTrendCard[];
  summary?: ClientInsightsSummary;
  loading: boolean;
}) {
  const summaryCards =
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

  const displayCards = [
    ...summaryCards,
    ...cards.map((card) => ({
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

function CopilotPanel({ insights }: { insights: InsightCopilotMessage[] }) {
  return (
    <Card className="flex flex-col gap-3 border border-emerald-100 bg-emerald-50/60 p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">Copilot Insights</p>
          <p className="text-xs text-emerald-600/80">Narrative takeaways generated from live analytics.</p>
        </div>
      </div>
      <ul className="space-y-3">
        {insights.length === 0 ? (
          <li className="flex items-center gap-2 text-xs text-emerald-700">
            <AlertTriangle className="h-4 w-4" />
            No insights yet—log activity to train the copilot.
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
  onAssign?: (entry: InsightQueueBreach) => void;
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
                <Button variant="outline" size="sm" onClick={() => onAssign?.(entry)}>
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
