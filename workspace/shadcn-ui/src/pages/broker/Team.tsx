import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Users, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMissionControlAgents, type MissionControlAgentRow } from '@/lib/api/mission-control';
import { inviteAgent, updateAgentCompliance, updateAgentProfileAdmin, type InviteAgentPayload } from '@/lib/api/agents';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';

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
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

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
    email: ''
  });

  const sendInvite = useMutation({
    mutationFn: (payload: InviteAgentPayload) => inviteAgent(orgId, payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['mission-control', 'team', orgId] });
      setIsDialogOpen(false);
      setForm({
        email: ''
      });

      const inviteUrl = result?.signupUrl;
      const canCopy = typeof inviteUrl === 'string' && inviteUrl.length > 0;
      toast({
        title: 'Invite created',
        description: canCopy ? (
          <div className="space-y-2">
            <p>Share this signup link with the agent:</p>
            <p className="break-all rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">{inviteUrl}</p>
          </div>
        ) : (
          'Invite created, but no signup link was returned.'
        ),
        action: canCopy ? (
          <ToastAction
            altText="Copy invite link"
            onClick={() => {
              void navigator.clipboard?.writeText(inviteUrl);
            }}
          >
            Copy link
          </ToastAction>
        ) : undefined
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
    const closedSales = agents.reduce((sum, agent) => sum + (agent.closedTransactionCount ?? 0), 0);
    const closedVolume = agents.reduce((sum, agent) => sum + (agent.closedTransactionVolume ?? 0), 0);
    const currentClients = agents.reduce((sum, agent) => sum + (agent.currentClientCount ?? 0), 0);
    const pastClients = agents.reduce((sum, agent) => sum + (agent.pastClientCount ?? 0), 0);
    return {
      total: agents.length,
      onboarding,
      active,
      offboarding,
      highRisk,
      requiresAction,
      closedSales,
      closedVolume,
      currentClients,
      pastClients
    };
  }, [agents]);

  return (
    <Card className="relative overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-background)] p-6 shadow-brand-lg backdrop-blur-xl">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-blue-600/16 via-white/0 to-brand-green-500/14 dark:from-brand-blue-600/24 dark:to-brand-green-500/18"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_60%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_60%)]"
      />
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

      <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total agents" value={isLoading ? '—' : numberFormatter.format(metrics.total)} />
        <KpiCard label="Onboarding" value={numberFormatter.format(metrics.onboarding)} helper={`${metrics.active} active`} />
        <KpiCard label="High risk" value={numberFormatter.format(metrics.highRisk)} helper={`${metrics.requiresAction} need action`} />
        <KpiCard
          label="Closed sales"
          value={numberFormatter.format(metrics.closedSales)}
          helper={currencyFormatter.format(metrics.closedVolume)}
        />
        <KpiCard
          label="Current clients"
          value={numberFormatter.format(metrics.currentClients)}
          helper={`${numberFormatter.format(metrics.pastClients)} past`}
        />
        <KpiCard label="Offboarding" value={numberFormatter.format(metrics.offboarding)} />
      </div>

	      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
	        <DialogContent className="overflow-hidden border-[var(--glass-border)] !bg-[var(--glass-background)] shadow-brand-lg backdrop-blur-xl sm:rounded-2xl">
	          <div
	            aria-hidden="true"
	            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-brand-blue-600/12 via-white/0 to-brand-green-500/10 dark:from-brand-blue-600/24 dark:to-brand-green-500/18"
	          />
	          <div
	            aria-hidden="true"
	            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_60%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_60%)]"
	          />
	          <DialogHeader>
	            <DialogTitle>Add agent</DialogTitle>
	            <DialogDescription>
	              Invite an agent by email. They’ll receive a signup link and be linked to your brokerage.
	            </DialogDescription>
	          </DialogHeader>
	          <div className="space-y-3">
	            <div className="space-y-1">
	              <Label htmlFor="agentEmail">Email</Label>
	              <Input
	                id="agentEmail"
	                type="email"
	                value={form.email}
	                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
	                placeholder="agent@hatch.test"
	                className="h-10 rounded-xl !border-white/30 !bg-white/25 text-slate-700 placeholder:text-slate-500 backdrop-blur-xl focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] dark:!border-white/15 dark:!bg-white/10 dark:text-ink-100 dark:placeholder:text-ink-100/60"
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
	                  email: form.email.trim()
	                })
	              }
	              disabled={sendInvite.isLoading || !form.email.trim()}
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
  const [search, setSearch] = useState('');
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
    const query = search.trim().toLowerCase();
    return agents.filter((agent) => {
      if (stageFilter !== 'ALL' && agent.lifecycleStage !== stageFilter) return false;
      if (riskFilter !== 'ALL' && agent.riskLevel !== riskFilter) return false;
      if (query) {
        const name = agent.name?.toLowerCase() ?? '';
        const email = agent.email?.toLowerCase() ?? '';
        if (!name.includes(query) && !email.includes(query)) return false;
      }
      return true;
    });
  }, [agents, stageFilter, riskFilter, search]);

	  return (
	    <Card className="relative z-0 overflow-hidden rounded-[24px] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-card-alpha)] p-5 shadow-brand backdrop-blur-[var(--hatch-card-blur)]">
	      <div
	        aria-hidden="true"
	        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-brand-blue-600/10 via-white/0 to-brand-green-500/10 dark:from-brand-blue-600/18 dark:to-brand-green-500/14"
	      />
	      <div
	        aria-hidden="true"
	        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.5),transparent_58%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_58%)]"
	      />
	      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--hatch-card-border)] pb-4">
	        <div>
	          <h2 className="text-lg font-semibold text-slate-900">Agent roster</h2>
	          <p className="text-sm text-slate-500">Lifecycle, compliance, and training snapshot.</p>
	        </div>
	        <div className="flex flex-wrap items-center gap-2">
	          <Input
	            value={search}
	            onChange={(event) => setSearch(event.target.value)}
	            placeholder="Search agents..."
	            className="h-9 w-56 rounded-full !border-white/30 !bg-white/25 px-4 text-sm text-slate-700 placeholder:text-slate-500 backdrop-blur-xl focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)] dark:!border-white/15 dark:!bg-white/10 dark:text-ink-100 dark:placeholder:text-ink-100/60"
	          />
	          <Select value={stageFilter} onValueChange={(value) => handleStageChange(value as StageFilter)}>
	            <SelectTrigger className="h-9 w-[156px] rounded-full !border-white/30 !bg-white/25 text-slate-700 backdrop-blur-xl dark:!border-white/15 dark:!bg-white/10 dark:text-ink-100">
	              <SelectValue placeholder="All stages" />
	            </SelectTrigger>
	            <SelectContent className="rounded-xl border border-[var(--glass-border)] !bg-[var(--glass-background)] backdrop-blur-xl">
	              {onboardingFilters.map((filter) => (
	                <SelectItem key={filter.id} value={filter.id}>
	                  {filter.label}
	                </SelectItem>
	              ))}
	            </SelectContent>
	          </Select>
	          <Select value={riskFilter} onValueChange={(value) => handleRiskChange(value as RiskFilter)}>
	            <SelectTrigger className="h-9 w-[128px] rounded-full !border-white/30 !bg-white/25 text-slate-700 backdrop-blur-xl dark:!border-white/15 dark:!bg-white/10 dark:text-ink-100">
	              <SelectValue placeholder="All risk" />
	            </SelectTrigger>
	            <SelectContent className="rounded-xl border border-[var(--glass-border)] !bg-[var(--glass-background)] backdrop-blur-xl">
	              {riskFilters.map((filter) => (
	                <SelectItem key={filter.id} value={filter.id}>
	                  {filter.label}
	                </SelectItem>
	              ))}
	            </SelectContent>
	          </Select>
	        </div>
	      </div>

      {error ? (
        <p className="py-6 text-sm text-rose-500">Unable to load team data.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-[color:var(--hatch-card-border)] text-sm text-slate-700">
            <thead className="bg-white/10 text-xs uppercase tracking-[0.15em] text-slate-500 backdrop-blur-sm dark:bg-white/5 dark:text-ink-100/70">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">Lifecycle</th>
                <th className="px-4 py-2 text-left">Risk</th>
                <th className="px-4 py-2 text-left">Training</th>
                <th className="px-4 py-2 text-left">Listings</th>
                <th className="px-4 py-2 text-left">Transactions</th>
                <th className="px-4 py-2 text-left">Sales</th>
                <th className="px-4 py-2 text-left">Clients</th>
                <th className="px-4 py-2 text-left">Workflow</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--hatch-card-border)]">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                    Loading roster…
                  </td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-slate-500">
                    No agents match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => <TeamRow key={agent.agentProfileId} orgId={orgId} agent={agent} />)
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
    <Card className="!rounded-2xl px-4 py-3 shadow-brand-md">
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

