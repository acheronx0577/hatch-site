"use client";

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { fetchMissionControlOverview, MissionControlOverview as MissionControlOverviewData } from '@/lib/api/mission-control';

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

export function MissionControlOverviewSection({ orgId }: MissionControlOverviewProps) {
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
                  <Card
                    key={metric.label}
                    className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{metric.category}</p>
                    <div className="text-[32px] font-semibold text-slate-900">{metric.value}</div>
                    <p className="text-sm text-slate-500">{metric.label}</p>
                  </Card>
                );
                if (metric.href) {
                  return (
                    <Link key={metric.label} href={metric.href} className="contents">
                      {card}
                    </Link>
                  );
                }
                return card;
              })}
        </div>
      )}
    </section>
  );
}

export { MissionControlOverviewSection as MissionControlOverview };

type Metric = {
  category: string;
  label: string;
  value: string;
  href?: string;
};

const metricLinkMap: Record<string, string> = {
  'Agents in onboarding': '/dashboard/team',
  'Open onboarding tasks': '/dashboard/team',
  'Open offboarding tasks': '/dashboard/team',
  'Total agents': '/dashboard/team',
  'Active agents': '/dashboard/team',
  'Non-compliant agents': '/dashboard/compliance',
  'High-risk agents': '/dashboard/compliance',
  'Total leads': '/dashboard/leads',
  'New leads': '/dashboard/leads',
  'Appointments set': '/dashboard/leads',
  'Total LOIs': '/dashboard/offer-intents',
  Submitted: '/dashboard/offer-intents',
  'Under review': '/dashboard/offer-intents',
  Accepted: '/dashboard/offer-intents',
  Declined: '/dashboard/offer-intents',
  'Properties under mgmt': '/dashboard/rentals',
  'Active leases': '/dashboard/rentals',
  'Seasonal leases': '/dashboard/rentals',
  'Upcoming tax due': '/dashboard/rentals',
  'Overdue tax': '/dashboard/rentals',
  'Transactions synced': '/dashboard/financials',
  'Transactions failed': '/dashboard/financials',
  'Leases synced': '/dashboard/financials',
  'Leases failed': '/dashboard/financials',
  'Est. GCI': '/dashboard/financials',
  'PM income (est)': '/dashboard/financials',
  'Indexed listings': '/dashboard/properties',
  'Active for sale': '/dashboard/properties',
  'Active rentals': '/dashboard/rentals',
  'Total saved searches': '/portal/saved-searches',
  'Alerts enabled': '/portal/saved-searches',
  'Daily alerts': '/portal/saved-searches',
  'Weekly alerts': '/portal/saved-searches',
  'Saved listings': '/portal/saved-homes',
  'Active listings': '/dashboard/properties',
  'Pending approval': '/dashboard/properties',
  'Under contract': '/dashboard/transactions',
  'Evaluations (30d)': '/dashboard/compliance',
  'Transactions w/ required docs': '/dashboard/transactions',
  'Transactions missing docs': '/dashboard/transactions?filter=missing-docs',
  'Upcoming closings missing docs': '/dashboard/transactions?filter=missing-docs&withinDays=30',
  'AI actions pending approval': '/dashboard/mission-control/ai-approvals'
};

function mapOverviewToMetrics(overview?: MissionControlOverviewData): Metric[] {
  if (!overview) return [];
  return [
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
      label: 'Submitted',
      value: numberFormatter.format(overview.loiStats.submittedOfferIntents),
      href: metricLinkMap['Submitted']
    },
    {
      category: 'Offer intents',
      label: 'Under review',
      value: numberFormatter.format(overview.loiStats.underReviewOfferIntents),
      href: metricLinkMap['Under review']
    },
    {
      category: 'Offer intents',
      label: 'Accepted',
      value: numberFormatter.format(overview.loiStats.acceptedOfferIntents),
      href: metricLinkMap['Accepted']
    },
    {
      category: 'Offer intents',
      label: 'Declined',
      value: numberFormatter.format(overview.loiStats.declinedOfferIntents),
      href: metricLinkMap['Declined']
    },
    {
      category: 'Rentals',
      label: 'Properties under mgmt',
      value: numberFormatter.format(overview.rentalStats.propertiesUnderManagement),
      href: metricLinkMap['Properties under mgmt']
    },
    {
      category: 'Rentals',
      label: 'Active leases',
      value: numberFormatter.format(overview.rentalStats.activeLeases),
      href: metricLinkMap['Active leases']
    },
    {
      category: 'Rentals',
      label: 'Seasonal leases',
      value: numberFormatter.format(overview.rentalStats.seasonalLeases),
      href: metricLinkMap['Seasonal leases']
    },
    {
      category: 'Rentals',
      label: 'Upcoming tax due',
      value: numberFormatter.format(overview.rentalStats.upcomingTaxDueCount),
      href: metricLinkMap['Upcoming tax due']
    },
    {
      category: 'Rentals',
      label: 'Overdue tax',
      value: numberFormatter.format(overview.rentalStats.overdueTaxCount),
      href: metricLinkMap['Overdue tax']
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
      label: 'Leases synced',
      value: numberFormatter.format(overview.financialStats.rentalLeasesSyncedCount),
      href: metricLinkMap['Leases synced']
    },
    {
      category: 'Financials',
      label: 'Leases failed',
      value: numberFormatter.format(overview.financialStats.rentalLeasesSyncFailedCount),
      href: metricLinkMap['Leases failed']
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
      category: 'MLS',
      label: 'Active rentals',
      value: numberFormatter.format(overview.mlsStats?.activeRentals ?? 0),
      href: metricLinkMap['Active rentals']
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
      category: 'Transactions',
      label: 'Transactions w/ required docs',
      value: `${overview.transactions.docsReadyPercent}%`,
      href: metricLinkMap['Transactions w/ required docs']
    },
    {
      category: 'Transactions',
      label: 'Transactions missing docs',
      value: numberFormatter.format(overview.transactions.missingDocs),
      href: metricLinkMap['Transactions missing docs']
    },
    {
      category: 'Transactions',
      label: 'Upcoming closings missing docs',
      value: numberFormatter.format(overview.transactions.upcomingClosingsMissingDocs),
      href: metricLinkMap['Upcoming closings missing docs']
    },
    {
      category: 'AI & Compliance',
      label: 'Evaluations (30d)',
      value: numberFormatter.format(overview.aiCompliance.evaluationsLast30Days),
      href: metricLinkMap['Evaluations (30d)']
    },
    {
      category: 'AI & Compliance',
      label: 'AI actions pending approval',
      value: numberFormatter.format(overview.aiApprovals.pending),
      href: metricLinkMap['AI actions pending approval']
    }
  ];
}

const SkeletonCard = () => (
  <div className="animate-pulse rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
    <div className="h-3 w-24 rounded bg-slate-100" />
    <div className="mt-3 h-8 w-20 rounded bg-slate-100" />
    <div className="mt-2 h-3 w-32 rounded bg-slate-100" />
  </div>
);
