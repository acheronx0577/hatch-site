import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchAgentProfile, fetchAgentTrainingProgress } from '@/lib/api/agents';
import { AgentPerformancePanel } from './components/agent-performance-panel';

const DEFAULT_ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'org-hatch';

type AgentDetailPageProps = {
  params: { agentProfileId: string };
};

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { agentProfileId } = params;
  const [profile, training] = await Promise.all([
    fetchAgentProfile(DEFAULT_ORG_ID, agentProfileId).catch(() => null),
    fetchAgentTrainingProgress(DEFAULT_ORG_ID, agentProfileId).catch(() => [])
  ]);

  if (!profile) {
    notFound();
  }

  const name = `${profile.user?.firstName ?? ''} ${profile.user?.lastName ?? ''}`.trim() || 'Agent';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/dashboard/mission-control" className="text-indigo-600 hover:underline">
            Mission Control
          </Link>{' '}
          / Agent detail
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">{name}</h1>
        <p className="text-sm text-slate-500">{profile.user?.email}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-slate-500">License</dt>
              <dd className="text-base text-slate-900">
                {profile.licenseNumber ?? '—'} {profile.licenseState ? `(${profile.licenseState})` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Specialization</dt>
              <dd className="text-base text-slate-900">
                {profile.isCommercial ? 'Commercial' : 'Residential'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Risk level</dt>
              <dd>
                <Badge>{profile.riskLevel}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Compliance</dt>
              <dd className="text-base text-slate-900">
                {profile.isCompliant ? 'Compliant' : 'Monitoring'} {profile.requiresAction ? '· Action required' : ''}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" id="training">
          <h2 className="text-lg font-semibold text-slate-900">Training progress</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {training.length === 0 ? (
              <p>No training modules assigned yet.</p>
            ) : (
              training.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-100 p-3">
                  <p className="font-semibold text-slate-900">{row.module.title}</p>
                  <p className="text-xs text-slate-500">{row.module.required ? 'Required' : 'Optional'}</p>
                  <p className="text-sm text-slate-600">Status: {row.status}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <AgentPerformancePanel
        orgId={DEFAULT_ORG_ID}
        agentProfileId={agentProfileId}
        riskLevel={profile.riskLevel}
        requiresAction={profile.requiresAction}
      />
    </div>
  );
}
