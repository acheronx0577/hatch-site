import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, Info, Plus, ShieldAlert, SlidersHorizontal, Users } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMissionControlAgents, type MissionControlAgentRow } from '@/lib/api/mission-control';
import { missionControlAgentsQueryKey } from '@/lib/queryKeys';
import {
  inviteAgent,
  listAgentInvites,
  resendAgentInvite,
  revokeAgentInvite,
  updateAgentCompliance,
  updateAgentProfileAdmin,
  type AgentInviteRecord,
  type InviteAgentPayload
} from '@/lib/api/agents';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

const onboardingFilters = [
  { id: 'ALL', label: 'All stages' },
  { id: 'ONBOARDING', label: 'Pending' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'OFFBOARDING', label: 'Inactive' }
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
    return <div className="text-sm text-gray-600">Select an organization to view team analytics.</div>;
  }
  return (
    <div className="space-y-8">
      <TeamOverviewPanel orgId={orgId} />
      <TeamRosterTable orgId={orgId} />
    </div>
  );
}

const numberFormatter = new Intl.NumberFormat('en-US');
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function useTeamData(orgId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: missionControlAgentsQueryKey(orgId),
    queryFn: () => fetchMissionControlAgents(orgId),
    staleTime: 30_000
  });
  return { agents: data ?? [], isLoading, error };
}

function useInviteData(orgId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['organizations', orgId, 'invites'],
    queryFn: () => listAgentInvites(orgId),
    staleTime: 30_000
  });
  return { invites: data ?? [], isLoading, error };
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
      queryClient.invalidateQueries({ queryKey: missionControlAgentsQueryKey(orgId) });
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'invites'] });
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
  const { invites: orgInvites, isLoading: invitesLoading, error: invitesError } = useInviteData(orgId);

  const pendingInvites = useMemo(() => {
    const now = Date.now();
    return orgInvites
      .filter((invite) => invite.status === 'PENDING' && new Date(invite.expiresAt).getTime() > now)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orgInvites]);

  const resendInvite = useMutation({
    mutationFn: (inviteId: string) => resendAgentInvite(orgId, inviteId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'invites'] });
      const inviteUrl = result?.signupUrl;
      const canCopy = typeof inviteUrl === 'string' && inviteUrl.length > 0;
      toast({
        title: 'Invite resent',
        description: canCopy ? (
          <div className="space-y-2">
            <p>Share the updated signup link with the agent:</p>
            <p className="break-all rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">{inviteUrl}</p>
          </div>
        ) : (
          'Invite resent, but no signup link was returned.'
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
        title: 'Failed to resend invite',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) => revokeAgentInvite(orgId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'invites'] });
      toast({ title: 'Invite revoked' });
    },
    onError: (error) => {
      toast({
        title: 'Failed to revoke invite',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  });
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
    <div className="space-y-4">
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
            <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Team readiness</h1>
            <p className="text-sm text-slate-500">
              Track onboarding progress, compliance risk, and link into detailed profiles.
            </p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setIsDialogOpen(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add agent
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Total agents" value={isLoading ? '—' : numberFormatter.format(metrics.total)} />
          <KpiCard
            label="Onboarding"
            value={numberFormatter.format(metrics.onboarding)}
            helper={`${metrics.active} active`}
          />
          <KpiCard
            label="High risk"
            value={numberFormatter.format(metrics.highRisk)}
            helper={`${metrics.requiresAction} action required`}
          />
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

      {invitesError ? (
        <Card className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-white/40 p-4 text-sm text-slate-600 backdrop-blur-md dark:bg-white/10 dark:text-ink-100/70">
          Unable to load pending invites.
        </Card>
      ) : pendingInvites.length > 0 ? (
        <PendingInvitesCard
          invites={pendingInvites}
          loading={invitesLoading}
          onResend={(inviteId) => resendInvite.mutate(inviteId)}
          onRevoke={(inviteId) => revokeInvite.mutate(inviteId)}
          busy={resendInvite.isLoading || revokeInvite.isLoading}
        />
      ) : null}
    </div>
  );
}

