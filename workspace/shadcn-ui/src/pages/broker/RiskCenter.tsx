import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Info, LayoutDashboard, Pencil, Plus, ShieldAlert, Trash2, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { fetchAgentProfile, fetchAgentRiskAiAnalysis, recomputeAgentRisk, updateAgentCompliance } from '@/lib/api/agents';
import {
  createCustomRiskPackage,
  deleteCustomRiskPackage,
  fetchRiskPackages,
  recomputeOrgRisk,
  updateCustomRiskPackage,
  updateRiskPackages,
  type RiskPackageDefinition,
  type RiskPackageId
} from '@/lib/api/risk-packages';
import {
  fetchMissionControlActivity,
  fetchMissionControlAgents,
  type MissionControlAgentRow,
  type MissionControlEvent
} from '@/lib/api/mission-control';
import { missionControlAgentsQueryKey } from '@/lib/queryKeys';
import { useOrgId } from '@/lib/hooks/useOrgId';
import { cn } from '@/lib/utils';

type RiskTab = 'agents' | 'ai';
type RiskDomain = 'ALL' | 'COMPLIANCE' | 'TRAINING' | 'TRANSACTIONS' | 'ONBOARDING' | 'OFFBOARDING';
type RiskSeverity = 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH';

const domains: Array<{ id: RiskDomain; label: string }> = [
  { id: 'ALL', label: 'All domains' },
  { id: 'COMPLIANCE', label: 'Compliance' },
  { id: 'TRAINING', label: 'Training & CE' },
  { id: 'TRANSACTIONS', label: 'Transactions' },
  { id: 'ONBOARDING', label: 'Onboarding' },
  { id: 'OFFBOARDING', label: 'Offboarding' }
];

const severities: Array<{ id: RiskSeverity; label: string }> = [
  { id: 'ALL', label: 'All severities' },
  { id: 'HIGH', label: 'High' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'LOW', label: 'Low' }
];

const legacyFilterToPreset = (
  value: string | null
): Partial<{
  domain: RiskDomain;
  severity: RiskSeverity;
}> => {
  const filter = value?.toUpperCase();
  switch (filter) {
    case 'HIGH_RISK':
      return { severity: 'HIGH' };
    case 'NONCOMPLIANT':
      return { domain: 'COMPLIANCE' };
    case 'ONBOARDING_TASKS':
      return { domain: 'ONBOARDING' };
    case 'OFFBOARDING_TASKS':
      return { domain: 'OFFBOARDING' };
    default:
      return {};
  }
};

const parseTab = (value: string | null): RiskTab => (value === 'ai' ? 'ai' : 'agents');

const parseDomain = (value: string | null, fallback: RiskDomain): RiskDomain => {
  if (!value) return fallback;
  const candidate = value.toUpperCase() as RiskDomain;
  return domains.some((domain) => domain.id === candidate) ? candidate : fallback;
};

const parseSeverity = (value: string | null, fallback: RiskSeverity): RiskSeverity => {
  if (!value) return fallback;
  const candidate = value.toUpperCase() as RiskSeverity;
  return severities.some((severity) => severity.id === candidate) ? candidate : fallback;
};

const eventMap: Record<string, { label: string; href: string }> = {
  ORG_LISTING_EVALUATED: { label: 'Listing evaluation', href: '/broker/properties' },
  ORG_TRANSACTION_EVALUATED: { label: 'Transaction review', href: '/broker/transactions' }
};

