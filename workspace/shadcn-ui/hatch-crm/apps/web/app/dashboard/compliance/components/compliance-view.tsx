"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AgentPerformanceBadge } from '@/components/agent-performance-badge';
import {
  fetchMissionControlActivity,
  fetchMissionControlAgents,
  fetchMissionControlCompliance,
  MissionControlAgentRow,
  MissionControlEvent
} from '@/lib/api/mission-control';
import { fetchAgentPerformanceLeaderboard, type AgentPerformanceLeaderboardResponse } from '@/lib/api/agent-performance';

type ComplianceViewProps = {
  orgId: string;
};

const tabs = [
  { id: 'agents', label: 'Agents' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'ai', label: 'AI Evaluations' }
] as const;

const evaluationTypes = new Set<MissionControlEvent['type']>([
  'ORG_LISTING_EVALUATED',
  'ORG_TRANSACTION_EVALUATED'
]);

export function ComplianceView({ orgId }: ComplianceViewProps) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('agents');
  const searchParams = useSearchParams();
  const focusAgentProfileId = searchParams?.get('agentProfileId') ?? null;
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [orientationFilter, setOrientationFilter] = useState<'ALL' | 'BUYER_HEAVY' | 'SELLER_HEAVY' | 'BALANCED'>('ALL');
  const [priceBandFilter, setPriceBandFilter] = useState<'ALL' | 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY'>('ALL');
  const [officeFilter, setOfficeFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');

  const { data: summary } = useQuery({
    queryKey: ['mission-control', 'compliance-summary', orgId],
    queryFn: () => fetchMissionControlCompliance(orgId),
    staleTime: 30_000
  });

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['mission-control', 'agents', orgId, 'compliance'],
    queryFn: () => fetchMissionControlAgents(orgId),
    staleTime: 30_000
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['mission-control', 'activity', orgId, 'compliance'],
    queryFn: () => fetchMissionControlActivity(orgId),
    staleTime: 30_000
  });

  const evaluationEvents = useMemo(
    () => (events ?? []).filter((event) => evaluationTypes.has(event.type)),
    [events]
  );

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery({
    queryKey: [
      'agent-performance',
      'leaderboard',
      orgId,
      leaderboardPage,
      orientationFilter,
      priceBandFilter,
      officeFilter,
      teamFilter
    ],
    queryFn: () =>
      fetchAgentPerformanceLeaderboard(orgId, {
        page: leaderboardPage,
        limit: 25,
        orientation: orientationFilter === 'ALL' ? undefined : orientationFilter,
        priceBand: priceBandFilter === 'ALL' ? undefined : priceBandFilter,
        officeId: officeFilter === 'ALL' ? undefined : officeFilter,
        teamId: teamFilter === 'ALL' ? undefined : teamFilter
      }),
    staleTime: 30_000,
    enabled: activeTab === 'leaderboard'
  });

  const leaderboardOptions = useMemo(() => {
    const items = (leaderboard?.items ?? []) as AgentPerformanceLeaderboardResponse['items'];
    const offices = new Map<string, { id: string; name: string | null }>();
    const teams = new Map<string, { id: string; name: string | null }>();
    for (const row of items) {
      if (row.office?.id) offices.set(row.office.id, row.office);
      if (row.team?.id) teams.set(row.team.id, row.team);
    }
    return {
      offices: Array.from(offices.values()).sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)),
      teams: Array.from(teams.values()).sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
    };
  }, [leaderboard]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Compliance</p>
          <h1 className="text-2xl font-semibold text-slate-900">Risk & licensing HQ</h1>
          <p className="text-sm text-slate-500">Monitor CE cycles, AI risk reviews, and membership status.</p>
        </div>
        <div className="flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-1 text-sm font-medium ${
                activeTab === tab.id ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Compliant agents" value={summary?.compliantAgents ?? 0} helper={`Total ${summary?.totalAgents ?? 0}`} />
        <KpiCard label="Needs attention" value={summary?.nonCompliantAgents ?? 0} helper="Non-compliant" />
        <KpiCard label="CE expiring 30d" value={summary?.ceExpiringSoon ?? 0} />
        <KpiCard label="Expired memberships" value={summary?.expiredMemberships ?? 0} />
      </div>

      {activeTab === 'agents' ? (
        <AgentComplianceTable agents={agents ?? []} isLoading={agentsLoading} focusAgentProfileId={focusAgentProfileId} />
      ) : activeTab === 'leaderboard' ? (
        <PerformanceLeaderboardTable
          orgId={orgId}
          data={leaderboard ?? null}
          isLoading={leaderboardLoading}
          page={leaderboardPage}
          onPageChange={setLeaderboardPage}
          orientationFilter={orientationFilter}
          onOrientationChange={(value) => {
            setLeaderboardPage(1);
            setOrientationFilter(value);
          }}
          priceBandFilter={priceBandFilter}
          onPriceBandChange={(value) => {
            setLeaderboardPage(1);
            setPriceBandFilter(value);
          }}
          officeFilter={officeFilter}
          officeOptions={leaderboardOptions.offices}
          onOfficeChange={(value) => {
            setLeaderboardPage(1);
            setOfficeFilter(value);
          }}
          teamFilter={teamFilter}
          teamOptions={leaderboardOptions.teams}
          onTeamChange={(value) => {
            setLeaderboardPage(1);
            setTeamFilter(value);
          }}
        />
      ) : (
        <AiEvaluationTable events={evaluationEvents} isLoading={eventsLoading} />
      )}
    </section>
  );
}

