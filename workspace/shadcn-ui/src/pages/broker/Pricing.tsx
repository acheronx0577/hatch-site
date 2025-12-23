import React, { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Loader2, Megaphone, ShieldCheck, User, Users2 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { createCheckoutSession } from '@/lib/api/billing'
import { useAuth } from '@/contexts/AuthContext'

interface Plan {
  id: string
  name: string
  description: string
  product: 'agent_solo' | 'brokerage'
  seats: number
  badge?: string
  badgeTone?: 'primary' | 'secondary'
  monthlyPrice: number
  yearlyPrice: number
  features: string[]
}

const plans: Plan[] = [
  {
    id: 'agent-solo',
    name: 'Agent Solo',
    description: 'Ideal for individual agents who need the full marketing and listings toolkit.',
    product: 'agent_solo',
    seats: 1,
    monthlyPrice: 79,
    yearlyPrice: 828, // 12 months with a small discount
    features: [
      'Single seat with full feature access',
      'Automated email + SMS follow ups',
      'AI-powered listing copy + marketing assets',
      'MLS & portal sync for personal inventory',
      'Stripe-powered billing & receipts',
    ],
  },
  {
    id: 'brokerage-25',
    name: 'Brokerage 25',
    description: 'Launch your brokerage with bundled seats and shared brand collateral.',
    product: 'brokerage',
    seats: 25,
    monthlyPrice: 499,
    yearlyPrice: 5290,
    badge: 'Great for new teams',
    badgeTone: 'secondary',
    features: [
      '25 seats with role-based permissions',
      'Centralized listing + lead routing',
      'Seat usage analytics & pipeline dashboards',
      'Shared marketing templates & asset library',
      'Priority support for onboarding',
    ],
  },
  {
    id: 'brokerage-50',
    name: 'Brokerage 50',
    description: 'Scale-ready bundle with deeper analytics and seat governance.',
    product: 'brokerage',
    seats: 50,
    monthlyPrice: 899,
    yearlyPrice: 9490,
    badge: 'Most Popular',
    badgeTone: 'primary',
    features: [
      '50 seats included + billing overrides',
      'Advanced analytics & goal tracking',
      'Team document vault & compliance logs',
      'Seat management automation + webhooks',
      'Dedicated CSM & quarterly strategy reviews',
    ],
  },
  {
    id: 'brokerage-100',
    name: 'Brokerage 100',
    description: 'For high-volume firms that need enterprise governance and SLAs.',
    product: 'brokerage',
    seats: 100,
    monthlyPrice: 1499,
    yearlyPrice: 15890,
    features: [
      '100 bundled seats with policy controls',
      'Custom SSO + security reviews',
      'Multi-market MLS integrations',
      'White-glove migration + playbook workshops',
      'Priority SLA support & roadmap input',
    ],
  },
]

const contactSales = {
  heading: 'Need more than 100 seats?',
  body: 'Talk with our sales team for bespoke seat bundles, premium support SLAs, and migration assistance.',
  actionText: 'Contact Sales',
  actionHref: 'mailto:sales@hatch.dev?subject=Custom%20Hatch%20Plan',
}

export default function PricingPage() {
  const { activeOrgId, activeMembership } = useAuth()
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  const intervalCopy = useMemo(() => ({
    monthly: {
      label: '/month',
      helper: 'Billed monthly',
    },
    yearly: {
      label: '/year',
      helper: 'Billed annually (2 months free)',
    },
  }), [])

  const handleCheckout = async (plan: Plan) => {
    try {
      setLoadingPlan(plan.id)
      const { url } = await createCheckoutSession({
        product: plan.product,
        interval,
        seats: plan.seats,
        orgId: activeOrgId ?? undefined,
        orgName: activeMembership?.org?.name,
      })
      window.location.href = url
    } catch (error) {
      console.error('Checkout failed', error)
      const description = error instanceof Error ? error.message : 'Please try again in a few minutes.'
      toast({
        title: 'Unable to start checkout',
        description,
        variant: 'destructive',
      })
    } finally {
      setLoadingPlan(null)
    }
  }

  const renderPrice = (plan: Plan) => {
    const value = interval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice
    return `$${value.toLocaleString()}`
  }

  return (
    <div className="space-y-10">
      <div className="text-center space-y-4">
        <Badge variant="outline" className="gap-2 text-sm">
          <ShieldCheck className="h-4 w-4" /> Seat-based subscriptions with Stripe checkout
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Choose a plan that fits your brokerage</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Each bundle includes the full Hatch marketing + listings suite. Pick the seat count that matches your team,
          or talk with sales for a tailored rollout.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-white/10 p-1 backdrop-blur-md">
          <Button
            size="sm"
            variant={interval === 'monthly' ? 'default' : 'ghost'}
            onClick={() => setInterval('monthly')}
            className="rounded-full"
          >
            Monthly
          </Button>
          <Button
            size="sm"
            variant={interval === 'yearly' ? 'default' : 'ghost'}
            onClick={() => setInterval('yearly')}
            className="rounded-full"
          >
            Yearly
          </Button>
        </div>
        <p className="text-sm text-slate-500">{intervalCopy[interval].helper}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {plans.map((plan) => {
          const badgeTone = plan.badgeTone === 'secondary' ? 'secondary' : 'default'
          const isPopular = plan.badgeTone === 'primary'
          return (
            <Card
              key={plan.id}
              className={`relative h-full flex flex-col ${
                isPopular ? 'border-purple-500 ring-2 ring-purple-100 shadow-lg' : 'hover:shadow-lg transition-shadow'
              }`}
            >
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    {plan.product === 'agent_solo' ? <User className="h-4 w-4" /> : <Users2 className="h-4 w-4" />}
                    <span>{plan.seats} seat{plan.seats === 1 ? '' : 's'} included</span>
                  </div>
                  {plan.badge && (
                    <Badge variant={badgeTone}>{plan.badge}</Badge>
                  )}
                </div>
                <CardTitle className="text-2xl font-bold text-gray-900">{plan.name}</CardTitle>
                <CardDescription className="text-gray-600 leading-relaxed">
                  {plan.description}
                </CardDescription>
                <div>
                  <span className="text-4xl font-bold text-gray-900">{renderPrice(plan)}</span>
                  <span className="text-gray-500 ml-2">{intervalCopy[interval].label}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-6">
                <div className="space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3 text-sm text-gray-700">
                      <Check className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <Button
                  className="mt-auto"
                  onClick={() => handleCheckout(plan)}
                  disabled={loadingPlan === plan.id}
                >
                  {loadingPlan === plan.id ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
                    </span>
                  ) : (
                    'Select Plan'
                  )}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="max-w-5xl mx-auto border-dashed">
        <CardContent className="p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 text-blue-700">
            <Megaphone className="h-6 w-6" />
          </div>
          <div className="space-y-2 flex-1">
            <h2 className="text-2xl font-semibold text-gray-900">{contactSales.heading}</h2>
            <p className="text-gray-600">{contactSales.body}</p>
          </div>
          <Button asChild variant="outline" className="whitespace-nowrap">
            <a href={contactSales.actionHref}>{contactSales.actionText}</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
