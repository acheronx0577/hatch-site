import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { API_BASE_URL } from '@/lib/api/hatch'
import { isTrackingAllowed } from '@/lib/cookieConsent'
import { useCookieConsent } from '@/lib/hooks/useCookieConsent'

type PublicLandingPage = {
  id: string
  organizationId: string
  campaignId: string | null
  slug: string
  title: string
  description: string | null
  seoTitle: string | null
  seoDescription: string | null
  layout: Record<string, unknown> | null
  formSchema: Record<string, unknown> | null
  publishedAt: string | null
}

type FormField = {
  name: string
  label: string
  type: string
  required?: boolean
  placeholder?: string
}

type FormSchema = {
  submitLabel?: string
  fields?: FormField[]
  consent?: {
    email?: boolean
    sms?: boolean
    text?: string
  }
}

const FALLBACK_FORM_SCHEMA: FormSchema = {
  submitLabel: 'Request info',
  fields: [
    { name: 'name', label: 'Full name', type: 'text' },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Phone', type: 'tel' },
    { name: 'message', label: 'Message', type: 'textarea' }
  ],
  consent: {
    email: true,
    sms: false,
    text: 'I agree to receive communications. I can unsubscribe at any time.'
  }
}

const safeString = (value: unknown) => (typeof value === 'string' ? value : '')