function KpiCard({ label, value, helper }: { label: string; value: number; helper?: string }) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-slate-900">{value.toLocaleString()}</p>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </Card>
  );
}

function AgentComplianceTable({
  agents,
  isLoading,
  focusAgentProfileId
}: {
  agents: MissionControlAgentRow[];
  isLoading: boolean;
  focusAgentProfileId: string | null;
}) {
  const focused = focusAgentProfileId ? agents.find((agent) => agent.agentProfileId === focusAgentProfileId) : null;
  const orderedAgents = focusAgentProfileId
    ? [...agents].sort((a, b) => (a.agentProfileId === focusAgentProfileId ? -1 : b.agentProfileId === focusAgentProfileId ? 1 : 0))
    : agents;

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Agent compliance</h2>
      <p className="text-sm text-slate-500">CE hours, risk, and issues requiring attention.</p>
      {focusAgentProfileId && focused ? (
        <p className="mt-2 text-xs text-slate-500">
          Showing highlights for <span className="font-semibold text-slate-700">{focused.name}</span>.{' '}
          <Link href="/dashboard/compliance" className="font-semibold text-brand-700 hover:underline">
            Clear filter
          </Link>
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-600">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-4">Agent</th>
              <th className="py-2 pr-4">API</th>
              <th className="py-2 pr-4">Risk level</th>
              <th className="py-2 pr-4">CE progress</th>
              <th className="py-2 pr-4">Issues</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                  Loading compliance data…
                </td>
              </tr>
            ) : agents.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-slate-400">
                  No agents found.
                </td>
              </tr>
            ) : (
              orderedAgents.map((agent) => (
                <tr
                  key={agent.agentProfileId}
                  className={`border-t border-slate-100 ${
                    focusAgentProfileId === agent.agentProfileId ? 'bg-brand-50/50' : ''
                  }`}
                >
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-900">{agent.name}</div>
                    <div className="text-xs text-slate-500">{agent.email ?? 'No email'}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <AgentPerformanceBadge performance={agent.performance ?? null} />
                  </td>
                  <td className="py-3 pr-4">
                    <Badge className={`border ${riskBadgeVariant[agent.riskLevel] ?? 'bg-slate-100 text-slate-600'}`}>
                      {agent.riskLevel}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-900">
                      {agent.ceHoursCompleted ?? 0}/{agent.ceHoursRequired ?? 0} hrs
                    </p>
                    <p className="text-xs text-slate-500">
                      Training: {agent.trainingCompleted}/{agent.trainingAssigned}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <ComplianceBadge agent={agent} />
                    {agent.openComplianceIssues > 0 ? (
                      <p className="text-xs text-rose-500">{agent.openComplianceIssues} open issues</p>
                    ) : (
                      <p className="text-xs text-slate-400">No issues</p>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href="/dashboard/mission-control">Mission Control</Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/dashboard/agents/${agent.agentProfileId}`}>View profile</Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ComplianceBadge({ agent }: { agent: MissionControlAgentRow }) {
  const label = agent.requiresAction ? 'Action required' : agent.isCompliant ? 'Compliant' : 'Monitoring';
  const tone = agent.requiresAction
    ? 'border border-rose-100 bg-rose-50 text-rose-700'
    : agent.isCompliant
      ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
      : 'border border-amber-100 bg-amber-50 text-amber-700';

  return <Badge className={tone}>{label}</Badge>;
}

function AiEvaluationTable({ events, isLoading }: { events: MissionControlEvent[]; isLoading: boolean }) {
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">AI compliance evaluations</h2>
      <p className="text-sm text-slate-500">Listings and transactions flagged by Copilot.</p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-600">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-4">Event</th>
              <th className="py-2 pr-4">Message</th>
              <th className="py-2 pr-4">Occurred</th>
              <th className="py-2">Link</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-slate-400">
                  Loading evaluations…
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-slate-400">
                  No AI compliance events recorded.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id} className="border-t border-slate-100">
                  <td className="py-3 pr-4 font-medium text-slate-900">{formatEventType(event.type)}</td>
                  <td className="py-3 pr-4 text-slate-600">{event.message ?? 'No additional context'}</td>
                  <td className="py-3 pr-4 text-slate-500">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="py-3 pr-4">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={event.type === 'ORG_TRANSACTION_EVALUATED' ? '/dashboard/transactions' : '/dashboard/properties'}>
                        View details
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PerformanceLeaderboardTable({
  data,
  isLoading,
  page,
  onPageChange,
  orientationFilter,
  onOrientationChange,
  priceBandFilter,
  onPriceBandChange,
  officeFilter,
  officeOptions,
  onOfficeChange,
  teamFilter,
  teamOptions,
  onTeamChange
}: {
  orgId: string;
  data: AgentPerformanceLeaderboardResponse | null;
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  orientationFilter: 'ALL' | 'BUYER_HEAVY' | 'SELLER_HEAVY' | 'BALANCED';
  onOrientationChange: (value: 'ALL' | 'BUYER_HEAVY' | 'SELLER_HEAVY' | 'BALANCED') => void;
  priceBandFilter: 'ALL' | 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY';
  onPriceBandChange: (value: 'ALL' | 'STARTER' | 'MOVE_UP' | 'PREMIUM' | 'LUXURY') => void;
  officeFilter: string;
  officeOptions: Array<{ id: string; name: string | null }>;
  onOfficeChange: (value: string) => void;
  teamFilter: string;
  teamOptions: Array<{ id: string; name: string | null }>;
  onTeamChange: (value: string) => void;
}) {
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 25;
  const lastPage = Math.max(1, Math.ceil(total / limit));

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Leaderboard</h2>
          <p className="text-sm text-slate-500">Agents ranked by API_v1 performance confidence.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orientation</label>
            <select
              className="mt-1 h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={orientationFilter}
              onChange={(event) => onOrientationChange(event.target.value as any)}
            >
              <option value="ALL">All</option>
              <option value="BUYER_HEAVY">Buyer-heavy</option>
              <option value="SELLER_HEAVY">Seller-heavy</option>
              <option value="BALANCED">Balanced</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price band</label>
            <select
              className="mt-1 h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={priceBandFilter}
              onChange={(event) => onPriceBandChange(event.target.value as any)}
            >
              <option value="ALL">All</option>
              <option value="STARTER">Starter (&lt;$300k)</option>
              <option value="MOVE_UP">$300k–$600k</option>
              <option value="PREMIUM">$600k–$1M</option>
              <option value="LUXURY">$1M+</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Office</label>
            <select
              className="mt-1 h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={officeFilter}
              onChange={(event) => onOfficeChange(event.target.value)}
            >
              <option value="ALL">All</option>
              {officeOptions.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name ?? office.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team</label>
            <select
              className="mt-1 h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={teamFilter}
              onChange={(event) => onTeamChange(event.target.value)}
            >
              <option value="ALL">All</option>
              {teamOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name ?? team.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-600">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-4">Rank</th>
              <th className="py-2 pr-4">Agent</th>
              <th className="py-2 pr-4">API</th>
              <th className="py-2 pr-4">Key dims</th>
              <th className="py-2">Link</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-slate-400">
                  Loading leaderboard…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-slate-400">
                  No results.
                </td>
              </tr>
            ) : (
              items.map((row, index) => (
                <tr key={row.agentProfileId} className="border-t border-slate-100">
                  <td className="py-3 pr-4 font-medium text-slate-900">{(page - 1) * limit + index + 1}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.email ?? 'No email'}</div>
                    <div className="text-xs text-slate-500">
                      {row.buyerSellerOrientation.replace(/_/g, ' ').toLowerCase()} · buyer share {row.buyerSharePercent}%
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <AgentPerformanceBadge
                      performance={{
                        modelVersion: row.modelVersion,
                        overallScore: row.overallScore,
                        confidenceBand: row.confidenceBand,
                        topDrivers: row.topDrivers ?? [],
                        lastUpdated: row.lastUpdated ?? new Date().toISOString()
                      }}
                    />
                  </td>
                  <td className="py-3 pr-4 text-xs text-slate-500">
                    Resp {Math.round(row.dimensions.responsivenessReliability * 100)} · Cap {Math.round(row.dimensions.capacityLoad * 100)} · Risk {Math.round(row.dimensions.riskDragPenalty * 100)}pts
                  </td>
                  <td className="py-3">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/dashboard/agents/${row.agentProfileId}`}>View</Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Page {page} of {lastPage} · {total.toLocaleString()} agents
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
            Prev
          </Button>
          <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => onPageChange(Math.min(lastPage, page + 1))}>
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}

const riskBadgeVariant: Record<string, string> = {
  LOW: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
  HIGH: 'bg-rose-50 text-rose-700 border-rose-100'
};

const formatEventType = (type: string) =>
  type
    .replace('ORG_', '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
