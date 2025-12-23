import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { BarChart3, Info, Plus, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  getLeadGenCampaignMetrics,
  listLeadGenCampaigns,
  listLeadGenConversions,
  listLeadGenLandingPages,
  type LeadGenCampaignMetrics,
  type LeadGenConversionEvent,
  type LeadGenLandingPage
} from '@/lib/api/lead-gen';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';
const DEFAULT_TENANT_ID = import.meta.env.VITE_TENANT_ID ?? 'tenant-hatch';

function formatMoney(cents: number, currency = 'USD') {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatCompact(value: number) {
  try {
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  } catch {
    return String(value);
  }
}

function toDayKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function groupLeadCreatedByDay(events: LeadGenConversionEvent[], days: number) {
  const buckets = new Map<string, number>();
  for (const e of events) {
    if (e.eventType !== 'LEAD_CREATED') continue;
    const key = toDayKey(new Date(e.occurredAt));
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const out: Array<{ key: string; label: string; count: number }> = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - offset);
    const key = toDayKey(d);
    out.push({ key, label: format(d, 'EEE'), count: buckets.get(key) ?? 0 });
  }
  return out;
}

export default function LeadGenOverviewPage() {
  const { activeOrgId, userId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;

  const ctx = useMemo(
    () => ({ orgId, userId, tenantId: DEFAULT_TENANT_ID, role: 'BROKER' }),
    [orgId, userId]
  );

  const overviewQuery = useQuery({
    queryKey: ['lead-gen', 'overview', orgId, userId],
    enabled: Boolean(orgId),
    staleTime: 30_000,
    queryFn: async () => {
      const [campaigns, landingPages] = await Promise.all([
        listLeadGenCampaigns(ctx),
        listLeadGenLandingPages(ctx)
      ]);

      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const conversions = await listLeadGenConversions(ctx, { from });

      const metricsByCampaignIdEntries = await Promise.all(
        campaigns.map(async (campaign) => {
          try {
            const metrics = await getLeadGenCampaignMetrics(ctx, campaign.id);
            return [campaign.id, metrics] as const;
          } catch {
            return [campaign.id, null] as const;
          }
        })
      );

      const metricsByCampaignId = Object.fromEntries(metricsByCampaignIdEntries) as Record<
        string,
        LeadGenCampaignMetrics | null
      >;

      return { campaigns, landingPages, conversions, metricsByCampaignId };
    }
  });

  const campaigns = overviewQuery.data?.campaigns ?? [];
  const landingPages = overviewQuery.data?.landingPages ?? [];
  const conversions = overviewQuery.data?.conversions ?? [];
  const metricsByCampaignId = overviewQuery.data?.metricsByCampaignId ?? {};

  const leadCreatedEvents = useMemo(
    () => conversions.filter((e) => e.eventType === 'LEAD_CREATED').sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [conversions]
  );

  const qualifiedCount = useMemo(
    () => conversions.filter((e) => e.eventType === 'LEAD_QUALIFIED').length,
    [conversions]
  );

  const appointmentCount = useMemo(
    () => conversions.filter((e) => e.eventType === 'APPOINTMENT_SET').length,
    [conversions]
  );

  const spendCents = useMemo(() => {
    return Object.values(metricsByCampaignId)
      .filter(Boolean)
      .reduce((sum, metrics) => sum + (metrics?.spendCents ?? 0), 0);
  }, [metricsByCampaignId]);

  const leadsCreatedCount = leadCreatedEvents.length;

  const leadsCreatedAllTime = useMemo(() => {
    return Object.values(metricsByCampaignId)
      .filter(Boolean)
      .reduce((sum, metrics) => sum + (metrics?.leadsCreated ?? 0), 0);
  }, [metricsByCampaignId]);

  const cplCents = leadsCreatedAllTime > 0 ? Math.round(spendCents / leadsCreatedAllTime) : null;

  const recentLeads = leadCreatedEvents.slice(0, 6);

  const series = useMemo(() => groupLeadCreatedByDay(conversions, 7), [conversions]);
  const maxSeries = Math.max(1, ...series.map((d) => d.count));

  const isEmpty = !overviewQuery.isLoading && !overviewQuery.error && campaigns.length === 0 && landingPages.length === 0;

  return (
    <div className="space-y-6">
      <section
        className={cn(
          'hatch-hero relative overflow-hidden rounded-[32px] border border-white/20',
          'bg-gradient-to-r from-[#1F5FFF] via-[#3D86FF] to-[#00C6A2]',
          'px-6 py-6 md:px-8 md:py-7 text-white shadow-[0_18px_48px_rgba(15,23,42,0.28)]'
        )}
      >
        <div className="pointer-events-none absolute -left-10 -top-10 h-44 w-44 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-44 w-44 rounded-full bg-cyan-300/40 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/80">
                Lead generation
              </p>
              <Badge variant="outline" className="border-white/30 bg-white/10 text-[10px] font-semibold text-white">
                Beta
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
              Launch a page. Get leads. Track outcomes.
            </h1>
            <p className="text-sm md:text-base text-sky-50/90">
              Campaigns + landing pages + conversion tracking — all in Hatch. No integrations needed to get started.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              className="bg-white/15 text-white hover:bg-white/20 border border-white/20 backdrop-blur"
            >
              <Link to="/broker/marketing/lead-gen/campaigns">
                <Plus className="mr-2 h-4 w-4" /> New campaign
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/25 bg-white/10 text-white hover:bg-white/15 backdrop-blur"
            >
              <Link to="/broker/marketing/lead-gen/landing-pages">New landing page</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/25 bg-white/10 text-white hover:bg-white/15 backdrop-blur"
            >
              <Link to="/broker/marketing/lead-gen/conversions">Export</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {overviewQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <Card key={idx} className="rounded-[24px]">
                  <CardHeader className="pb-2">
                    <Skeleton className="h-3 w-24" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className="rounded-[24px]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-ink-800">Leads (7d)</CardTitle>
                    <CardDescription className="text-xs">Form submissions tracked</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between">
                    <div className="text-3xl font-semibold text-slate-900">{formatCompact(leadsCreatedCount)}</div>
                    <Sparkles className="h-5 w-5 text-emerald-500" />
                  </CardContent>
                </Card>

                <Card className="rounded-[24px]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-ink-800">Qualified (7d)</CardTitle>
                    <CardDescription className="text-xs">Lead → qualified events</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between">
                    <div className="text-3xl font-semibold text-slate-900">{formatCompact(qualifiedCount)}</div>
                    <BarChart3 className="h-5 w-5 text-sky-500" />
                  </CardContent>
                </Card>

                <Card className="rounded-[24px]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-ink-800">Appointments (7d)</CardTitle>
                    <CardDescription className="text-xs">Booked meetings</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between">
                    <div className="text-3xl font-semibold text-slate-900">{formatCompact(appointmentCount)}</div>
                    <span className="text-xs font-semibold text-slate-500">{conversions.length} events</span>
                  </CardContent>
                </Card>

                <Card className="rounded-[24px]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-ink-800">Avg CPL</CardTitle>
                    <CardDescription className="text-xs">All time (tracked spend)</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between">
                    <div className="text-3xl font-semibold text-slate-900">
                      {cplCents == null ? '—' : formatMoney(cplCents, 'USD')}
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      Spend {formatMoney(spendCents, 'USD')}
                    </span>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <Card className="rounded-[24px]">
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Quick actions</CardTitle>
                <CardDescription className="text-xs">The fastest way to get a link into the world.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/broker/marketing/lead-gen/campaigns">Campaigns</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/broker/marketing/lead-gen/landing-pages">Landing pages</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/broker/marketing/lead-gen/conversions">Conversions</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/broker/marketing/lead-gen/audiences">Audiences</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="relative grid gap-3 md:grid-cols-2 md:before:absolute md:before:left-1/2 md:before:top-1/2 md:before:h-px md:before:w-12 md:before:-translate-x-1/2 md:before:-translate-y-1/2 md:before:bg-white/30 md:before:content-['']">
              <div className="rounded-[var(--radius-lg)] border border-white/20 bg-card/[var(--hatch-glass-alpha-recessed)] p-4 backdrop-blur-md">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/35 text-sm font-semibold text-slate-900 shadow-brand backdrop-blur-md">
                    1
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">Create a campaign</div>
                    <div className="mt-1 text-xs text-slate-600">Sets your UTMs + budget tracking.</div>
                  </div>
                </div>
                <div className="mt-3">
                  <Button asChild size="sm">
                    <Link to="/broker/marketing/lead-gen/campaigns">Create campaign</Link>
                  </Button>
                </div>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-white/20 bg-card/[var(--hatch-glass-alpha-recessed)] p-4 backdrop-blur-md">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/35 text-sm font-semibold text-slate-900 shadow-brand backdrop-blur-md">
                    2
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">Publish a landing page</div>
                    <div className="mt-1 text-xs text-slate-600">Instant attribution + consent capture.</div>
                  </div>
                </div>
                <div className="mt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/broker/marketing/lead-gen/landing-pages">Create page</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px]">
            <CardHeader className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Leads trend</CardTitle>
                <CardDescription className="text-xs">Last 7 days (LEAD_CREATED events)</CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/broker/marketing/lead-gen/conversions">View events</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-7 gap-2 items-end">
                {series.map((d) => {
                  const height = Math.round((d.count / maxSeries) * 96);
                  return (
                    <div key={d.key} className="flex flex-col items-center gap-2">
                      <div
                        className="w-full max-w-[28px] rounded-xl bg-gradient-to-b from-emerald-400 to-sky-500 shadow-sm"
                        style={{ height: `${Math.max(8, height)}px` }}
                        aria-label={`${d.label}: ${d.count}`}
                      />
                      <div className="text-[11px] font-medium text-slate-500">{d.label}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {isEmpty ? (
            <Card className="rounded-[24px]">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Start here</CardTitle>
                <CardDescription className="text-xs">You’ll be live in a few minutes.</CardDescription>
              </CardHeader>
	              <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
	                <div className="text-sm text-muted-foreground">
	                  Create a campaign and publish a landing page. We’ll route leads into your CRM and log conversion events automatically.
	                </div>
	                <div className="flex flex-wrap gap-2">
	                  <Button asChild size="sm">
	                    <Link to="/broker/marketing/lead-gen/campaigns">Create campaign</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/broker/marketing/lead-gen/landing-pages">Create landing page</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
	        </div>

	        <aside className="space-y-6 lg:sticky lg:top-24">
	          <Card className="rounded-[24px]">
	            <CardHeader className="pb-4 flex flex-row items-start justify-between gap-3">
	              <div>
	                <CardTitle className="text-base font-semibold">Recent leads</CardTitle>
                <CardDescription className="text-xs">Newest submissions (last 7 days)</CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/broker/marketing/lead-gen/conversions">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {overviewQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="rounded-2xl border border-slate-200/60 bg-white/20 p-3 backdrop-blur">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="mt-2 h-3 w-20" />
                    </div>
                  ))}
                </div>
              ) : recentLeads.length === 0 ? (
	                <div className="flex items-start gap-3 rounded-2xl border border-slate-200/60 bg-white/20 p-3 text-sm text-muted-foreground backdrop-blur">
	                  <Sparkles className="mt-0.5 h-4 w-4 text-brand-blue-600" />
	                  <div>
	                    <p className="font-medium text-slate-700">No leads yet.</p>
	                    <p className="text-xs text-slate-600">Publish a landing page to start capturing submissions.</p>
	                  </div>
	                </div>
	              ) : (
                recentLeads.map((event) => {
                  const page = event.landingPageId ? landingPages.find((p) => p.id === event.landingPageId) : null;
                  const campaign = event.campaignId ? campaigns.find((c) => c.id === event.campaignId) : null;
                  const href = event.personId ? `/broker/crm/leads/${event.personId}` : null;

                  return (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-slate-200/60 bg-white/20 p-3 backdrop-blur"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">
                            {href ? (
                              <Link to={href} className="hover:underline">
                                Lead captured
                              </Link>
                            ) : (
                              'Lead captured'
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-600">
                            {page?.title ?? page?.slug ?? 'Landing page'} · {campaign?.name ?? 'No campaign'}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatDistanceToNow(new Date(event.occurredAt), { addSuffix: true })}
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        {event.personId ? `CRM: ${event.personId}` : `Lead: ${event.leadId ?? '—'}`}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] hatch-glass--info">
            <CardHeader className="pb-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-white/20 text-brand-blue-700 backdrop-blur-md">
                  <Info className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Where do leads show up?</CardTitle>
                  <CardDescription className="text-xs">Hatch routes the lead into CRM when possible.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Landing page form submits create a lead record and (when possible) a CRM contact. Review outcomes in Conversions, then work the contact in CRM.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/broker/crm">Open Leads &amp; CRM</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/broker/marketing/lead-gen/conversions">Open Conversions</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
