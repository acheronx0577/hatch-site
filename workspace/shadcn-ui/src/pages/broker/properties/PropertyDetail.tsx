import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, FileText, Image as ImageIcon, XCircle } from 'lucide-react';

import { AreaMetricsTab } from '@/components/properties/AreaMetricsTab';
import { ComparablesTab } from '@/components/properties/ComparablesTab';
import { MlsDetailsTab } from '@/components/properties/MlsDetailsTab';
import { RecommendationsWidget } from '@/components/properties/RecommendationsWidget';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { emitAskHatchOpen } from '@/lib/ask-hatch/events';
import {
  approveOrgListing,
  fetchOrgListingActivity,
  fetchOrgListingDetails,
  rejectOrgListing,
  requestOrgListingApproval,
  requestOrgListingChanges,
  type ListingActivityEvent,
  type OrgListingRecord,
  type OrgListingDocumentRecord
} from '@/lib/api/org-listings';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

type ListingApprovalAction = 'REQUEST_APPROVAL' | 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
type PropertyDetailTab = 'details' | 'area' | 'comps' | 'documents' | 'activity';

export default function PropertyDetailPage() {
  const { activeOrgId, isBroker } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  const { listingId } = useParams<{ listingId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parsePropertyDetailTab(searchParams.get('tab'));
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingAction, setPendingAction] = useState<ListingApprovalAction | null>(null);
  const [actionNote, setActionNote] = useState('');

  const approvalMutation = useMutation({
    mutationFn: async ({ action, note }: { action: ListingApprovalAction; note?: string }) => {
      if (!listingId) {
        throw new Error('Missing listing id');
      }
      switch (action) {
        case 'REQUEST_APPROVAL':
          return requestOrgListingApproval(orgId, listingId);
        case 'APPROVE':
          return approveOrgListing(orgId, listingId, { note });
        case 'REQUEST_CHANGES':
          return requestOrgListingChanges(orgId, listingId, { note });
        case 'REJECT':
          return rejectOrgListing(orgId, listingId, { note });
        default:
          throw new Error('Unsupported listing action');
      }
    },
    onSuccess: async (_updated, { action }) => {
      if (!listingId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['broker', 'properties', orgId] }),
        queryClient.invalidateQueries({ queryKey: ['broker', 'properties', orgId, listingId, 'details'] }),
        queryClient.invalidateQueries({ queryKey: ['broker', 'properties', orgId, listingId, 'activity'] }),
        queryClient.invalidateQueries({ queryKey: ['broker', 'properties', orgId, listingId, 'recommendations'] }),
        queryClient.invalidateQueries({ queryKey: ['mission-control', 'overview', orgId] })
      ]);

      const label =
        action === 'REQUEST_APPROVAL'
          ? 'Approval requested'
          : action === 'APPROVE'
            ? 'Listing approved'
            : action === 'REQUEST_CHANGES'
              ? 'Changes requested'
              : 'Listing rejected';

      toast({ title: label });
      setPendingAction(null);
      setActionNote('');
    },
    onError: (error) => {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'Unexpected error',
        variant: 'destructive'
      });
    }
  });

  const detailsQuery = useQuery({
    queryKey: ['broker', 'properties', orgId, listingId, 'details'],
    queryFn: () => fetchOrgListingDetails(orgId, listingId ?? ''),
    enabled: Boolean(orgId && listingId),
    staleTime: 30_000
  });

  if (!orgId) {
    return <div className="text-sm text-slate-600">Select an organization to view listing inventory.</div>;
  }

  if (!listingId) {
    return <div className="text-sm text-slate-600">Missing listing id.</div>;
  }

  if (detailsQuery.isLoading) {
    return <PropertyDetailSkeleton />;
  }

  if (detailsQuery.error || !detailsQuery.data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="px-2">
          <Link to="/broker/properties">
            <ChevronLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <Card>
          <CardContent className="pt-6 text-sm text-rose-600">Unable to load property details.</CardContent>
        </Card>
      </div>
    );
  }

  const { listing, mlsDetails, areaMetrics, comparables } = detailsQuery.data;
  const photos = (mlsDetails?.photos ?? []).filter(Boolean);
  const cover = photos[0] ?? null;

  const addressLine = [listing.addressLine1, listing.city, listing.state, listing.postalCode].filter(Boolean).join(', ');
  const agentLabel = listing.agentProfile?.user
    ? `${listing.agentProfile.user.firstName ?? ''} ${listing.agentProfile.user.lastName ?? ''}`.trim() ||
      listing.agentProfile.user.email ||
      'Agent'
    : 'Unassigned';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-2">
            <Link to="/broker/properties">
              <ChevronLeft className="h-4 w-4" />
              Back to inventory
            </Link>
          </Button>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Property</p>
            <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">{listing.addressLine1}</h1>
            <p className="text-sm text-slate-600">{addressLine}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge variant={statusBadgeVariant(listing.status)}>{formatStatus(listing.status)}</Badge>
            {listing.mlsNumber ? <Badge variant="outline">MLS #{listing.mlsNumber}</Badge> : null}
            <span className="text-slate-400">•</span>
            <span>Agent: {agentLabel}</span>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white/25 px-5 py-4 text-right backdrop-blur-md dark:bg-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">List price</p>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">
            {listing.listPrice ? currencyFormatter.format(Number(listing.listPrice)) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {listing.bedrooms ?? '—'} bd • {listing.bathrooms ?? '—'} ba • {listing.squareFeet ? `${listing.squareFeet.toLocaleString()} sqft` : '—'}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => {
              emitAskHatchOpen({
                title: `Listing · ${listing.addressLine1}`,
                contextType: 'LISTING',
                contextId: listing.id,
                contextSnapshot: {
                  title: listing.addressLine1,
                  subtitle: addressLine,
                  href: `/broker/properties/${listing.id}`,
                  fields: [
                    { label: 'Status', value: formatStatus(listing.status) },
                    { label: 'Price', value: listing.listPrice ? currencyFormatter.format(Number(listing.listPrice)) : '—' },
                    { label: 'Agent', value: agentLabel }
                  ]
                }
              });
            }}
          >
            Ask Hatch
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-6">
          <PropertyGallery photos={photos} cover={cover} />

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const nextTab = parsePropertyDetailTab(value);
              const next = new URLSearchParams(searchParams);
              if (nextTab === 'details') {
                next.delete('tab');
              } else {
                next.set('tab', nextTab);
              }
              setSearchParams(next, { replace: true });
            }}
          >
            <TabsList className="flex flex-wrap justify-start">
              <TabsTrigger value="details">MLS details</TabsTrigger>
              <TabsTrigger value="area">Area metrics</TabsTrigger>
              <TabsTrigger value="comps">Comparables</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-6">
              <MlsDetailsTab listing={listing} details={mlsDetails} />
            </TabsContent>

            <TabsContent value="area" className="mt-6">
              <AreaMetricsTab metrics={areaMetrics} />
            </TabsContent>

            <TabsContent value="comps" className="mt-6">
              <ComparablesTab comps={comparables ?? []} />
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <DocumentsTab documents={listing.documents ?? []} />
            </TabsContent>

            <TabsContent value="activity" className="mt-6">
              <ActivityTab orgId={orgId} listingId={listingId} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <ApprovalWorkflowCard
            listing={listing}
            isBroker={isBroker}
            onRequestApproval={() => setPendingAction('REQUEST_APPROVAL')}
            onApprove={() => setPendingAction('APPROVE')}
            onRequestChanges={() => setPendingAction('REQUEST_CHANGES')}
            onReject={() => setPendingAction('REJECT')}
            busy={approvalMutation.isPending}
          />
          <RecommendationsWidget orgId={orgId} listingId={listingId} />
        </div>
      </div>

      <ApprovalDialog
        open={pendingAction !== null}
        action={pendingAction}
        note={actionNote}
        busy={approvalMutation.isPending}
        onNoteChange={setActionNote}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
            setActionNote('');
          }
        }}
        onConfirm={() => {
          if (!pendingAction) return;
          approvalMutation.mutate({
            action: pendingAction,
            note: actionNote.trim().length ? actionNote.trim() : undefined
          });
        }}
      />
    </div>
  );
}

