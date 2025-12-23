import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { fetchOrgListings } from '@/lib/api/org-listings';
import {
  createLeadGenCampaign,
  getLeadGenCampaignMetrics,
  listLeadGenCampaigns,
  type LeadGenCampaign,
  type LeadGenCampaignMetrics,
  type LeadGenChannel,
  type LeadGenObjective
} from '@/lib/api/lead-gen';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';
const DEFAULT_TENANT_ID = import.meta.env.VITE_TENANT_ID ?? 'tenant-hatch';

const CHANNELS: LeadGenChannel[] = ['PAID_SOCIAL', 'PAID_SEARCH', 'SEO', 'OUTBOUND', 'DIRECT', 'OTHER'];
const OBJECTIVES: LeadGenObjective[] = ['LEADS', 'TRAFFIC', 'CONVERSIONS'];

type CampaignGoal = 'GET_LEADS' | 'PROMOTE_LISTING' | 'RECRUIT_AGENTS';
type CampaignPlatform = 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN';

const GOALS: Array<{ id: CampaignGoal; title: string; description: string; objective: LeadGenObjective }> = [
  { id: 'GET_LEADS', title: 'Get leads', description: 'Drive new buyer/seller inquiries into the CRM.', objective: 'LEADS' },
  { id: 'PROMOTE_LISTING', title: 'Promote listing', description: 'Boost a specific property with ready-to-post creative.', objective: 'TRAFFIC' },
  { id: 'RECRUIT_AGENTS', title: 'Recruit agents', description: 'Attract talent with a lightweight recruiting campaign.', objective: 'LEADS' }
];

const PLATFORM_OPTIONS: Array<{ id: CampaignPlatform; label: string }> = [
  { id: 'INSTAGRAM', label: 'Instagram' },
  { id: 'FACEBOOK', label: 'Facebook' },
  { id: 'LINKEDIN', label: 'LinkedIn' }
];

function statusBadge(status: string) {
  switch (status) {
    case 'ACTIVE':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Active</Badge>;
    case 'PAUSED':
      return <Badge className="border-amber-200 bg-amber-100 text-amber-800">Paused</Badge>;
    case 'ARCHIVED':
      return <Badge variant="secondary">Archived</Badge>;
    default:
      return <Badge variant="outline">Draft</Badge>;
  }
}

