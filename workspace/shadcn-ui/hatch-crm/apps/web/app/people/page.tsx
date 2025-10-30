import PipelineBoard from '@/components/pipeline-board';
import { getLeads, getPipelines } from '@/lib/api';

export const dynamic = 'force-dynamic';

const LEADS_PAGE_SIZE = 50;

export default async function PeoplePage() {
  const [pipelines, leadResponse] = await Promise.all([
    getPipelines(),
    getLeads({ limit: LEADS_PAGE_SIZE })
  ]);

  return (
    <div className="space-y-8">
      <PipelineBoard
        pipelines={pipelines}
        initialLeads={leadResponse.items}
        initialNextCursor={leadResponse.nextCursor ?? null}
        pageSize={LEADS_PAGE_SIZE}
      />
    </div>
  );
}
