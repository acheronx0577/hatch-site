import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { MissionControlLayout } from './MissionControlLayout';
import { MissionControlKpiRow, KpiItem } from './MissionControlKpiRow';
import { MissionControlSectionCard } from './MissionControlSectionCard';
import { MissionControlMetricTile, MetricTone } from './MissionControlMetricTile';
import { MissionControlSidebar } from './MissionControlSidebar';
import { MissionControlHero } from './MissionControlHero';
import { MissionControlActivityFeed } from './mission-control-activity-feed';
import { MissionControlAgentsPanel } from './mission-control-agents-panel';
import { MissionControlCompliancePanel } from './mission-control-compliance-panel';
import { fetchMissionControlAgents, fetchMissionControlOverview } from '@/lib/api/mission-control';
import { fetchOrgListings } from '@/lib/api/org-listings';
import { getPipelineBoardColumns, getPipelines } from '@/lib/api/hatch';
import { summarizeListings } from '@/lib/listings/summary';
import {
  brokerPropertiesQueryKey,
  missionControlAgentsQueryKey,
  missionControlOverviewQueryKey,
  pipelineBoardColumnsQueryKey
} from '@/lib/queryKeys';

type MissionMetric = {
  id: string;
  label: string;
  value: number | string;
  tone?: MetricTone;
  href?: string;
};

const numberFormatter = new Intl.NumberFormat('en-US');
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatNumber = (value?: number) => numberFormatter.format(value ?? 0);
const formatCurrency = (value?: number) => currencyFormatter.format(value ?? 0);

const pipelineQueryKey = (tenantId: string) => ['pipelines', tenantId];

type MissionControlViewProps = {
  orgId: string;
};

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch';

