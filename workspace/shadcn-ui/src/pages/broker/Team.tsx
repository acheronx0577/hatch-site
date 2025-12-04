import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Users, Shield, Sparkles, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMissionControlAgents, type MissionControlAgentRow } from '@/lib/api/mission-control';
import { inviteAgent, type InviteAgentPayload } from '@/lib/api/agents';
import { useToast } from '@/components/ui/use-toast';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

const onboardingFilters = [
  { id: 'ALL', label: 'All stages' },
  { id: 'ONBOARDING', label: 'Onboarding' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'OFFBOARDING', label: 'Offboarding' }
] as const;

const riskFilters = [
  { id: 'ALL', label: 'All risk' },
  { id: 'LOW', label: 'Low' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'HIGH', label: 'High' }
] as const;

export default function BrokerTeam() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  if (!orgId) {
    return <div className="p-8 text-sm text-gray-600">Select an organization to view team analytics.</div>;
  }
  return (
    <div className="space-y-6 p-6">
      <TeamOverviewPanel orgId={orgId} />
      <TeamRosterTable orgId={orgId} />
    </div>
  );
}

const numberFormatter = new Intl.NumberFormat('en-US');

function useTeamData(orgId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['mission-control', 'team', orgId],
    queryFn: () => fetchMissionControlAgents(orgId),
    staleTime: 30_000
  });
  return { agents: data ?? [], isLoading, error };
}

