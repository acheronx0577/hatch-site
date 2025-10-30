import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import BrokerLayout from '@/components/layout/BrokerLayout'
import { useBroker } from '@/contexts/BrokerContext'
import {
  Users,
  BarChart3,
  TrendingUp,
  Award,
  Target,
  Calendar
} from 'lucide-react'

export default function TeamAdvanced() {
  const { agents } = useBroker()

  return (
    <BrokerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Advanced Team Analytics</h1>
          <p className="text-gray-600">Deep insights into team performance and metrics</p>
        </div>

        {/* Team performance metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Team Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$125,430</div>
              <p className="text-xs text-muted-foreground">
                +15% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{agents.filter(a => a.status === 'active').length}</div>
              <p className="text-xs text-muted-foreground">
                Out of {agents.length} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Performance</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">4.2/5</div>
              <p className="text-xs text-muted-foreground">
                Team rating average
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Goal Progress</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">78%</div>
              <p className="text-xs text-muted-foreground">
                Monthly target achieved
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed analytics charts would go here */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Team Performance Trends</CardTitle>
              <CardDescription>Monthly performance comparison</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-gray-500">
                Chart placeholder - Team performance over time
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Individual Agent Metrics</CardTitle>
              <CardDescription>Compare agent performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-gray-500">
                Chart placeholder - Agent comparison metrics
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </BrokerLayout>
  )
}