export function MissionControlView({ orgId }: MissionControlViewProps) {
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError
  } = useQuery({
    queryKey: missionControlOverviewQueryKey(orgId),
    queryFn: () => fetchMissionControlOverview(orgId),
    staleTime: 60_000
  });

  const {
    data: agents,
    isLoading: agentsLoading,
    error: agentsError
  } = useQuery({
    queryKey: missionControlAgentsQueryKey(orgId),
    queryFn: () => fetchMissionControlAgents(orgId),
    staleTime: 60_000
  });

  const {
    data: listings,
    isLoading: listingsLoading,
    error: listingsError
  } = useQuery({
    queryKey: brokerPropertiesQueryKey(orgId),
    queryFn: () => fetchOrgListings(orgId),
    staleTime: 30_000
  });

  const { data: pipelines } = useQuery({
    queryKey: pipelineQueryKey(TENANT_ID),
    queryFn: () => getPipelines(TENANT_ID),
    staleTime: 60_000
  });

  const primaryPipelineId = pipelines?.[0]?.id ?? null;
  const { data: pipelineColumns, isLoading: pipelineColumnsLoading } = useQuery({
    queryKey: pipelineBoardColumnsQueryKey(TENANT_ID, primaryPipelineId),
    queryFn: () => getPipelineBoardColumns(primaryPipelineId as string),
    enabled: Boolean(primaryPipelineId),
    staleTime: 60_000
  });

  const agentSummary = useMemo(() => {
    const rows = agents ?? [];
    const totalAgents = rows.length;
    const activeAgents = rows.filter((agent) => agent.lifecycleStage === 'ACTIVE').length;
    const pendingAgents = rows.filter((agent) => agent.lifecycleStage === 'ONBOARDING').length;
    const inactiveAgents = rows.filter((agent) => agent.lifecycleStage === 'OFFBOARDING').length;
    const complianceFlaggedAgents = rows.filter(
      (agent) => agent.openComplianceIssues > 0 || agent.requiresAction || !agent.isCompliant
    );
    const complianceByRisk = { LOW: 0, MEDIUM: 0, HIGH: 0 } as const;
    for (const agent of complianceFlaggedAgents) {
      if (agent.riskLevel === 'HIGH') complianceByRisk.HIGH += 1;
      else if (agent.riskLevel === 'MEDIUM') complianceByRisk.MEDIUM += 1;
      else complianceByRisk.LOW += 1;
    }
    const highRiskAgents = rows.filter((agent) => agent.riskLevel === 'HIGH').length;
    return {
      totalAgents,
      activeAgents,
      pendingAgents,
      inactiveAgents,
      complianceFlaggedAgents: complianceFlaggedAgents.length,
      complianceByRisk,
      highRiskAgents
    };
  }, [agents]);

  const listingSummary = useMemo(() => summarizeListings(listings ?? []), [listings]);

  const pipelineLeadStats = useMemo(() => {
    if (!pipelineColumns?.stages?.length) return null;
    const stages = pipelineColumns.stages;
    const totalLeads = stages.reduce((sum, stage) => sum + (stage.count ?? 0), 0);
    const newStage =
      stages.find((stage) => stage.name.toLowerCase().includes('new')) ??
      stages[0] ??
      null;
    const newLeads = newStage?.count ?? 0;
    const appointmentStage =
      stages.find((stage) => stage.name.toLowerCase().includes('appointment')) ??
      stages.find((stage) => stage.name.toLowerCase().includes('showing')) ??
      null;
    const appointmentsSet = appointmentStage?.count ?? 0;
    return { totalLeads, newLeads, appointmentsSet };
  }, [pipelineColumns?.stages]);

  const overviewErrorMessage = useMemo(() => {
    if (!overviewError) return null;
    const status = (overviewError as any)?.status ?? (overviewError as any)?.response?.status;
    if (status === 403) {
      return "You don't have permission to view mission control for this organization.";
    }
    return 'Unable to load mission control overview. Please retry shortly.';
  }, [overviewError]);

  const kpiErrorMessage = useMemo(() => {
    const error = overviewErrorMessage ?? (agentsError ? 'Unable to load agent roster metrics.' : null);
    return error ?? (listingsError ? 'Unable to load listing inventory metrics.' : null);
  }, [agentsError, listingsError, overviewErrorMessage]);

  const kpiLoading = overviewLoading || agentsLoading || listingsLoading || pipelineColumnsLoading;

  const kpis: KpiItem[] = useMemo(() => {
    if (!overview) return [];
    const leadTotals = pipelineLeadStats ?? { totalLeads: 0, newLeads: 0, appointmentsSet: 0 };
    const complianceFlagsTotal = agentSummary.complianceFlaggedAgents;
    const complianceHelperParts = [
      agentSummary.complianceByRisk.LOW ? `${formatNumber(agentSummary.complianceByRisk.LOW)} low` : null,
      agentSummary.complianceByRisk.MEDIUM ? `${formatNumber(agentSummary.complianceByRisk.MEDIUM)} medium` : null,
      agentSummary.complianceByRisk.HIGH ? `${formatNumber(agentSummary.complianceByRisk.HIGH)} high` : null
    ].filter(Boolean);
    return [
      {
        id: 'active-agents',
        label: 'Active agents',
        value: formatNumber(agentSummary.activeAgents),
        helperText: `${formatNumber(agentSummary.totalAgents)} in roster`,
        href: '/broker/team?stage=ACTIVE'
      },
      {
        id: 'active-listings',
        label: 'Active listings',
        value: formatNumber(listingSummary.active),
        helperText: `${formatNumber(listingSummary.pending)} pending`,
        href: '/broker/properties?filter=ACTIVE'
      },
      {
        id: 'deals-needing-review',
        label: 'Needs review',
        value: formatNumber(overview.transactions?.nonCompliant ?? 0),
        helperText: `${formatNumber(overview.transactions?.underContract ?? 0)} in progress`,
        href: '/broker/transactions?filter=ATTENTION'
      },
      {
        id: 'new-leads',
        label: 'New leads',
        value: formatNumber(leadTotals.newLeads),
        helperText: `${formatNumber(leadTotals.totalLeads)} total`,
        href: '/broker/crm'
      },
      {
        id: 'compliance-flags',
        label: 'Compliance flags',
        value: formatNumber(complianceFlagsTotal),
        helperText: complianceHelperParts.length > 0 ? complianceHelperParts.join(' · ') : 'No open flags',
        href: '/broker/compliance?domain=COMPLIANCE'
      }
    ];
  }, [agentSummary, listingSummary.active, listingSummary.pending, overview, pipelineLeadStats]);

  const agentsModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: 'agents-total',
        label: 'Total agents',
        value: formatNumber(agentSummary.totalAgents)
      },
      {
        id: 'agents-active',
        label: 'Active',
        value: formatNumber(agentSummary.activeAgents)
      },
      {
        id: 'agents-onboarding',
        label: 'Pending',
        value: formatNumber(agentSummary.pendingAgents),
        tone: agentSummary.pendingAgents > 0 ? 'muted' : 'neutral'
      },
      {
        id: 'agents-offboarding',
        label: 'Inactive',
        value: formatNumber(agentSummary.inactiveAgents),
        tone: agentSummary.inactiveAgents > 0 ? 'muted' : 'neutral'
      },
      {
        id: 'agents-noncompliant',
        label: 'Needing attention',
        value: formatNumber(agentSummary.complianceFlaggedAgents),
        tone: 'warning'
      },
      {
        id: 'agents-highrisk',
        label: 'High risk',
        value: formatNumber(agentSummary.highRiskAgents),
        tone: 'danger'
      }
    ];
  }, [agentSummary, overview]);

  const listingsModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: 'listings-total',
        label: 'Total',
        value: formatNumber(listingSummary.total),
        href: '/broker/properties'
      },
      {
        id: 'listings-active',
        label: 'Active',
        value: formatNumber(listingSummary.active),
        href: '/broker/properties?filter=ACTIVE'
      },
      {
        id: 'listings-pending',
        label: 'Pending',
        value: formatNumber(listingSummary.pending),
        tone: 'warning',
        href: '/broker/properties?filter=PENDING'
      },
      {
        id: 'listings-expiring',
        label: 'Expiring',
        value: formatNumber(listingSummary.expiringSoon),
        tone: 'warning',
        href: '/broker/properties?filter=EXPIRING'
      }
    ];
  }, [listingSummary, overview]);

  const leadsModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    const leadTotals = pipelineLeadStats ?? { totalLeads: 0, newLeads: 0, appointmentsSet: 0 };
    return [
      {
        id: 'leads-total',
        label: 'Total',
        value: formatNumber(leadTotals.totalLeads)
      },
      {
        id: 'leads-new',
        label: 'New',
        value: formatNumber(leadTotals.newLeads)
      },
      {
        id: 'leads-appointments',
        label: 'Appointments',
        value: formatNumber(leadTotals.appointmentsSet)
      },
      {
        id: 'leads-automation',
        label: 'Automations',
        value: formatNumber(overview.marketingAutomation?.activeCampaigns ?? 0),
        tone: (overview.marketingAutomation?.activeCampaigns ?? 0) > 0 ? 'success' : 'neutral'
      }
    ];
  }, [overview]);

  const transactionsModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: 'transactions-under-contract',
        label: 'In progress',
        value: formatNumber(overview.transactions.underContract)
      },
      {
        id: 'transactions-attention',
        label: 'Needs review',
        value: formatNumber(overview.transactions.nonCompliant),
        tone: 'warning'
      },
      {
        id: 'transactions-closings',
        label: 'Closings (30d)',
        value: formatNumber(overview.transactions.closingsNext30Days)
      },
      {
        id: 'transactions-gci',
        label: 'Est. GCI',
        value: formatCurrency(overview.financialStats.estimatedGci)
      }
    ];
  }, [overview]);

  const offerIntentModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    const inPlay =
      (overview.loiStats.sentOfferIntents ?? 0) +
      (overview.loiStats.receivedOfferIntents ?? 0) +
      (overview.loiStats.counteredOfferIntents ?? 0);
    return [
      {
        id: 'oi-total',
        label: 'Total LOIs',
        value: formatNumber(overview.loiStats.totalOfferIntents)
      },
      {
        id: 'oi-draft',
        label: 'Draft',
        value: formatNumber(overview.loiStats.draftOfferIntents)
      },
      {
        id: 'oi-in-play',
        label: 'In play',
        value: formatNumber(inPlay),
        tone: inPlay > 0 ? 'muted' : undefined
      },
      {
        id: 'oi-accepted',
        label: 'Accepted',
        value: formatNumber(overview.loiStats.acceptedOfferIntents)
      },
      {
        id: 'oi-rejected',
        label: 'Rejected',
        value: formatNumber(overview.loiStats.rejectedOfferIntents),
        tone: overview.loiStats.rejectedOfferIntents > 0 ? 'danger' : undefined
      }
    ];
  }, [overview]);

  const complianceModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    const compliantAgents = Math.max(agentSummary.totalAgents - agentSummary.complianceFlaggedAgents, 0);
    return [
      {
        id: 'compliance-compliant',
        label: 'Compliant',
        value: `${formatNumber(compliantAgents)}/${formatNumber(agentSummary.totalAgents)}`
      },
      {
        id: 'compliance-noncompliant',
        label: 'Needing attention',
        value: formatNumber(agentSummary.complianceFlaggedAgents),
        tone: 'warning'
      },
      {
        id: 'compliance-ai-evals',
        label: 'AI checks (30d)',
        value: formatNumber(overview.aiCompliance.evaluationsLast30Days)
      },
      {
        id: 'compliance-docs-pending',
        label: 'Pending docs',
        value: formatNumber(overview.documentCompliance?.pending ?? 0),
        tone: 'warning'
      }
    ];
  }, [agentSummary, overview]);

  return (
    <MissionControlLayout
      header={
        <MissionControlHero
          brokerName={overview?.organizationId ? undefined : 'your brokerage'}
          activeAgents={agentSummary.activeAgents}
          liveListings={listingSummary.active}
          riskLevel={
            agentSummary.complianceFlaggedAgents > 0
              ? 'elevated'
              : agentSummary.highRiskAgents > 0
                ? 'watching'
                : 'calm'
          }
        />
      }
      kpis={<MissionControlKpiRow items={kpis} loading={kpiLoading} error={kpiErrorMessage} />}
      modules={
        <div className="flex flex-col gap-6">
          <MissionControlSectionCard
            title="Agents"
            subtitle="People, momentum, and risk."
            actionLabel="Open roster"
            actionHref="/broker/team"
          >
            {overviewLoading || agentsLoading ? (
              <div className="grid gap-3 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`agents-skel-${idx}`}
                    className="hatch-shimmer h-16 rounded-[var(--radius-md)] border border-[color:var(--hatch-card-border)]"
                  />
                ))}
              </div>
            ) : kpiErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{kpiErrorMessage}</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                {agentsModuleMetrics.map((metric) => (
                  <MissionControlMetricTile
                    key={metric.id}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                  />
                ))}
              </div>
            )}
          </MissionControlSectionCard>

          <MissionControlSectionCard
            title="Listings"
            subtitle="What's live and what's next."
            actionLabel="Open listings"
            actionHref="/broker/properties"
          >
            {overviewLoading || listingsLoading ? (
              <div className="grid gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={`listings-skel-${idx}`}
                    className="hatch-shimmer h-16 rounded-[var(--radius-md)] border border-[color:var(--hatch-card-border)]"
                  />
                ))}
              </div>
            ) : kpiErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{kpiErrorMessage}</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-4">
                {listingsModuleMetrics.map((metric) => {
                  const tile = (
                    <MissionControlMetricTile
                      label={metric.label}
                      value={metric.value}
                      tone={metric.tone}
                      className={metric.href ? 'transition hover:border-white/30 hover:bg-white/20' : undefined}
                    />
                  );
                  return metric.href ? (
                    <Link
                      key={metric.id}
                      to={metric.href}
                      className="block rounded-[var(--radius-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    >
                      {tile}
                    </Link>
                  ) : (
                    <div key={metric.id}>{tile}</div>
                  );
                })}
              </div>
            )}
          </MissionControlSectionCard>

          <MissionControlSectionCard
            title="Leads & CRM"
            subtitle="Funnel health at a glance."
            actionLabel="Open leads"
            actionHref="/broker/crm"
          >
            {overviewLoading ? (
              <div className="grid gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={`leads-skel-${idx}`}
                    className="hatch-shimmer h-16 rounded-[var(--radius-md)] border border-[color:var(--hatch-card-border)]"
                  />
                ))}
              </div>
            ) : overviewErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{overviewErrorMessage}</div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-4">
                  {leadsModuleMetrics.map((metric) => (
                    <MissionControlMetricTile
                      key={metric.id}
                      label={metric.label}
                      value={metric.value}
                      tone={metric.tone}
                    />
                  ))}
                </div>
                {overview.leadTypeBreakdown ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MissionControlMetricTile
                      label="Buyer leads"
                      value={formatNumber(overview.leadTypeBreakdown.BUYER)}
                      tone="neutral"
                    />
                    <MissionControlMetricTile
                      label="Seller leads"
                      value={formatNumber(overview.leadTypeBreakdown.SELLER)}
                      tone="neutral"
                    />
                    <MissionControlMetricTile
                      label="Unknown type"
                      value={formatNumber(overview.leadTypeBreakdown.UNKNOWN)}
                      tone="muted"
                    />
                  </div>
                ) : null}
              </div>
            )}
          </MissionControlSectionCard>

          <MissionControlSectionCard
            title="Deals"
            subtitle="Pipeline and commission impact."
            actionLabel="Open deals"
            actionHref="/broker/transactions"
          >
            {overviewLoading ? (
              <div className="grid gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={`deals-skel-${idx}`}
                    className="hatch-shimmer h-16 rounded-[var(--radius-md)] border border-[color:var(--hatch-card-border)]"
                  />
                ))}
              </div>
            ) : overviewErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{overviewErrorMessage}</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-4">
                {transactionsModuleMetrics.map((metric) => (
                  <MissionControlMetricTile
                    key={metric.id}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                  />
                ))}
              </div>
            )}
          </MissionControlSectionCard>

          <MissionControlSectionCard
            title="Offer intents"
            subtitle="Letters of intent, at a glance."
            actionLabel="Open intents"
            actionHref="/broker/offer-intents"
          >
            {overviewLoading ? (
              <div className="grid gap-3 md:grid-cols-5">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div
                    key={`oi-skel-${idx}`}
                    className="hatch-shimmer h-16 rounded-[var(--radius-md)] border border-[color:var(--hatch-card-border)]"
                  />
                ))}
              </div>
            ) : overviewErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{overviewErrorMessage}</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-5">
                {offerIntentModuleMetrics.map((metric) => (
                  <MissionControlMetricTile
                    key={metric.id}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                  />
                ))}
              </div>
            )}
          </MissionControlSectionCard>

          <MissionControlSectionCard
            title="Risk Center"
            subtitle="Training, CE, and checks."
            actionLabel="Open Risk Center"
            actionHref="/broker/compliance"
          >
            {overviewLoading || agentsLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={`comp-skel-${idx}`}
                    className="hatch-shimmer h-16 rounded-[var(--radius-md)] border border-[color:var(--hatch-card-border)]"
                  />
                ))}
              </div>
            ) : kpiErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{kpiErrorMessage}</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {complianceModuleMetrics.map((metric) => (
                  <MissionControlMetricTile
                    key={metric.id}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                  />
                ))}
              </div>
            )}
          </MissionControlSectionCard>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <MissionControlAgentsPanel orgId={orgId} />
            </div>
            <MissionControlCompliancePanel orgId={orgId} />
          </div>
        </div>
      }
      sidebar={
        <MissionControlSidebar
          activityFeed={<MissionControlActivityFeed orgId={orgId} />}
        />
      }
    />
  );
}
