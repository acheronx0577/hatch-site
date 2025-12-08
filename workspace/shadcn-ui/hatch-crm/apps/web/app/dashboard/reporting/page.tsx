'use client';

import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchOrgDailyAnalytics, type OrgDailyAnalyticsPoint } from '@/lib/api/reporting';
import { useOrgId } from '@/lib/hooks/useOrgId';

const formatCurrency = (value?: number) => {
  if (typeof value !== 'number') {
    return '-';
  }
  return `$${value.toLocaleString()}`;
};

const formatDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
};

export default function ReportingPage() {
  const orgId = useOrgId();
  const [data, setData] = useState<OrgDailyAnalyticsPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    fetchOrgDailyAnalytics(orgId)
      .then((rows) => setData(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        console.error('Failed to load reporting data', err);
        setError('Unable to load reporting data right now.');
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  if (!orgId) {
    return <p className="p-4 text-sm">Select an organization to view reporting.</p>;
  }

  if (loading) {
    return <p className="p-4 text-sm">Loading reporting data...</p>;
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="p-4 text-sm">No analytics snapshots have been generated yet.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Org Daily Analytics (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b text-left">
                <tr>
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">New Leads</th>
                  <th className="py-1 pr-2">Qualified</th>
                  <th className="py-1 pr-2">Closed Leads</th>
                  <th className="py-1 pr-2">Closed Deals</th>
                  <th className="py-1 pr-2">Closed Volume</th>
                  <th className="py-1 pr-2">Active Leases</th>
                  <th className="py-1 pr-2">PM Income</th>
                  <th className="py-1 pr-2">AI Actions (Completed/Total)</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-1 pr-2">{formatDate(row.date)}</td>
                    <td className="py-1 pr-2">{row.leadsNewCount}</td>
                    <td className="py-1 pr-2">{row.leadsQualifiedCount}</td>
                    <td className="py-1 pr-2">{row.leadsClosedCount}</td>
                    <td className="py-1 pr-2">{row.transactionsClosedCount}</td>
                    <td className="py-1 pr-2">{formatCurrency(row.transactionsClosedVolume)}</td>
                    <td className="py-1 pr-2">{row.activeLeasesCount}</td>
                    <td className="py-1 pr-2">{formatCurrency(row.pmIncomeEstimate)}</td>
                    <td className="py-1 pr-2">
                      {row.copilotActionsCompletedCount}/{row.copilotActionsSuggestedCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
