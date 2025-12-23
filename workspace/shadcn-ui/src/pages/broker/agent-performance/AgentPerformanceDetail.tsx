import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgentPerformanceSnapshot, fetchAgentPerformanceDetail } from '@/lib/api/agentPerformance'
import { fetchMissionControlAgents, type MissionControlAgentRow } from '@/lib/api/mission-control'
import { useOrgId } from '@/lib/hooks/useOrgId'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const numberFormatter = new Intl.NumberFormat(undefined)
const currencyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const formatSeconds = (seconds: number) => {
  if (!seconds || seconds <= 0) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  if (hours < 24) return `${hours.toFixed(1)}h`
  const days = hours / 24
  return `${days.toFixed(1)}d`
}

function SparkBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  return (
    <div className="flex h-12 items-end gap-1">
      {values.map((value, idx) => (
        <div
          key={`${idx}-${value}`}
          className="w-2 flex-none rounded-sm bg-brand-blue-600/70"
          style={{ height: `${Math.max(10, Math.round((value / max) * 100))}%` }}
          aria-label={`Score ${value}`}
        />
      ))}
    </div>
  )
}

export const AgentPerformanceDetail: React.FC = () => {
  const orgId = useOrgId()
  const { agentProfileId } = useParams<{ agentProfileId: string }>()
  const [rows, setRows] = useState<AgentPerformanceSnapshot[]>([])
  const [agentRow, setAgentRow] = useState<MissionControlAgentRow | null>(null)
  const [allAgents, setAllAgents] = useState<MissionControlAgentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId || !agentProfileId) return
    setLoading(true)
    Promise.all([fetchAgentPerformanceDetail(orgId, agentProfileId), fetchMissionControlAgents(orgId)])
      .then(([history, agents]) => {
        const sorted = (history ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setRows(sorted)
        setAllAgents(agents ?? [])
        setAgentRow((agents ?? []).find((agent) => agent.agentProfileId === agentProfileId) ?? null)
      })
      .catch((err) => {
        console.error(err)
        setError('Failed to load performance history')
      })
      .finally(() => setLoading(false))
  }, [orgId, agentProfileId])

  const latest = rows[0] ?? null
  const trend = useMemo(() => rows.slice(0, 14).reverse(), [rows])

  const conversionRate = useMemo(() => {
    if (!latest || latest.leadsWorked <= 0) return null
    return latest.leadsConverted / latest.leadsWorked
  }, [latest])

  const firmRank = useMemo(() => {
    if (!agentProfileId || allAgents.length === 0) return null
    const ranked = allAgents
      .slice()
      .sort((a, b) => (b.closedTransactionVolume ?? 0) - (a.closedTransactionVolume ?? 0))
    const idx = ranked.findIndex((row) => row.agentProfileId === agentProfileId)
    if (idx < 0) return null
    return { rank: idx + 1, total: ranked.length, top: ranked.slice(0, 5) }
  }, [agentProfileId, allAgents])

  const buyerShare = agentRow?.buyerSharePercent ?? null
  const sellerShare = buyerShare !== null ? Math.max(0, 100 - buyerShare) : null

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link to="/broker/team" className="text-xs font-semibold text-brand-600 hover:underline">
            ← Back to roster
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {agentRow?.name ?? 'Agent performance'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {agentRow?.email ?? agentProfileId}
          </p>
          {agentRow?.buyerSellerOrientation ? (
            <Badge variant="secondary">
              {agentRow.buyerSellerOrientation.replace('_', '-').toLowerCase()}
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {agentProfileId ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/broker/compliance?agent=${encodeURIComponent(agentProfileId)}`}>Risk Center</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link to="/broker/agent-performance">All agents</Link>
          </Button>
        </div>
      </div>

      {error ? <div className="text-sm text-rose-600">{error}</div> : null}
      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Closed volume</CardTitle>
            <CardDescription className="text-xs">Sales + sides</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-semibold text-slate-900">
              {agentRow ? currencyFormatter.format(agentRow.closedTransactionVolume ?? 0) : '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              {agentRow ? `${numberFormatter.format(agentRow.closedTransactionCount ?? 0)} closed` : '—'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Buyer / seller mix</CardTitle>
            <CardDescription className="text-xs">Orientation + recent lead mix</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-semibold text-slate-900">
              {buyerShare !== null ? `Buyer ${buyerShare}%` : '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              {sellerShare !== null ? `Seller ${sellerShare}%` : '—'}
            </div>
            {agentRow ? (
              <div className="pt-2 text-xs text-muted-foreground">
                Buyer {agentRow.buyerLeadCount} · Seller {agentRow.sellerLeadCount} · Unknown {agentRow.unknownLeadCount}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Speed + conversion</CardTitle>
            <CardDescription className="text-xs">Response time & lead conversion</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-xs text-muted-foreground">Avg response</div>
              <div className="text-sm font-semibold text-slate-900">{latest ? formatSeconds(latest.avgResponseTimeSec) : '—'}</div>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-xs text-muted-foreground">Conversion</div>
              <div className="text-sm font-semibold text-slate-900">
                {conversionRate !== null ? `${(conversionRate * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
            {latest ? (
              <div className="text-xs text-muted-foreground">
                {latest.leadsConverted} converted · {latest.leadsWorked} worked
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Performance trend</CardTitle>
            <CardDescription className="text-xs">Last {trend.length} snapshots</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {trend.length > 0 ? (
              <>
                <SparkBars values={trend.map((row) => row.performanceScore)} />
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Perf {latest ? latest.performanceScore.toFixed(1) : '—'}</span>
                  <span>·</span>
                  <span>Resp {latest ? latest.responsivenessScore.toFixed(1) : '—'}</span>
                  <span>·</span>
                  <span>Activity {latest ? latest.activityScore.toFixed(1) : '—'}</span>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No performance snapshots yet.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Firm rank</CardTitle>
            <CardDescription className="text-xs">Ranked by closed volume</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {firmRank ? (
              <>
                <div className="text-2xl font-semibold text-slate-900">
                  #{firmRank.rank}{' '}
                  <span className="text-sm font-normal text-muted-foreground">of {firmRank.total}</span>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top 5</div>
                  <div className="space-y-1 text-sm">
                    {firmRank.top.map((row, idx) => (
                      <div key={row.agentProfileId} className="flex items-center justify-between gap-3">
                        <div className="min-w-0 truncate">
                          <span className="text-xs text-muted-foreground">#{idx + 1}</span>{' '}
                          <span className="font-medium text-slate-900">{row.name}</span>
                        </div>
                        <div className="shrink-0 text-xs font-semibold text-slate-700">
                          {currencyFormatter.format(row.closedTransactionVolume ?? 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Firm ranking unavailable.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {rows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Snapshot history</CardTitle>
            <CardDescription className="text-xs">Most recent scoring runs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {rows.slice(0, 20).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2 last:border-b-0">
                <div className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-semibold text-slate-900">{row.performanceScore.toFixed(1)}</span>
                  <span className="text-muted-foreground">Resp {row.responsivenessScore.toFixed(1)}</span>
                  <span className="text-muted-foreground">Leads {row.leadsWorked}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
