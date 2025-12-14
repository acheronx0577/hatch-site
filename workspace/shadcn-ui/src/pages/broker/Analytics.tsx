import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { fetchMissionControlOverview } from '@/lib/api/mission-control'
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Building2,
  Calendar,
  Target,
  Award,
  Loader2
} from 'lucide-react'

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

  const { data: overview, isLoading } = useQuery({
    queryKey: ['mission-control', 'overview', orgId],
    queryFn: () => fetchMissionControlOverview(orgId),
    enabled: !!orgId,
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

  if (!orgId) {
    return <div className="p-6 text-sm text-gray-600">Select an organization to view analytics.</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600">Track your performance and business metrics</p>
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
                <div className="text-2xl font-bold">{formatCurrency.format(totalRevenue)}</div>
                <p className="text-xs text-muted-foreground">
                  GCI + PM income
                </p>
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
                <div className="text-2xl font-bold">{formatNumber.format(closedDeals)}</div>
                <p className="text-xs text-muted-foreground">
                  Total transactions
                </p>
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
                <div className="text-2xl font-bold">{formatNumber.format(overview?.leadStats?.totalLeads ?? 0)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatNumber.format(overview?.leadStats?.newLeads ?? 0)} new this period
                </p>
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
                <div className="text-2xl font-bold">{conversionRate}%</div>
                <p className="text-xs text-muted-foreground">
                  Lead → Qualified
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts and detailed analytics would go here */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sales Performance</CardTitle>
            <CardDescription>Monthly sales trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-gray-500">
              Chart placeholder - Sales data visualization
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Sources</CardTitle>
            <CardDescription>Where your leads are coming from</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-gray-500">
              Chart placeholder - Lead sources breakdown
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}