function readPayloadString(event: MissionControlEvent, key: string) {
  const payload = event.payload;
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function resolveEvaluationHref(event: MissionControlEvent, fallback: string) {
  if (event.type === 'ORG_LISTING_EVALUATED') {
    const listingId = readPayloadString(event, 'listingId');
    return listingId ? `/broker/properties/${listingId}` : fallback;
  }
  if (event.type === 'ORG_TRANSACTION_EVALUATED') {
    const transactionId = readPayloadString(event, 'transactionId');
    return transactionId ? `/broker/transactions?focus=${transactionId}` : fallback;
  }
  return fallback;
}

export default function RiskCenterPage() {
  const orgId = useOrgId();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tab = parseTab(searchParams.get('view'));
  const legacyPreset = legacyFilterToPreset(searchParams.get('filter'));
  const domain = parseDomain(searchParams.get('domain'), legacyPreset.domain ?? 'ALL');
  const severity = parseSeverity(searchParams.get('severity'), legacyPreset.severity ?? 'ALL');
  const highlightedAgentId = searchParams.get('agent');

  const updateParam = (key: string, value: string | null, defaults: string[] = []) => {
    const next = new URLSearchParams(searchParams);
    if (!value || defaults.includes(value)) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const updateModernParam = (key: string, value: RiskDomain | RiskSeverity) => {
    const next = new URLSearchParams(searchParams);
    next.delete('filter');
    if (value === 'ALL') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const { data: agents, isLoading: agentsLoading, error: agentsError } = useQuery({
    queryKey: missionControlAgentsQueryKey(orgId),
    queryFn: () => fetchMissionControlAgents(orgId),
    staleTime: 30_000
  });

  const sortedAgents = useMemo(() => (agents ?? []).slice().sort((a, b) => b.riskScore - a.riskScore), [agents]);

  const selectedAgent = useMemo(() => {
    if (!highlightedAgentId) return null;
    return (agents ?? []).find((agent) => agent.agentProfileId === highlightedAgentId) ?? null;
  }, [agents, highlightedAgentId]);

  const domainAgents = useMemo(() => {
    if (domain === 'ALL') return sortedAgents;

    return sortedAgents.filter((agent) => {
      switch (domain) {
        case 'COMPLIANCE':
          return agent.openComplianceIssues > 0 || agent.requiresAction || !agent.isCompliant;
        case 'TRAINING': {
          const requiredGap = Math.max(0, agent.requiredTrainingAssigned - agent.requiredTrainingCompleted);
          const ceGap = Math.max(0, (agent.ceHoursRequired ?? 0) - (agent.ceHoursCompleted ?? 0));
          return requiredGap > 0 || ceGap > 0;
        }
        case 'TRANSACTIONS':
          return agent.nonCompliantTransactionCount > 0;
        case 'ONBOARDING':
          return agent.onboardingTasksOpenCount > 0;
        case 'OFFBOARDING':
          return agent.offboardingTasksOpenCount > 0;
        default:
          return true;
      }
    });
  }, [domain, sortedAgents]);

  const filteredAgents = useMemo(() => {
    if (severity === 'ALL') return domainAgents;
    return domainAgents.filter((agent) => agent.riskLevel.toUpperCase() === severity);
  }, [domainAgents, severity]);

  const filteredSummary = useMemo(() => {
    const byRisk = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const agent of domainAgents) {
      if (agent.riskLevel === 'HIGH') byRisk.HIGH += 1;
      else if (agent.riskLevel === 'MEDIUM') byRisk.MEDIUM += 1;
      else byRisk.LOW += 1;
    }
    return {
      total: domainAgents.length,
      visible: filteredAgents.length,
      byRisk
    };
  }, [domainAgents, filteredAgents.length]);

  const { data: events, isLoading: eventsLoading, error: eventsError } = useQuery({
    queryKey: ['mission-control', 'activity', orgId, 'risk-center'],
    queryFn: () => fetchMissionControlActivity(orgId),
    staleTime: 30_000,
    enabled: tab === 'ai'
  });

  const evaluationEvents = useMemo(() => (events ?? []).filter((event) => Boolean(eventMap[event.type])), [events]);

  const {
    data: riskPackages,
    isLoading: riskPackagesLoading,
    error: riskPackagesError
  } = useQuery({
    queryKey: ['ai-broker', 'risk-packages', orgId],
    queryFn: () => fetchRiskPackages(orgId),
    staleTime: 60_000
  });

  const activePackages = useMemo(() => {
    const ids = new Set(riskPackages?.activePackageIds ?? []);
    return (riskPackages?.packages ?? []).filter((pkg) => ids.has(pkg.id));
  }, [riskPackages]);

  const activePackageNames = useMemo(() => activePackages.map((pkg) => pkg.name), [activePackages]);

  const [packagesDialogOpen, setPackagesDialogOpen] = useState(false);
  const [draftActivePackageIds, setDraftActivePackageIds] = useState<RiskPackageId[]>([]);
  const [packageEditorOpen, setPackageEditorOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<RiskPackageDefinition | null>(null);
  const [packageFormError, setPackageFormError] = useState<string | null>(null);
  const [packageName, setPackageName] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [packageGroup, setPackageGroup] = useState('Custom');
  const [signalMultipliersJson, setSignalMultipliersJson] = useState('{\n  \n}');
  const [categoryCapsJson, setCategoryCapsJson] = useState('{\n  \n}');
  const [categoryMultipliersJson, setCategoryMultipliersJson] = useState('{\n  \n}');
  const [categoryDefaultMultiplier, setCategoryDefaultMultiplier] = useState('');

  useEffect(() => {
    if (!packagesDialogOpen) return;
    setDraftActivePackageIds(riskPackages?.activePackageIds ?? []);
  }, [packagesDialogOpen, riskPackages?.activePackageIds]);

  useEffect(() => {
    if (!packageEditorOpen) {
      setPackageFormError(null);
      return;
    }

    const pkg = editingPackage;
    setPackageName(pkg?.name ?? '');
    setPackageDescription(pkg?.description ?? '');
    setPackageGroup(pkg?.group ?? 'Custom');
    setSignalMultipliersJson(JSON.stringify(pkg?.signalMultipliers ?? {}, null, 2));
    setCategoryCapsJson(JSON.stringify(pkg?.categoryCaps ?? {}, null, 2));
    setCategoryMultipliersJson(JSON.stringify(pkg?.categoryMultipliers ?? {}, null, 2));
    setCategoryDefaultMultiplier(
      typeof pkg?.categoryDefaultMultiplier === 'number' ? String(pkg.categoryDefaultMultiplier) : ''
    );
    setPackageFormError(null);
  }, [editingPackage, packageEditorOpen]);

  const packagesMutation = useMutation({
    mutationFn: (activePackageIds: RiskPackageId[]) => updateRiskPackages(orgId, { activePackageIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-broker', 'risk-packages', orgId] });
      toast({
        title: 'Risk packages updated',
        description: 'Recomputing risk scores for all agents…'
      });

      try {
        await recomputeOrgRisk(orgId);
        await queryClient.invalidateQueries({ queryKey: missionControlAgentsQueryKey(orgId) });
        toast({
          title: 'Risk scores recalculated',
          description: 'Risk Compliance Center now reflects your active packages.'
        });
      } catch (error) {
        toast({
          title: 'Packages saved, recompute failed',
          description: 'Try again in a moment or recompute per agent from the detail sheet.',
          variant: 'destructive'
        });
      }

      setPackagesDialogOpen(false);
    },
    onError: () => {
      toast({
        title: 'Unable to update packages',
        description: 'Please try again.',
        variant: 'destructive'
      });
    }
  });

  const createPackageMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createCustomRiskPackage>[1]) => createCustomRiskPackage(orgId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-broker', 'risk-packages', orgId] });
      toast({ title: 'Custom package created', description: 'You can now activate it from the package list.' });
      setPackageEditorOpen(false);
      setEditingPackage(null);
    },
    onError: (error) => {
      toast({
        title: 'Unable to create package',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive'
      });
    }
  });

  const updatePackageMutation = useMutation({
    mutationFn: (input: { packageId: string; payload: Parameters<typeof updateCustomRiskPackage>[2] }) =>
      updateCustomRiskPackage(orgId, input.packageId, input.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-broker', 'risk-packages', orgId] });
      toast({ title: 'Custom package updated', description: 'Changes apply on the next recompute.' });
      setPackageEditorOpen(false);
      setEditingPackage(null);
    },
    onError: (error) => {
      toast({
        title: 'Unable to update package',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive'
      });
    }
  });

  const deletePackageMutation = useMutation({
    mutationFn: (packageId: string) => deleteCustomRiskPackage(orgId, packageId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-broker', 'risk-packages', orgId] });
      toast({ title: 'Custom package deleted' });
    },
    onError: (error) => {
      toast({
        title: 'Unable to delete package',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive'
      });
    }
  });

  const parseRecord = (raw: string): Record<string, number> => {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object.');
    }
    const entries = Object.entries(parsed as Record<string, unknown>).filter(([key]) => key.trim().length > 0);
    return Object.fromEntries(
      entries
        .map(([key, value]) => {
          const num = typeof value === 'number' ? value : Number(value);
          if (!Number.isFinite(num)) return null;
          return [key, num] as const;
        })
        .filter(Boolean) as Array<readonly [string, number]>
    );
  };

  const handleSaveCustomPackage = () => {
    setPackageFormError(null);

    try {
      const name = packageName.trim();
      if (!name) {
        setPackageFormError('Package name is required.');
        return;
      }

      const signalMultipliers = parseRecord(signalMultipliersJson);
      if (!Object.keys(signalMultipliers).length) {
        setPackageFormError('signalMultipliers must include at least one entry.');
        return;
      }

      const categoryCaps = parseRecord(categoryCapsJson);
      const categoryMultipliers = parseRecord(categoryMultipliersJson);
      const categoryDefault =
        categoryDefaultMultiplier.trim().length > 0 ? Number(categoryDefaultMultiplier.trim()) : undefined;
      if (categoryDefault !== undefined && !Number.isFinite(categoryDefault)) {
        setPackageFormError('categoryDefaultMultiplier must be a number.');
        return;
      }

      const payload = {
        name,
        description: packageDescription.trim() || undefined,
        group: packageGroup.trim() || undefined,
        signalMultipliers,
        categoryCaps: Object.keys(categoryCaps).length ? categoryCaps : undefined,
        categoryDefaultMultiplier: categoryDefault,
        categoryMultipliers: Object.keys(categoryMultipliers).length ? categoryMultipliers : undefined
      };

      if (editingPackage?.isCustom) {
        updatePackageMutation.mutate({ packageId: editingPackage.id, payload });
        return;
      }

      createPackageMutation.mutate(payload);
    } catch (error) {
      setPackageFormError(error instanceof Error ? error.message : 'Invalid JSON payload.');
    }
  };

  return (
    <section className="space-y-6">
      <Hero
        tab={tab}
        domain={domain}
        severity={severity}
        onTabChange={(nextTab) => updateParam('view', nextTab === 'agents' ? null : nextTab, ['agents'])}
        onDomainChange={(value) => updateModernParam('domain', value)}
        onSeverityChange={(value) => updateModernParam('severity', value)}
        activePackages={activePackageNames}
        packagesLoading={riskPackagesLoading}
        onManagePackages={() => setPackagesDialogOpen(true)}
        summary={filteredSummary}
      />

      {tab === 'agents' ? (
        <>
          <AgentsPanel
            agents={filteredAgents}
            isLoading={agentsLoading}
            error={agentsError}
            highlightedAgentId={highlightedAgentId}
            onViewAgent={(agentProfileId) => updateParam('agent', agentProfileId)}
          />
          <AgentRiskSheet
            orgId={orgId}
            open={Boolean(highlightedAgentId)}
            agent={selectedAgent}
            packages={riskPackages}
            onOpenChange={(open) => {
              if (!open) {
                updateParam('agent', null);
              }
            }}
          />
        </>
      ) : (
        <AiPanel events={evaluationEvents} isLoading={eventsLoading} error={eventsError} />
      )}

      <Dialog open={packagesDialogOpen} onOpenChange={setPackagesDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Risk packages</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setEditingPackage(null);
                  setPackageEditorOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New package
              </Button>
            </DialogTitle>
            <DialogDescription>
              Tune the risk score weighting to match your brokerage’s pain points. Saving will recalculate all agent scores.
            </DialogDescription>
          </DialogHeader>

          {riskPackagesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={`pkg-skel-${idx}`} className="h-16 rounded-2xl bg-white/10" />
              ))}
            </div>
          ) : riskPackagesError ? (
            <p className="text-sm text-red-600">Unable to load packages.</p>
          ) : (
            <div className="max-h-[60vh] space-y-6 overflow-auto pr-1">
              {groupPackages(riskPackages?.packages ?? []).map(([group, groupPackages]) => (
                <div key={group} className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {groupPackages.map((pkg) => {
                      const checked = draftActivePackageIds.includes(pkg.id);
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          className={cn(
                            'rounded-2xl border border-[color:var(--hatch-card-border)] bg-white/10 p-4 text-left transition-colors hover:bg-white/15',
                            checked && 'border-brand-blue-600/40 bg-brand-blue-600/10'
                          )}
                          onClick={() => {
                            setDraftActivePackageIds((current) =>
                              current.includes(pkg.id) ? current.filter((id) => id !== pkg.id) : [...current, pkg.id]
                            );
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink-900">
                                {pkg.name}{' '}
                                {pkg.isCustom ? (
                                  <span className="ml-2 rounded-full border border-slate-200/70 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                    Custom
                                  </span>
                                ) : null}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">{pkg.description}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              {pkg.isCustom ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setEditingPackage(pkg);
                                      setPackageEditorOpen(true);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    <span className="sr-only">Edit custom package</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full text-rose-600 hover:text-rose-700"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      const ok = window.confirm(`Delete custom package "${pkg.name}"?`);
                                      if (!ok) return;
                                      deletePackageMutation.mutate(pkg.id);
                                    }}
                                    disabled={deletePackageMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sr-only">Delete custom package</span>
                                  </Button>
                                </>
                              ) : null}
                              <Checkbox checked={checked} className="mt-1" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setPackagesDialogOpen(false)} disabled={packagesMutation.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => packagesMutation.mutate(draftActivePackageIds)}
              disabled={packagesMutation.isPending || riskPackagesLoading}
            >
              {packagesMutation.isPending ? 'Saving…' : 'Save & recompute'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={packageEditorOpen}
        onOpenChange={(open) => {
          setPackageEditorOpen(open);
          if (!open) {
            setEditingPackage(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingPackage?.isCustom ? 'Edit custom package' : 'Create custom package'}</DialogTitle>
            <DialogDescription>
              Define signal multipliers using signal patterns like <code className="font-mono">LICENSE:*</code> or{' '}
              <code className="font-mono">AI:AI_COMPLIANCE</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pkg-name">Name</Label>
                <Input id="pkg-name" value={packageName} onChange={(event) => setPackageName(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-desc">Description</Label>
                <Textarea
                  id="pkg-desc"
                  value={packageDescription}
                  onChange={(event) => setPackageDescription(event.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-group">Group</Label>
                <Input id="pkg-group" value={packageGroup} onChange={(event) => setPackageGroup(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-category-default">Category default multiplier (optional)</Label>
                <Input
                  id="pkg-category-default"
                  type="number"
                  inputMode="decimal"
                  value={categoryDefaultMultiplier}
                  onChange={(event) => setCategoryDefaultMultiplier(event.target.value)}
                />
              </div>
              {packageFormError ? <p className="text-sm text-rose-600">{packageFormError}</p> : null}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pkg-signals">signalMultipliers (required JSON)</Label>
                <Textarea
                  id="pkg-signals"
                  value={signalMultipliersJson}
                  onChange={(event) => setSignalMultipliersJson(event.target.value)}
                  rows={6}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-caps">categoryCaps (optional JSON)</Label>
                <Textarea
                  id="pkg-caps"
                  value={categoryCapsJson}
                  onChange={(event) => setCategoryCapsJson(event.target.value)}
                  rows={4}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pkg-mults">categoryMultipliers (optional JSON)</Label>
                <Textarea
                  id="pkg-mults"
                  value={categoryMultipliersJson}
                  onChange={(event) => setCategoryMultipliersJson(event.target.value)}
                  rows={4}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPackageEditorOpen(false)}
              disabled={createPackageMutation.isPending || updatePackageMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveCustomPackage}
              disabled={createPackageMutation.isPending || updatePackageMutation.isPending}
            >
              {createPackageMutation.isPending || updatePackageMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Hero({
  tab,
  domain,
  severity,
  onTabChange,
  onDomainChange,
  onSeverityChange,
  activePackages,
  packagesLoading,
  onManagePackages,
  summary
}: {
  tab: RiskTab;
  domain: RiskDomain;
  severity: RiskSeverity;
  onTabChange: (value: RiskTab) => void;
  onDomainChange: (value: RiskDomain) => void;
  onSeverityChange: (value: RiskSeverity) => void;
  activePackages: string[];
  packagesLoading: boolean;
  onManagePackages: () => void;
  summary?: {
    total: number;
    visible: number;
    byRisk: { LOW: number; MEDIUM: number; HIGH: number };
  };
}) {
  const summaryLabel =
    domain === 'COMPLIANCE'
      ? 'Compliance flags'
      : domain === 'TRAINING'
        ? 'Training gaps'
        : domain === 'TRANSACTIONS'
          ? 'Transaction risks'
          : domain === 'ONBOARDING'
            ? 'Onboarding tasks'
            : domain === 'OFFBOARDING'
              ? 'Offboarding tasks'
              : 'Agents in scope';

  return (
    <div className="hatch-hero relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-r from-[#1F5FFF] via-[#3D86FF] to-[#00C6A2] text-white shadow-[0_30px_80px_rgba(31,95,255,0.35)]">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_52%)]" />
      <div className="relative z-10 flex flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:justify-between md:px-10">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-white/20 bg-white/20 p-3 shadow-inner shadow-white/15 backdrop-blur">
            <ShieldAlert className="h-6 w-6 text-white" />
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.4em] text-white/80">Broker</p>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Risk Compliance Center</h1>
              <p className="mt-2 text-sm text-white/85">Monitor agent risk, open critical items, and recent evaluations.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/85">
                <span className="text-white/80">Active packages:</span>
                {packagesLoading ? (
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px]">Loading…</span>
                ) : activePackages.length ? (
                  <>
                    {activePackages.slice(0, 3).map((name) => (
                      <span key={name} className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px]">
                        {name}
                      </span>
                    ))}
                    {activePackages.length > 3 ? (
                      <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px]">
                        +{activePackages.length - 3}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px]">None</span>
                )}
              </div>
              {tab === 'agents' && summary ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/85">
                  <span className="text-white/80">{summaryLabel}:</span>
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px]">
                    {summary.total} total
                  </span>
                  {summary.byRisk.HIGH ? (
                    <span className="rounded-full border border-white/25 bg-rose-500/20 px-3 py-1 text-[11px]">
                      {summary.byRisk.HIGH} high
                    </span>
                  ) : null}
                  {summary.byRisk.MEDIUM ? (
                    <span className="rounded-full border border-white/25 bg-amber-500/20 px-3 py-1 text-[11px]">
                      {summary.byRisk.MEDIUM} medium
                    </span>
                  ) : null}
                  {summary.byRisk.LOW ? (
                    <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px]">
                      {summary.byRisk.LOW} low
                    </span>
                  ) : null}
                  {severity !== 'ALL' && summary.visible !== summary.total ? (
                    <span className="text-white/80">Showing {summary.visible}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Domain"
            value={domain}
            items={domains}
            onValueChange={(value) => onDomainChange(value as RiskDomain)}
          />
          <FilterSelect
            label="Severity"
            value={severity}
            items={severities}
            onValueChange={(value) => onSeverityChange(value as RiskSeverity)}
          />
          <Button
            type="button"
            variant="secondary"
            className="h-9 rounded-full border border-white/25 bg-white/15 px-4 text-xs font-semibold text-white hover:bg-white/20"
            onClick={onManagePackages}
          >
            Risk packages
          </Button>
        </div>
      </div>

      <div className="border-t border-white/10 bg-white/5 px-6 py-3 text-sm md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-white/75">Sorted by total risk score.</p>
          <div className="flex rounded-full border border-white/20 bg-white/10 p-1">
            <button
              type="button"
              onClick={() => onTabChange('agents')}
              className={cn(
                'rounded-full px-4 py-1 text-xs font-semibold transition',
                tab === 'agents' ? 'bg-white/20 text-white shadow-sm' : 'text-white/85 hover:bg-white/10'
              )}
            >
              Agents
            </button>
            <button
              type="button"
              onClick={() => onTabChange('ai')}
              className={cn(
                'rounded-full px-4 py-1 text-xs font-semibold transition',
                tab === 'ai' ? 'bg-white/20 text-white shadow-sm' : 'text-white/85 hover:bg-white/10'
              )}
            >
              AI Evaluations
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  items,
  onValueChange
}: {
  label: string;
  value: string;
  items: Array<{ id: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 w-[196px] rounded-full border border-white/25 bg-white/15 px-3 text-xs font-semibold text-white shadow-sm backdrop-blur-md focus:ring-white/40 [&>svg]:text-white/90 [&>svg]:opacity-80">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">{label}</span>
          <SelectValue className="text-white data-[placeholder]:text-white/80" placeholder={items[0]?.label} />
        </div>
      </SelectTrigger>
      <SelectContent className="rounded-xl border border-[var(--glass-border)] !bg-[var(--glass-background)] text-ink-900 shadow-brand-lg backdrop-blur-xl">
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id} className="rounded-lg">
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AgentsPanel({
  agents,
  isLoading,
  error,
  highlightedAgentId,
  onViewAgent
}: {
  agents: MissionControlAgentRow[];
  isLoading: boolean;
  error: unknown;
  highlightedAgentId: string | null;
  onViewAgent: (agentProfileId: string) => void;
}) {
  return (
    <TooltipProvider>
      <Card className="overflow-hidden rounded-3xl shadow-brand-lg">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/55 via-white/18 to-white/0" />

        <div className="relative border-b border-[color:var(--hatch-card-border)] px-6 py-5">
          <h2 className="text-lg font-semibold text-ink-900">Agents</h2>
          <p className="text-sm text-slate-600">Prioritize follow-ups by risk score and open items.</p>
        </div>

        <div className="relative overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-700">
            <thead className="bg-white/45 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Agent</th>
                <th className="px-6 py-3">Score</th>
                <th className="px-6 py-3">API</th>
                <th className="px-6 py-3">Open P0</th>
                <th className="px-6 py-3">Open P1</th>
                <th className="px-6 py-3">Last event</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--hatch-card-border)]">
              {error ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-rose-600">
                    Unable to load risk roster.
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Loading agents…
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No agents match the selected filters.
                  </td>
                </tr>
              ) : (
                agents.map((agent, index) => {
                  const previous = agents[index - 1];
                  const showDivider = index > 0 && previous?.riskLevel !== agent.riskLevel;
                  return (
                    <Fragment key={agent.agentProfileId}>
                      {showDivider ? (
                        <tr aria-hidden="true">
                          <td colSpan={7} className="p-0">
                            <div className="h-px bg-[color:var(--hatch-card-border)]" />
                          </td>
                        </tr>
                      ) : null}
                      <AgentRow
                        agent={agent}
                        highlighted={agent.agentProfileId === highlightedAgentId}
                        onViewAgent={onViewAgent}
                      />
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </TooltipProvider>
  );
}

function AgentRow({
  agent,
  highlighted,
  onViewAgent
}: {
  agent: MissionControlAgentRow;
  highlighted: boolean;
  onViewAgent: (agentProfileId: string) => void;
}) {
  const p0 = agent.requiresAction ? agent.openComplianceIssues : 0;
  const p1 = Math.max(0, agent.requiredTrainingAssigned - agent.requiredTrainingCompleted);
  const lastEvent = agent.lastComplianceEvaluationAt ? new Date(agent.lastComplianceEvaluationAt).toLocaleString() : '—';
  const api = agent.performance ?? null;
  const apiBand = String(api?.confidenceBand ?? 'NONE').toUpperCase();
  const apiHasInsufficientData = Boolean(
    api?.topDrivers?.some((driver) => (driver?.label ?? '').toLowerCase().startsWith('insufficient recent data'))
  );
  const apiScore = api && !apiHasInsufficientData ? Math.round(Math.max(0, Math.min(1, api.overallScore ?? 0)) * 100) : null;
  const apiTopDrivers = Array.isArray(api?.topDrivers) ? api!.topDrivers.slice(0, 2) : [];
  const apiBadgeTone = apiHasInsufficientData ? 'NONE' : apiBand;

  return (
    <tr
      className={cn(
        'transition-colors hover:bg-white/30',
        agent.riskLevel === 'HIGH' && 'bg-rose-50/60',
        highlighted && 'bg-white/50 outline outline-2 outline-offset-[-2px] outline-brand-blue-600/35'
      )}
    >
      <td className="px-6 py-4">
        <div className="font-semibold text-ink-900">{agent.name}</div>
        <div className="text-xs text-slate-500">{agent.email ?? 'No email'}</div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold tabular-nums text-ink-900">{Math.round(agent.riskScore)}</span>
          <Badge className={cn('border', riskBadgeVariant[agent.riskLevel] ?? 'bg-slate-100 text-slate-700 border-slate-200')}>
            {agent.riskLevel}
          </Badge>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Badge className={cn('min-w-10 justify-center border tabular-nums', apiBandVariant[apiBadgeTone] ?? apiBandVariant.NONE)}>
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
      <td className="px-6 py-4">
        <CountPill value={p0} tone="critical" />
      </td>
      <td className="px-6 py-4">
        <CountPill value={p1} tone="warning" />
      </td>
      <td className="px-6 py-4 text-xs text-slate-600">{lastEvent}</td>
      <td className="px-6 py-4 text-right">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-full"
          onClick={() => onViewAgent(agent.agentProfileId)}
        >
          <Eye className="h-4 w-4" />
          <span className="sr-only">View details</span>
        </Button>
      </td>
    </tr>
  );
}

function CountPill({ value, tone }: { value: number; tone: 'critical' | 'warning' }) {
  const style =
    tone === 'critical'
      ? 'border-rose-200/70 bg-rose-500/10 text-rose-700'
      : 'border-amber-200/70 bg-amber-500/10 text-amber-700';

  return (
    <span
      className={cn(
        'inline-flex min-w-9 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums',
        value === 0 ? 'border-slate-200/70 bg-slate-500/5 text-slate-600' : style
      )}
      aria-label={`${tone === 'critical' ? 'Open P0' : 'Open P1'} ${value}`}
    >
      {value}
    </span>
  );
}

function AiPanel({ events, isLoading, error }: { events: MissionControlEvent[]; isLoading: boolean; error: unknown }) {
  return (
    <Card className="overflow-hidden rounded-3xl shadow-brand-lg">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/55 via-white/18 to-white/0" />

      <div className="relative border-b border-[color:var(--hatch-card-border)] px-6 py-5">
        <h2 className="text-lg font-semibold text-ink-900">AI Evaluations</h2>
        <p className="text-sm text-slate-600">Listings and transactions flagged by Copilot.</p>
      </div>

      <div className="relative overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-700">
          <thead className="bg-white/45 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3">Event</th>
              <th className="px-6 py-3">Message</th>
              <th className="px-6 py-3">Occurred</th>
              <th className="px-6 py-3 text-right">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--hatch-card-border)]">
            {error ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-rose-600">
                  Unable to load evaluations.
                </td>
              </tr>
            ) : isLoading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  Loading evaluations…
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  No AI evaluation events recorded.
                </td>
              </tr>
            ) : (
              events.map((event) => {
                const meta = eventMap[event.type];
                const href = meta ? resolveEvaluationHref(event, meta.href) : '/broker/mission-control';
                return (
                  <tr key={event.id} className="transition-colors hover:bg-white/30">
                    <td className="px-6 py-4 font-semibold text-ink-900">{meta?.label ?? event.type}</td>
                    <td className="px-6 py-4 text-slate-600">{event.message ?? 'No additional context'}</td>
                    <td className="px-6 py-4 text-xs text-slate-600">{new Date(event.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <Button asChild size="sm" variant="ghost" className="rounded-full">
                        <Link to={href}>View</Link>
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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

function AgentRiskSheet({
  orgId,
  open,
  agent,
  packages,
  onOpenChange
}: {
  orgId: string;
  open: boolean;
  agent: MissionControlAgentRow | null;
  packages?: { activePackageIds: RiskPackageId[]; packages: RiskPackageDefinition[] } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const agentProfileId = agent?.agentProfileId ?? null;

  const { data: agentProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['agent-profile', orgId, agentProfileId],
    queryFn: () => fetchAgentProfile(orgId, agentProfileId ?? ''),
    enabled: open && Boolean(agentProfileId),
    staleTime: 30_000
  });

  const riskAiQuery = useQuery({
    queryKey: ['ai-broker', 'agent-risk-analysis', orgId, agentProfileId],
    queryFn: () => fetchAgentRiskAiAnalysis(orgId, agentProfileId ?? ''),
    enabled: open && Boolean(agentProfileId),
    staleTime: 60_000
  });

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateAgentCompliance>[2]) => updateAgentCompliance(orgId, agentProfileId ?? '', payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: missionControlAgentsQueryKey(orgId) }),
        queryClient.invalidateQueries({ queryKey: ['agent-profile', orgId, agentProfileId] })
      ]);
      await queryClient.invalidateQueries({ queryKey: ['ai-broker', 'agent-risk-analysis', orgId, agentProfileId] });
      toast({ title: 'Risk override updated' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to update override',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  });

  const recomputeMutation = useMutation({
    mutationFn: () => recomputeAgentRisk(orgId, agentProfileId ?? ''),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: missionControlAgentsQueryKey(orgId) }),
        queryClient.invalidateQueries({ queryKey: ['agent-profile', orgId, agentProfileId] })
      ]);
      await queryClient.invalidateQueries({ queryKey: ['ai-broker', 'agent-risk-analysis', orgId, agentProfileId] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to recompute risk drivers',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  });

  const effectiveRiskLevel = agentProfile?.riskLevel ?? agent?.riskLevel;
  const effectiveRiskScore = agentProfile?.riskScore ?? agent?.riskScore;
  const effectiveIsCompliant = agentProfile?.isCompliant ?? agent?.isCompliant;
  const effectiveRequiresAction = agentProfile?.requiresAction ?? agent?.requiresAction;

  const riskLabel = effectiveRiskLevel ?? '—';
  const riskScore = typeof effectiveRiskScore === 'number' ? Math.round(effectiveRiskScore) : null;
  const complianceLabel = agent
    ? effectiveRequiresAction
      ? 'Action required'
      : effectiveIsCompliant
        ? 'Compliant'
        : 'Monitoring'
    : '—';
  const complianceTone = agent
    ? effectiveRequiresAction
      ? 'border-rose-200/70 bg-rose-500/10 text-rose-700'
      : effectiveIsCompliant
        ? 'border-emerald-200/70 bg-emerald-500/10 text-emerald-700'
        : 'border-amber-200/70 bg-amber-500/10 text-amber-800'
    : 'border-slate-200/70 bg-slate-500/5 text-slate-600';

  const requiredTrainingGap = agent ? Math.max(0, agent.requiredTrainingAssigned - agent.requiredTrainingCompleted) : null;
  const ceGap = agent
    ? Math.max(0, (agent.ceHoursRequired ?? 0) - (agent.ceHoursCompleted ?? 0))
    : null;

  const lastEvaluationLabel = agent?.lastComplianceEvaluationAt
    ? new Date(agent.lastComplianceEvaluationAt).toLocaleString()
    : '—';

  const riskSignals = useMemo(() => parseRiskSignals(agentProfile?.riskFlags), [agentProfile?.riskFlags]);
  const manualOverride = useMemo(() => parseManualOverride(agentProfile?.riskFlags), [agentProfile?.riskFlags]);
  const riskComputation = useMemo(() => parseRiskComputation(agentProfile?.riskFlags), [agentProfile?.riskFlags]);

  const packageNameById = useMemo(() => {
    const rows = packages?.packages ?? [];
    return new Map(rows.map((pkg) => [pkg.id, pkg.name] as const));
  }, [packages?.packages]);

  const breakdown = useMemo(() => computeRiskBreakdown(riskSignals), [riskSignals]);
  const computedScore = riskComputation?.score ?? breakdown.totalPoints;
  const computedLevel = riskComputation?.level ?? breakdown.level;
  const baseScore = riskComputation?.baseScore ?? null;
  const computedPackages = useMemo(
    () =>
      (riskComputation?.activePackageIds ?? []).map((id) => packageNameById.get(id) ?? id),
    [packageNameById, riskComputation?.activePackageIds]
  );
  const hasSignals = riskSignals.length > 0;

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideRiskLevel, setOverrideRiskLevel] = useState<RiskLevel>('LOW');
  const [overrideRiskScore, setOverrideRiskScore] = useState('0');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideClearAction, setOverrideClearAction] = useState(true);
  const [autoRecomputeDoneFor, setAutoRecomputeDoneFor] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !agentProfileId) {
      setAutoRecomputeDoneFor(null);
      return;
    }

    if (profileLoading) return;

    const scoreValue = typeof effectiveRiskScore === 'number' ? effectiveRiskScore : 0;
    if (scoreValue <= 0) return;

    if (!hasSignals && autoRecomputeDoneFor !== agentProfileId && !recomputeMutation.isPending) {
      setAutoRecomputeDoneFor(agentProfileId);
      recomputeMutation.mutate();
    }
  }, [
    open,
    agentProfileId,
    autoRecomputeDoneFor,
    effectiveRiskScore,
    hasSignals,
    profileLoading,
    recomputeMutation
  ]);

  useEffect(() => {
    if (!overrideDialogOpen) return;
    if (manualOverride) {
      setOverrideRiskLevel(manualOverride.riskLevel);
      setOverrideRiskScore(String(manualOverride.riskScore));
      setOverrideReason(manualOverride.reasonText ?? '');
      setOverrideClearAction(manualOverride.riskLevel === 'LOW');
      return;
    }
    setOverrideRiskLevel('LOW');
    setOverrideRiskScore('0');
    setOverrideReason('');
    setOverrideClearAction(true);
  }, [manualOverride, overrideDialogOpen]);

  useEffect(() => {
    if (overrideRiskLevel !== 'LOW' && overrideClearAction) {
      setOverrideClearAction(false);
    }
  }, [overrideRiskLevel, overrideClearAction]);

  const handleSaveOverride = async () => {
    if (!agentProfileId) return;
    const normalizedScore = clampRiskScore(overrideRiskScore);
    const now = new Date().toISOString();
    const nextOverride: ManualRiskOverride = {
      riskLevel: overrideRiskLevel,
      riskScore: normalizedScore,
      reasonText: overrideReason.trim() ? overrideReason.trim() : undefined,
      createdAt: manualOverride?.createdAt ?? now,
      updatedAt: now
    };

    const nextFlags = upsertManualOverride(agentProfile?.riskFlags, nextOverride);

    const payload: Parameters<typeof updateAgentCompliance>[2] = {
      riskLevel: overrideRiskLevel,
      riskScore: normalizedScore,
      riskFlags: nextFlags,
      requiresAction: overrideClearAction ? false : overrideRiskLevel !== 'LOW'
    };

    if (overrideClearAction) {
      payload.isCompliant = true;
    }

    await mutation.mutateAsync(payload);
    setOverrideDialogOpen(false);
  };

  const handleClearOverride = async () => {
    if (!agentProfileId) return;
    const nextFlags = removeManualOverride(agentProfile?.riskFlags);
    await mutation.mutateAsync({
      riskFlags: nextFlags,
      riskLevel: computedLevel,
      riskScore: computedScore,
      requiresAction: computedLevel !== 'LOW'
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-3">
            <span className="truncate">{agent?.name ?? 'Agent risk details'}</span>
            <Badge
              className={cn(
                'border shrink-0',
                riskLabel !== '—' ? riskBadgeVariant[riskLabel] ?? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-100 text-slate-700 border-slate-200'
              )}
            >
              {riskLabel}
            </Badge>
          </SheetTitle>
          <SheetDescription className="space-y-1">
            <span className="block truncate text-slate-600">{agent?.email ?? ''}</span>
            <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold text-slate-700">
              Compliance: <span className={cn('ml-2 rounded-full border px-2 py-0.5 text-[11px] font-semibold', complianceTone)}>{complianceLabel}</span>
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {manualOverride ? (
            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 text-sm text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Manual override active</p>
              <p className="mt-1 font-medium">
                Risk set to {manualOverride.riskLevel} ({manualOverride.riskScore}).
              </p>
              {manualOverride.reasonText ? (
                <p className="mt-1 text-sm text-amber-800">Reason: {manualOverride.reasonText}</p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailTile label="Risk score" value={riskScore === null ? '—' : String(riskScore)} />
            <DetailTile label="Open compliance issues" value={agent ? String(agent.openComplianceIssues) : '—'} />
            <DetailTile label="Required training gap" value={requiredTrainingGap === null ? '—' : String(requiredTrainingGap)} />
            <DetailTile label="CE hours gap" value={ceGap === null ? '—' : String(ceGap)} />
            <DetailTile
              label="Flagged transactions"
              value={agent ? String(agent.nonCompliantTransactionCount) : '—'}
            />
            <DetailTile label="Onboarding tasks open" value={agent ? String(agent.onboardingTasksOpenCount) : '—'} />
          </div>

          <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last evaluation</p>
            <p className="mt-1 text-sm font-medium text-ink-900">{lastEvaluationLabel}</p>
          </div>

          <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk drivers</p>
              <span className="text-[11px] font-semibold text-slate-500">
                {profileLoading ? 'Loading…' : `Computed ${computedScore} (${computedLevel.toLowerCase()})`}
              </span>
            </div>
            {!profileLoading && (riskComputation?.activePackageIds?.length ?? 0) > 0 && baseScore !== null ? (
              <p className="mt-2 text-xs text-slate-600">
                Package impact: {computedScore} with {computedPackages.join(', ')} · {baseScore} without packages
              </p>
            ) : null}
            {profileLoading ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`risk-signal-skel-${idx}`} className="h-10 rounded-xl bg-white/10" />
                ))}
              </div>
            ) : breakdown.entries.length === 0 ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-600">
                  {manualOverride
                    ? 'No computed risk drivers found (score is currently overridden).'
                    : (riskScore ?? 0) > 0
                      ? `No risk drivers are stored for this score yet. ${recomputeMutation.isPending ? 'Recomputing…' : 'Click recompute to generate them.'}`
                      : 'No active risk drivers found for this agent.'}
                </p>
                {(manualOverride || (riskScore ?? 0) > 0) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => recomputeMutation.mutate()}
                    disabled={!agentProfileId || recomputeMutation.isPending}
                  >
                    {recomputeMutation.isPending ? 'Recomputing…' : 'Recompute drivers'}
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {breakdown.entries.map((entry) => (
                  <li
                    key={`${entry.signal.source}:${entry.signal.code}:${entry.signal.detectedAt ?? 'now'}`}
                    className={cn(
                      'rounded-xl border border-[color:var(--hatch-card-border)] bg-white/10 p-3',
                      entry.pointsAdded === 0 && 'opacity-70'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {(() => {
                          const boosts = getBoostPackageIds(entry.signal)
                            .map((id) => packageNameById.get(id as RiskPackageId) ?? id)
                            .filter(Boolean);
                          return (
                            <Fragment>
                        <p className="text-sm font-semibold text-ink-900">
                          {formatSignalLabel(entry.signal)}
                        </p>
                        {entry.signal.description ? (
                          <p className="mt-1 text-xs text-slate-600">{entry.signal.description}</p>
                        ) : null}
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">
                          Category: {entry.categoryKey.toLowerCase()} · {entry.pointsAdded > 0 ? `+${entry.pointsAdded}` : '+0'} pts
                        </p>
                              {boosts.length ? (
                                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                  Boosted by: {boosts.join(', ')}
                                </p>
                              ) : null}
                            </Fragment>
                          );
                        })()}
                      </div>
                      <Badge className={cn('border shrink-0', riskBadgeVariant[entry.signal.severity])}>
                        {entry.signal.severity}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI summary</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => void riskAiQuery.refetch()}
                disabled={!agentProfileId || riskAiQuery.isFetching}
              >
                {riskAiQuery.isFetching ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>

            {riskAiQuery.isLoading ? (
              <div className="mt-3 space-y-2">
                <div className="h-4 w-5/6 rounded bg-white/10" />
                <div className="h-4 w-2/3 rounded bg-white/10" />
              </div>
            ) : riskAiQuery.error ? (
              <p className="mt-3 text-sm text-rose-600">Unable to generate AI analysis right now.</p>
            ) : riskAiQuery.data ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-700">{riskAiQuery.data.summary}</p>
                {riskAiQuery.data.suggestions?.length ? (
                  <ul className="space-y-1 text-sm text-slate-700">
                    {riskAiQuery.data.suggestions.map((suggestion, idx) => (
                      <li key={`risk-ai-suggestion-${idx}`} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue-600/60" />
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">No AI summary available.</p>
            )}
          </div>

          <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-white/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resolve / override</p>
            <p className="mt-1 text-sm text-slate-600">
              Set a broker override for the risk score. Use this when signals are false positives or already handled.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="rounded-full"
                onClick={() => setOverrideDialogOpen(true)}
                disabled={!agentProfileId || mutation.isPending}
              >
                {manualOverride ? 'Edit override' : 'Resolve'}
              </Button>
              {manualOverride ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => void handleClearOverride()}
                  disabled={!agentProfileId || mutation.isPending}
                >
                  Clear override
                </Button>
              ) : null}
            </div>
          </div>

          {agent?.memberships?.length ? (
            <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Memberships</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {agent.memberships.map((membership) => (
                  <li key={`${membership.type}:${membership.name}`} className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium text-ink-900">{membership.name}</span>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {membership.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {agent ? (
              <>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to={`/broker/mission-control?agent=${agent.agentProfileId}`}>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Mission Control
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to={`/broker/transactions?agent=${agent.agentProfileId}`}>
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    Transactions
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="rounded-full">
                  <Link to={`/broker/team?agent=${agent.agentProfileId}`}>
                    <Users className="mr-2 h-4 w-4" />
                    Team record
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Broker override</DialogTitle>
              <DialogDescription>Manually set the agent’s risk score and optionally clear action-required flags.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Risk level</Label>
                <Select value={overrideRiskLevel} onValueChange={(value) => setOverrideRiskLevel(value as RiskLevel)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select risk level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="overrideRiskScore">Risk score (0–100)</Label>
                <Input
                  id="overrideRiskScore"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={overrideRiskScore}
                  onChange={(event) => setOverrideRiskScore(event.target.value)}
                />
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="overrideClearAction"
                  checked={overrideClearAction}
                  onCheckedChange={(checked) => setOverrideClearAction(Boolean(checked))}
                  disabled={overrideRiskLevel !== 'LOW'}
                />
                <label htmlFor="overrideClearAction" className="text-sm text-slate-700">
                  Mark as resolved (sets compliance to Compliant and clears Action required)
                </label>
              </div>

              <div className="space-y-1">
                <Label htmlFor="overrideReason">Reason (optional)</Label>
                <Textarea
                  id="overrideReason"
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  placeholder="e.g. Reviewed documents; false positive from AI evaluation."
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOverrideDialogOpen(false)} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSaveOverride()} disabled={mutation.isPending || !agentProfileId}>
                {mutation.isPending ? 'Saving…' : 'Save override'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--hatch-card-border)] bg-white/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-900 tabular-nums">{value}</p>
    </div>
  );
}

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

type RiskSignal = {
  source: string;
  code: string;
  severity: RiskLevel;
  description?: string;
  category?: string;
  detectedAt?: string;
  ttlHours?: number;
  meta?: Record<string, unknown>;
};

type ManualRiskOverride = {
  riskLevel: RiskLevel;
  riskScore: number;
  reasonText?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
};

type RiskComputation = {
  score: number;
  level: RiskLevel;
  baseScore?: number;
  baseLevel?: RiskLevel;
  computedAt?: string;
  activePackageIds?: RiskPackageId[];
};

type RiskDriverEntry = {
  signal: RiskSignal;
  categoryKey: string;
  pointsAdded: number;
};

type RiskBreakdown = {
  totalPoints: number;
  level: RiskLevel;
  entries: RiskDriverEntry[];
};

const pointsBySeverity: Record<RiskLevel, number> = {
  LOW: 5,
  MEDIUM: 15,
  HIGH: 30
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function parseRiskSignals(riskFlags: unknown): RiskSignal[] {
  if (!isObject(riskFlags)) return [];
  const raw = (riskFlags as any).riskSignals;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!isObject(entry)) return null;
      const severity = (entry as any).severity;
      if (severity !== 'LOW' && severity !== 'MEDIUM' && severity !== 'HIGH') return null;
      const source = typeof (entry as any).source === 'string' ? (entry as any).source : null;
      const code = typeof (entry as any).code === 'string' ? (entry as any).code : null;
      if (!source || !code) return null;
      const metaRaw = (entry as any).meta;
      const meta = isObject(metaRaw) ? metaRaw : undefined;
      return {
        source,
        code,
        severity,
        description: typeof (entry as any).description === 'string' ? (entry as any).description : undefined,
        category: typeof (entry as any).category === 'string' ? (entry as any).category : undefined,
        detectedAt: typeof (entry as any).detectedAt === 'string' ? (entry as any).detectedAt : undefined,
        ttlHours: typeof (entry as any).ttlHours === 'number' ? (entry as any).ttlHours : undefined,
        meta
      } satisfies RiskSignal;
    })
    .filter(Boolean) as RiskSignal[];
}

function parseRiskComputation(riskFlags: unknown): RiskComputation | null {
  if (!isObject(riskFlags)) return null;
  const raw = (riskFlags as any).riskComputation;
  if (!isObject(raw)) return null;

  const level = (raw as any).level;
  const score = (raw as any).score;
  if (level !== 'LOW' && level !== 'MEDIUM' && level !== 'HIGH') return null;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;

  const baseScore = (raw as any).baseScore;
  const baseLevel = (raw as any).baseLevel;
  const activePackageIdsRaw = (raw as any).activePackageIds;

  return {
    score: clampNumber(Math.round(score), 0, 100),
    level,
    baseScore: typeof baseScore === 'number' && Number.isFinite(baseScore) ? clampNumber(Math.round(baseScore), 0, 100) : undefined,
    baseLevel: baseLevel === 'LOW' || baseLevel === 'MEDIUM' || baseLevel === 'HIGH' ? baseLevel : undefined,
    computedAt: typeof (raw as any).computedAt === 'string' ? (raw as any).computedAt : undefined,
    activePackageIds: Array.isArray(activePackageIdsRaw)
      ? (activePackageIdsRaw.filter((id) => typeof id === 'string') as RiskPackageId[])
      : undefined
  };
}

function parseManualOverride(riskFlags: unknown): ManualRiskOverride | null {
  if (!isObject(riskFlags)) return null;
  const raw = (riskFlags as any).manualOverride;
  if (!isObject(raw)) return null;
  const riskLevel = (raw as any).riskLevel;
  const riskScore = (raw as any).riskScore;
  if (riskLevel !== 'LOW' && riskLevel !== 'MEDIUM' && riskLevel !== 'HIGH') return null;
  if (typeof riskScore !== 'number' || Number.isNaN(riskScore)) return null;
  return {
    riskLevel,
    riskScore: clampNumber(Math.round(riskScore), 0, 100),
    reasonText: typeof (raw as any).reasonText === 'string' ? (raw as any).reasonText : undefined,
    createdAt: typeof (raw as any).createdAt === 'string' ? (raw as any).createdAt : undefined,
    updatedAt: typeof (raw as any).updatedAt === 'string' ? (raw as any).updatedAt : undefined,
    expiresAt: typeof (raw as any).expiresAt === 'string' ? (raw as any).expiresAt : undefined
  };
}

function computeRiskBreakdown(signals: RiskSignal[], now = new Date()): RiskBreakdown {
  const metaEntries = signals
    .map((signal) => {
      const meta = isObject(signal.meta) ? signal.meta : null;
      const points = meta && typeof (meta as any).pointsAdded === 'number' ? (meta as any).pointsAdded : null;
      const categoryKey =
        meta && typeof (meta as any).categoryKey === 'string'
          ? String((meta as any).categoryKey)
          : (signal.category ?? signal.source ?? 'OTHER').toUpperCase();
      return { signal, pointsAdded: points, categoryKey };
    })
    .filter(Boolean);

  const hasMeta = metaEntries.some((entry) => typeof entry.pointsAdded === 'number' && Number.isFinite(entry.pointsAdded));
  if (hasMeta) {
    const entries = metaEntries.map((entry) => ({
      signal: entry.signal,
      categoryKey: entry.categoryKey,
      pointsAdded:
        typeof entry.pointsAdded === 'number' && Number.isFinite(entry.pointsAdded)
          ? clampNumber(Math.round(entry.pointsAdded), 0, 100)
          : 0
    }));
    const totalPoints = clampNumber(entries.reduce((sum, entry) => sum + entry.pointsAdded, 0), 0, 100);
    const level: RiskLevel = totalPoints >= 70 ? 'HIGH' : totalPoints >= 35 ? 'MEDIUM' : 'LOW';
    return {
      totalPoints,
      level,
      entries: entries
        .slice()
        .sort((a, b) => b.pointsAdded - a.pointsAdded || pointsBySeverity[b.signal.severity] - pointsBySeverity[a.signal.severity])
    };
  }

  const categoryCap = 40;
  const categoryTotals = new Map<string, number>();
  const entries: RiskDriverEntry[] = [];

  let remaining = 100;
  for (const signal of signals) {
    const detectedAt = signal.detectedAt ? new Date(signal.detectedAt) : now;
    const ttlHours = signal.ttlHours ?? null;
    if (ttlHours !== null) {
      const expiresAt = detectedAt.getTime() + ttlHours * 60 * 60 * 1000;
      if (expiresAt < now.getTime()) {
        continue;
      }
    }

    const categoryKey = (signal.category ?? signal.source ?? 'OTHER').toUpperCase();
    const already = categoryTotals.get(categoryKey) ?? 0;
    const availableInCategory = Math.max(0, categoryCap - already);
    const basePoints = Math.min(pointsBySeverity[signal.severity] ?? 0, availableInCategory);
    const pointsAdded = Math.min(basePoints, remaining);

    if (pointsAdded > 0) {
      categoryTotals.set(categoryKey, already + pointsAdded);
      remaining -= pointsAdded;
    }

    entries.push({ signal, categoryKey, pointsAdded });

    if (remaining <= 0) {
      remaining = 0;
    }
  }

  const totalPoints = 100 - remaining;
  const level: RiskLevel = totalPoints >= 70 ? 'HIGH' : totalPoints >= 35 ? 'MEDIUM' : 'LOW';

  return {
    totalPoints,
    level,
    entries: entries
      .slice()
      .sort((a, b) => pointsBySeverity[b.signal.severity] - pointsBySeverity[a.signal.severity])
  };
}

function groupPackages(packages: RiskPackageDefinition[]) {
  const byGroup = new Map<string, RiskPackageDefinition[]>();
  for (const pkg of packages) {
    const group = pkg.group ?? 'Other';
    const existing = byGroup.get(group) ?? [];
    existing.push(pkg);
    byGroup.set(group, existing);
  }

  return Array.from(byGroup.entries()).map(([group, groupPackages]) => [
    group,
    groupPackages.slice().sort((a, b) => a.name.localeCompare(b.name))
  ]) as Array<[string, RiskPackageDefinition[]]>;
}

function getBoostPackageIds(signal: RiskSignal) {
  const meta = isObject(signal.meta) ? signal.meta : null;
  if (!meta) return [];
  const raw = (meta as any).matchedPackageIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string');
}

function formatSignalLabel(signal: RiskSignal) {
  const base = `${signal.source}:${signal.code}`.replace(/_/g, ' ');
  return base
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
    .replace(/\bai\b/, 'AI');
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampRiskScore(value: string) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return clampNumber(Math.round(raw), 0, 100);
}

function upsertManualOverride(existing: unknown, override: ManualRiskOverride): Record<string, unknown> {
  const base = isObject(existing) ? { ...existing } : {};
  return { ...base, manualOverride: override };
}

function removeManualOverride(existing: unknown): Record<string, unknown> {
  const base = isObject(existing) ? { ...existing } : {};
  if ('manualOverride' in base) {
    const { manualOverride: _ignored, ...rest } = base;
    return rest;
  }
  return base;
}
