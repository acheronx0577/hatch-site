import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { MissionControlLayout } from './MissionControlLayout';
import { MissionControlKpiRow, KpiItem } from './MissionControlKpiRow';
import { MissionControlSectionCard } from './MissionControlSectionCard';
import { MissionControlMetricTile, MetricTone } from './MissionControlMetricTile';
import { MissionControlSidebar } from './MissionControlSidebar';
import { SecurityAuditCard } from './SecurityAuditCard';
import { MissionControlHero } from './MissionControlHero';
import { MissionControlActivityFeed } from './mission-control-activity-feed';
import { MissionControlAgentsPanel } from './mission-control-agents-panel';
import { MissionControlCompliancePanel } from './mission-control-compliance-panel';
import { fetchMissionControlOverview } from '@/lib/api/mission-control';

type MissionMetric = {
  id: string;
  label: string;
  value: number | string;
  tone?: MetricTone;
};

const numberFormatter = new Intl.NumberFormat('en-US');
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const formatNumber = (value?: number) => numberFormatter.format(value ?? 0);
const formatCurrency = (value?: number) => currencyFormatter.format(value ?? 0);

const overviewQueryKey = (orgId: string) => ['mission-control', 'overview', orgId];

type MissionControlViewProps = {
  orgId: string;
};

