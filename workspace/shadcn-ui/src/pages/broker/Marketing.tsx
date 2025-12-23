import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function BrokerMarketingPage() {
  return (
    <div className="space-y-6">
      <Card className="!rounded-3xl p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/45 via-white/12 to-white/0 dark:from-white/10 dark:via-white/5"
        />
        <div className="relative space-y-2">
          <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Marketing</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Choose a marketing workspace—generate listing assets, run AI campaigns, or manage drip automations.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="group relative flex h-full flex-col overflow-hidden">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500/70 to-sky-500/70" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              Marketing Studio
              <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.14em]">Beta</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 text-sm text-muted-foreground">
            <p>Generate listing flyers and branded assets from templates. Swap photos, update contact info, then export.</p>
            <p className="text-xs text-slate-500">Last used: —</p>
            <div className="mt-auto">
              <Button asChild size="sm">
                <Link to="/broker/marketing/studio">Open Studio</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative flex h-full flex-col overflow-hidden">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-500/70 to-brand-blue-600/70" />
          <CardHeader>
            <CardTitle className="text-base font-semibold">AI Campaign Center</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 text-sm text-muted-foreground">
            <p>Create and manage AI-generated nurture + listing campaigns. Draft with Haven or Lumen, then send.</p>
            <p className="text-xs text-slate-500">Active: —</p>
            <div className="mt-auto">
              <Button asChild size="sm">
                <Link to="/broker/marketing/campaign-center">Open Campaign Center</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative flex h-full flex-col overflow-hidden">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500/70 to-teal-500/70" />
          <CardHeader>
            <CardTitle className="text-base font-semibold">Drip Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 text-sm text-muted-foreground">
            <p>Build lightweight drips that run through Playbooks—no new AI surfaces required.</p>
            <p className="text-xs text-slate-500">Last run: —</p>
            <div className="mt-auto">
              <Button asChild size="sm">
                <Link to="/broker/marketing/campaigns">Open Drips</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="group relative flex h-full flex-col overflow-hidden">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500/70 to-rose-500/70" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              Lead Generation
              <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.14em]">Beta</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 text-sm text-muted-foreground">
            <p>Create acquisition campaigns, publish landing pages, track conversions, and export audiences.</p>
            <p className="text-xs text-slate-500">Leads (7d): —</p>
            <div className="mt-auto">
              <Button asChild size="sm">
                <Link to="/broker/marketing/lead-gen">Open Lead Gen</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
