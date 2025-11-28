import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { fetchMissionControlOverview } from '@/lib/api/mission-control';
import {
  connectAccounting,
  fetchAccountingSyncStatus,
  syncRentalLeaseRecord,
  syncTransactionRecord,
  type AccountingSyncStatusResponse
} from '@/lib/api/accounting';

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch';
const ACCOUNTING_ENABLED = (import.meta.env.VITE_ACCOUNTING_ENABLED ?? 'false').toLowerCase() === 'true';
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');

type TransactionRecord = AccountingSyncStatusResponse['transactions'][number];
type LeaseRecord = AccountingSyncStatusResponse['rentalLeases'][number];
type SyncRecord = (TransactionRecord & { kind: 'transaction' }) | (LeaseRecord & { kind: 'lease' });
type FinancialStats = import('@/lib/api/mission-control').MissionControlOverview['financialStats'];

const formatNumber = new Intl.NumberFormat('en-US');
const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const accountingQueryKey = (orgId: string) => ['accounting', 'sync-status', orgId];
const overviewQueryKey = (orgId: string) => ['mission-control', 'overview', orgId];

export default function BrokerFinancials() {
  const { activeOrgId } = useAuth();
  const orgId = activeOrgId ?? DEFAULT_ORG_ID;
  if (!orgId) return <div className="p-6 text-sm text-slate-600">Select an organization to view financials.</div>;
  if (!ACCOUNTING_ENABLED) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Accounting sync is disabled in this environment.
      </div>
    );
  }
  return (
    <div className="space-y-6 p-6">
      <FinancialsView orgId={orgId} />
    </div>
  );
}

function FinancialsView({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const [realmInput, setRealmInput] = useState('');

  const { data: overview } = useQuery({
    queryKey: overviewQueryKey(orgId),
    queryFn: () => fetchMissionControlOverview(orgId),
    staleTime: 60_000
  });

  const {
    data: syncStatus,
    isLoading,
    error
  } = useQuery({
    queryKey: accountingQueryKey(orgId),
    queryFn: () => fetchAccountingSyncStatus(orgId),
    staleTime: 30_000
  });

  useEffect(() => {
    setRealmInput(syncStatus?.config?.realmId ?? '');
  }, [syncStatus?.config?.realmId]);

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: accountingQueryKey(orgId) });
    queryClient.invalidateQueries({ queryKey: overviewQueryKey(orgId) });
  };

  const connectMutation = useMutation({
    mutationFn: (realmId: string) => connectAccounting(orgId, { provider: 'QUICKBOOKS', realmId }),
    onSuccess: invalidateData
  });

  const syncTransactionMutation = useMutation({
    mutationFn: (transactionId: string) => syncTransactionRecord(orgId, transactionId),
    onSuccess: invalidateData
  });

  const syncLeaseMutation = useMutation({
    mutationFn: (leaseId: string) => syncRentalLeaseRecord(orgId, leaseId),
    onSuccess: invalidateData
  });

  const handleOAuthConnect = () => {
    const authorizeUrl = `${API_BASE}/integrations/quickbooks/authorize?orgId=${encodeURIComponent(orgId)}`;
    window.location.href = authorizeUrl;
  };

  const summaryMetrics = useMemo(() => mapFinancialStatsToCards(overview?.financialStats), [overview?.financialStats]);

  const transactionsQueue: SyncRecord[] = (syncStatus?.transactions ?? [])
    .filter((record) => record.syncStatus === 'PENDING' || record.syncStatus === 'FAILED')
    .map((record) => ({ kind: 'transaction', ...record }));
  const rentalQueue: SyncRecord[] = (syncStatus?.rentalLeases ?? [])
    .filter((record) => record.syncStatus === 'PENDING' || record.syncStatus === 'FAILED')
    .map((record) => ({ kind: 'lease', ...record }));

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm uppercase tracking-wide text-slate-500">Brokerage Financials</p>
        <h1 className="text-2xl font-semibold text-slate-900">Accounting & QuickBooks integration</h1>
        <p className="text-sm text-slate-500">
          Connect QuickBooks, monitor sync queues, and track portfolio financial metrics without leaving Hatch.
        </p>
      </header>

      {summaryMetrics.length > 0 ? <SummaryCards metrics={summaryMetrics} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <ConnectionCard
          realmInput={realmInput}
          setRealmInput={setRealmInput}
          config={syncStatus?.config}
          isLoading={isLoading}
          onConnect={() => connectMutation.mutate(realmInput)}
          onOAuthConnect={handleOAuthConnect}
          disabled={!realmInput || connectMutation.isPending}
          isSubmitting={connectMutation.isPending}
        />
        <StatusCallout
          title="Transaction sync health"
          synced={overview?.financialStats.transactionsSyncedCount ?? 0}
          failed={overview?.financialStats.transactionsSyncFailedCount ?? 0}
          total={syncStatus?.transactions?.length ?? 0}
        />
        <StatusCallout
          title="Rental sync health"
          synced={overview?.financialStats.rentalLeasesSyncedCount ?? 0}
          failed={overview?.financialStats.rentalLeasesSyncFailedCount ?? 0}
          total={syncStatus?.rentalLeases?.length ?? 0}
        />
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Unable to load accounting sync status. Please retry shortly.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SyncQueueTable
          title="Transaction sync queue"
          isLoading={isLoading}
          records={transactionsQueue}
          onRetry={(id) => syncTransactionMutation.mutate(id)}
          onRefresh={invalidateData}
        />
        <SyncQueueTable
          title="Rental lease sync queue"
          isLoading={isLoading}
          records={rentalQueue}
          onRetry={(id) => syncLeaseMutation.mutate(id)}
          onRefresh={invalidateData}
        />
      </div>
    </section>
  );
}

