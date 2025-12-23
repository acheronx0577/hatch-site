import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMissionControlOverview } from '@/lib/api/mission-control'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MissionControlActivityFeed } from '@/components/mission-control/mission-control-activity-feed'

const LiveActivityPage: React.FC = () => {
  const { activeOrgId } = useAuth()
  const { data, isFetching } = useQuery({
    queryKey: ['mission-control', 'overview', activeOrgId],
    queryFn: () => fetchMissionControlOverview(activeOrgId!),
    enabled: Boolean(activeOrgId),
    staleTime: 10_000
  })

  if (!activeOrgId) return <p className="text-sm text-muted-foreground">Select an organization.</p>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Live</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Live Activity</h1>
          <p className="text-sm text-slate-600">Who is active right now across listings, transactions, and documents.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {isFetching ? 'Updating…' : 'Last updated: just now'}
        </div>
      </div>

      {data ? (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Active users</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-4xl font-semibold tracking-tight text-slate-900">{data.liveActivity.activeUsers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Listings being viewed</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-4xl font-semibold tracking-tight text-slate-900">{data.liveActivity.listingViews}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Transactions being viewed</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-4xl font-semibold tracking-tight text-slate-900">{data.liveActivity.transactionViews}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <MissionControlActivityFeed orgId={activeOrgId} />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-medium">What we track</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">
                <ul className="list-disc space-y-1 pl-5">
                  <li>Lead created/moved</li>
                  <li>Listing status + broker approvals</li>
                  <li>Transaction stage changes</li>
                  <li>Compliance evaluations + resolutions</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">Loading live data…</CardContent>
        </Card>
      )}
    </div>
  )
}

export default LiveActivityPage