function formatMoney(cents: number, currency = 'USD') {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export default function LeadGenCampaignsPage() {
  const { activeOrgId, userId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;

  const ctx = useMemo(
    () => ({ orgId, userId, tenantId: DEFAULT_TENANT_ID, role: 'BROKER' }),
    [orgId, userId]
  );

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<CampaignGoal>('GET_LEADS');
  const [campaignName, setCampaignName] = useState('');
  const [listingId, setListingId] = useState<string>('');
  const [platforms, setPlatforms] = useState<CampaignPlatform[]>(['INSTAGRAM', 'FACEBOOK']);
  const [budgetPerDay, setBudgetPerDay] = useState(25);

  const [slug, setSlug] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');

  const listingsQuery = useQuery({
    queryKey: ['org-listings', orgId, 'lead-gen'],
    queryFn: () => fetchOrgListings(orgId),
    enabled: createOpen
  });

  const resetForm = () => {
    setError(null);
    setStep(0);
    setGoal('GET_LEADS');
    setCampaignName('');
    setListingId('');
    setPlatforms(['INSTAGRAM', 'FACEBOOK']);
    setBudgetPerDay(25);
    setSlug('');
    setUtmSource('');
    setUtmMedium('');
    setUtmCampaign('');
  };

  const campaignsQuery = useQuery({
    queryKey: ['lead-gen', 'campaigns', orgId],
    queryFn: () => listLeadGenCampaigns(ctx)
  });

  const campaignIds = useMemo(() => (campaignsQuery.data ?? []).map((c) => c.id), [campaignsQuery.data]);

  const campaignMetricsQuery = useQuery({
    queryKey: ['lead-gen', 'campaign-metrics', orgId, campaignIds],
    enabled: campaignIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const entries = await Promise.all(
        campaignIds.map(async (id) => {
          try {
            const metrics = await getLeadGenCampaignMetrics(ctx, id);
            return [id, metrics] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );
      return Object.fromEntries(entries) as Record<string, LeadGenCampaignMetrics | null>;
    }
  });

  const campaigns = useMemo(() => {
    const items = campaignsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const haystack = [c.name, c.slug, c.channel, c.objective, c.utmSource, c.utmMedium, c.utmCampaign]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [campaignsQuery.data, search]);

  const selectedGoal = GOALS.find((entry) => entry.id === goal) ?? GOALS[0];
  const derivedObjective = selectedGoal.objective;
  const derivedChannel: LeadGenChannel = platforms.length > 0 ? 'PAID_SOCIAL' : 'OTHER';

  const selectedListing = useMemo(() => {
    if (!listingId) return null;
    return (listingsQuery.data ?? []).find((listing) => listing.id === listingId) ?? null;
  }, [listingId, listingsQuery.data]);

  const resolvedCampaignName = useMemo(() => {
    const trimmed = campaignName.trim();
    if (trimmed) return trimmed;
    const listingLabel = selectedListing?.addressLine1?.trim();
    const target = goal === 'PROMOTE_LISTING' && listingLabel ? listingLabel : 'General';
    return `${selectedGoal.title} · ${target}`;
  }, [campaignName, goal, selectedGoal.title, selectedListing?.addressLine1]);

  const generatedCreative = useMemo(() => {
    const listing = selectedListing;
    const city = listing?.city?.trim() || '';
    const state = listing?.state?.trim() || '';
    const location = [city, state].filter(Boolean).join(', ');
    const price =
      listing?.listPrice && Number.isFinite(Number(listing.listPrice))
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
            Number(listing.listPrice)
          )
        : null;

    if (goal === 'PROMOTE_LISTING' && listing) {
      const headline = `Just listed: ${listing.addressLine1}${location ? ` · ${location}` : ''}`;
      const caption = `${headline}${price ? ` · ${price}` : ''}\n\nDM us for the full brochure or schedule a showing today.`;
      const tags = [
        '#realestate',
        '#newlisting',
        city ? `#${city.replace(/\s+/g, '').toLowerCase()}realestate` : null,
        state ? `#${state.replace(/\s+/g, '').toLowerCase()}` : null
      ].filter(Boolean);
      return { headline, caption, hashtags: tags.join(' ') };
    }

    if (goal === 'RECRUIT_AGENTS') {
      const headline = 'Join a brokerage built for modern agents';
      const caption =
        'We support you with lead routing, compliance automation, transaction ops, and marketing.\n\nReply “INFO” for the comp plan + onboarding details.';
      return { headline, caption, hashtags: '#realestate #realtorlife #brokerage' };
    }

    const headline = location ? `Looking to buy or sell in ${location}?` : 'Ready to buy or sell?';
    const caption =
      `${headline}\n\nGet curated listings, instant updates, and an agent who follows up fast. Drop your email and we’ll reach out.`.trim();
    return { headline, caption, hashtags: '#realestate #homesforsale #openhouse' };
  }, [goal, selectedListing]);

  const canProceed = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) {
      return goal !== 'PROMOTE_LISTING' || Boolean(listingId);
    }
    if (step === 2) {
      return platforms.length > 0;
    }
    if (step === 3) {
      return Number.isFinite(budgetPerDay) && budgetPerDay > 0;
    }
    return true;
  }, [budgetPerDay, goal, listingId, platforms.length, step]);

  const handleCreate = async () => {
    setError(null);
    try {
      const budget = Math.round(Math.max(0, budgetPerDay) * 100);
      const payload: Partial<LeadGenCampaign> = {
        name: resolvedCampaignName,
        channel: derivedChannel,
        objective: derivedObjective,
        status: 'DRAFT',
        currency: 'USD',
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        ...(utmSource.trim() ? { utmSource: utmSource.trim() } : {}),
        ...(utmMedium.trim() ? { utmMedium: utmMedium.trim() } : {}),
        ...(utmCampaign.trim() ? { utmCampaign: utmCampaign.trim() } : {}),
        ...(Number.isFinite(budget) && budget > 0 ? { dailyBudgetCents: budget } : {}),
        targeting: {
          goal,
          listingId: listingId || null,
          platforms,
          budgetPerDay
        },
        creativeBrief: `${generatedCreative.headline}\n\n${generatedCreative.caption}\n\n${generatedCreative.hashtags}`
      };

      await createLeadGenCampaign(ctx, payload);
      await campaignsQuery.refetch();
      void campaignMetricsQuery.refetch();
      setCreateOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    }
  };

  const totalLabel = campaignsQuery.isLoading ? 'Loading…' : `${campaigns.length} total`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Lead Generation</p>
          <h1 className="text-2xl font-bold text-slate-900">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Organize UTMs, track spend, and measure outcomes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/broker/marketing/lead-gen">Back</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              campaignsQuery.refetch();
              campaignMetricsQuery.refetch();
            }}
          >
            Refresh
          </Button>

          <Dialog
            open={createOpen}
            onOpenChange={(next) => {
              setCreateOpen(next);
              if (!next) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> New campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[680px]">
              <DialogHeader>
                <DialogTitle>Create campaign</DialogTitle>
                <DialogDescription>Create a campaign in under 60 seconds. Advanced fields live under settings.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/20 px-4 py-2 text-xs text-slate-600 backdrop-blur">
                  <span className="font-semibold text-slate-900">Step {step + 1} / 5</span>
                  <span>{selectedGoal.title}</span>
                </div>

                {step === 0 ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      {GOALS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setGoal(item.id)}
                          className={`rounded-2xl border px-4 py-3 text-left transition ${
                            goal === item.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <Label>Campaign name (optional)</Label>
                      <Input
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        placeholder={resolvedCampaignName}
                        autoFocus
                      />
                      <p className="text-[11px] text-slate-500">Leave blank to auto-name from goal + target.</p>
                    </div>
                  </div>
                ) : null}

                {step === 1 ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Target</Label>
                      <Select value={listingId || '__none'} onValueChange={(value) => setListingId(value === '__none' ? '' : value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a listing (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">General (no property)</SelectItem>
                          {(listingsQuery.data ?? []).slice(0, 50).map((listing) => (
                            <SelectItem key={listing.id} value={listing.id}>
                              {listing.addressLine1}, {listing.city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {goal === 'PROMOTE_LISTING' ? (
                        <p className="text-[11px] text-slate-500">Promote listing requires selecting a property.</p>
                      ) : (
                        <p className="text-[11px] text-slate-500">Pick a listing to auto-generate creative from photos + details.</p>
                      )}
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="space-y-3">
                    <Label>Platforms</Label>
                    <div className="grid gap-2 md:grid-cols-3">
                      {PLATFORM_OPTIONS.map((platform) => {
                        const checked = platforms.includes(platform.id);
                        return (
                          <label
                            key={platform.id}
                            className="flex cursor-pointer items-start gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                setPlatforms((prev) => {
                                  const next = new Set(prev);
                                  if (value === true) next.add(platform.id);
                                  else next.delete(platform.id);
                                  return Array.from(next);
                                });
                              }}
                            />
                            <div>
                              <p className="font-semibold text-slate-900">{platform.label}</p>
                              <p className="text-xs text-slate-500">Included in creative + targeting.</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-500">We store platforms under targeting for explainability.</p>
                  </div>
                ) : null}

                {step === 3 ? (
                  <div className="space-y-3">
                    <Label>Budget</Label>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">${budgetPerDay}/day</p>
                        <p className="text-xs text-slate-500">Daily budget</p>
                      </div>
                      <Slider
                        value={[budgetPerDay]}
                        onValueChange={(value) => setBudgetPerDay(Math.round(value[0] ?? 0))}
                        min={5}
                        max={250}
                        step={5}
                        className="mt-4"
                      />
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>$5</span>
                        <span>$250</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {step === 4 ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{generatedCreative.headline}</p>
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                        {generatedCreative.caption}
                      </pre>
                      <p className="mt-2 text-xs text-slate-500">{generatedCreative.hashtags}</p>
                      <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Channel</p>
                          <p className="font-medium text-slate-900">{derivedChannel}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Objective</p>
                          <p className="font-medium text-slate-900">{derivedObjective}</p>
                        </div>
                      </div>
                    </div>

                    <details className="rounded-2xl border border-slate-200/70 bg-white/20 px-4 py-3 backdrop-blur">
                      <summary className="cursor-pointer text-sm font-medium text-slate-900">Advanced settings</summary>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="leadgen-campaign-slug">Slug (optional)</Label>
                          <Input
                            id="leadgen-campaign-slug"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="winter-buyer"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="leadgen-utm-source">UTM source</Label>
                          <Input
                            id="leadgen-utm-source"
                            value={utmSource}
                            onChange={(e) => setUtmSource(e.target.value)}
                            placeholder="facebook"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="leadgen-utm-medium">UTM medium</Label>
                          <Input
                            id="leadgen-utm-medium"
                            value={utmMedium}
                            onChange={(e) => setUtmMedium(e.target.value)}
                            placeholder="cpc"
                          />
                        </div>
                        <div className="grid gap-2 md:col-span-2">
                          <Label htmlFor="leadgen-utm-campaign">UTM campaign</Label>
                          <Input
                            id="leadgen-utm-campaign"
                            value={utmCampaign}
                            onChange={(e) => setUtmCampaign(e.target.value)}
                            placeholder="winter-buyer-leads"
                          />
                        </div>
                      </div>
                    </details>
                  </div>
                ) : null}

                {error ? <div className="text-xs text-destructive">{error}</div> : null}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (step === 0) setCreateOpen(false);
                    else setStep((prev) => Math.max(0, prev - 1));
                  }}
                >
                  {step === 0 ? 'Cancel' : 'Back'}
                </Button>
                {step < 4 ? (
                  <Button onClick={() => setStep((prev) => Math.min(4, prev + 1))} disabled={!canProceed}>
                    Next
                  </Button>
                ) : (
                  <Button onClick={handleCreate} disabled={!resolvedCampaignName.trim()}>
                    Create campaign
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="rounded-[24px]">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">Campaigns</CardTitle>
            <CardDescription className="text-xs">{totalLabel}</CardDescription>
          </div>
          <div className="relative w-full md:w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="pb-2">
          {campaignsQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading campaigns…</div>
          ) : campaigns.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No lead gen campaigns yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Campaign</th>
                    <th className="px-4 py-3 text-left">Channel</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Leads</th>
                    <th className="px-4 py-3 text-right">CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => {
                    const metrics = campaignMetricsQuery.data?.[campaign.id] ?? null;
                    return (
                      <tr key={campaign.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{campaign.name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {campaign.utmSource || '—'} / {campaign.utmMedium || '—'} / {campaign.utmCampaign || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">{campaign.channel}</td>
                        <td className="px-4 py-3">{statusBadge(campaign.status)}</td>
                        <td className="px-4 py-3 text-right">
                          {campaignMetricsQuery.isLoading ? (
                            <div className="flex justify-end">
                              <Skeleton className="h-4 w-10" />
                            </div>
                          ) : metrics ? (
                            metrics.leadsCreated.toLocaleString()
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {campaignMetricsQuery.isLoading ? (
                            <div className="flex justify-end">
                              <Skeleton className="h-4 w-14" />
                            </div>
                          ) : metrics && metrics.costPerLeadCents != null ? (
                            <div className="flex flex-col items-end">
                              <span className="font-medium text-slate-900">
                                {formatMoney(metrics.costPerLeadCents, campaign.currency)}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Spend {formatMoney(metrics.spendCents, campaign.currency)}
                              </span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