function PendingInvitesCard({
  invites,
  loading,
  busy,
  onResend,
  onRevoke
}: {
  invites: AgentInviteRecord[];
  loading: boolean;
  busy: boolean;
  onResend: (inviteId: string) => void;
  onRevoke: (inviteId: string) => void;
}) {
  return (
    <Card className="relative z-0 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-card-alpha)] p-6 shadow-brand backdrop-blur-[var(--hatch-card-blur)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-brand-blue-600/10 via-white/0 to-brand-green-500/10 dark:from-brand-blue-600/18 dark:to-brand-green-500/14"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Pending invites</h2>
          <p className="text-sm text-slate-500">Agents who have not joined yet.</p>
        </div>
        {loading ? <p className="text-xs text-slate-500">Loading…</p> : null}
      </div>

      <div className="mt-4 space-y-2">
        {invites.map((invite) => {
          const expiresAt = new Date(invite.expiresAt);
          const expiresSoon = expiresAt.getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000;
          return (
            <div
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/25 bg-white/15 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-white/10"
            >
              <div>
                <p className="font-medium text-slate-900">{invite.email}</p>
                <p className="text-xs text-slate-500">
                  Expires {expiresAt.toLocaleDateString()}
                  {expiresSoon ? <span className="ml-2 text-amber-700">Expires soon</span> : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onResend(invite.id)}
                  disabled={busy}
                >
                  Resend
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Revoke invite for ${invite.email}?`)) {
                      onRevoke(invite.id);
                    }
                  }}
                  disabled={busy}
                >
                  Revoke
                </Button>
              </div>
            </div>
          );
        })}
      </div>
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
    <TooltipProvider>
      <Card className="relative z-0 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-card/[var(--hatch-card-alpha)] p-6 shadow-brand backdrop-blur-[var(--hatch-card-blur)]">
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
		          <p className="text-sm text-slate-500">Lifecycle, compliance, and performance snapshot.</p>
		        </div>
	        <div className="flex flex-wrap items-center gap-2">
	          <Input
	            value={search}
	            onChange={(event) => setSearch(event.target.value)}
	            placeholder="Search agents..."
	            className="h-9 w-56 rounded-full px-4"
	          />
	          <Select value={stageFilter} onValueChange={(value) => handleStageChange(value as StageFilter)}>
	            <SelectTrigger className="h-9 w-[156px] rounded-full">
	              <SelectValue placeholder="All stages" />
	            </SelectTrigger>
	            <SelectContent className="rounded-xl">
	              {onboardingFilters.map((filter) => (
	                <SelectItem key={filter.id} value={filter.id}>
	                  {filter.label}
	                </SelectItem>
	              ))}
	            </SelectContent>
	          </Select>
	          <Select value={riskFilter} onValueChange={(value) => handleRiskChange(value as RiskFilter)}>
	            <SelectTrigger className="h-9 w-[128px] rounded-full">
	              <SelectValue placeholder="All risk" />
	            </SelectTrigger>
	            <SelectContent className="rounded-xl">
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
        <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--hatch-card-border)] bg-white/10 backdrop-blur-md dark:bg-white/5">
          <div className="max-h-[72vh] overflow-auto">
          <table className="min-w-full text-sm text-slate-700">
	            <thead className="sticky top-0 z-10 bg-white/25 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500 backdrop-blur-sm dark:bg-white/10 dark:text-ink-100/70">
	              <tr>
	                <th className="px-3 py-2 text-left">Agent</th>
	                <th className="px-3 py-2 text-left">Lifecycle</th>
	                <th className="px-3 py-2 text-left">Risk</th>
	                <th className="px-3 py-2 text-left">API</th>
	                <th className="px-3 py-2 text-left">Listings</th>
	                <th className="px-3 py-2 text-left">Transactions</th>
	                <th className="px-3 py-2 text-left">Sales</th>
	                <th className="px-3 py-2 text-left">Clients</th>
                <th className="px-3 py-2 text-left">Workflow</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
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
        </div>
      )}
      </Card>
    </TooltipProvider>
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
  LOW: 'bg-emerald-100 text-emerald-700 border-emerald-200/70',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200/70',
  HIGH: 'bg-rose-100 text-rose-700 border-rose-200/70'
};

const apiBandVariant: Record<string, string> = {
  HIGH: 'bg-emerald-100 text-emerald-700 border-emerald-200/70',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200/70',
  DEVELOPING: 'bg-slate-100 text-slate-700 border-slate-200/70',
  NONE: 'bg-slate-50 text-slate-600 border-slate-200/70'
};

const apiBandLabel: Record<string, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  DEVELOPING: 'Developing',
  NONE: 'No snapshot'
};

const apiHelpCopy =
  'Confidence score based on historical performance, responsiveness, momentum, fit, capacity, and risk.';

type ActionRequiredItem = { title: string; detail: string };

const buildActionRequiredItems = (agent: MissionControlAgentRow): ActionRequiredItem[] => {
  const items: ActionRequiredItem[] = [];

  if (agent.openComplianceIssues > 0) {
    items.push({
      title: 'Compliance issues',
      detail: `${agent.openComplianceIssues} open`
    });
  }

  const requiredTrainingRemaining = agent.requiredTrainingAssigned - agent.requiredTrainingCompleted;
  if (requiredTrainingRemaining > 0) {
    items.push({
      title: 'Required training',
      detail: `${agent.requiredTrainingCompleted}/${agent.requiredTrainingAssigned} completed`
    });
  }

  if (
    agent.ceHoursRequired !== null &&
    agent.ceHoursRequired !== undefined &&
    agent.ceHoursCompleted !== null &&
    agent.ceHoursCompleted !== undefined &&
    agent.ceHoursCompleted < agent.ceHoursRequired
  ) {
    items.push({
      title: 'Continuing education',
      detail: `${agent.ceHoursCompleted}/${agent.ceHoursRequired} hours logged`
    });
  }

  const membershipIssues = agent.memberships.filter(
    (membership) => (membership.status ?? '').trim().toUpperCase() !== 'ACTIVE'
  );
  if (membershipIssues.length > 0) {
    items.push({
      title: 'Memberships',
      detail: membershipIssues
        .map((membership) => membership.name)
        .filter(Boolean)
        .slice(0, 2)
        .join(', ')
    });
  }

  if ((agent.lifecycleStage ?? '').toUpperCase() === 'ONBOARDING' && agent.onboardingTasksOpenCount > 0) {
    items.push({
      title: 'Onboarding tasks',
      detail: `${agent.onboardingTasksOpenCount} open`
    });
  }

  if ((agent.lifecycleStage ?? '').toUpperCase() === 'OFFBOARDING' && agent.offboardingTasksOpenCount > 0) {
    items.push({
      title: 'Offboarding tasks',
      detail: `${agent.offboardingTasksOpenCount} open`
    });
  }

  return items;
};

function TeamRow({ orgId, agent }: { orgId: string; agent: MissionControlAgentRow }) {
  const complianceLabel = agent.requiresAction ? 'Action required' : agent.isCompliant ? 'Compliant' : 'Monitoring';
  const complianceTone = agent.requiresAction
    ? 'bg-rose-100 text-rose-700 border-rose-200/70'
    : agent.isCompliant
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200/70'
      : 'bg-amber-100 text-amber-800 border-amber-200/70';

  const actionItems = agent.requiresAction ? buildActionRequiredItems(agent) : [];
  const orientationLabel =
    agent.buyerSellerOrientation === 'BUYER_HEAVY'
      ? 'Buyer-heavy'
      : agent.buyerSellerOrientation === 'SELLER_HEAVY'
        ? 'Seller-heavy'
        : agent.buyerSellerOrientation === 'BALANCED'
          ? 'Balanced'
          : 'Unknown';
  const orientationTone =
    agent.buyerSellerOrientation === 'BUYER_HEAVY'
      ? 'bg-sky-100 text-sky-800 border-sky-200/70'
      : agent.buyerSellerOrientation === 'SELLER_HEAVY'
        ? 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200/70'
        : agent.buyerSellerOrientation === 'BALANCED'
          ? 'bg-slate-100 text-slate-700 border-slate-200/70'
          : 'bg-slate-50 text-slate-500 border-slate-200/70';
  const shareLabel =
    agent.buyerSellerOrientation === 'SELLER_HEAVY'
      ? `Seller ${Math.max(0, 100 - (agent.buyerSharePercent ?? 0))}%`
      : agent.buyerSellerOrientation === 'BUYER_HEAVY' || agent.buyerSellerOrientation === 'BALANCED'
        ? `Buyer ${agent.buyerSharePercent ?? 0}%`
        : null;

  const api = agent.performance ?? null;
  const apiBand = String(api?.confidenceBand ?? 'NONE').toUpperCase();
  const apiHasInsufficientData = Boolean(
    api?.topDrivers?.some((driver) => (driver?.label ?? '').toLowerCase().startsWith('insufficient recent data'))
  );
  const apiScore = api && !apiHasInsufficientData ? Math.round(Math.max(0, Math.min(1, api.overallScore ?? 0)) * 100) : null;
  const apiTopDrivers = Array.isArray(api?.topDrivers) ? api!.topDrivers.slice(0, 2) : [];
  const apiBadgeTone = apiHasInsufficientData ? 'NONE' : apiBand;

  return (
    <tr className="transition-colors odd:bg-white/20 even:bg-white/10 hover:bg-white/25 dark:odd:bg-white/10 dark:even:bg-white/5 dark:hover:bg-white/12">
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/20 text-sm font-semibold text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-ink-100">
            <Users className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">{agent.name}</p>
            <p className="text-[11px] leading-tight text-slate-500">{agent.email ?? 'No email'}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge className={`border ${orientationTone} px-2 py-0.5 text-[10px] font-semibold`}>
                {orientationLabel}
                {shareLabel ? ` · ${shareLabel}` : ''}
              </Badge>
              <span className="text-[11px] text-slate-500">
                Buyer {agent.buyerLeadCount} · Seller {agent.sellerLeadCount}
              </span>
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <Badge variant="secondary" className="capitalize">{agent.lifecycleStage?.toLowerCase() ?? 'unknown'}</Badge>
      </td>
      <td className="px-3 py-2 align-top">
        <Badge className={`border ${riskBadgeVariant[agent.riskLevel] ?? 'bg-slate-100 text-slate-600'}`}>{agent.riskLevel}</Badge>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2">
          <Badge className={`min-w-10 justify-center border tabular-nums ${apiBandVariant[apiBadgeTone] ?? apiBandVariant.NONE}`}>
            {apiScore ?? '—'}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-sm p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-blue-600 focus:ring-offset-2"
                aria-label="About Agent Performance Indicator"
              >
                <Info className="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">
                  API {apiScore ?? '—'} · {apiHasInsufficientData ? 'Insufficient data' : apiBandLabel[apiBand] ?? 'No snapshot'}
                </p>
                <p className="text-sm text-slate-700">{apiHelpCopy}</p>
                {apiTopDrivers.length > 0 ? (
                  <ul className="space-y-1 text-xs text-slate-600">
                    {apiTopDrivers.map((driver) => (
                      <li key={driver.label}>
                        <span className={driver.direction === 'negative' ? 'text-rose-700' : 'text-emerald-700'}>
                          {driver.direction === 'negative' ? '−' : '+'}
                        </span>{' '}
                        {driver.label}
                      </li>
                    ))}
                  </ul>
                ) : api ? null : (
                  <p className="text-xs text-slate-600">No performance snapshot yet. Open Performance to refresh scores.</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <p className="font-medium text-slate-900">{agent.activeListingCount}</p>
        <p className="text-[11px] text-slate-500">{agent.listingCount} total</p>
      </td>
      <td className="px-3 py-2 align-top">
        <p className="font-medium text-slate-900">{agent.transactionCount}</p>
        <p className="text-[11px] text-slate-500">{agent.nonCompliantTransactionCount} flagged</p>
      </td>
      <td className="px-3 py-2 align-top">
        <p className="font-medium text-slate-900">{agent.closedTransactionCount}</p>
        <p className="text-[11px] text-slate-500">{currencyFormatter.format(agent.closedTransactionVolume)}</p>
      </td>
      <td className="px-3 py-2 align-top">
        <p className="font-medium text-slate-900">{agent.currentClientCount}</p>
        <p className="text-[11px] text-slate-500">{agent.pastClientCount} past</p>
      </td>
      <td className="px-3 py-2 align-top">
        {agent.requiresAction ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className={`border ${complianceTone} gap-1`}>
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                {complianceLabel}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs rounded-xl border border-white/30 bg-white/90 p-3 text-xs text-slate-800 shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-slate-950/80 dark:text-ink-100">
              <div className="space-y-2">
                <p className="text-sm font-semibold">Action required</p>
                {actionItems.length > 0 ? (
                  <ul className="space-y-1">
                    {actionItems.slice(0, 6).map((item) => (
                      <li key={item.title}>
                        <span className="font-medium">{item.title}:</span> {item.detail}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>This agent is flagged for broker follow-up.</p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-ink-100/70">
                  Open Risk Center for details and remediation steps.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Badge className={`border ${complianceTone} gap-1`}>
            {agent.isCompliant ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            {complianceLabel}
          </Badge>
        )}
        <p className="text-[11px] text-slate-500">
          Onboarding: {agent.onboardingTasksOpenCount} open · {agent.onboardingTasksCompletedCount} done
        </p>
      </td>
      <td className="px-3 py-2 text-right align-top">
        <div className="inline-flex items-center justify-end gap-2">
          <AgentManageSheet orgId={orgId} agent={agent} />
          <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
            <Link to={`/broker/agent-performance/${agent.agentProfileId}`}>
              <BarChart3 className="h-4 w-4" />
              <span className="sr-only">Performance</span>
            </Link>
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
            <Link to={`/broker/compliance?agent=${agent.agentProfileId}`}>
              <ShieldAlert className="h-4 w-4" />
              <span className="sr-only">Risk Center</span>
            </Link>
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
      queryClient.invalidateQueries({ queryKey: missionControlAgentsQueryKey(orgId) });
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
          size="icon"
          variant="outline"
          className="h-8 w-8"
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="sr-only">Manage</span>
        </Button>
	      </SheetTrigger>
	      <SheetContent className="w-[420px] overflow-hidden sm:max-w-md">
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
              <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Training &amp; CE</Label>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <MiniMetric
                  label="Training"
                  value={`${agent.trainingCompleted}/${agent.trainingAssigned}`}
                  helper={`Required ${agent.requiredTrainingCompleted}/${agent.requiredTrainingAssigned}`}
                />
                <MiniMetric
                  label="CE hours"
                  value={
                    agent.ceHoursRequired !== null && agent.ceHoursRequired !== undefined && agent.ceHoursCompleted !== null && agent.ceHoursCompleted !== undefined
                      ? `${agent.ceHoursCompleted}/${agent.ceHoursRequired}`
                      : '—'
                  }
                  helper={agent.ceCycleEndAt ? `Cycle ends ${new Date(agent.ceCycleEndAt).toLocaleDateString()}` : 'Cycle end —'}
                />
              </div>
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
                <Link to={`/broker/compliance?agent=${agent.agentProfileId}`}>Risk Center</Link>
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
