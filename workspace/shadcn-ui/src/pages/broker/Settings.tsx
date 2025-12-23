import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { HatchLogo } from '@/components/HatchLogo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useUserRole } from '@/lib/auth/roles'
import { fetchAgentPortalConfig, updateAgentPortalConfig } from '@/lib/api/agent-portal'

type BrokerSettings = {
  brokerId: string
  brokerName: string
  brokerageName: string
  brokerageAddress: string
  brokeragePhone: string
  brokerageEmail: string
  logoUrl: string
  notes: string
}

const DEFAULT_SETTINGS: BrokerSettings = {
  brokerId: 'BRK-2048',
  brokerName: 'Devon User',
  brokerageName: 'Hatch Realty Partners',
  brokerageAddress: '123 Ocean Drive, Miami, FL 33139',
  brokeragePhone: '(305) 555-1234',
  brokerageEmail: 'brokers@hatch.test',
  logoUrl: '/hatch-logo.png',
  notes: 'Visible on broker-generated reports and client touchpoints.'
}

const DEFAULT_AGENT_ALLOWED_PATHS = ['/broker/crm', '/broker/contracts', '/broker/transactions'] as const

const AGENT_PORTAL_MODULES: Array<{ path: string; label: string; description: string }> = [
  { path: '/broker/crm', label: 'Leads & CRM', description: 'Contacts, leads, timelines, and tasks.' },
  { path: '/broker/contracts', label: 'Contracts', description: 'Contract templates and signing workflows.' },
  { path: '/broker/transactions', label: 'Transactions', description: 'Transaction pipeline and deal records.' },
  { path: '/broker/properties', label: 'Active Listings', description: 'Live listings and property records.' },
  { path: '/broker/draft-listings', label: 'Draft Listings', description: 'Draft and publish new listings.' },
  { path: '/broker/offer-intents', label: 'Offer Intents', description: 'Offers and negotiation tracking.' },
  { path: '/broker/opportunities', label: 'Opportunities', description: 'Opportunity pipeline view.' },
  { path: '/broker/financials', label: 'Financials', description: 'Commissions and earnings snapshots.' },
  { path: '/broker/analytics', label: 'Analytics', description: 'Performance dashboards and KPIs.' },
  { path: '/broker/live-activity', label: 'Live Activity', description: 'Live presence and activity feed.' },
  { path: '/broker/compliance', label: 'Risk Center', description: 'Risk scoring, compliance workflows, and audits.' },
  { path: '/broker/settings', label: 'Settings', description: 'Preferences and notifications.' }
]