function TeamRow({ orgId, agent }: { orgId: string; agent: MissionControlAgentRow }) {
  const complianceLabel = agent.requiresAction ? 'Action required' : agent.isCompliant ? 'Compliant' : 'Monitoring';
  const complianceTone = agent.requiresAction
    ? 'bg-rose-50 text-rose-700 border-rose-100'
    : agent.isCompliant
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : 'bg-amber-50 text-amber-700 border-amber-100';

  return (
    <tr className="transition-colors hover:bg-white/10 dark:hover:bg-white/5">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/20 text-sm font-semibold text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-ink-100">
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
        <p className="font-medium text-slate-900">{agent.closedTransactionCount}</p>
        <p className="text-xs text-slate-500">{currencyFormatter.format(agent.closedTransactionVolume)}</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{agent.currentClientCount}</p>
        <p className="text-xs text-slate-500">{agent.pastClientCount} past</p>
      </td>
      <td className="px-4 py-3">
        <Badge className={`border ${complianceTone}`}>{complianceLabel}</Badge>
        <p className="text-xs text-slate-500">
          Onboarding: {agent.onboardingTasksOpenCount} open · {agent.onboardingTasksCompletedCount} done
        </p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <AgentManageSheet orgId={orgId} agent={agent} />
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

const lifecycleOptions = [
  { id: 'ONBOARDING', label: 'Onboarding' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'OFFBOARDING', label: 'Offboarding' }
] as const;

type LifecycleStage = (typeof lifecycleOptions)[number]['id'];

const normalizeLifecycleStage = (value: string | null | undefined): LifecycleStage => {
  const normalized = (value ?? '').toUpperCase();
  const match = lifecycleOptions.find((option) => option.id === normalized);
  return match?.id ?? 'ONBOARDING';
};

const riskOptions = [
  { id: 'LOW', label: 'Low risk' },
  { id: 'MEDIUM', label: 'Moderate risk' },
  { id: 'HIGH', label: 'High risk' }
] as const;

type RiskLevel = (typeof riskOptions)[number]['id'];

const normalizeRiskLevel = (value: string | null | undefined): RiskLevel => {
  const normalized = (value ?? '').toUpperCase();
  const match = riskOptions.find((option) => option.id === normalized);
  return match?.id ?? 'LOW';
};

type ComplianceState = 'COMPLIANT' | 'MONITORING' | 'ACTION_REQUIRED';

const resolveComplianceState = (agent: Pick<MissionControlAgentRow, 'isCompliant' | 'requiresAction'>): ComplianceState =>
  agent.requiresAction ? 'ACTION_REQUIRED' : agent.isCompliant ? 'COMPLIANT' : 'MONITORING';

const complianceOptions = [
  { id: 'COMPLIANT', label: 'Compliant' },
  { id: 'MONITORING', label: 'Monitoring' },
  { id: 'ACTION_REQUIRED', label: 'Action required' }
] as const;

const complianceStateToOverrides = (state: ComplianceState) => {
  switch (state) {
    case 'COMPLIANT':
      return { isCompliant: true, requiresAction: false };
    case 'ACTION_REQUIRED':
      return { isCompliant: false, requiresAction: true };
    case 'MONITORING':
    default:
      return { isCompliant: false, requiresAction: false };
  }
};

function AgentManageSheet({ orgId, agent }: { orgId: string; agent: MissionControlAgentRow }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [lifecycleStage, setLifecycleStage] = useState<LifecycleStage>(() => normalizeLifecycleStage(agent.lifecycleStage));
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(() => normalizeRiskLevel(agent.riskLevel));
  const [complianceState, setComplianceState] = useState<ComplianceState>(() => resolveComplianceState(agent));

  useEffect(() => {
    if (!open) return;
    setLifecycleStage(normalizeLifecycleStage(agent.lifecycleStage));
    setRiskLevel(normalizeRiskLevel(agent.riskLevel));
    setComplianceState(resolveComplianceState(agent));
  }, [open, agent.lifecycleStage, agent.riskLevel, agent.isCompliant, agent.requiresAction]);

  const hasStageChanges = normalizeLifecycleStage(agent.lifecycleStage) !== lifecycleStage;
  const hasRiskChanges = normalizeRiskLevel(agent.riskLevel) !== riskLevel;
  const hasComplianceChanges = resolveComplianceState(agent) !== complianceState;
  const hasChanges = hasStageChanges || hasRiskChanges || hasComplianceChanges;

  const saveChanges = useMutation({
    mutationFn: async () => {
      const nextStage = lifecycleStage;
      const nextRiskLevel = riskLevel;
      const nextComplianceState = complianceState;

      const stageChanged = normalizeLifecycleStage(agent.lifecycleStage) !== nextStage;
      const riskChanged = normalizeRiskLevel(agent.riskLevel) !== nextRiskLevel;
      const complianceChanged = resolveComplianceState(agent) !== nextComplianceState;

      const tasks: Array<Promise<unknown>> = [];

      if (stageChanged) {
        tasks.push(updateAgentProfileAdmin(orgId, agent.agentProfileId, { lifecycleStage: nextStage }));
      }

      if (riskChanged || complianceChanged) {
        tasks.push(
          updateAgentCompliance(orgId, agent.agentProfileId, {
            riskLevel: nextRiskLevel,
            ...complianceStateToOverrides(nextComplianceState)
          })
        );
      }

      await Promise.all(tasks);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission-control', 'team', orgId] });
      toast({
        title: 'Agent updated',
        description: 'Changes saved successfully.'
      });
      setOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Failed to update agent',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  });

	  return (
	    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="border-[var(--glass-border)] bg-white/20 hover:bg-white/30 dark:bg-white/10 dark:hover:bg-white/15"
        >
          Manage
        </Button>
	      </SheetTrigger>
	      <SheetContent className="w-[420px] overflow-hidden border-[var(--glass-border)] !bg-[var(--glass-background)] backdrop-blur-xl sm:max-w-md">
	        <div
	          aria-hidden="true"
	          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand-blue-600/14 via-white/0 to-brand-green-500/12 dark:from-brand-blue-600/24 dark:to-brand-green-500/18"
	        />
	        <div
	          aria-hidden="true"
	          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_60%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_60%)]"
	        />
	        <SheetHeader className="pr-6">
	          <SheetTitle className="text-slate-900">Agent profile</SheetTitle>
	          <SheetDescription className="text-slate-600">
	            {agent.name} · {agent.email ?? 'No email'}
	          </SheetDescription>
	        </SheetHeader>

        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric
              label="Closed sales"
              value={numberFormatter.format(agent.closedTransactionCount)}
              helper={currencyFormatter.format(agent.closedTransactionVolume)}
            />
            <MiniMetric
              label="Clients"
              value={numberFormatter.format(agent.currentClientCount)}
              helper={`${numberFormatter.format(agent.pastClientCount)} past`}
            />
            <MiniMetric
              label="Leads"
              value={numberFormatter.format(agent.assignedLeadsCount)}
              helper={`${numberFormatter.format(agent.qualifiedLeadsCount)} qualified`}
            />
            <MiniMetric
              label="Offer intents"
              value={numberFormatter.format(agent.acceptedOfferIntentCount)}
              helper={`${numberFormatter.format(agent.offerIntentCount)} total`}
            />
            <MiniMetric
              label="Active listings"
              value={numberFormatter.format(agent.activeListingCount)}
              helper={`${numberFormatter.format(agent.listingCount)} total`}
            />
            <MiniMetric
              label="Transactions"
              value={numberFormatter.format(agent.transactionCount)}
              helper={`${numberFormatter.format(agent.nonCompliantTransactionCount)} flagged`}
            />
          </div>

	          <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-card/45 p-4 backdrop-blur-sm">
	            <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Lifecycle stage</Label>
	            <div className="mt-2">
	              <Select value={lifecycleStage} onValueChange={(value) => setLifecycleStage(value as LifecycleStage)}>
	                <SelectTrigger className="h-10 rounded-xl !border-white/30 !bg-white/25 backdrop-blur dark:!border-white/15 dark:!bg-white/10">
	                  <SelectValue placeholder="Select stage" />
	                </SelectTrigger>
	                <SelectContent className="rounded-xl border border-[var(--glass-border)] !bg-[var(--glass-background)] backdrop-blur-xl">
	                  {lifecycleOptions.map((option) => (
	                    <SelectItem key={option.id} value={option.id}>
	                      {option.label}
	                    </SelectItem>
	                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-card/45 p-4 backdrop-blur-sm">
            <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Risk & compliance</Label>
            <div className="mt-2 grid gap-3">
	              <div>
	                <Label className="text-xs text-slate-500">Risk level</Label>
	                <div className="mt-1">
	                  <Select value={riskLevel} onValueChange={(value) => setRiskLevel(value as RiskLevel)}>
	                    <SelectTrigger className="h-10 rounded-xl !border-white/30 !bg-white/25 backdrop-blur dark:!border-white/15 dark:!bg-white/10">
	                      <SelectValue placeholder="Select risk level" />
	                    </SelectTrigger>
	                    <SelectContent className="rounded-xl border border-[var(--glass-border)] !bg-[var(--glass-background)] backdrop-blur-xl">
	                      {riskOptions.map((option) => (
	                        <SelectItem key={option.id} value={option.id}>
	                          {option.label}
	                        </SelectItem>
	                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

	              <div>
	                <Label className="text-xs text-slate-500">Compliance</Label>
	                <div className="mt-1">
	                  <Select value={complianceState} onValueChange={(value) => setComplianceState(value as ComplianceState)}>
	                    <SelectTrigger className="h-10 rounded-xl !border-white/30 !bg-white/25 backdrop-blur dark:!border-white/15 dark:!bg-white/10">
	                      <SelectValue placeholder="Select compliance state" />
	                    </SelectTrigger>
	                    <SelectContent className="rounded-xl border border-[var(--glass-border)] !bg-[var(--glass-background)] backdrop-blur-xl">
	                      {complianceOptions.map((option) => (
	                        <SelectItem key={option.id} value={option.id}>
	                          {option.label}
	                        </SelectItem>
	                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => saveChanges.mutate()} disabled={!hasChanges || saveChanges.isPending}>
              {saveChanges.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saveChanges.isPending}>
              Close
            </Button>
          </div>

          <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-card/45 p-4 text-sm text-slate-700 backdrop-blur-sm">
            <p className="font-semibold text-slate-900">Quick links</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" asChild>
                <Link to={`/broker/transactions?agent=${agent.agentProfileId}`}>Transactions</Link>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <Link to={`/broker/mission-control?agent=${agent.agentProfileId}`}>Mission Control</Link>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <Link to={`/broker/compliance?agent=${agent.agentProfileId}`}>Compliance</Link>
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Sales and client totals update automatically from transactions and contacts.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MiniMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-card/45 px-4 py-3 shadow-sm backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{helper}</p>
    </div>
  );
}
