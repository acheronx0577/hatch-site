import Link from 'next/link';

import AgentPerformanceAnalytics from '@/components/agents/performance-analytics/AgentPerformanceAnalytics';

type AgentPerformancePageProps = {
  params: { agentProfileId: string };
};

export default function AgentPerformancePage({ params }: AgentPerformancePageProps) {
  const { agentProfileId } = params;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        <Link href={`/dashboard/agents/${agentProfileId}`} className="text-indigo-600 hover:underline">
          Agent profile
        </Link>{' '}
        / Performance analytics
      </p>
      <AgentPerformanceAnalytics agentId={agentProfileId} />
    </div>
  );
}

