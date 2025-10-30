import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  CreditCard,
  Calendar,
  Users,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Download
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { PRICING_PLANS } from '@/types/subscription'
import type { Firm, SubscriptionResponse } from '@/types/subscription'
import { toast } from '@/components/ui/use-toast'

export function SubscriptionDashboard() {
  const { user } = useAuth()
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubscriptionData = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      
      // Get firm membership
      const { data: membership, error: membershipError } = await supabase
        .from('firm_memberships')
        .select('firm_id, role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (membershipError) throw membershipError

      // Get firm and subscription data
      const { data: firm, error: firmError } = await supabase
        .from('firms')
        .select('*')
        .eq('id', membership.firm_id)
        .single()

      if (firmError) throw firmError

      // Mock subscription data for now
      const mockSubscription: SubscriptionResponse = {
        firm: firm as Firm,
        membership,
        current_plan: PRICING_PLANS.find(p => p.id === firm.tier) || PRICING_PLANS[0],
        usage: {
          seats_used: firm.seats_used || 0,
          seats_available: firm.seats_purchased || 0,
          storage_used_gb: 2.5,
          api_calls_used: 1250
        },
        billing: {
          next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          amount_due: PRICING_PLANS.find(p => p.id === firm.tier)?.price || 0,
          payment_method: {
            type: 'card',
            last4: '4242'
          }
        }
      }

      setSubscription(mockSubscription)
    } catch (err) {
      console.error('Error fetching subscription:', err)
      setError(err instanceof Error ? err.message : 'Failed to load subscription data')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      fetchSubscriptionData()
    }
  }, [fetchSubscriptionData, user])

  const handleUpgrade = () => {
    window.location.href = '/pricing'
  }

  const handleManageBilling = () => {
    // In a real app, this would redirect to Stripe Customer Portal
    toast({
      title: 'Billing portal',
      description: 'Redirecting you to manage payment details.',
    })
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            Error Loading Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-700 mb-4">{error}</p>
          <Button onClick={fetchSubscriptionData} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Subscription Found</CardTitle>
          <CardDescription>
            You don't have an active subscription yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleUpgrade}>
            View Pricing Plans
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { firm, current_plan, usage, billing } = subscription
  const seatUsagePercent = (usage.seats_used / usage.seats_available) * 100

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Billing & Subscription</h2>
        <Badge 
          variant={firm.subscription_status === 'active' ? 'default' : 'secondary'}
          className="text-sm"
        >
          {firm.subscription_status}
        </Badge>
      </div>

      {/* Current Plan Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{current_plan.name}</div>
            <p className="text-xs text-muted-foreground">
              ${current_plan.price}/month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Seats</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.seats_used}/{usage.seats_available}
            </div>
            <div className="mt-2">
              <Progress value={seatUsagePercent} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {usage.seats_available - usage.seats_used} seats available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Billing</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${billing.amount_due}
            </div>
            <p className="text-xs text-muted-foreground">
              Due {billing.next_billing_date.toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Details */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Overview</CardTitle>
          <CardDescription>
            Your current usage across all features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Team Members</span>
            <span className="text-sm text-muted-foreground">
              {usage.seats_used} of {usage.seats_available} used
            </span>
          </div>
          <Progress value={seatUsagePercent} className="h-2" />
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Storage Used</span>
            <span className="text-sm text-muted-foreground">
              {usage.storage_used_gb} GB of {usage.seats_available * (current_plan.limits?.storage_per_agent_gb || 5)} GB
            </span>
          </div>
          <Progress value={(usage.storage_used_gb / (usage.seats_available * (current_plan.limits?.storage_per_agent_gb || 5))) * 100} className="h-2" />
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">API Calls</span>
            <span className="text-sm text-muted-foreground">
              {usage.api_calls_used.toLocaleString()} of {current_plan.limits?.api_calls_per_month?.toLocaleString() || 'Unlimited'} this month
            </span>
          </div>
          {current_plan.limits?.api_calls_per_month && (
            <Progress value={(usage.api_calls_used / current_plan.limits.api_calls_per_month) * 100} className="h-2" />
          )}
        </CardContent>
      </Card>

      {/* Billing Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Upgrade Plan
            </CardTitle>
            <CardDescription>
              Get more seats and features for your growing team
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleUpgrade} className="w-full">
              View Pricing Plans
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2" />
              Manage Billing
            </CardTitle>
            <CardDescription>
              Update payment method, view invoices, and more
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={handleManageBilling} variant="outline" className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              Billing Portal
            </Button>
            <div className="text-xs text-muted-foreground">
              Payment method: •••• {billing.payment_method?.last4}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Billing Activity</CardTitle>
          <CardDescription>
            Your recent invoices and payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Mock recent invoices */}
            {[
              { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), amount: current_plan.price, status: 'paid' },
              { date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), amount: current_plan.price, status: 'paid' }
            ].map((invoice, index) => (
              <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium">Monthly Subscription</p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.date.toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium">${invoice.amount}</span>
                  <Badge variant="outline" className="text-green-600">
                    {invoice.status}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
