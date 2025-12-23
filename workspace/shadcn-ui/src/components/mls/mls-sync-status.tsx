import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { fetchMlsSyncRuns, triggerMlsSync, type MlsSyncRun, type MlsSyncStatus } from '@/lib/api/mls-sync';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const mlsSyncQueryKey = (orgId: string, limit: number) => ['mls-sync', orgId, limit] as const;

const statusStyles: Record<MlsSyncStatus, { label: string; className: string }> = {
  SUCCESS: { label: 'Healthy', className: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  FAILED: { label: 'Failed', className: 'bg-red-50 text-red-700 border border-red-100' },
  RUNNING: { label: 'Running', className: 'bg-blue-50 text-blue-700 border border-blue-100' },
  PENDING: { label: 'Pending', className: 'bg-slate-50 text-slate-600 border border-slate-100' }
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return 'Not run yet';
  return new Date(value).toLocaleString();
};

const formatCount = (value?: number) => new Intl.NumberFormat('en-US').format(value ?? 0);

export function MlsSyncSummaryCard({ orgId, className }: { orgId: string; className?: string }) {
  const {
    data,
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: mlsSyncQueryKey(orgId, 1),
    queryFn: () => fetchMlsSyncRuns(orgId, 1),
    staleTime: 60_000,
    enabled: Boolean(orgId)
  });

  const lastRun = data?.[0];
  const status = lastRun?.status ?? 'PENDING';
  const statusMeta = statusStyles[status];

  return (
    <Card className={cn('hatch-glass--info', className)}>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">MLS Sync</p>
            <p className="text-sm text-slate-500">
              {lastRun ? `Last run ${formatTimestamp(lastRun.finishedAt ?? lastRun.startedAt)}` : 'No sync runs yet'}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isRefetching || isLoading}>
            <RefreshCw className={cn('h-4 w-4', { 'animate-spin': isRefetching })} />
            <span className="sr-only">Refresh MLS sync status</span>
          </Button>
        </div>

        {error ? (
          <div className="text-sm text-red-600">
            Unable to load sync status. <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
          </div>
        ) : isLoading ? (
          <LoadingState message="Loading MLS sync status..." className="py-4 text-xs" />
        ) : lastRun ? (
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-sm font-medium">
              {status === 'SUCCESS' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : status === 'FAILED' ? <AlertCircle className="h-4 w-4 text-red-500" /> : <RefreshCw className="h-4 w-4 text-blue-500" />}
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', statusMeta.className)}>{statusMeta.label}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-slate-500">Fetched</p>
                <p className="text-base font-semibold text-slate-900">{formatCount(lastRun.totalFetched)}</p>
              </div>
              <div>
                <p className="text-slate-500">Indexed</p>
                <p className="text-base font-semibold text-slate-900">{formatCount(lastRun.totalUpserted)}</p>
              </div>
              <div>
                <p className="text-slate-500">Failed</p>
                <p className="text-base font-semibold text-slate-900">{formatCount(lastRun.totalFailed)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            MLS ingestion hasn’t been run yet. Configure your feed and start syncing listings.
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <p className="text-slate-500">Provider: {lastRun?.provider ?? 'Configured feed'}</p>
          <Link to="/broker/marketing#mls-sync" className="text-blue-600 hover:underline">
            View sync history
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function MlsSyncPanel({ orgId }: { orgId: string }) {
  const limit = 10;
  const {
    data,
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: mlsSyncQueryKey(orgId, limit),
    queryFn: () => fetchMlsSyncRuns(orgId, limit),
    enabled: Boolean(orgId),
    staleTime: 30_000
  });
  const runs = data ?? [];
  const lastRun = runs[0];
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { activeMembership, user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);

  const canTriggerSync = useMemo(() => {
    if (user?.globalRole === 'SUPER_ADMIN') return true;
    const role = activeMembership?.role ?? '';
    return role.toUpperCase().includes('BROKER');
  }, [activeMembership?.role, user?.globalRole]);

  const handleRunSync = async () => {
    if (!orgId) return;
    setIsRunning(true);
    try {
      await triggerMlsSync(orgId);
      toast({ title: 'MLS sync triggered', description: 'Listings are being refreshed in the background.' });
      await queryClient.invalidateQueries({ queryKey: ['mls-sync', orgId] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to trigger sync';
      toast({ title: 'MLS sync failed', description: message, variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card id="mls-sync" className="rounded-2xl border border-slate-100 shadow-sm">
      <CardHeader className="flex flex-col gap-2 space-y-0 border-b border-slate-100 px-5 py-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base font-semibold">MLS Sync History</CardTitle>
          <p className="text-sm text-slate-500">
            Monitor IDX ingestion and re-run the connector when you need to refresh your portal inventory.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching || isLoading}>
            <RefreshCw className={cn('mr-2 h-3.5 w-3.5', { 'animate-spin': isRefetching })} /> Refresh
          </Button>
          {canTriggerSync ? (
            <Button size="sm" onClick={handleRunSync} disabled={isRunning}>
              {isRunning ? 'Running…' : 'Run sync now'}
            </Button>
          ) : (
            <p className="text-xs text-slate-500">Only brokers can run an MLS sync.</p>)
          }
        </div>
      </CardHeader>
      <CardContent className="px-5 py-4">
        {error ? (
          <ErrorState message="Unable to load MLS sync runs." />
        ) : isLoading ? (
          <LoadingState message="Loading MLS sync runs..." />
        ) : runs.length === 0 ? (
          <div className="py-6 text-sm text-slate-500">No sync runs recorded yet.</div>
        ) : (
          <div className="space-y-4">
            {lastRun && (
              <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', statusStyles[lastRun.status].className)}>
                    {statusStyles[lastRun.status].label}
                  </span>
                  <span className="text-slate-500">Last run: {formatTimestamp(lastRun.finishedAt ?? lastRun.startedAt)}</span>
                  <span className="text-slate-500">Provider: {lastRun.provider}</span>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Metric label="Fetched" value={formatCount(lastRun.totalFetched)} />
                  <Metric label="Indexed" value={formatCount(lastRun.totalUpserted)} />
                  <Metric label="Failed" value={formatCount(lastRun.totalFailed)} isWarning={lastRun.totalFailed > 0} />
                </div>
                {lastRun.errorMessage && <p className="text-xs text-red-600">{lastRun.errorMessage}</p>}
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left">Run started</th>
                    <th className="px-3 py-2 text-left">Finished</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Fetched</th>
                    <th className="px-3 py-2 text-right">Indexed</th>
                    <th className="px-3 py-2 text-right">Failed</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-t border-slate-100 text-xs">
                      <td className="px-3 py-2 text-slate-600">{formatTimestamp(run.startedAt)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatTimestamp(run.finishedAt)}</td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', statusStyles[run.status].className)}>
                          {statusStyles[run.status].label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatCount(run.totalFetched)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatCount(run.totalUpserted)}</td>
                      <td className={cn('px-3 py-2 text-right font-semibold', run.totalFailed ? 'text-red-600' : 'text-slate-900')}>
                        {formatCount(run.totalFailed)}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {run.errorMessage ? <span>{run.errorMessage}</span> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const Metric = ({ label, value, isWarning }: { label: string; value: string; isWarning?: boolean }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    <p className={cn('text-2xl font-semibold', isWarning ? 'text-red-600' : 'text-slate-900')}>{value}</p>
  </div>
);