function normalizeFormSchema(input: unknown): FormSchema {
  if (!input || typeof input !== 'object') return FALLBACK_FORM_SCHEMA
  const obj = input as Record<string, unknown>
  const fieldsRaw = Array.isArray(obj.fields) ? obj.fields : undefined
  const fields =
    fieldsRaw
      ?.map((f) => {
        if (!f || typeof f !== 'object') return null
        const field = f as Record<string, unknown>
        const name = safeString(field.name).trim()
        const label = safeString(field.label).trim()
        if (!name || !label) return null
        const type = safeString(field.type).trim() || 'text'
        const required = typeof field.required === 'boolean' ? field.required : false
        const placeholder = safeString(field.placeholder).trim() || undefined
        return { name, label, type, required, placeholder } satisfies FormField
      })
      .filter(Boolean) as FormField[] | undefined

  const consentRaw = obj.consent && typeof obj.consent === 'object' ? (obj.consent as Record<string, unknown>) : undefined

  return {
    submitLabel: safeString(obj.submitLabel).trim() || FALLBACK_FORM_SCHEMA.submitLabel,
    fields: fields && fields.length > 0 ? fields : FALLBACK_FORM_SCHEMA.fields,
    consent: {
      email: consentRaw ? Boolean(consentRaw.email) : FALLBACK_FORM_SCHEMA.consent?.email,
      sms: consentRaw ? Boolean(consentRaw.sms) : FALLBACK_FORM_SCHEMA.consent?.sms,
      text: safeString(consentRaw?.text).trim() || FALLBACK_FORM_SCHEMA.consent?.text
    }
  }
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(16)
    crypto.getRandomValues(buf)
    buf[6] = (buf[6] & 0x0f) | 0x40
    buf[8] = (buf[8] & 0x3f) | 0x80
    const hex = Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function getAnonymousId() {
  const key = 'hatch_anonymous_id'
  try {
    const existing = localStorage.getItem(key)
    if (existing && existing.length > 10) return existing
    const next = uuid()
    localStorage.setItem(key, next)
    return next
  } catch {
    return uuid()
  }
}

function buildPixelSrc(params: { orgId: string; campaignId?: string | null; landingPageId?: string | null }) {
  const qs = new URLSearchParams({ orgId: params.orgId })
  if (params.campaignId) qs.set('campaignId', params.campaignId)
  if (params.landingPageId) qs.set('landingPageId', params.landingPageId)
  return `${API_BASE_URL}lead-gen/pixel.js?${qs.toString()}`
}

function getAttributionParam(searchParams: URLSearchParams, key: string, altKey?: string) {
  const primary = searchParams.get(key)?.trim()
  if (primary) return primary
  const alt = altKey ? searchParams.get(altKey)?.trim() : null
  return alt || null
}

function resolveLayoutBlocks(layout: Record<string, unknown> | null) {
  if (!layout || typeof layout !== 'object') return []
  const blocks = (layout as { blocks?: unknown }).blocks
  return Array.isArray(blocks) ? blocks : []
}

export default function LeadGenLandingPage() {
  const { orgId, slug } = useParams()
  const [searchParams] = useSearchParams()
  const consent = useCookieConsent()
  const trackingAllowed = isTrackingAllowed(consent)

  const [page, setPage] = useState<PublicLandingPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const schema = useMemo(() => normalizeFormSchema(page?.formSchema ?? null), [page?.formSchema])
  const layoutBlocks = useMemo(() => resolveLayoutBlocks(page?.layout ?? null), [page?.layout])

  const [values, setValues] = useState<Record<string, string>>({})
  const [honeypot, setHoneypot] = useState('')
  const [consentEmail, setConsentEmail] = useState(false)
  const [consentSms, setConsentSms] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedLeadId, setSubmittedLeadId] = useState<string | null>(null)

  useEffect(() => {
    setValues({})
    setHoneypot('')
    setConsentEmail(false)
    setConsentSms(false)
    setIsSubmitting(false)
    setSubmitError(null)
    setSubmittedLeadId(null)
  }, [page?.id])

  useEffect(() => {
    if (!orgId || !slug) {
      setError('Missing landing page parameters')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setPage(null)

    const url = `${API_BASE_URL}lead-gen/public/organizations/${encodeURIComponent(orgId)}/landing-pages/${encodeURIComponent(slug)}`
    fetch(url, { credentials: 'omit' })
      .then(async (res) => {
        if (!res.ok) {
          const message = await res.text().catch(() => '')
          throw new Error(message || `Failed to load landing page (${res.status})`)
        }
        return res.json() as Promise<PublicLandingPage>
      })
      .then((data) => {
        if (cancelled) return
        setPage(data)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load landing page')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [orgId, slug])

  useEffect(() => {
    if (!page) return
    const title = page.seoTitle?.trim() || page.title
    document.title = title

    const description = page.seoDescription?.trim() || page.description?.trim() || ''
    const meta =
      (document.querySelector('meta[name="description"]') as HTMLMetaElement | null) ??
      (document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null)
    if (meta && description) {
      meta.content = description
    }
  }, [page])

  useEffect(() => {
    if (!page || !orgId) return
    const selector = 'script[data-hatch-leadgen-pixel="true"]'
    const existing = document.querySelector(selector)
    if (existing) existing.remove()

    if (!trackingAllowed) return

    const script = document.createElement('script')
    script.src = buildPixelSrc({ orgId, campaignId: page.campaignId, landingPageId: page.id })
    script.async = true
    script.defer = true
    script.setAttribute('data-hatch-leadgen-pixel', 'true')
    document.head.appendChild(script)

    return () => {
      script.remove()
    }
  }, [orgId, page, trackingAllowed])

  const heroBlock = useMemo(() => {
    const hero = layoutBlocks.find((b: any) => b && typeof b === 'object' && (b as any).type === 'hero') as any
    if (!hero) return null
    return {
      headline: safeString(hero.headline).trim() || page?.title || 'Request info',
      subheadline: safeString(hero.subheadline).trim() || page?.description || null,
      bullets: Array.isArray(hero.bullets) ? (hero.bullets as unknown[]).map((x) => safeString(x).trim()).filter(Boolean) : [],
      cta: safeString(hero.cta).trim() || schema.submitLabel || 'Submit'
    }
  }, [layoutBlocks, page?.description, page?.title, schema.submitLabel])

  const proofBlock = useMemo(() => {
    const proof = layoutBlocks.find((b: any) => b && typeof b === 'object' && (b as any).type === 'proof') as any
    if (!proof) return null
    const itemsRaw = Array.isArray(proof.items) ? proof.items : []
    const items = itemsRaw
      .map((item: any) => {
        if (!item || typeof item !== 'object') return null
        const label = safeString(item.label).trim()
        const value = safeString(item.value).trim()
        if (!label || !value) return null
        return { label, value }
      })
      .filter(Boolean) as Array<{ label: string; value: string }>
    return {
      headline: safeString(proof.headline).trim() || 'Why Hatch?',
      items
    }
  }, [layoutBlocks])

  const handleChange = (name: string, next: string) => {
    setValues((prev) => ({ ...prev, [name]: next }))
  }

  const requiredFields = useMemo(() => (schema.fields ?? []).filter((f) => f.required).map((f) => f.name), [schema.fields])

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false
    for (const name of requiredFields) {
      if (!values[name]?.trim()) return false
    }
    return true
  }, [isSubmitting, requiredFields, values])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!orgId || !slug) return
    if (!canSubmit) return

    setSubmitError(null)
    setIsSubmitting(true)

    try {
      const emailField = values.email?.trim()
      const phoneField = values.phone?.trim()
      if (!emailField && !phoneField) {
        throw new Error('Please provide an email or phone number.')
      }

      const utmSource = getAttributionParam(searchParams, 'utm_source', 'utmSource')
      const utmMedium = getAttributionParam(searchParams, 'utm_medium', 'utmMedium')
      const utmCampaign = getAttributionParam(searchParams, 'utm_campaign', 'utmCampaign')
      const gclid = getAttributionParam(searchParams, 'gclid')
      const fbclid = getAttributionParam(searchParams, 'fbclid')

      const knownFields = new Set([
        'listingId',
        'name',
        'email',
        'phone',
        'message',
        'desiredMoveIn',
        'budgetMin',
        'budgetMax',
        'bedrooms',
        'bathrooms'
      ])

      const metadata: Record<string, unknown> = {}
      for (const field of schema.fields ?? []) {
        const value = values[field.name]?.trim()
        if (!value) continue
        if (knownFields.has(field.name)) continue
        metadata[field.name] = value
      }

      const payload: Record<string, unknown> = {
        ...(values.listingId?.trim() ? { listingId: values.listingId.trim() } : {}),
        ...(values.name?.trim() ? { name: values.name.trim() } : {}),
        ...(values.email?.trim() ? { email: values.email.trim() } : {}),
        ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}),
        ...(values.message?.trim() ? { message: values.message.trim() } : {}),
        ...(values.desiredMoveIn?.trim() ? { desiredMoveIn: values.desiredMoveIn.trim() } : {}),
        ...(values.budgetMin?.trim() ? { budgetMin: Number(values.budgetMin.trim()) } : {}),
        ...(values.budgetMax?.trim() ? { budgetMax: Number(values.budgetMax.trim()) } : {}),
        ...(values.bedrooms?.trim() ? { bedrooms: Number(values.bedrooms.trim()) } : {}),
        ...(values.bathrooms?.trim() ? { bathrooms: Number(values.bathrooms.trim()) } : {}),
        ...(utmSource ? { utmSource } : {}),
        ...(utmMedium ? { utmMedium } : {}),
        ...(utmCampaign ? { utmCampaign } : {}),
        ...(gclid ? { gclid } : {}),
        ...(fbclid ? { fbclid } : {}),
        ...(trackingAllowed ? { anonymousId: getAnonymousId() } : {}),
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
        website: honeypot,
        marketingConsentEmail: consentEmail,
        marketingConsentSms: consentSms,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {})
      }

      const url = `${API_BASE_URL}lead-gen/public/organizations/${encodeURIComponent(orgId)}/landing-pages/${encodeURIComponent(slug)}/submit?mode=json`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const message = await response.text().catch(() => '')
        throw new Error(message || 'Submission failed')
      }

      const result = (await response.json()) as { ok?: boolean; leadId?: string }
      if (!result.ok) {
        throw new Error('Submission failed')
      }

      setSubmittedLeadId(result.leadId ?? 'created')

      if (trackingAllowed) {
        try {
          ;(window as any).HatchPixel?.track?.('leadgen.form_submitted', {
            orgId,
            landingPageId: page?.id ?? null,
            campaignId: page?.campaignId ?? null
          })
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Loading…</div>
        </div>
      </div>
    )
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-3xl space-y-4">
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Landing page not available</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{error || 'Landing page not found.'}</p>
              <p>If this is a draft page, publish it first in Hatch → Marketing → Lead Gen → Landing Pages.</p>
              <Button asChild size="sm" variant="outline">
                <a href="/broker/marketing/lead-gen/landing-pages">Open Lead Gen</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hatch</div>
              <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{heroBlock?.headline ?? page.title}</h1>
              {heroBlock?.subheadline ? <p className="text-base text-slate-600">{heroBlock.subheadline}</p> : null}
              {heroBlock?.bullets?.length ? (
                <ul className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  {heroBlock.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {proofBlock ? (
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">{proofBlock.headline}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  {proofBlock.items.length ? (
                    proofBlock.items.map((item) => (
                      <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{item.value}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">Add proof points in the landing page builder.</div>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-sm">
              We respect your privacy. Submissions are logged with attribution (UTMs/click IDs) and consent evidence for compliance.
            </div>
          </div>

          <div className="lg:col-span-2">
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">{schema.submitLabel ?? heroBlock?.cta ?? 'Get in touch'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {submittedLeadId ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    Thanks — your request is in. You can close this tab.
                  </div>
                ) : null}

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <input
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    className="hidden"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    name="website"
                  />

                  {(schema.fields ?? []).map((field) => {
                    const value = values[field.name] ?? ''
                    const label = (
                      <div className="flex items-center justify-between">
                        <span>{field.label}</span>
                        {field.required ? <span className="text-[11px] text-slate-500">Required</span> : null}
                      </div>
                    )

                    if (field.type === 'textarea') {
                      return (
                        <div key={field.name} className="grid gap-2">
                          <div className="text-xs font-medium">{label}</div>
                          <Textarea
                            value={value}
                            onChange={(e) => handleChange(field.name, e.target.value)}
                            placeholder={field.placeholder}
                            className="min-h-[120px]"
                          />
                        </div>
                      )
                    }

                    const inputType = ['email', 'tel', 'text', 'number', 'date'].includes(field.type) ? field.type : 'text'
                    return (
                      <div key={field.name} className="grid gap-2">
                        <div className="text-xs font-medium">{label}</div>
                        <Input
                          value={value}
                          onChange={(e) => handleChange(field.name, e.target.value)}
                          placeholder={field.placeholder}
                          type={inputType}
                        />
                      </div>
                    )
                  })}

                  {schema.consent?.email ? (
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <Checkbox checked={consentEmail} onCheckedChange={(checked) => setConsentEmail(Boolean(checked))} />
                      <div className="leading-relaxed">
                        <div className="font-medium text-slate-700">Email consent</div>
                        <div>{schema.consent?.text ?? FALLBACK_FORM_SCHEMA.consent?.text}</div>
                      </div>
                    </label>
                  ) : null}

                  {schema.consent?.sms ? (
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <Checkbox checked={consentSms} onCheckedChange={(checked) => setConsentSms(Boolean(checked))} />
                      <div className="leading-relaxed">
                        <div className="font-medium text-slate-700">SMS consent</div>
                        <div>{schema.consent?.text ?? FALLBACK_FORM_SCHEMA.consent?.text}</div>
                      </div>
                    </label>
                  ) : null}

                  {submitError ? <div className="text-xs text-destructive">{submitError}</div> : null}

                  <Button type="submit" disabled={!canSubmit} className="w-full">
                    {isSubmitting ? 'Submitting…' : schema.submitLabel ?? 'Submit'}
                  </Button>

                  <div className="text-center text-[11px] text-slate-500">
                    Powered by Hatch Lead Gen (server-side attribution + dedupe).
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
