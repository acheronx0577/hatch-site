import { WebhookSubscriptionsTable } from '@/components/webhook-subscriptions-table';
import { listWebhookSubscriptions } from '@/lib/api/webhooks';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface WebhooksPageProps {
  searchParams?: {
    status?: string;
  };
}

export default async function WebhooksPage({ searchParams }: WebhooksPageProps) {
  const statusParam = searchParams?.status === 'active'
    ? 'active'
    : searchParams?.status === 'inactive'
      ? 'inactive'
      : 'all';

  const initial = await listWebhookSubscriptions({
    limit: PAGE_SIZE,
    status: statusParam as 'all' | 'active' | 'inactive'
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Webhooks</h1>
        <p className="text-sm text-slate-500">
          Manage outbound webhooks and validate subscription health.
        </p>
      </div>

      <WebhookSubscriptionsTable
        initialItems={initial.items}
        initialNextCursor={initial.nextCursor}
        pageSize={PAGE_SIZE}
        initialFilter={statusParam as 'all' | 'active' | 'inactive'}
      />
    </div>
  );
}