function SummaryCards({ metrics }: { metrics: MetricCard[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => (
        <Card key={metric.label} className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
          <p className="text-2xl font-semibold text-slate-900">{metric.value}</p>
          <p className="text-xs text-slate-500">{metric.caption}</p>
        </Card>
      ))}
    </div>
  );
}

type MetricCard = {
  label: string;
  value: string;
  caption: string;
};

function mapFinancialStatsToCards(stats?: FinancialStats): MetricCard[] {
  if (!stats) return [];
  return [
    {
      label: 'Transactions synced',
      value: formatNumber.format(stats.transactionsSyncedCount),
      caption: 'Pushed successfully to QuickBooks'
    },
    {
      label: 'Transactions failed',
      value: formatNumber.format(stats.transactionsSyncFailedCount),
      caption: 'Need broker review'
    },
    {
      label: 'Leases synced',
      value: formatNumber.format(stats.rentalLeasesSyncedCount),
      caption: 'Rental invoices generated'
    },
    {
      label: 'Leases failed',
      value: formatNumber.format(stats.rentalLeasesSyncFailedCount),
      caption: 'Retry once resolved'
    },
    {
      label: 'Estimated GCI',
      value: formatCurrency.format(stats.estimatedGci ?? 0),
      caption: 'Closed transaction volume'
    },
    {
      label: 'PM income',
      value: formatCurrency.format(stats.estimatedPmIncome ?? 0),
      caption: 'Active lease rent roll'
    }
  ];
}

function ConnectionCard({
  realmInput,
  setRealmInput,
  config,
  isLoading,
  onConnect,
  onOAuthConnect,
  disabled,
  isSubmitting
}: {
  realmInput: string;
  setRealmInput: (value: string) => void;
  config?: AccountingSyncStatusResponse['config'] | null;
  isLoading: boolean;
  onConnect: () => void;
  onOAuthConnect: () => void;
  disabled: boolean;
  isSubmitting: boolean;
}) {
  return (
    <Card className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">QuickBooks connection</p>
          <p className="text-sm text-slate-500">Realm + provider stored per org.</p>
        </div>
        <Badge className="bg-emerald-50 text-emerald-700">
          {config?.realmId ? 'Connected' : 'Not connected'}
        </Badge>
      </div>
      <div className="space-y-1 text-sm text-slate-600">
        <p>
          Provider: <span className="font-medium">{config?.provider ?? 'QUICKBOOKS'}</span>
        </p>
        <p>
          Realm ID: <span className="font-mono text-slate-900">{config?.realmId ?? '—'}</span>
        </p>
        <p className="text-xs text-slate-500">
          Connected at: {config?.connectedAt ? new Date(config.connectedAt).toLocaleString() : 'Not yet connected'}
        </p>
      </div>
      <div className="space-y-2">
        <Input
          value={realmInput}
          onChange={(event) => setRealmInput(event.target.value)}
          placeholder="QuickBooks realm id"
          disabled={isSubmitting || isLoading}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="default" className="w-full" disabled={disabled} onClick={onConnect}>
            {isSubmitting ? 'Saving...' : config?.realmId ? 'Update realm ID' : 'Save realm ID'}
          </Button>
          <Button variant="outline" className="w-full sm:w-40" onClick={onOAuthConnect} disabled={isSubmitting || isLoading}>
            Connect via OAuth
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatusCallout({
  title,
  synced,
  failed,
  total
}: {
  title: string;
  synced: number;
  failed: number;
  total: number;
}) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-3 flex items-end gap-4">
        <div>
          <p className="text-2xl font-semibold text-slate-900">{formatNumber.format(synced)}</p>
          <p className="text-xs text-slate-500">Synced</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-rose-600">{formatNumber.format(failed)}</p>
          <p className="text-xs text-slate-500">Failed</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900">{formatNumber.format(total)}</p>
          <p className="text-xs text-slate-500">Total records</p>
        </div>
      </div>
    </Card>
  );
}

function SyncQueueTable({
  title,
  records,
  isLoading,
  onRetry,
  onRefresh
}: {
  title: string;
  records: SyncRecord[];
  isLoading: boolean;
  onRetry: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">Focus on pending + failed items</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" onClick={onRefresh} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Record</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Last sync</th>
              <th className="px-4 py-3 text-left">Error</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading queue…
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Up to date — no pending syncs.
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const displayId =
                  record.kind === 'transaction'
                    ? record.transaction?.id ?? record.transactionId
                    : record.lease?.id ?? record.leaseId;
                const address =
                  record.kind === 'transaction'
                    ? record.transaction?.listing?.addressLine1
                    : record.lease?.unit?.property?.addressLine1;
                const retryId = record.kind === 'transaction' ? record.transactionId : record.leaseId;
                return (
                  <tr key={record.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{displayId}</p>
                      <p className="text-xs text-slate-500">{address ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={cn(
                          'bg-slate-100 text-slate-700',
                          record.syncStatus === 'FAILED' && 'bg-rose-50 text-rose-600'
                        )}
                      >
                        {record.syncStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {record.lastSyncAt ? new Date(record.lastSyncAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-rose-600">{record.errorMessage ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" onClick={() => retryId && onRetry(retryId)}>
                        Retry sync
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
