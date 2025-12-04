import React, { useMemo, useState } from 'react'

import { HatchLogo } from '@/components/HatchLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'

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
  logoUrl: '/hatch logo.png',
  notes: 'Visible on broker-generated reports and client touchpoints.'
}

export default function BrokerSettingsPage() {
  const { setUser, session } = useAuth()
  const [settings, setSettings] = useState<BrokerSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)

  const headerGradient = useMemo(
    () =>
      'bg-gradient-to-r from-sky-500/90 via-cyan-400/80 to-emerald-400/80 backdrop-blur-lg border border-white/20 shadow-lg',
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className={`${headerGradient} rounded-3xl px-6 py-5 flex items-center justify-between`}>
          <div className="space-y-1 text-white drop-shadow-sm">
            <p className="text-sm uppercase tracking-[0.15em] text-white">Admin · Settings</p>
            <h1 className="text-2xl font-semibold text-white">Brokerage Profile</h1>
            <p className="text-sm text-white/90">
              Keep your brokerage identity polished across reports, client portals, and automations.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 bg-white rounded-2xl px-4 py-3 border border-white/60 shadow-lg">
            <HatchLogo className="h-12" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 rounded-2xl bg-white/70 backdrop-blur-md border border-slate-200 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Identity</h2>
              <p className="text-sm text-slate-500">Who you are and how clients see you.</p>
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
              <Button onClick={handleSave} disabled={saving} className="bg-sky-600 hover:bg-sky-700 text-white">
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">Branding</h3>
                  <p className="text-sm text-slate-500">Logo appears on client-facing reports and emails.</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                  Hatch palette
                </span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 flex flex-col items-center gap-3">
                <div className="w-full h-32 rounded-lg bg-gradient-to-r from-sky-100 via-slate-50 to-emerald-50 border border-slate-100 flex items-center justify-center">
                  <img
                    src={settings.logoUrl || '/hatch logo.png'}
                    alt="Brokerage logo"
                    className="h-16 object-contain drop-shadow-sm"
                    onError={(e) => {
                      if (settings.logoUrl) {
                        setSettings((prev) => ({ ...prev, logoUrl: '/hatch logo.png' }))
                      }
                      e.currentTarget.src = '/hatch logo.png'
                    }}
                  />
                </div>
                <Label
                  htmlFor="logoUpload"
                  className="w-full inline-flex justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Upload new logo
                  <input
                    id="logoUpload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoSelect}
                  />
                </Label>
              </div>
            </div>

            <div className="rounded-2xl bg-white/70 backdrop-blur-md border border-slate-200 shadow-sm p-5 space-y-3">
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
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