function ApprovalWorkflowCard({
  listing,
  isBroker,
  onRequestApproval,
  onApprove,
  onRequestChanges,
  onReject,
  busy
}: {
  listing: OrgListingRecord;
  isBroker: boolean;
  onRequestApproval: () => void;
  onApprove: () => void;
  onRequestChanges: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const status = (listing.status ?? '').toUpperCase();
  const brokerApproved = Boolean(listing.brokerApproved);
  const approvalNeeded = status === 'PENDING_BROKER_APPROVAL' || (status === 'ACTIVE' && !brokerApproved) || status === 'DRAFT';

  if (!approvalNeeded) {
    return null;
  }

  const headline = brokerApproved ? 'Approved' : status === 'PENDING_BROKER_APPROVAL' ? 'Pending approval' : 'Not approved';
  const helper =
    status === 'PENDING_BROKER_APPROVAL'
      ? 'Broker decision required before this listing can go live.'
      : status === 'ACTIVE' && !brokerApproved
        ? 'This listing is active but missing broker approval.'
        : 'Submit this draft for broker review when ready.';

  return (
    <Card id="broker-approval">
      <CardHeader>
        <CardTitle className="text-base">Broker approval</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{headline}</p>
            <p className="text-xs text-slate-500">{helper}</p>
          </div>
          {brokerApproved ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-amber-600" />}
        </div>

        {status === 'PENDING_BROKER_APPROVAL' && isBroker ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onApprove} disabled={busy}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve
            </Button>
            <Button type="button" variant="outline" onClick={onRequestChanges} disabled={busy}>
              Request changes
            </Button>
            <Button type="button" variant="destructive" onClick={onReject} disabled={busy}>
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </div>
        ) : null}

        {status === 'DRAFT' && !isBroker ? (
          <Button type="button" variant="outline" onClick={onRequestApproval} disabled={busy}>
            Request broker approval
          </Button>
        ) : null}

        {status === 'ACTIVE' && !brokerApproved && isBroker ? (
          <Button type="button" onClick={onApprove} disabled={busy}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Mark approved
          </Button>
        ) : null}

        <p className="text-xs text-slate-500">Actions log into the Activity tab for auditing.</p>
      </CardContent>
    </Card>
  );
}

