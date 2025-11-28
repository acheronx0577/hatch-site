import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { MissionControlSectionCard } from './MissionControlSectionCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchMissionControlAgents, MissionControlAgentRow } from '@/lib/api/mission-control';

type MissionControlAgentsPanelProps = {
  orgId: string;
};

const agentsQueryKey = (orgId: string) => ['mission-control', 'agents', orgId];

export function MissionControlAgentsPanel({ orgId }: MissionControlAgentsPanelProps) {
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'>('ALL');
  const { data, isLoading } = useQuery({
    queryKey: agentsQueryKey(orgId),
    queryFn: () => fetchMissionControlAgents(orgId),
    staleTime: 60_000
  });

  const filteredAgents = useMemo(() => {
    if (!data) return [];
    if (riskFilter === 'ALL') return data;
    return data.filter((agent) => agent.riskLevel === riskFilter);
  }, [data, riskFilter]);

  return (
    <MissionControlSectionCard
      title="Agents"
      subtitle="People, momentum, and risk."
      actionLabel="Open roster"
      actionHref="/broker/agents"
    >
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <Select value={riskFilter} onValueChange={(value) => setRiskFilter(value as typeof riskFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All risk levels</SelectItem>
            <SelectItem value="LOW">Low risk</SelectItem>
            <SelectItem value="MEDIUM">Moderate risk</SelectItem>
            <SelectItem value="HIGH">High risk</SelectItem>
          </SelectContent>
        </Select>
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
            {(isLoading ? [] : filteredAgents).map((agent) => (
              <AgentRow key={agent.agentProfileId} agent={agent} />
            ))}
            {isLoading ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-slate-400">
                  Loading agents...
                </td>
              </tr>
            ) : null}
            {!isLoading && filteredAgents.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-slate-400">
                  No agents match the selected filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </MissionControlSectionCard>
  );
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
  const complianceFilter = agent.requiresAction ? 'NONCOMPLIANT' : agent.riskLevel === 'HIGH' ? 'HIGH_RISK' : null;

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
        <p className="text-xs text-slate-500">
          Required: {agent.requiredTrainingCompleted}/{agent.requiredTrainingAssigned}
        </p>
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
          <Button size="sm" variant="secondary" asChild>
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
