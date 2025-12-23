import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { MissionControlSectionCard } from './MissionControlSectionCard';
import { MissionControlMetricTile } from './MissionControlMetricTile';
import { fetchMissionControlAgents } from '@/lib/api/mission-control';
import { missionControlAgentsQueryKey } from '@/lib/queryKeys';

type MissionControlCompliancePanelProps = {
  orgId: string;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function MissionControlCompliancePanel({ orgId }: MissionControlCompliancePanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: missionControlAgentsQueryKey(orgId),
    queryFn: () => fetchMissionControlAgents(orgId),
    staleTime: 60_000
  });

  const summary = useMemo(() => {
    const agents = data ?? [];
    const now = Date.now();
    const ceThreshold = now + THIRTY_DAYS_MS;
    const needsAttention = agents.filter((agent) => agent.openComplianceIssues > 0 || agent.requiresAction || !agent.isCompliant);
    const ceExpiringSoon = agents.filter((agent) => {
      if (!agent.ceCycleEndAt) return false;
      const value = new Date(agent.ceCycleEndAt).getTime();
      return Number.isFinite(value) && value <= ceThreshold;
    }).length;
    const expiredMemberships = agents.reduce((sum, agent) => {
      const count = (agent.memberships ?? []).filter((membership) => membership.status === 'EXPIRED').length;
      return sum + count;
    }, 0);

    return {
      totalAgents: agents.length,
      needsAttention: needsAttention.length,
      compliantAgents: Math.max(0, agents.length - needsAttention.length),
      ceExpiringSoon,
      expiredMemberships
    };
  }, [data]);

  const metrics = (data ?? []).length
    ? [
        {
          key: 'compliant-agents',
          label: 'Compliant agents',
          value: `${summary.compliantAgents}/${summary.totalAgents}`,
          tone: 'success' as const
        },
        {
          key: 'noncompliant-agents',
          label: 'Agents needing attention',
          value: summary.needsAttention,
          tone: summary.needsAttention > 0 ? ('warning' as const) : ('neutral' as const)
        },
        {
          key: 'ce-expiring-30d',
          label: 'CE expiring in 30 days',
          value: summary.ceExpiringSoon,
          tone: summary.ceExpiringSoon > 0 ? ('warning' as const) : ('muted' as const)
        },
        {
          key: 'expired-memberships',
          label: 'Expired memberships',
          value: summary.expiredMemberships,
          tone: summary.expiredMemberships > 0 ? ('danger' as const) : ('neutral' as const)
        }
      ]
    : [];

  return (
    <MissionControlSectionCard
      title="Risk Center"
      subtitle="Training, CE, and checks."
      actionLabel="Open Risk Center"
      actionHref="/broker/compliance"
      data-testid="mission-control-compliance"
    >
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {isLoading ? (
          <ComplianceSkeleton />
        ) : (
          metrics.map((metric) => (
            <MissionControlMetricTile key={metric.key} label={metric.label} value={metric.value} tone={metric.tone} />
          ))
        )}
        {!isLoading && metrics.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-card/45 px-3 py-2 text-xs text-slate-600 backdrop-blur-sm">
            No compliance data yet.
          </div>
        ) : null}
      </div>
    </MissionControlSectionCard>
  );
}

const ComplianceSkeleton = () => (
  <div className="grid gap-3 md:grid-cols-2">
    {Array.from({ length: 4 }).map((_, idx) => (
      <div
        key={`compliance-skel-${idx}`}
        className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-glass-alpha-recessed)] p-4 backdrop-blur-md"
      >
        <div className="hatch-shimmer h-3 w-32 rounded" />
        <div className="hatch-shimmer h-5 w-20 rounded" />
      </div>
    ))}
  </div>
);
