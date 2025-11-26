import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AiEmailComposerModal } from '@/components/ai/AiEmailComposerModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MlsSyncPanel } from '@/components/mls/mls-sync-status';
import { useAuth } from '@/contexts/AuthContext';
import type { PersonaId } from '@/lib/ai/aiPersonas';
import {
  type CampaignFilter,
  type MarketingCampaign,
  type MarketingCampaignStatus,
  type MarketingChannel,
  listMarketingCampaigns
} from '@/lib/api/hatch';
import { cn } from '@/lib/utils';

const personaLabel = (personaId: PersonaId) => {
  switch (personaId) {
    case 'agent_copilot':
      return 'Echo';
    case 'lead_nurse':
      return 'Lumen';
    case 'listing_concierge':
      return 'Haven';
    case 'market_analyst':
      return 'Atlas';
    case 'transaction_coordinator':
      return 'Nova';
    default:
      return personaId;
  }
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const statusBadge = (status: MarketingCampaignStatus) => {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>;
    case 'scheduled':
      return <Badge className="border-amber-200 bg-amber-100 text-amber-800">Scheduled</Badge>;
    case 'sent':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Sent</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return null;
  }
};

const channelBadge = (channel: MarketingChannel) => {
  return <Badge variant="outline">{channel === 'EMAIL' ? 'Email' : 'SMS'}</Badge>;
};

export default function BrokerMarketingPage() {
  const { activeOrgId } = useAuth();
  const fallbackOrgId = import.meta.env.VITE_ORG_ID ?? 'org-hatch';
  const orgId = activeOrgId ?? fallbackOrgId;
  const [tab, setTab] = useState<CampaignFilter>('all');
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPersona, setComposerPersona] = useState<PersonaId>('lead_nurse');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listMarketingCampaigns(tab)
      .then((data) => {
        if (!active) return;
        setCampaigns(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load campaigns');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab]);

  const filteredCampaigns = useMemo(() => {
    if (!search.trim()) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter((campaign) => {
      return (
        campaign.name.toLowerCase().includes(q) ||
        campaign.subject.toLowerCase().includes(q) ||
        personaLabel(campaign.personaId).toLowerCase().includes(q)
      );
    });
  }, [campaigns, search]);

  const handleNewAiEmail = (personaId: PersonaId) => {
    setComposerPersona(personaId);
    setComposerOpen(true);
  };

  const handleCampaignCreated = (campaign: MarketingCampaign) => {
    setCampaigns((prev) => [campaign, ...prev]);
    if (tab !== 'all') {
      setTab('all');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Marketing</p>
          <h1 className="text-2xl font-bold text-slate-900">AI Campaign Center</h1>
          <p className="text-sm text-muted-foreground">
            Run AI-powered campaigns to your sphere, leads, and past clients. Draft with Haven or Lumen, review, and send with a click.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/broker/marketing/campaigns">Drip campaigns</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleNewAiEmail('lead_nurse')}>
            New nurture email (Lumen)
          </Button>
          <Button size="sm" onClick={() => handleNewAiEmail('listing_concierge')}>
            New listing email (Haven)
          </Button>
        </div>
      </div>

      <MlsSyncPanel orgId={orgId} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as CampaignFilter)}>
        <TabsList>
          <TabsTrigger value="all">All campaigns</TabsTrigger>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-sm font-semibold">Campaigns</CardTitle>
              <Input
                placeholder="Search campaigns…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full max-w-xs text-sm"
              />
            </CardHeader>
            <CardContent className="pb-2">
              {error ? (
                <div className="py-8 text-center text-sm text-destructive">{error}</div>
              ) : loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading campaigns…</div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No campaigns yet. Start by creating a new AI-generated email.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">Name</th>
                        <th className="px-3 py-2 text-left font-semibold">Persona</th>
                        <th className="px-3 py-2 text-left font-semibold">Subject</th>
                        <th className="px-3 py-2 text-left font-semibold">Channel</th>
                        <th className="px-3 py-2 text-left font-semibold">Created</th>
                        <th className="px-3 py-2 text-left font-semibold">Sent</th>
                        <th className="px-3 py-2 text-right font-semibold">Recipients</th>
                        <th className="px-3 py-2 text-right font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCampaigns.map((campaign) => (
                        <tr
                          key={campaign.id}
                          className={cn('border-b last:border-0 hover:bg-muted/40')}
                        >
                          <td className="max-w-[180px] truncate px-3 py-2 text-left">{campaign.name}</td>
                          <td className="px-3 py-2 text-left">
                            <span className="inline-flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                                {personaLabel(campaign.personaId).charAt(0)}
                              </span>
                              {personaLabel(campaign.personaId)}
                            </span>
                          </td>
                          <td className="max-w-[260px] truncate px-3 py-2 text-left">{campaign.subject}</td>
                          <td className="px-3 py-2 text-left">{channelBadge(campaign.channel)}</td>
                          <td className="px-3 py-2 text-left">{formatDateTime(campaign.createdAt)}</td>
                          <td className="px-3 py-2 text-left">{formatDateTime(campaign.sentAt)}</td>
                          <td className="px-3 py-2 text-right">{campaign.recipientsCount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{statusBadge(campaign.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AiEmailComposerModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        personaId={composerPersona}
        onCampaignCreated={handleCampaignCreated}
      />
    </div>
  );
}
