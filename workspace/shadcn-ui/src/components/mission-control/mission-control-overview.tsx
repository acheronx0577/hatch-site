import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { DebugLinkHint } from '@/components/mission-control/debug-link-hint';
import { fetchMissionControlOverview } from '@/lib/api/mission-control';
import type { MissionControlOverview as MissionControlOverviewData } from '@/lib/api/mission-control';

type MissionControlOverviewProps = {
  orgId: string;
};

const numberFormatter = new Intl.NumberFormat('en-US');
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const overviewQueryKey = (orgId: string) => ['mission-control', 'overview', orgId];

export function MissionControlOverview({ orgId }: MissionControlOverviewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: overviewQueryKey(orgId),
    queryFn: () => fetchMissionControlOverview(orgId),
    staleTime: 60_000
  });

  const metrics = useMemo(() => mapOverviewToMetrics(data), [data]);

  return (
    <section data-testid="mission-control-overview" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">Overview</h2>
        <p className="text-sm text-slate-500">
          Last refreshed {data ? new Date().toLocaleTimeString() : 'just now'}
        </p>
      </div>
      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          Unable to load mission control overview. Please retry shortly.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, index) => <SkeletonCard key={`mc-overview-skel-${index}`} />)
            : metrics.map((metric) => {
                const card = (
                  <Card className="flex flex-col gap-2 !rounded-2xl px-4 py-3 transition hover:bg-card/90 hover:shadow-brand-md">
                    <DebugLinkHint href={metric.href} />
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{metric.category}</p>
                    <div className="text-[32px] font-semibold text-slate-900">{metric.value}</div>
                    <p className="text-sm text-slate-500">{metric.label}</p>
                  </Card>
                );
                if (metric.href) {
                  return (
                    <Link key={metric.label} to={metric.href} className="contents">
                      {card}
                    </Link>
                  );
                }
                return (
                  <div key={metric.label} className="contents">
                    {card}
                  </div>
                );
              })}
        </div>
      )}
    </section>
  );
}

type Metric = {
  category: string;
  label: string;
  value: string;
  href?: string;
};

const metricLinkMap: Record<string, string> = {
  'Agents in onboarding': '/broker/team?stage=ONBOARDING',
  'Open onboarding tasks': '/broker/compliance?filter=ONBOARDING_TASKS',
  'Open offboarding tasks': '/broker/compliance?filter=OFFBOARDING_TASKS',
  'Total agents': '/broker/team',
  'Active agents': '/broker/team?stage=ACTIVE',
  'Non-compliant agents': '/broker/compliance?filter=NONCOMPLIANT',
  'High-risk agents': '/broker/compliance?filter=HIGH_RISK',
  'Total leads': '/broker/crm',
  'New leads': '/broker/crm',
  'Appointments set': '/broker/crm',
  'Total LOIs': '/broker/offer-intents',
  Draft: '/broker/offer-intents?status=DRAFT',
  Sent: '/broker/offer-intents?status=SENT',
  Received: '/broker/offer-intents?status=RECEIVED',
  Countered: '/broker/offer-intents?status=COUNTERED',
  Accepted: '/broker/offer-intents?status=ACCEPTED',
  Rejected: '/broker/offer-intents?status=REJECTED',
  'Transactions synced': '/broker/transactions',
  'Transactions failed': '/broker/transactions',
  'Est. GCI': '/broker/analytics',
  'PM income (est)': '/broker/analytics',
  'Indexed listings': '/broker/marketing',
  'Active for sale': '/broker/marketing',
  'Total saved searches': '/broker/marketing',
  'Alerts enabled': '/broker/marketing',
  'Daily alerts': '/broker/marketing',
  'Weekly alerts': '/broker/marketing',
  'Saved listings': '/broker/marketing',
  'Active listings': '/broker/properties?filter=ACTIVE',
  'Pending approval': '/broker/properties?filter=FLAGGED',
  'Under contract': '/broker/transactions?filter=UNDER_CONTRACT',
  'Transactions needing TC attention': '/broker/transactions?filter=ATTENTION',
  'Marketing automation': '/broker/marketing/campaigns',
  'Lead optimization': '/broker/crm',
  'Evaluations (30d)': '/broker/compliance?view=ai'
};