function ApprovalDialog({
  open,
  action,
  note,
  busy,
  onNoteChange,
  onOpenChange,
  onConfirm
}: {
  open: boolean;
  action: ListingApprovalAction | null;
  note: string;
  busy: boolean;
  onNoteChange: (next: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!action) {
    return null;
  }

  const title =
    action === 'REQUEST_APPROVAL'
      ? 'Request broker approval'
      : action === 'APPROVE'
        ? 'Approve listing'
        : action === 'REQUEST_CHANGES'
          ? 'Request changes'
          : 'Reject listing';

  const description =
    action === 'REQUEST_APPROVAL'
      ? 'This will move the listing into Pending broker approval.'
      : action === 'APPROVE'
        ? 'This will mark the listing approved and move it to Active.'
        : action === 'REQUEST_CHANGES'
          ? 'This will send the listing back to Draft so the agent can make updates.'
          : 'This will reject the listing and return it to Draft.';

  const confirmVariant =
    (action === 'REJECT' ? 'destructive' : action === 'REQUEST_CHANGES' ? 'outline' : 'default') as
      | 'default'
      | 'destructive'
      | 'outline';

  const confirmLabel =
    action === 'REQUEST_APPROVAL'
      ? 'Request approval'
      : action === 'APPROVE'
        ? 'Approve'
        : action === 'REQUEST_CHANGES'
          ? 'Request changes'
          : 'Reject';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {action !== 'REQUEST_APPROVAL' ? (
          <div className="space-y-2">
            <Label htmlFor="listing-approval-note">Optional note</Label>
            <Textarea
              id="listing-approval-note"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Add context for the activity log…"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PropertyGallery({ photos, cover }: { photos: string[]; cover: string | null }) {
  const placeholderImg =
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 800 420%22%3E%3Crect width=%22800%22 height=%22420%22 rx=%2224%22 fill=%22%23eef2f7%22/%3E%3Cpath d=%22M120 310h560L500 160 388 250 310 210z%22 fill=%22%23cbd5e1%22/%3E%3Ccircle cx=%22300%22 cy=%22170%22 r=%2218%22 fill=%22%23cbd5e1%22/%3E%3C/svg%3E';

  const resolvedCover = cover ?? placeholderImg;
  const showThumbs = photos.length > 1;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-white/10 backdrop-blur-md dark:bg-white/5">
        <img
          src={resolvedCover}
          alt=""
          className="h-64 w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const target = e.currentTarget;
            if (target.src !== placeholderImg) target.src = placeholderImg;
          }}
        />
      </div>

      {showThumbs ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.slice(0, 10).map((photo, idx) => (
            <div
              key={`${photo}-${idx}`}
              className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white/10"
            >
              <img
                src={photo}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src !== placeholderImg) target.src = placeholderImg;
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ImageIcon className="h-4 w-4" />
          <span>{photos.length === 0 ? 'No photos available' : `${photos.length} photo(s)`}</span>
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ documents }: { documents: OrgListingDocumentRecord[] }) {
  const docs = useMemo(() => documents.filter(Boolean), [documents]);
  if (docs.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-white/10 p-4 text-sm text-slate-600 backdrop-blur-md dark:bg-white/5">
        No documents attached to this listing yet.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white/10 p-4 text-sm backdrop-blur-md dark:bg-white/5"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{doc.orgFile?.name ?? 'Document'}</p>
              <p className="text-xs text-slate-500">{formatStatus(doc.type)}</p>
            </div>
            {doc.orgFile?.fileId ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/broker/documents/${doc.orgFile.fileId}`}>
                  <FileText className="h-4 w-4" />
                  View
                </Link>
              </Button>
            ) : (
              <span className="text-xs text-slate-500">No file available</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityTab({ orgId, listingId }: { orgId: string; listingId: string }) {
  const query = useQuery({
    queryKey: ['broker', 'properties', orgId, listingId, 'activity'],
    queryFn: () => fetchOrgListingActivity(orgId, listingId),
    enabled: Boolean(orgId && listingId),
    staleTime: 30_000
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={`activity-skel-${idx}`} className="h-14 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-white/10 p-4 text-sm text-rose-600 backdrop-blur-md dark:bg-white/5">
        Unable to load activity.
      </div>
    );
  }

  const events = (query.data ?? []) as ListingActivityEvent[];
  if (events.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-white/10 p-4 text-sm text-slate-600 backdrop-blur-md dark:bg-white/5">
        No activity yet.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.map((event) => {
          const actorLabel = formatActor(event.actor);
          const message = event.message?.trim() || humanizeEventType(event.type);
          return (
            <div key={event.id} className="flex items-start gap-3">
              <span className="mt-2 h-2 w-2 flex-none rounded-full bg-slate-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{message}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {actorLabel} · {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PropertyDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-10 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <Skeleton className="h-64 w-full rounded-[var(--radius-xl)]" />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <div className="lg:col-span-4">
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}

function formatStatus(status?: string | null) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

const statusBadgeVariant = (status: string) => {
  const normalized = (status ?? '').toLowerCase();
  if (normalized.includes('active')) return 'success' as const;
  if (normalized.includes('pending') || normalized.includes('approval')) return 'warning' as const;
  if (normalized.includes('expir')) return 'warning' as const;
  if (normalized.includes('withdraw')) return 'neutral' as const;
  return 'neutral' as const;
};

const eventLabelMap: Record<string, string> = {
  ORG_LISTING_CREATED: 'Listing created',
  ORG_LISTING_UPDATED: 'Listing updated',
  ORG_LISTING_STATUS_CHANGED: 'Status updated',
  ORG_LISTING_APPROVAL_REQUESTED: 'Broker approval requested',
  ORG_LISTING_APPROVED: 'Listing approved',
  ORG_LISTING_REJECTED: 'Listing rejected',
  ORG_LISTING_CHANGES_REQUESTED: 'Changes requested',
  ORG_FILE_UPLOADED: 'File uploaded'
};

function humanizeEventType(type: string) {
  const match = eventLabelMap[type];
  if (match) return match;
  const base = type.replace(/_/g, ' ').toLowerCase();
  return base.replace(/^\w/, (char) => char.toUpperCase());
}

function formatActor(actor: ListingActivityEvent['actor']) {
  if (!actor) return 'System';
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim();
  return name || actor.email || 'User';
}

function parsePropertyDetailTab(value: string | null): PropertyDetailTab {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return 'details';
  const allowed: PropertyDetailTab[] = ['details', 'area', 'comps', 'documents', 'activity'];
  return (allowed.includes(normalized as PropertyDetailTab) ? normalized : 'details') as PropertyDetailTab;
}
