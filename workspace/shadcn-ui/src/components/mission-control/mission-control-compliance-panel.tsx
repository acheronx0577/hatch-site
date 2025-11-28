import { useQuery } from '@tanstack/react-query';

import { MissionControlSectionCard } from './MissionControlSectionCard';
import { MissionControlMetricTile } from './MissionControlMetricTile';
import { fetchMissionControlCompliance } from '@/lib/api/mission-control';

type MissionControlCompliancePanelProps = {
  orgId: string;
};

const complianceQueryKey = (orgId: string) => ['mission-control', 'compliance', orgId];

function humanizeComplianceKey(key: string): string {
  switch (key) {
    case 'noncompliant-agents':
    case '/BROKER/COMPLIANCE?FILTER=NONCOMPLIANT':
      return 'Agents needing attention';
    case 'ce-expiring-30d':
      return 'CE expiring in 30 days';
    case 'expired-memberships':
      return 'Expired memberships';
    default:
      return key.replace(/[_-]/g, ' ');
  }
}

export function MissionControlCompliancePanel({ orgId }: MissionControlCompliancePanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: complianceQueryKey(orgId),
    queryFn: () => fetchMissionControlCompliance(orgId),
    staleTime: 60_000
  });

  const metrics = data
    ? [
        {
          key: 'compliant-agents',
          label: 'Compliant agents',
          value: `${data.compliantAgents}/${data.totalAgents}`,
          tone: 'success' as const
        },
        {
          key: 'noncompliant-agents',
          label: humanizeComplianceKey('noncompliant-agents'),
          value: data.nonCompliantAgents,
          tone: data.nonCompliantAgents > 0 ? ('warning' as const) : ('default' as const)
        },
        {
          key: 'ce-expiring-30d',
          label: humanizeComplianceKey('ce-expiring-30d'),
          value: data.ceExpiringSoon,
          tone: data.ceExpiringSoon > 0 ? ('warning' as const) : ('muted' as const)
        },
        {
          key: 'expired-memberships',
          label: humanizeComplianceKey('expired-memberships'),
          value: data.expiredMemberships,
          tone: data.expiredMemberships > 0 ? ('danger' as const) : ('default' as const)
        }
      ]
    : [];

  return (
    <MissionControlSectionCard
      title="Compliance"
      subtitle="Training, CE, and checks."
      actionLabel="Open compliance"
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
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">No compliance data yet.</div>
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
        className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-slate-50 p-3 animate-pulse"
      >
        <div className="h-3 w-32 rounded bg-slate-200" />
        <div className="h-5 w-20 rounded bg-slate-300" />
      </div>
    ))}
  </div>
);