export function MissionControlView({ orgId }: MissionControlViewProps) {
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError
  } = useQuery({
    queryKey: overviewQueryKey(orgId),
    queryFn: () => fetchMissionControlOverview(orgId),
    staleTime: 60_000
  });

  const overviewErrorMessage = useMemo(() => {
    if (!overviewError) return null;
    const status = (overviewError as any)?.status ?? (overviewError as any)?.response?.status;
    if (status === 403) {
      return "You don't have permission to view mission control for this organization.";
    }
    return 'Unable to load mission control overview. Please retry shortly.';
  }, [overviewError]);

  const kpis: KpiItem[] = useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: 'active-agents',
        label: 'Active agents',
        value: formatNumber(overview.activeAgents),
        helperText: `${formatNumber(overview.totalAgents)} in roster`
      },
      {
        id: 'active-listings',
        label: 'Active listings',
        value: formatNumber(overview.listings.active),
        helperText: `${formatNumber(overview.listings.pendingApproval)} pending`
      },
      {
        id: 'deals-needing-review',
        label: 'Needs review',
        value: formatNumber(overview.transactions?.nonCompliant ?? 0),
        helperText: `${formatNumber(overview.transactions?.underContract ?? 0)} in progress`
      },
      {
        id: 'new-leads',
        label: 'New (7d)',
        value: formatNumber(overview.leadStats.newLeads),
        helperText: `${formatNumber(overview.leadStats.totalLeads)} total`
      },
      {
        id: 'compliance-flags',
        label: 'Compliance flags',
        value: formatNumber(overview.nonCompliantAgents),
        helperText: `${formatNumber(overview.highRiskAgents)} high risk`
      }
    ];
  }, [overview]);

  const agentsModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: 'agents-total',
        label: 'Total agents',
        value: formatNumber(overview.totalAgents)
      },
      {
        id: 'agents-active',
        label: 'Active',
        value: formatNumber(overview.activeAgents)
      },
      {
        id: 'agents-onboarding',
        label: 'Onboarding',
        value: formatNumber(overview.onboarding.agentsInOnboarding),
        tone: overview.onboarding.agentsInOnboarding > 0 ? 'muted' : 'neutral'
      },
      {
        id: 'agents-offboarding',
        label: 'Offboarding',
        value: formatNumber(overview.offboarding.agentsInOffboarding),
        tone: overview.offboarding.agentsInOffboarding > 0 ? 'muted' : 'neutral'
      },
      {
        id: 'agents-noncompliant',
        label: 'Needing attention',
        value: formatNumber(overview.nonCompliantAgents),
        tone: 'warning'
      },
      {
        id: 'agents-highrisk',
        label: 'High risk',
        value: formatNumber(overview.highRiskAgents),
        tone: 'danger'
      }
    ];
  }, [overview]);

  const listingsModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: 'listings-total',
        label: 'Total',
        value: formatNumber(overview.listings.total)
      },
      {
        id: 'listings-active',
        label: 'Active',
        value: formatNumber(overview.listings.active)
      },
      {
        id: 'listings-pending',
        label: 'Pending',
        value: formatNumber(overview.listings.pendingApproval),
        tone: 'warning'
      },
      {
        id: 'listings-expiring',
        label: 'Expiring',
        value: formatNumber(overview.listings.expiringSoon),
        tone: 'warning'
      }
    ];
  }, [overview]);

  const leadsModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: 'leads-total',
        label: 'Total',
        value: formatNumber(overview.leadStats.totalLeads)
      },
      {
        id: 'leads-new',
        label: 'New (7d)',
        value: formatNumber(overview.leadStats.newLeads)
      },
      {
        id: 'leads-appointments',
        label: 'Appointments',
        value: formatNumber(overview.leadStats.appointmentsSet)
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
    return [
      {
        id: 'oi-total',
        label: 'Total LOIs',
        value: formatNumber(overview.loiStats.totalOfferIntents)
      },
      {
        id: 'oi-submitted',
        label: 'Submitted',
        value: formatNumber(overview.loiStats.submittedOfferIntents)
      },
      {
        id: 'oi-review',
        label: 'Under review',
        value: formatNumber(overview.loiStats.underReviewOfferIntents)
      },
      {
        id: 'oi-accepted',
        label: 'Accepted',
        value: formatNumber(overview.loiStats.acceptedOfferIntents)
      },
      {
        id: 'oi-declined',
        label: 'Declined',
        value: formatNumber(overview.loiStats.declinedOfferIntents)
      }
    ];
  }, [overview]);

  const complianceModuleMetrics: MissionMetric[] = useMemo(() => {
    if (!overview) return [];
    const compliantAgents = Math.max((overview.totalAgents ?? 0) - (overview.nonCompliantAgents ?? 0), 0);
    return [
      {
        id: 'compliance-compliant',
        label: 'Compliant',
        value: `${formatNumber(compliantAgents)}/${formatNumber(overview.totalAgents)}`
      },
      {
        id: 'compliance-noncompliant',
        label: 'Needing attention',
        value: formatNumber(overview.nonCompliantAgents),
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
  }, [overview]);

  return (
    <MissionControlLayout
      header={
        <MissionControlHero
          brokerName={overview?.organizationId ? undefined : 'your brokerage'}
          activeAgents={overview?.activeAgents}
          liveListings={overview?.listings?.active}
          riskLevel={
            (overview?.nonCompliantAgents ?? 0) > 0
              ? 'elevated'
              : (overview?.highRiskAgents ?? 0) > 0
                ? 'watching'
                : 'calm'
          }
        />
      }
      kpis={<MissionControlKpiRow items={kpis} loading={overviewLoading} error={overviewErrorMessage} />}
      modules={
        <div className="flex flex-col gap-6">
          <MissionControlSectionCard
            title="Agents"
            subtitle="People, momentum, and risk."
            actionLabel="Open roster"
            actionHref="/broker/team"
          >
            {overviewLoading ? (
              <div className="grid gap-3 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={`agents-skel-${idx}`} className="h-16 rounded-2xl bg-slate-50 animate-pulse" />
                ))}
              </div>
            ) : overviewErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{overviewErrorMessage}</div>
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
            {overviewLoading ? (
              <div className="grid gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`listings-skel-${idx}`} className="h-16 rounded-2xl bg-slate-50 animate-pulse" />
                ))}
              </div>
            ) : overviewErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{overviewErrorMessage}</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-4">
                {listingsModuleMetrics.map((metric) => (
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
            title="Leads & CRM"
            subtitle="Funnel health at a glance."
            actionLabel="Open leads"
            actionHref="/broker/leads"
          >
            {overviewLoading ? (
              <div className="grid gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`leads-skel-${idx}`} className="h-16 rounded-2xl bg-slate-50 animate-pulse" />
                ))}
              </div>
            ) : overviewErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{overviewErrorMessage}</div>
            ) : (
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
                  <div key={`deals-skel-${idx}`} className="h-16 rounded-2xl bg-slate-50 animate-pulse" />
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
                  <div key={`oi-skel-${idx}`} className="h-16 rounded-2xl bg-slate-50 animate-pulse" />
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
            title="Compliance"
            subtitle="Training, CE, and checks."
            actionLabel="Open compliance"
            actionHref="/broker/compliance"
          >
            {overviewLoading ? (
              <div className="grid gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`comp-skel-${idx}`} className="h-16 rounded-2xl bg-slate-50 animate-pulse" />
                ))}
              </div>
            ) : overviewErrorMessage ? (
              <div className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{overviewErrorMessage}</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-4">
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
          securityAudit={<SecurityAuditCard orgId={orgId} />}
          activityFeed={<MissionControlActivityFeed orgId={orgId} />}
        />
      }
    />
  );
}
