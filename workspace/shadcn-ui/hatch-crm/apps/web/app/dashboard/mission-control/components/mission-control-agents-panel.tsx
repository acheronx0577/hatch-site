"use client";

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { fetchMissionControlAgents, MissionControlAgentRow } from '@/lib/api/mission-control';
import { cn } from '@/lib/utils';

type MissionControlAgentsPanelProps = {
  orgId: string;
};

const agentsQueryKey = (orgId: string) => ['mission-control', 'agents', orgId];

type GroupBy = 'NONE' | 'COMPLIANCE' | 'RISK' | 'LIFECYCLE';

export function MissionControlAgentsPanel({ orgId }: MissionControlAgentsPanelProps) {
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'>('ALL');
  const [groupBy, setGroupBy] = useState<GroupBy>('COMPLIANCE');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [hasInitializedGroups, setHasInitializedGroups] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: agentsQueryKey(orgId),
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
    if (groupBy === 'NONE') return;
    if (hasInitializedGroups) return;
    if (groupedAgents.length === 0) return;

    const next = new Set<string>();
    const keys = groupedAgents.map(([key]) => key);

    if (groupBy === 'COMPLIANCE') {
      ['ACTION_REQUIRED', 'MONITORING'].forEach((key) => (keys.includes(key) ? next.add(key) : null));
    } else if (groupBy === 'RISK') {
      ['HIGH', 'MEDIUM'].forEach((key) => (keys.includes(key) ? next.add(key) : null));
    } else if (groupBy === 'LIFECYCLE') {
      ['ONBOARDING', 'OFFBOARDING'].forEach((key) => (keys.includes(key) ? next.add(key) : null));
    }

    if (next.size === 0) {
      next.add(keys[0]);
    }

    setExpandedGroups(next);
    setHasInitializedGroups(true);
  }, [groupBy, groupedAgents, hasInitializedGroups]);

  const toggleGroup = (group: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  return (
    <Card className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" data-testid="mission-control-agents">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Agents</h3>
          <p className="text-sm text-slate-500">Risk and training snapshot</p>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <div className="relative w-full md:w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search agents…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-9 pl-9"
            />
          </div>

          <select
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 md:w-[180px]"
            value={groupBy}
            onChange={(event) => {
              setGroupBy(event.target.value as GroupBy);
              setExpandedGroups(new Set());
              setHasInitializedGroups(false);
            }}
          >
            <option value="COMPLIANCE">Compliance</option>
            <option value="RISK">Risk level</option>
            <option value="LIFECYCLE">Lifecycle</option>
            <option value="NONE">No grouping</option>
          </select>

          <select
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 md:w-[180px]"
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)}
          >
            <option value="ALL">All risk levels</option>
            <option value="LOW">Low risk</option>
            <option value="MEDIUM">Moderate risk</option>
            <option value="HIGH">High risk</option>
          </select>

          {groupBy !== 'NONE' && groupedAgents.length > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setExpandedGroups(new Set(groupedAgents.map(([key]) => key)))}
              >
                Expand all
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setExpandedGroups(new Set())}>
                Collapse all
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-600">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Agent</th>
              <th className="py-2 pr-4">Risk</th>
              <th className="py-2 pr-4">Compliance</th>
              <th className="py-2 pr-4">Training</th>
              <th className="py-2 pr-4">Listings</th>
              <th className="py-2 pr-4">Transactions</th>
              <th className="py-2 pr-4">Offer intents</th>
              <th className="py-2 pr-4">Workflow</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-sm text-slate-400">
                  Loading agents…
                </td>
              </tr>
            ) : filteredAgents.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-sm text-slate-400">
                  No agents match the selected filter.
                </td>
              </tr>
            ) : groupBy === 'NONE' ? (
              filteredAgents.map((agent) => <AgentRow key={agent.agentProfileId} agent={agent} />)
            ) : (
              groupedAgents.map(([group, groupAgents]) => {
                const open = expandedGroups.has(group);
                return (
                  <Fragment key={group}>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td colSpan={9} className="py-2 pr-4">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left transition hover:bg-slate-100/70"
                          onClick={() => toggleGroup(group)}
                          aria-expanded={open}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <ChevronDown
                              className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
                            />
                            <span className="min-w-0 truncate font-medium text-slate-900">
                              {formatGroupLabel(groupBy, group)}
                            </span>
                            <Badge variant="secondary" className="shrink-0">
                              {groupAgents.length}
                            </Badge>
                          </span>
                          <span className="text-xs text-slate-500">{open ? 'Hide' : 'Show'}</span>
                        </button>
                      </td>
                    </tr>
                    {open ? groupAgents.map((agent) => <AgentRow key={agent.agentProfileId} agent={agent} />) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
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
      return agent.lifecycleStage ? agent.lifecycleStage.toUpperCase() : 'UNKNOWN';
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
  LOW: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
  HIGH: 'bg-rose-50 text-rose-700 border-rose-100'
};

function AgentRow({ agent }: { agent: MissionControlAgentRow }) {
  const trainingLabel = `${agent.trainingCompleted}/${agent.trainingAssigned}`;
  const complianceLabel = agent.requiresAction ? 'Action required' : agent.isCompliant ? 'Compliant' : 'Monitoring';
  const complianceTone = agent.requiresAction
    ? 'bg-rose-50 text-rose-700 border-rose-100'
    : agent.isCompliant
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : 'bg-amber-50 text-amber-700 border-amber-100';

  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className="py-3 pr-4">
        <div className="font-medium text-slate-900">{agent.name}</div>
        <div className="text-xs text-slate-500">{agent.email}</div>
      </td>
      <td className="py-3 pr-4">
        <Badge className={`border ${riskBadgeVariant[agent.riskLevel] ?? 'bg-slate-100 text-slate-600'}`}>
          {agent.riskLevel}
        </Badge>
      </td>
      <td className="py-3 pr-4">
        <Badge className={`border ${complianceTone}`}>{complianceLabel}</Badge>
        {agent.openComplianceIssues > 0 ? (
          <p className="text-xs text-rose-500">{agent.openComplianceIssues} open issues</p>
        ) : null}
      </td>
      <td className="py-3 pr-4">
        <div className="font-medium text-slate-900">{trainingLabel}</div>
        <p className="text-xs text-slate-500">Required: {agent.requiredTrainingCompleted}/{agent.requiredTrainingAssigned}</p>
      </td>
      <td className="py-3 pr-4">
        <p className="font-medium text-slate-900">{agent.listingCount}</p>
        <p className="text-xs text-slate-500">{agent.activeListingCount} active</p>
      </td>
      <td className="py-3 pr-4">
        <p className="font-medium text-slate-900">{agent.transactionCount}</p>
        <p className="text-xs text-slate-500">{agent.nonCompliantTransactionCount} flagged</p>
      </td>
      <td className="py-3 pr-4">
        <p className="font-medium text-slate-900">{agent.offerIntentCount}</p>
        <p className="text-xs text-slate-500">{agent.acceptedOfferIntentCount} accepted</p>
      </td>
      <td className="py-3 pr-4">
        <Badge className="border bg-slate-50 text-slate-700">
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
      <td className="py-3">
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/dashboard/agents/${agent.agentProfileId}`}>View profile</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/dashboard/agents/${agent.agentProfileId}#training`}>Training</Link>
          </Button>
        </div>
      </td>
    </tr>
  );
}