function mapOverviewToMetrics(overview?: MissionControlOverviewData): Metric[] {
  if (!overview) return [];
  return [
    {
      category: 'Live',
      label: 'Active users now',
      value: numberFormatter.format(overview.liveActivity.activeUsers)
    },
    {
      category: 'Live',
      label: 'Active listings viewed',
      value: numberFormatter.format(overview.liveActivity.listingViews),
      href: '/broker/live-activity'
    },
    {
      category: 'Onboarding',
      label: 'Agents in onboarding',
      value: numberFormatter.format(overview.onboarding.agentsInOnboarding),
      href: metricLinkMap['Agents in onboarding']
    },
    {
      category: 'Onboarding',
      label: 'Open onboarding tasks',
      value: numberFormatter.format(overview.onboarding.totalOnboardingTasksOpen),
      href: metricLinkMap['Open onboarding tasks']
    },
    {
      category: 'Offboarding',
      label: 'Open offboarding tasks',
      value: numberFormatter.format(overview.offboarding.totalOffboardingTasksOpen),
      href: metricLinkMap['Open offboarding tasks']
    },
    {
      category: 'Agents',
      label: 'Total agents',
      value: numberFormatter.format(overview.totalAgents),
      href: metricLinkMap['Total agents']
    },
    {
      category: 'Agents',
      label: 'Active agents',
      value: numberFormatter.format(overview.activeAgents),
      href: metricLinkMap['Active agents']
    },
    {
      category: 'Agents',
      label: 'Non-compliant agents',
      value: numberFormatter.format(overview.nonCompliantAgents),
      href: metricLinkMap['Non-compliant agents']
    },
    {
      category: 'Agents',
      label: 'High-risk agents',
      value: numberFormatter.format(overview.highRiskAgents),
      href: metricLinkMap['High-risk agents']
    },
    {
      category: 'Transactions',
      label: 'Transactions needing TC attention',
      value: numberFormatter.format(overview.transactions?.nonCompliant ?? 0),
      href: metricLinkMap['Transactions needing TC attention']
    },
    {
      category: 'Marketing',
      label: 'Marketing automation',
      value: numberFormatter.format(overview.marketingAutomation?.activeCampaigns ?? 0),
      href: metricLinkMap['Marketing automation']
    },
    {
      category: 'Leads',
      label: 'Lead optimization',
      value: numberFormatter.format(overview.leadOptimization?.highPriority ?? 0),
      href: metricLinkMap['Lead optimization']
    },
    {
      category: 'Leads',
      label: 'Total leads',
      value: numberFormatter.format(overview.leadStats.totalLeads),
      href: metricLinkMap['Total leads']
    },
    {
      category: 'Leads',
      label: 'New leads',
      value: numberFormatter.format(overview.leadStats.newLeads),
      href: metricLinkMap['New leads']
    },
    {
      category: 'Leads',
      label: 'Appointments set',
      value: numberFormatter.format(overview.leadStats.appointmentsSet),
      href: metricLinkMap['Appointments set']
    },
    {
      category: 'Offer intents',
      label: 'Total LOIs',
      value: numberFormatter.format(overview.loiStats.totalOfferIntents),
      href: metricLinkMap['Total LOIs']
    },
    {
      category: 'Offer intents',
      label: 'Draft',
      value: numberFormatter.format(overview.loiStats.draftOfferIntents),
      href: metricLinkMap.Draft
    },
    {
      category: 'Offer intents',
      label: 'Sent',
      value: numberFormatter.format(overview.loiStats.sentOfferIntents),
      href: metricLinkMap.Sent
    },
    {
      category: 'Offer intents',
      label: 'Received',
      value: numberFormatter.format(overview.loiStats.receivedOfferIntents),
      href: metricLinkMap.Received
    },
    {
      category: 'Offer intents',
      label: 'Countered',
      value: numberFormatter.format(overview.loiStats.counteredOfferIntents),
      href: metricLinkMap.Countered
    },
    {
      category: 'Offer intents',
      label: 'Accepted',
      value: numberFormatter.format(overview.loiStats.acceptedOfferIntents),
      href: metricLinkMap.Accepted
    },
    {
      category: 'Offer intents',
      label: 'Rejected',
      value: numberFormatter.format(overview.loiStats.rejectedOfferIntents),
      href: metricLinkMap.Rejected
    },
    {
      category: 'Financials',
      label: 'Transactions synced',
      value: numberFormatter.format(overview.financialStats.transactionsSyncedCount),
      href: metricLinkMap['Transactions synced']
    },
    {
      category: 'Financials',
      label: 'Transactions failed',
      value: numberFormatter.format(overview.financialStats.transactionsSyncFailedCount),
      href: metricLinkMap['Transactions failed']
    },
    {
      category: 'Financials',
      label: 'Est. GCI',
      value: currencyFormatter.format(overview.financialStats.estimatedGci ?? 0),
      href: metricLinkMap['Est. GCI']
    },
    {
      category: 'Financials',
      label: 'PM income (est)',
      value: currencyFormatter.format(overview.financialStats.estimatedPmIncome ?? 0),
      href: metricLinkMap['PM income (est)']
    },
    {
      category: 'MLS',
      label: 'Indexed listings',
      value: numberFormatter.format(overview.mlsStats?.totalIndexed ?? 0),
      href: metricLinkMap['Indexed listings']
    },
    {
      category: 'MLS',
      label: 'Active for sale',
      value: numberFormatter.format(overview.mlsStats?.activeForSale ?? 0),
      href: metricLinkMap['Active for sale']
    },
    {
      category: 'Saved searches',
      label: 'Total saved searches',
      value: numberFormatter.format(overview.savedSearchStats?.totalSavedSearches ?? 0),
      href: metricLinkMap['Total saved searches']
    },
    {
      category: 'Saved searches',
      label: 'Alerts enabled',
      value: numberFormatter.format(overview.savedSearchStats?.alertsEnabledCount ?? 0),
      href: metricLinkMap['Alerts enabled']
    },
    {
      category: 'Saved searches',
      label: 'Daily alerts',
      value: numberFormatter.format(overview.savedSearchStats?.dailyCount ?? 0),
      href: metricLinkMap['Daily alerts']
    },
    {
      category: 'Saved searches',
      label: 'Weekly alerts',
      value: numberFormatter.format(overview.savedSearchStats?.weeklyCount ?? 0),
      href: metricLinkMap['Weekly alerts']
    },
    {
      category: 'Favorites',
      label: 'Saved listings',
      value: numberFormatter.format(overview.favoritesStats?.totalSavedListings ?? 0),
      href: metricLinkMap['Saved listings']
    },
    {
      category: 'Listings',
      label: 'Active listings',
      value: numberFormatter.format(overview.listings.active),
      href: metricLinkMap['Active listings']
    },
    {
      category: 'Listings',
      label: 'Pending approval',
      value: numberFormatter.format(overview.listings.pendingApproval),
      href: metricLinkMap['Pending approval']
    },
    {
      category: 'Transactions',
      label: 'Under contract',
      value: numberFormatter.format(overview.transactions.underContract),
      href: metricLinkMap['Under contract']
    },
    {
      category: 'AI & Compliance',
      label: 'Evaluations (30d)',
      value: numberFormatter.format(overview.aiCompliance.evaluationsLast30Days),
      href: metricLinkMap['Evaluations (30d)']
    }
  ];
}

const SkeletonCard = () => (
  <div className="animate-pulse rounded-2xl border border-[color:var(--hatch-card-border)] bg-card/60 px-4 py-3 shadow-brand backdrop-blur-[var(--hatch-card-blur)]">
    <div className="h-3 w-24 rounded bg-slate-200/70" />
    <div className="mt-3 h-8 w-20 rounded bg-slate-200/70" />
    <div className="mt-2 h-3 w-32 rounded bg-slate-200/70" />
  </div>
);
