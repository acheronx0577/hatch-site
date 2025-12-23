import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Search } from 'lucide-react';

import { MissionControlSectionCard } from './MissionControlSectionCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchMissionControlAgents, MissionControlAgentRow } from '@/lib/api/mission-control';
import { missionControlAgentsQueryKey } from '@/lib/queryKeys';

type MissionControlAgentsPanelProps = {
  orgId: string;
};

type GroupBy = 'NONE' | 'COMPLIANCE' | 'RISK' | 'LIFECYCLE';
type PageSize = 5 | 10;

type PagedAgent = {
  group: string;
  agent: MissionControlAgentRow;
};

type PaginationItem = { type: 'page'; page: number } | { type: 'ellipsis'; key: string };

const pageSizes: PageSize[] = [5, 10];

export function MissionControlAgentsPanel({ orgId }: MissionControlAgentsPanelProps) {
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'>('ALL');
  const [groupBy, setGroupBy] = useState<GroupBy>('COMPLIANCE');
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: missionControlAgentsQueryKey(orgId),
    queryFn: () => fetchMissionControlAgents(orgId),
    staleTime: 60_000
  });

  const filteredAgents = useMemo(() => {
    if (!data) return [];
    const query = searchQuery.trim().toLowerCase();

    return data
      .filter((agent) => (riskFilter === 'ALL' ? true : agent.riskLevel === riskFilter))
      .filter((agent) => {
        if (!query) return true;
        return agent.name.toLowerCase().includes(query) || agent.email.toLowerCase().includes(query);
      });
  }, [data, riskFilter, searchQuery]);

  const groupedAgents = useMemo(() => {
    if (groupBy === 'NONE') {
      return [['ALL', filteredAgents]] as Array<[string, MissionControlAgentRow[]]>;
    }

    const groups: Record<string, MissionControlAgentRow[]> = {};
    for (const agent of filteredAgents) {
      const key = resolveAgentGroupKey(agent, groupBy);
      (groups[key] ??= []).push(agent);
    }

    const order = groupOrder[groupBy] ?? [];
    return Object.entries(groups)
      .map(([key, agents]) => [
        key,
        agents.slice().sort((a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name))
      ] as [string, MissionControlAgentRow[]])
      .sort(([a], [b]) => {
        const aIndex = order.indexOf(a);
        const bIndex = order.indexOf(b);
        if (aIndex !== -1 || bIndex !== -1) {
          return (aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex) - (bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex);
        }
        return a.localeCompare(b);
      });
  }, [filteredAgents, groupBy]);

  useEffect(() => {
    setPage(1);
  }, [groupBy, riskFilter, searchQuery, pageSize]);

  const pagedAgents = useMemo((): PagedAgent[] => {
    if (groupBy === 'NONE') {
      return filteredAgents
        .slice()
        .sort((a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name))
        .map((agent) => ({ group: 'ALL', agent }));
    }

    return groupedAgents.flatMap(([group, agents]) => agents.map((agent) => ({ group, agent })));
  }, [filteredAgents, groupedAgents, groupBy]);

  const totalAgents = pagedAgents.length;
  const totalPages = Math.max(1, Math.ceil(totalAgents / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return pagedAgents.slice(start, start + pageSize);
  }, [page, pageSize, pagedAgents]);

  const pageGroups = useMemo(() => {
    const map = new Map<string, MissionControlAgentRow[]>();
    for (const item of pageItems) {
      const next = map.get(item.group) ?? [];
      next.push(item.agent);
      map.set(item.group, next);
    }
    return Array.from(map.entries()) as Array<[string, MissionControlAgentRow[]]>;
  }, [pageItems]);

  const paginationItems = useMemo(() => buildPaginationItems(page, totalPages), [page, totalPages]);

  const rangeLabel = useMemo(() => {
    if (totalAgents === 0) return '0';
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalAgents);
    return `${start}-${end} of ${totalAgents}`;
  }, [page, pageSize, totalAgents]);

  const goToPage = (value: number) => {
    const clamped = Math.min(Math.max(1, value), totalPages);
    setPage(clamped);
  };

  return (
    <MissionControlSectionCard
      title="Agents"
      subtitle="People, momentum, and risk."
      actionLabel="Open roster"
      actionHref="/broker/team"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <div className="relative w-full md:w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search agents…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            value={groupBy}
            onValueChange={(value) => {
              setGroupBy(value as GroupBy);
            }}
          >
            <SelectTrigger className="w-full md:w-[190px]">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPLIANCE">Compliance</SelectItem>
              <SelectItem value="RISK">Risk level</SelectItem>
              <SelectItem value="LIFECYCLE">Lifecycle</SelectItem>
              <SelectItem value="NONE">No grouping</SelectItem>
            </SelectContent>
          </Select>

          <Select value={riskFilter} onValueChange={(value) => setRiskFilter(value as typeof riskFilter)}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Filter by risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All risk levels</SelectItem>
              <SelectItem value="LOW">Low risk</SelectItem>
              <SelectItem value="MEDIUM">Moderate risk</SelectItem>
              <SelectItem value="HIGH">High risk</SelectItem>
            </SelectContent>
          </Select>

          <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value) as PageSize)}>
            <SelectTrigger className="w-full md:w-[140px]">
              <SelectValue placeholder="Rows" />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-white/15 backdrop-blur-md dark:bg-white/5">
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead className="bg-white/25 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:bg-white/10 dark:text-ink-100/70">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Compliance</th>
                <th className="px-4 py-3">Training</th>
                <th className="px-4 py-3">Listings</th>
                <th className="px-4 py-3">Transactions</th>
                <th className="px-4 py-3">Offer intents</th>
                <th className="px-4 py-3">Workflow</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    Loading agents…
                  </td>
                </tr>
              ) : totalAgents === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    No agents match the selected filter.
                  </td>
                </tr>
              ) : groupBy === 'NONE' ? (
                (pageGroups[0]?.[1] ?? []).map((agent) => <AgentRow key={agent.agentProfileId} agent={agent} />)
              ) : (
                pageGroups.map(([group, groupAgents]) => (
                  <Fragment key={group}>
                    <tr className="bg-white/15 dark:bg-white/10">
                      <td colSpan={9} className="px-4 py-2">
                        <div className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1">
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="min-w-0 truncate font-medium text-slate-900">
                              {formatGroupLabel(groupBy, group)}
                            </span>
                            <Badge variant="secondary" className="shrink-0">
                              {groupAgents.length}
                            </Badge>
                          </span>
                          <span className="text-xs text-slate-500">Showing {groupAgents.length}</span>
                        </div>
                      </td>
                    </tr>
                    {groupAgents.map((agent) => (
                      <AgentRow key={agent.agentProfileId} agent={agent} />
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalAgents > pageSize ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{rangeLabel}</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              Prev
            </Button>
            {paginationItems.map((item) =>
              item.type === 'page' ? (
                <Button
                  key={`page-${item.page}`}
                  type="button"
                  size="sm"
                  variant={item.page === page ? 'secondary' : 'ghost'}
                  onClick={() => goToPage(item.page)}
                >
                  {item.page}
                </Button>
              ) : (
                <span key={item.key} className="px-2 text-xs text-slate-500">
                  …
                </span>
              )
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </MissionControlSectionCard>
  );
}

function buildPaginationItems(page: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 1) return [{ type: 'page', page: 1 }];

  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let candidate = page - 1; candidate <= page + 1; candidate += 1) {
    if (candidate >= 1 && candidate <= totalPages) {
      pages.add(candidate);
    }
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  let prev = 0;
  for (const current of sorted) {
    if (prev && current - prev > 1) {
      items.push({ type: 'ellipsis', key: `${prev}-${current}` });
    }
    items.push({ type: 'page', page: current });
    prev = current;
  }
  return items;
}

const groupOrder: Record<Exclude<GroupBy, 'NONE'>, string[]> = {
  COMPLIANCE: ['ACTION_REQUIRED', 'MONITORING', 'COMPLIANT', 'UNKNOWN'],
  RISK: ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'],
  LIFECYCLE: ['ONBOARDING', 'RAMPING', 'ACTIVE', 'AT_RISK', 'OFFBOARDING', 'UNKNOWN']
};

function resolveAgentGroupKey(agent: MissionControlAgentRow, groupBy: Exclude<GroupBy, 'NONE'>): string {
  switch (groupBy) {
    case 'COMPLIANCE':
      return agent.requiresAction ? 'ACTION_REQUIRED' : agent.isCompliant ? 'COMPLIANT' : 'MONITORING';
    case 'RISK':
      return agent.riskLevel || 'UNKNOWN';
    case 'LIFECYCLE':
      return agent.lifecycleStage?.toUpperCase?.() ? agent.lifecycleStage.toUpperCase() : 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

function formatGroupLabel(groupBy: Exclude<GroupBy, 'NONE'>, group: string) {
  if (groupBy === 'COMPLIANCE') {
    switch (group) {
      case 'ACTION_REQUIRED':
        return 'Action required';
      case 'MONITORING':
        return 'Monitoring';
      case 'COMPLIANT':
        return 'Compliant';
      default:
        return 'Unknown';
    }
  }

  if (groupBy === 'RISK') {
    switch (group) {
      case 'HIGH':
        return 'High risk';
      case 'MEDIUM':
        return 'Moderate risk';
      case 'LOW':
        return 'Low risk';
      default:
        return 'Unknown risk';
    }
  }

  const label = group.replace(/_/g, ' ').toLowerCase();
  return label.replace(/^\w/, (char) => char.toUpperCase());
}

const riskBadgeVariant: Record<string, string> = {
  LOW: 'bg-emerald-100 text-emerald-700 border-emerald-200/70',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200/70',
  HIGH: 'bg-rose-100 text-rose-700 border-rose-200/70'
};

function AgentRow({ agent }: { agent: MissionControlAgentRow }) {
  const trainingLabel = `${agent.trainingCompleted}/${agent.trainingAssigned}`;
  const complianceLabel = agent.requiresAction ? 'Action required' : agent.isCompliant ? 'Compliant' : 'Monitoring';
  const complianceTone = agent.requiresAction
    ? 'bg-rose-100 text-rose-700 border-rose-200/70'
    : agent.isCompliant
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200/70'
      : 'bg-amber-100 text-amber-800 border-amber-200/70';
  const complianceFilter = agent.requiresAction ? 'NONCOMPLIANT' : agent.riskLevel === 'HIGH' ? 'HIGH_RISK' : null;

  return (
    <tr className="transition-colors odd:bg-white/10 even:bg-white/5 hover:bg-white/20 dark:odd:bg-white/10 dark:even:bg-white/5 dark:hover:bg-white/10">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{agent.name}</div>
        <div className="text-xs text-slate-500">{agent.email}</div>
      </td>
      <td className="px-4 py-3">
        <Badge className={`border ${riskBadgeVariant[agent.riskLevel] ?? 'bg-slate-100 text-slate-600'}`}>
          {agent.riskLevel}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge className={`border ${complianceTone}`}>
          {agent.requiresAction ? <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" /> : null}
          {agent.isCompliant && !agent.requiresAction ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          {complianceLabel}
        </Badge>
        {agent.openComplianceIssues > 0 ? (
          <p className="text-xs text-rose-500">{agent.openComplianceIssues} open issues</p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{trainingLabel}</div>
        <p className="text-xs text-slate-500">
          Required: {agent.requiredTrainingCompleted}/{agent.requiredTrainingAssigned}
        </p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{agent.listingCount}</p>
        <p className="text-xs text-slate-500">{agent.activeListingCount} active</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{agent.transactionCount}</p>
        <p className="text-xs text-slate-500">{agent.nonCompliantTransactionCount} flagged</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{agent.offerIntentCount}</p>
        <p className="text-xs text-slate-500">{agent.acceptedOfferIntentCount} accepted</p>
      </td>
      <td className="px-4 py-3">
        <Badge variant="secondary" className="capitalize">
          {agent.lifecycleStage?.toLowerCase() ?? 'unknown'}
        </Badge>
        <p className="text-xs text-slate-500">
          Onboarding: {agent.onboardingTasksOpenCount} open · {agent.onboardingTasksCompletedCount} done
        </p>
        {agent.offboardingTasksOpenCount > 0 ? (
          <p className="text-xs text-rose-500">{agent.offboardingTasksOpenCount} offboarding tasks open</p>
        ) : (
          <p className="text-xs text-slate-400">No offboarding tasks</p>
        )}
        <p className="text-xs text-slate-500">
          Leads: {agent.assignedLeadsCount} total · {agent.newLeadsCount} new · {agent.qualifiedLeadsCount} qualified
        </p>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={`/broker/team?stage=${agent.lifecycleStage ?? 'ALL'}&risk=${agent.riskLevel ?? 'ALL'}`}>
              View profile
            </Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={complianceFilter ? `/broker/compliance?filter=${complianceFilter}` : '/broker/compliance?view=agents'}>
              Training
            </Link>
          </Button>
        </div>
      </td>
    </tr>
  );
}
