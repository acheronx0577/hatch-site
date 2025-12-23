import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchMissionControlActivity, MissionControlEvent } from '@/lib/api/mission-control';
import { missionControlActivityQueryKey } from '@/lib/queryKeys';

type MissionControlActivityFeedProps = {
  orgId: string;
};

export function MissionControlActivityFeed({ orgId }: MissionControlActivityFeedProps) {
  const { data, isLoading } = useQuery({
    queryKey: missionControlActivityQueryKey(orgId),
    queryFn: () => fetchMissionControlActivity(orgId),
    refetchInterval: 30_000
  });

  const events = data ?? [];

  return (
    <Card className="h-full p-6" data-testid="mission-control-activity">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-slate-900">Activity</h3>
          <p className="text-sm text-slate-500">Latest org events</p>
        </div>
      </div>

      <ScrollArea className="mt-4 h-[320px] pr-1">
        <ul className="space-y-3 list-none" data-testid="mc-activity-list">
          {isLoading
            ? Array.from({ length: 4 }).map((_, idx) => <ActivitySkeleton key={`activity-skel-${idx}`} />)
            : events.map((event) => <ActivityItem key={event.id} event={event} />)}
          {!isLoading && events.length === 0 ? (
            <li className="text-sm text-slate-500">No recent activity recorded for this organization.</li>
          ) : null}
        </ul>
      </ScrollArea>
    </Card>
  );
}

const readableLabel: Record<string, string> = {
  ORG_CREATED: 'Organization created',
  AGENT_INVITE_CREATED: 'Agent invite sent',
  AGENT_INVITE_ACCEPTED: 'Agent joined',
  ORG_FOLDER_CREATED: 'Vault folder added',
  ORG_FILE_UPLOADED: 'Vault file uploaded',
  ORG_FILE_CLASSIFIED: 'Document classified',
  ORG_FILE_EVALUATED: 'Document evaluated',
  ORG_LISTING_CREATED: 'Listing created',
  ORG_LISTING_UPDATED: 'Listing updated',
  ORG_LISTING_STATUS_CHANGED: 'Listing status changed',
  ORG_LISTING_APPROVAL_REQUESTED: 'Listing submitted for approval',
  ORG_LISTING_APPROVED: 'Listing approved',
  ORG_LISTING_REJECTED: 'Listing rejected',
  ORG_LISTING_CHANGES_REQUESTED: 'Listing changes requested',
  ORG_LISTING_EVALUATED: 'Listing compliance review',
  ORG_LEAD_CREATED: 'Lead created',
  ORG_LEAD_STATUS_CHANGED: 'Lead stage changed',
  ORG_OFFER_INTENT_CREATED: 'LOI created',
  ORG_OFFER_INTENT_STATUS_CHANGED: 'LOI status changed',
  ORG_TRANSACTION_EVALUATED: 'Transaction compliance review',
  ORG_TRANSACTION_CREATED: 'Transaction created',
  ORG_TRANSACTION_UPDATED: 'Transaction updated',
  ORG_TRANSACTION_STATUS_CHANGED: 'Transaction stage changed'
};

const eventLinkMap: Record<string, string> = {
  AGENT_INVITE_CREATED: '/broker/team?stage=ONBOARDING',
  AGENT_INVITE_ACCEPTED: '/broker/team?stage=ONBOARDING',
  ORG_LISTING_EVALUATED: '/broker/properties?filter=FLAGGED',
  ORG_TRANSACTION_EVALUATED: '/broker/transactions?filter=ATTENTION',
  ORG_LISTING_APPROVAL_REQUESTED: '/broker/properties?filter=FLAGGED',
  ORG_LISTING_CHANGES_REQUESTED: '/broker/properties?filter=FLAGGED',
  ORG_LISTING_REJECTED: '/broker/properties?filter=FLAGGED',
  ORG_LISTING_APPROVED: '/broker/properties'
};

function readStringPayload(event: MissionControlEvent, key: string) {
  const payload = event.payload;
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function resolveEventHref(event: MissionControlEvent) {
  const leadId = readStringPayload(event, 'leadId');
  const offerIntentId = readStringPayload(event, 'offerIntentId');
  const fileId = readStringPayload(event, 'fileId');
  const listingId = readStringPayload(event, 'listingId');
  const transactionId = readStringPayload(event, 'transactionId');

  if (['ORG_LEAD_CREATED', 'ORG_LEAD_STATUS_CHANGED'].includes(event.type)) {
    return leadId ? `/broker/crm/leads/${leadId}` : '/broker/crm';
  }

  if (['ORG_OFFER_INTENT_CREATED', 'ORG_OFFER_INTENT_STATUS_CHANGED'].includes(event.type)) {
    return offerIntentId ? `/broker/offer-intents?focus=${offerIntentId}` : '/broker/offer-intents';
  }

  if (['ORG_FILE_UPLOADED', 'ORG_FILE_CLASSIFIED', 'ORG_FILE_EVALUATED'].includes(event.type)) {
    return fileId ? `/broker/documents/${fileId}` : null;
  }

  if (
    [
      'ORG_TRANSACTION_CREATED',
      'ORG_TRANSACTION_UPDATED',
      'ORG_TRANSACTION_STATUS_CHANGED',
      'ORG_TRANSACTION_EVALUATED'
    ].includes(event.type)
  ) {
    return transactionId ? `/broker/transactions?focus=${transactionId}` : '/broker/transactions';
  }

  if (
    [
      'ORG_LISTING_CREATED',
      'ORG_LISTING_UPDATED',
      'ORG_LISTING_STATUS_CHANGED',
      'ORG_LISTING_APPROVAL_REQUESTED',
      'ORG_LISTING_APPROVED',
      'ORG_LISTING_REJECTED',
      'ORG_LISTING_CHANGES_REQUESTED',
      'ORG_LISTING_EVALUATED'
    ].includes(event.type)
  ) {
    return listingId ? `/broker/properties/${listingId}` : '/broker/properties';
  }

  return eventLinkMap[event.type] ?? null;
}

function ActivityItem({ event }: { event: MissionControlEvent }) {
  const createdAt = new Date(event.createdAt);
  const label = readableLabel[event.type] ?? event.type.replace(/_/g, ' ');
  const href = resolveEventHref(event);
  const content = (
    <div className="group relative rounded-[var(--radius-md)] px-3 py-2 pl-4 transition-colors duration-200 hover:bg-white/25 dark:hover:bg-white/10">
      <div aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-blue-600/80" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-slate-900">{label}</p>
          {event.message ? <p className="mt-0.5 text-[12px] text-slate-600">{event.message}</p> : null}
        </div>
        <p className="shrink-0 text-[11px] text-slate-400">{formatDistanceToNow(createdAt, { addSuffix: true })}</p>
      </div>
    </div>
  );
  return (
    <li>
      {href ? (
        <Link to={href} className="contents">
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  );
}

const ActivitySkeleton = () => (
  <li className="relative rounded-[var(--radius-md)] px-3 py-2 pl-4">
    <div aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-blue-600/35" />
    <div className="hatch-shimmer h-4 w-40 rounded" />
    <div className="hatch-shimmer mt-2 h-3 w-64 rounded" />
  </li>
);
