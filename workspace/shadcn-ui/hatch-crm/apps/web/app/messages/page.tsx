import { MessagesTable } from '@/components/messages-table';
import { listMessages } from '@/lib/api/messages';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface MessagesPageProps {
  searchParams?: {
    q?: string;
    channel?: string;
    direction?: string;
  };
}

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  const initialQuery = searchParams?.q ?? '';
  const initialChannel =
    searchParams?.channel === 'SMS' ||
    searchParams?.channel === 'EMAIL' ||
    searchParams?.channel === 'PUSH' ||
    searchParams?.channel === 'IN_APP' ||
    searchParams?.channel === 'VOICE'
      ? (searchParams.channel as 'SMS' | 'EMAIL' | 'PUSH' | 'IN_APP' | 'VOICE')
      : 'all';
  const initialDirection =
    searchParams?.direction === 'INBOUND' || searchParams?.direction === 'OUTBOUND'
      ? (searchParams.direction as 'INBOUND' | 'OUTBOUND')
      : 'all';

  const initial = await listMessages({
    limit: PAGE_SIZE,
    q: initialQuery || undefined,
    channel: initialChannel,
    direction: initialDirection
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Messaging</h1>
        <p className="text-sm text-slate-500">
          Monitor inbound and outbound communications across SMS and email.
        </p>
      </div>

      <MessagesTable
        initialItems={initial.items}
        initialNextCursor={initial.nextCursor}
        pageSize={PAGE_SIZE}
        initialQuery={initialQuery}
        initialChannel={initialChannel}
        initialDirection={initialDirection}
      />
    </div>
  );
}
