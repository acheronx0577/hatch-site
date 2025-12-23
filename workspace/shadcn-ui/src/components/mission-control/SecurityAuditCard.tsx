import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Workflow } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MlsSyncSummaryCard } from '@/components/mls/mls-sync-status';

type SecurityAuditCardProps = {
  orgId: string;
};

export function SecurityAuditCard({ orgId }: SecurityAuditCardProps) {
  return (
      <div className="flex flex-col gap-4">
      <MlsSyncSummaryCard orgId={orgId} />

      <Card className="!rounded-[var(--radius-lg)]">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
              <ShieldCheck className="h-4 w-4 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-sm md:text-base">Security &amp; Audit</CardTitle>
              <p className="text-[11px] text-slate-500">Track MLS syncs, accounting pushes, and policy changes.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Stay investor- and compliance-ready.</p>
            <p className="text-[11px] text-slate-400">Every sensitive action is logged automatically.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/broker/audit-log">Open log</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="!rounded-[var(--radius-lg)]">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
              <Workflow className="h-4 w-4 text-slate-700" />
            </div>
            <div>
              <CardTitle className="text-sm md:text-base">Automations</CardTitle>
              <p className="text-[11px] text-slate-500">Build playbooks that react to leads, listings, docs, and syncs.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-600">Trigger → Condition → Action.</p>
            <p className="text-[11px] text-slate-400">Route leads, flag compliance, notify teams automatically.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/broker/playbooks">Manage</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
