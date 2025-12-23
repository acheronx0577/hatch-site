import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { fetchMissionControlAgents, fetchMissionControlOverview } from '@/lib/api/mission-control'
import { fetchAgentDailyAnalytics, fetchOrgDailyAnalytics } from '@/lib/api/reporting'
import { missionControlAgentsQueryKey } from '@/lib/queryKeys'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Building2, DollarSign, Loader2, TrendingUp, Users } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const DEFAULT_ORG_ID = import.meta.env.VITE_ORG_ID ?? 'org-hatch'

const formatCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

const formatNumber = new Intl.NumberFormat('en-US')

export default function Analytics() {
  const { activeOrgId } = useAuth()
  const orgId = activeOrgId ?? DEFAULT_ORG_ID
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'ytd'>('30d')
  const [agentProfileId, setAgentProfileId] = useState<string>('ALL')

  const { data: overview, isLoading } = useQuery({
    queryKey: ['mission-control', 'overview', orgId],
    queryFn: () => fetchMissionControlOverview(orgId),
    enabled: !!orgId,
    staleTime: 60_000
  })

  const { data: agents } = useQuery({
    queryKey: missionControlAgentsQueryKey(orgId),
    queryFn: () => fetchMissionControlAgents(orgId),
    enabled: Boolean(orgId),
    staleTime: 60_000
  })

  const { startDate, endDate, label: rangeLabel } = useMemo(() => {
    const end = new Date()
    let start: Date
    if (range === '7d') start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    else if (range === '90d') start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000)
    else if (range === 'ytd') start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
    else start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)

    const startIso = start.toISOString()
    const endIso = end.toISOString()
    return {
      startDate: startIso,
      endDate: endIso,
      label: `${new Date(startIso).toLocaleDateString()} – ${new Date(endIso).toLocaleDateString()}`
    }
  }, [range])

  const orgSeriesQuery = useQuery({
    queryKey: ['reporting', 'org-daily', orgId, startDate, endDate],
    queryFn: () => fetchOrgDailyAnalytics(orgId, { startDate, endDate }),
    enabled: Boolean(orgId),
    staleTime: 60_000
  })

  const agentSeriesQuery = useQuery({
    queryKey: ['reporting', 'agent-daily', orgId, agentProfileId, startDate, endDate],
    queryFn: () => fetchAgentDailyAnalytics(orgId, agentProfileId, { startDate, endDate }),
    enabled: Boolean(orgId) && agentProfileId !== 'ALL',
    staleTime: 60_000
  })

  const totalRevenue = useMemo(() => {
    if (!overview?.financialStats) return 0
    return (overview.financialStats.estimatedGci ?? 0) + (overview.financialStats.estimatedPmIncome ?? 0)
  }, [overview?.financialStats])

  const closedDeals = useMemo(() => {
    return overview?.transactions?.total ?? 0
  }, [overview?.transactions])

  const conversionRate = useMemo(() => {
    if (!overview?.leadStats) return 0
    const { totalLeads, qualifiedLeads } = overview.leadStats
    if (totalLeads === 0) return 0
    return ((qualifiedLeads / totalLeads) * 100).toFixed(1)
  }, [overview?.leadStats])

  const chartData = useMemo(() => {
    const org = orgSeriesQuery.data ?? []
    const agent = agentSeriesQuery.data ?? []
    const agentByDate = new Map(agent.map((row) => [row.date.slice(0, 10), row]))

    return org.map((row) => {
      const key = row.date.slice(0, 10)
      const agentRow = agentByDate.get(key)
      return {
        date: key,
        leadsNew: row.leadsNewCount,
        leadsQualified: row.leadsQualifiedCount,
        leadsClosed: row.leadsClosedCount,
        offersSubmitted: row.offerIntentsSubmittedCount,
        offersAccepted: row.offerIntentsAcceptedCount,
        transactionsClosed: row.transactionsClosedCount,
        transactionsVolume: row.transactionsClosedVolume,
        agentLeadsNew: agentRow?.leadsNewCount ?? null,
        agentLeadsQualified: agentRow?.leadsQualifiedCount ?? null,
        agentTransactionsClosed: agentRow?.transactionsClosedCount ?? null
      }
    })
  }, [agentSeriesQuery.data, orgSeriesQuery.data])

  const agentOptions = useMemo(() => {
    return (agents ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((agent) => ({ id: agent.agentProfileId, label: agent.name }))
  }, [agents])

  if (!orgId) {
    return <div className="text-sm text-gray-600">Select an organization to view analytics.</div>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Analytics</p>
          <h1 className="text-[30px] font-semibold tracking-tight text-slate-900">Performance</h1>
          <p className="text-sm text-slate-600">Track funnel health, transactions, and team throughput.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-white/10 p-1 backdrop-blur-md dark:bg-white/5">
            {(['7d', '30d', '90d', 'ytd'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-200 ${
                  range === key ? 'border border-white/20 bg-white/35 text-slate-900 shadow-brand' : 'text-slate-600 hover:bg-white/20 hover:text-slate-900 dark:text-ink-100/70 dark:hover:bg-white/10 dark:hover:text-ink-100'
                }`}
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={agentProfileId} onValueChange={setAgentProfileId}>
              <SelectTrigger className="h-9 w-[220px] rounded-full bg-white/10">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All agents</SelectItem>
                {agentOptions.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-slate-500">{rangeLabel}</span>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-4xl font-semibold tracking-tight text-slate-900">{formatCurrency.format(totalRevenue)}</div>
                <div className="mt-2 text-xs text-slate-500">Brokerage estimates</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed Deals</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-4xl font-semibold tracking-tight text-slate-900">{formatNumber.format(closedDeals)}</div>
                <div className="mt-2 text-xs text-slate-500">Total transactions</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-4xl font-semibold tracking-tight text-slate-900">{formatNumber.format(overview?.leadStats?.totalLeads ?? 0)}</div>
                <div className="mt-2 text-xs text-slate-500">{formatNumber.format(overview?.leadStats?.newLeads ?? 0)} new</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-4xl font-semibold tracking-tight text-slate-900">{conversionRate}%</div>
                <div className="mt-2 text-xs text-slate-500">Qualified / total leads</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Lead funnel trend"
          subtitle="New → Qualified → Closed (daily)"
          loading={orgSeriesQuery.isLoading}
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="leadsNew" stroke="#2563eb" strokeWidth={2} dot={false} name="Org new" />
              <Line type="monotone" dataKey="leadsQualified" stroke="#16a34a" strokeWidth={2} dot={false} name="Org qualified" />
              <Line type="monotone" dataKey="leadsClosed" stroke="#0f172a" strokeWidth={2} dot={false} name="Org closed" />
              {agentProfileId !== 'ALL' ? (
                <Line
                  type="monotone"
                  dataKey="agentLeadsNew"
                  stroke="#93c5fd"
                  strokeWidth={2}
                  dot={false}
                  name="Agent new"
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Transactions throughput"
          subtitle="Closed count + volume (daily)"
          loading={orgSeriesQuery.isLoading}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="transactionsClosed" fill="#0ea5e9" name="Closed (count)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="transactionsVolume" fill="#22c55e" name="Closed volume" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Offer intent activity"
          subtitle="Submitted vs accepted (daily)"
          loading={orgSeriesQuery.isLoading}
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="offersSubmitted"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                name="Submitted"
              />
              <Line
                type="monotone"
                dataKey="offersAccepted"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                name="Accepted"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>How we compute these charts</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Charts are derived from the reporting endpoints (`/organizations/:orgId/reporting/*`) and update as new
            leads, offers, and transactions are created or moved.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  loading,
  children
}: {
  title: string
  subtitle: string
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : children}
      </CardContent>
    </Card>
  )
}