function TeamOverviewPanel({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<InviteAgentPayload>({
    email: '',
    name: '',
    licenseNumber: '',
    licenseState: '',
    licenseExpiresAt: ''
  });

  const sendInvite = useMutation({
    mutationFn: (payload: InviteAgentPayload) => inviteAgent(orgId, payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['mission-control', 'team', orgId] });
      setIsDialogOpen(false);
      setForm({
        email: '',
        name: '',
        licenseNumber: '',
        licenseState: '',
        licenseExpiresAt: ''
      });
      toast({
        title: result?.sent ? 'Invite sent' : 'Invite not sent',
        description: result?.sent
          ? 'We emailed the agent with a signup link.'
          : result?.reason ?? 'Email send skipped; copy link and share manually.'
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to send invite',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  });

  const { agents, isLoading } = useTeamData(orgId);
  const metrics = useMemo(() => {
    const onboarding = agents.filter((agent) => agent.lifecycleStage === 'ONBOARDING').length;
    const active = agents.filter((agent) => agent.lifecycleStage === 'ACTIVE').length;
    const offboarding = agents.filter((agent) => agent.lifecycleStage === 'OFFBOARDING').length;
    const highRisk = agents.filter((agent) => agent.riskLevel === 'HIGH').length;
    const requiresAction = agents.filter((agent) => agent.requiresAction).length;
    return { total: agents.length, onboarding, active, offboarding, highRisk, requiresAction };
  }, [agents]);

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Mission Control</p>
          <h1 className="text-2xl font-semibold text-slate-900">Team readiness</h1>
          <p className="text-sm text-slate-500">
            Track onboarding progress, compliance risk, and link into detailed profiles.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setIsDialogOpen(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add agent
          </Button>
          <Button variant="outline" asChild>
            <Link to="/broker/team-advanced">Advanced manager</Link>
          </Button>
          <Button asChild>
            <Link to="/broker/mission-control">Mission Control</Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total agents" value={isLoading ? '—' : numberFormatter.format(metrics.total)} />
        <KpiCard label="Onboarding" value={numberFormatter.format(metrics.onboarding)} helper={`${metrics.active} active`} />
        <KpiCard label="High risk" value={numberFormatter.format(metrics.highRisk)} helper={`${metrics.requiresAction} need action`} />
        <KpiCard label="Offboarding" value={numberFormatter.format(metrics.offboarding)} />
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add agent</DialogTitle>
            <DialogDescription>
              Invite an agent by email. They’ll receive a signup link and be linked to your brokerage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="agentName">Name</Label>
              <Input
                id="agentName"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Alex Agent"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agentEmail">Email</Label>
              <Input
                id="agentEmail"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="agent@hatch.test"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="licenseNumber">License number</Label>
                <Input
                  id="licenseNumber"
                  value={form.licenseNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, licenseNumber: e.target.value }))}
                  placeholder="SL1234567"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="licenseState">License state</Label>
                <Input
                  id="licenseState"
                  value={form.licenseState}
                  onChange={(e) => setForm((prev) => ({ ...prev, licenseState: e.target.value }))}
                  placeholder="FL"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="licenseExpiresAt">License expiry (ISO date)</Label>
              <Input
                id="licenseExpiresAt"
                type="date"
                value={form.licenseExpiresAt}
                onChange={(e) => setForm((prev) => ({ ...prev, licenseExpiresAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                sendInvite.mutate({
                  email: form.email.trim(),
                  name: form.name.trim(),
                  licenseNumber: form.licenseNumber.trim() || undefined,
                  licenseState: form.licenseState.trim() || undefined,
                  licenseExpiresAt: form.licenseExpiresAt ? form.licenseExpiresAt : undefined
                })
              }
              disabled={sendInvite.isLoading || !form.email.trim() || !form.name.trim()}
            >
              {sendInvite.isLoading ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TeamRosterTable({ orgId }: { orgId: string }) {
  const { agents, isLoading, error } = useTeamData(orgId);
  const [searchParams, setSearchParams] = useSearchParams();
  type StageFilter = (typeof onboardingFilters)[number]['id'];
  type RiskFilter = (typeof riskFilters)[number]['id'];

  const parseStage = (value: string | null): StageFilter => {
    if (!value) return 'ALL';
    const match = onboardingFilters.find((filter) => filter.id === value.toUpperCase());
    return (match?.id ?? 'ALL') as StageFilter;
  };

  const parseRisk = (value: string | null): RiskFilter => {
    if (!value) return 'ALL';
    const match = riskFilters.find((filter) => filter.id === value.toUpperCase());
    return (match?.id ?? 'ALL') as RiskFilter;
  };

  const [stageFilter, setStageFilter] = useState<StageFilter>(() => parseStage(searchParams.get('stage')));
  const [riskFilter, setRiskFilter] = useState<RiskFilter>(() => parseRisk(searchParams.get('risk')));

  useEffect(() => {
    const nextStage = parseStage(searchParams.get('stage'));
    if (nextStage !== stageFilter) {
      setStageFilter(nextStage);
    }
  }, [searchParams, stageFilter]);

  useEffect(() => {
    const nextRisk = parseRisk(searchParams.get('risk'));
    if (nextRisk !== riskFilter) {
      setRiskFilter(nextRisk);
    }
  }, [searchParams, riskFilter]);

  const updateSearchParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'ALL') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const handleStageChange = (value: StageFilter) => {
    setStageFilter(value);
    updateSearchParam('stage', value);
  };

  const handleRiskChange = (value: RiskFilter) => {
    setRiskFilter(value);
    updateSearchParam('risk', value);
  };

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (stageFilter !== 'ALL' && agent.lifecycleStage !== stageFilter) return false;
      if (riskFilter !== 'ALL' && agent.riskLevel !== riskFilter) return false;
      return true;
    });
  }, [agents, stageFilter, riskFilter]);

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Agent roster</h2>
          <p className="text-sm text-slate-500">Lifecycle, compliance, and training snapshot.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-full border border-slate-200 px-3 py-1 text-sm"
            value={stageFilter}
            onChange={(event) => handleStageChange(event.target.value as StageFilter)}
          >
            {onboardingFilters.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-full border border-slate-200 px-3 py-1 text-sm"
            value={riskFilter}
            onChange={(event) => handleRiskChange(event.target.value as RiskFilter)}
          >
            {riskFilters.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p className="py-6 text-sm text-rose-500">Unable to load team data.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">Lifecycle</th>
                <th className="px-4 py-2 text-left">Risk</th>
                <th className="px-4 py-2 text-left">Training</th>
                <th className="px-4 py-2 text-left">Listings</th>
                <th className="px-4 py-2 text-left">Transactions</th>
                <th className="px-4 py-2 text-left">Workflow</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                    Loading roster…
                  </td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                    No agents match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => <TeamRow key={agent.agentProfileId} agent={agent} />)
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function KpiCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-slate-900">{value}</p>
      {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
    </Card>
  );
}

const riskBadgeVariant: Record<string, string> = {
  LOW: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-100',
  HIGH: 'bg-rose-50 text-rose-700 border-rose-100'
};

function TeamRow({ agent }: { agent: MissionControlAgentRow }) {
  const complianceLabel = agent.requiresAction ? 'Action required' : agent.isCompliant ? 'Compliant' : 'Monitoring';
  const complianceTone = agent.requiresAction
    ? 'bg-rose-50 text-rose-700 border-rose-100'
    : agent.isCompliant
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : 'bg-amber-50 text-amber-700 border-amber-100';

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">{agent.name}</p>
            <p className="text-xs text-slate-500">{agent.email ?? 'No email'}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge className="border bg-slate-50 capitalize text-slate-700">{agent.lifecycleStage?.toLowerCase() ?? 'unknown'}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge className={`border ${riskBadgeVariant[agent.riskLevel] ?? 'bg-slate-100 text-slate-600'}`}>{agent.riskLevel}</Badge>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">
          {agent.trainingCompleted}/{agent.trainingAssigned}
        </p>
        <p className="text-xs text-slate-500">
          Required: {agent.requiredTrainingCompleted}/{agent.requiredTrainingAssigned}
        </p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{agent.activeListingCount}</p>
        <p className="text-xs text-slate-500">{agent.listingCount} total</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{agent.transactionCount}</p>
        <p className="text-xs text-slate-500">{agent.nonCompliantTransactionCount} flagged</p>
      </td>
      <td className="px-4 py-3">
        <Badge className={`border ${complianceTone}`}>{complianceLabel}</Badge>
        <p className="text-xs text-slate-500">
          Onboarding: {agent.onboardingTasksOpenCount} open · {agent.onboardingTasksCompletedCount} done
        </p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" asChild>
            <Link to={`/broker/mission-control?agent=${agent.agentProfileId}`}>Mission Control</Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/broker/compliance?agent=${agent.agentProfileId}`}>Compliance</Link>
          </Button>
        </div>
      </td>
    </tr>
  );
}