export default function BrokerSettingsPage() {
  const { setUser, session, activeOrgId } = useAuth()
  const role = useUserRole()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<BrokerSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)

  const orgId = activeOrgId ?? (import.meta.env.VITE_ORG_ID || null)
  const canManageAgentPortal = (role === 'BROKER' || role === 'ADMIN') && !!orgId

  const agentPortalQuery = useQuery({
    queryKey: ['agent-portal-config', orgId],
    queryFn: () => fetchAgentPortalConfig(orgId as string),
    enabled: canManageAgentPortal,
    staleTime: 60_000
  })

  const [agentPortalAllowedPaths, setAgentPortalAllowedPaths] = useState<string[]>([...DEFAULT_AGENT_ALLOWED_PATHS])
  const [agentPortalLandingPath, setAgentPortalLandingPath] = useState<string>(DEFAULT_AGENT_ALLOWED_PATHS[0])
  const [agentPortalDirty, setAgentPortalDirty] = useState(false)

  React.useEffect(() => {
    if (!agentPortalQuery.data) return
    const nextAllowed = agentPortalQuery.data.allowedPaths?.length
      ? agentPortalQuery.data.allowedPaths
      : [...DEFAULT_AGENT_ALLOWED_PATHS]
    const nextLanding = agentPortalQuery.data.landingPath ?? nextAllowed[0] ?? DEFAULT_AGENT_ALLOWED_PATHS[0]
    setAgentPortalAllowedPaths(nextAllowed)
    setAgentPortalLandingPath(nextLanding)
    setAgentPortalDirty(false)
  }, [agentPortalQuery.data])

  React.useEffect(() => {
    if (agentPortalAllowedPaths.includes(agentPortalLandingPath)) return
    setAgentPortalLandingPath(agentPortalAllowedPaths[0] ?? DEFAULT_AGENT_ALLOWED_PATHS[0])
  }, [agentPortalAllowedPaths, agentPortalLandingPath])

  const moduleLabelByPath = useMemo(() => {
    const map = new Map<string, string>()
    AGENT_PORTAL_MODULES.forEach((module) => map.set(module.path, module.label))
    return map
  }, [])

  const enabledLandingOptions = useMemo(() => {
    const fallback = agentPortalAllowedPaths.length ? agentPortalAllowedPaths : [...DEFAULT_AGENT_ALLOWED_PATHS]
    return fallback.slice().sort((a, b) => a.localeCompare(b))
  }, [agentPortalAllowedPaths])

  const agentPortalSaveMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('missing_org_id')
      const allowedPaths = agentPortalAllowedPaths.length ? agentPortalAllowedPaths : [...DEFAULT_AGENT_ALLOWED_PATHS]
      const landingPath = allowedPaths.includes(agentPortalLandingPath) ? agentPortalLandingPath : allowedPaths[0]
      return updateAgentPortalConfig(orgId, { allowedPaths, landingPath })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agent-portal-config', orgId] })
      setAgentPortalDirty(false)
      toast({
        title: 'Agent portal updated',
        description: 'Invited agents will see the updated navigation immediately.'
      })
    },
    onError: (error) => {
      toast({
        title: 'Could not update agent portal',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive'
      })
    }
  })

  const headerGradient = useMemo(
    () =>
      'hatch-hero relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-r from-[#1F5FFF] via-[#3D86FF] to-[#00C6A2] text-white shadow-[0_30px_80px_rgba(31,95,255,0.35)]',
    []
  )

  const handleChange = (field: keyof BrokerSettings) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSettings((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleSave = () => {
    setSaving(true)
    // Update local session profile so the top-right name reflects immediately.
    const [first, ...rest] = settings.brokerName.trim().split(' ')
    const last = rest.join(' ').trim()
    if (session && setUser) {
      setUser({
        ...session,
        profile: {
          ...(session.profile ?? {}),
          first_name: first || settings.brokerName,
          last_name: last || ''
        }
      })
    }
    setTimeout(() => setSaving(false), 300)
  }

  const handleLogoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setSettings((prev) => ({ ...prev, logoUrl: objectUrl }))
  }

  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className={`${headerGradient} px-6 py-6 md:px-8 md:py-7 flex items-center justify-between`}>
          <div className="space-y-1 text-white drop-shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">Admin · Settings</p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">Brokerage Profile</h1>
            <p className="text-sm text-white/90">
              Keep your brokerage identity polished across reports, client portals, and automations.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 rounded-2xl border border-white/20 bg-white/15 px-4 py-3 backdrop-blur">
            <HatchLogo className="h-12" />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 space-y-5 hover:translate-y-0 hover:shadow-brand">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Identity</h2>
              <p className="text-sm text-slate-600">Who you are and how clients see you.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="brokerId">Broker ID</Label>
                <Input id="brokerId" value={settings.brokerId} onChange={handleChange('brokerId')} />
              </div>
              <div>
                <Label htmlFor="brokerName">Broker name</Label>
                <Input id="brokerName" value={settings.brokerName} onChange={handleChange('brokerName')} />
              </div>
              <div>
                <Label htmlFor="brokerageName">Brokerage name</Label>
                <Input id="brokerageName" value={settings.brokerageName} onChange={handleChange('brokerageName')} />
              </div>
              <div>
                <Label htmlFor="brokerageEmail">Brokerage email</Label>
                <Input id="brokerageEmail" value={settings.brokerageEmail} onChange={handleChange('brokerageEmail')} />
              </div>
              <div>
                <Label htmlFor="brokeragePhone">Brokerage phone</Label>
                <Input id="brokeragePhone" value={settings.brokeragePhone} onChange={handleChange('brokeragePhone')} />
              </div>
              <div>
                <Label htmlFor="brokerageAddress">Brokerage address</Label>
                <Input
                  id="brokerageAddress"
                  value={settings.brokerageAddress}
                  onChange={handleChange('brokerageAddress')}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Internal notes</Label>
              <p className="mt-1 text-xs text-slate-500">Internal-only. Not visible to agents.</p>
              <Textarea
                id="notes"
                value={settings.notes}
                onChange={handleChange('notes')}
                className="min-h-[90px]"
                placeholder="Use this for internal context on filings, licenses, or public-facing text."
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSettings(DEFAULT_SETTINGS)} disabled={saving}>
                Reset
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </Card>

          <section className="space-y-4">
            {canManageAgentPortal && (
              <Card className="p-5 space-y-4 hover:translate-y-0 hover:shadow-brand">
                <div>
                  <h3 className="font-semibold text-slate-900">Agent Portal</h3>
                  <p className="text-sm text-slate-500">
                    Control what invited agents can access and where they land after signing in.
                  </p>
                </div>

                <div className="space-y-3">
                  {agentPortalQuery.isLoading ? (
                    <div className="space-y-3 rounded-xl border border-[var(--glass-border)] bg-white/20 p-4 backdrop-blur">
                      <div className="hatch-shimmer h-3 w-40 rounded" />
                      <div className="hatch-shimmer h-3 w-56 rounded" />
                      <div className="hatch-shimmer h-3 w-48 rounded" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {AGENT_PORTAL_MODULES.map((module) => {
                        const checked = agentPortalAllowedPaths.includes(module.path)
                        const disableToggle = checked && agentPortalAllowedPaths.length <= 1
                        return (
                          <div
                            key={module.path}
                            className="flex items-start justify-between gap-4 rounded-xl border border-[var(--glass-border)] bg-white/25 px-4 py-3 backdrop-blur"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-900">{module.label}</p>
                              <p className="text-xs text-slate-500">{module.description}</p>
                              <p className="mt-1 text-[11px] font-mono text-slate-400">{module.path}</p>
                            </div>
                            <Switch
                              checked={checked}
                              disabled={disableToggle}
                              onCheckedChange={(next) => {
                                setAgentPortalAllowedPaths((prev) => {
                                  const has = prev.includes(module.path)
                                  if (has && !next) {
                                    if (prev.length <= 1) return prev
                                    return prev.filter((p) => p !== module.path)
                                  }
                                  if (!has && next) {
                                    return [...prev, module.path]
                                  }
                                  return prev
                                })
                                setAgentPortalDirty(true)
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Agent landing page</Label>
                  <Select
                    value={agentPortalLandingPath}
                    onValueChange={(value) => {
                      setAgentPortalLandingPath(value)
                      setAgentPortalDirty(true)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a landing page" />
                    </SelectTrigger>
                    <SelectContent>
                      {enabledLandingOptions.map((path) => (
                        <SelectItem key={path} value={path}>
                          {moduleLabelByPath.get(path) ?? path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={agentPortalSaveMutation.isPending}
                    onClick={() => {
                      setAgentPortalAllowedPaths([...DEFAULT_AGENT_ALLOWED_PATHS])
                      setAgentPortalLandingPath(DEFAULT_AGENT_ALLOWED_PATHS[0])
                      setAgentPortalDirty(true)
                    }}
                  >
                    Reset to default
                  </Button>
                  <Button
                    disabled={!agentPortalDirty || agentPortalSaveMutation.isPending}
                    onClick={() => agentPortalSaveMutation.mutate()}
                  >
                    {agentPortalSaveMutation.isPending ? 'Saving…' : 'Save agent portal'}
                  </Button>
                </div>
              </Card>
            )}

            <Card className="p-5 space-y-4 hover:translate-y-0 hover:shadow-brand">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">Branding</h3>
                  <p className="text-sm text-slate-500">Logo appears on client-facing reports and emails.</p>
                </div>
                <span className="text-xs font-semibold text-brand-blue-600 hover:underline cursor-pointer">
                  Hatch palette
                </span>
              </div>
              <div className="rounded-xl border border-[var(--glass-border)] bg-white/20 p-4 flex flex-col items-center gap-3 backdrop-blur">
                <div className="w-full h-32 rounded-lg bg-gradient-to-r from-sky-100/70 via-white/50 to-emerald-50/70 border border-[var(--glass-border)] flex items-center justify-center">
                  <img
                    src={settings.logoUrl || '/hatch-logo.png'}
                    alt="Brokerage logo"
                    className="h-16 object-contain drop-shadow-sm"
                    onError={(e) => {
                      if (settings.logoUrl) {
                        setSettings((prev) => ({ ...prev, logoUrl: '/hatch-logo.png' }))
                      }
                      e.currentTarget.src = '/hatch-logo.png'
                    }}
                  />
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Label htmlFor="logoUpload" className="cursor-pointer justify-center">
                    Upload new logo
                    <input
                      id="logoUpload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoSelect}
                    />
                  </Label>
                </Button>
              </div>
            </Card>

            <Card className="p-5 space-y-3 hover:translate-y-0 hover:shadow-brand">
              <h3 className="font-semibold text-slate-900">Compliance IDs</h3>
              <p className="text-sm text-slate-500">
                Keep license and association IDs current for disclosure on documents.
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>MLS ID</Label>
                    <Input placeholder="e.g., MIA-44321" />
                  </div>
                  <div>
                    <Label>State license</Label>
                    <Input placeholder="e.g., SL3456789" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tax ID / EIN</Label>
                    <Input placeholder="e.g., 12-3456789" />
                  </div>
                  <div>
                    <Label>Office code</Label>
                    <Input placeholder="e.g., HQ-MIA" />
                  </div>
                </div>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}
