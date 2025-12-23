import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { ArrowLeft, BadgeCheck, CheckCircle, Clock, Globe, Shield, Sparkles, Users } from 'lucide-react'

import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const demoBookingSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name.'),
  email: z.string().trim().email('Enter a valid email.'),
  brokerageName: z.string().trim().min(2, 'Enter your brokerage name.'),
  agentCount: z.string().optional(),
  challenge: z.string().optional(),
  notes: z.string().optional(),
})

type DemoBookingValues = z.infer<typeof demoBookingSchema>

type DemoBookingAvailabilityResponse = {
  ok: boolean
  calendarTimeZone: string
  slotMinutes: number
  workStartHour: number
  workEndHour: number
  daysAhead: number
  days: Array<{ date: string; slots: string[] }>
}

type DemoBookingBookResponse = {
  ok: boolean
  event?: {
    id: string | null
    htmlLink: string | null
    hangoutLink: string | null
    start: string
    end: string
  }
}

const AGENT_COUNT_OPTIONS = [
  { value: 'solo', label: 'Just me (solo agent)' },
  { value: '2-10', label: '2-10 agents' },
  { value: '11-25', label: '11-25 agents' },
  { value: '26-50', label: '26-50 agents' },
  { value: '51-100', label: '51-100 agents' },
  { value: '100+', label: '100+ agents' },
  { value: '250+', label: '250+ agents' },
  { value: '500+', label: '500+ agents' },
  { value: '1000+', label: '1000+ agents' },
]

const CHALLENGE_OPTIONS = [
  { value: 'marketing-compliance', label: 'Keeping marketing compliant with FREC' },
  { value: 'inconsistent-materials', label: 'Agents creating inconsistent marketing materials' },
  { value: 'onboarding-training', label: 'Managing agent onboarding and training' },
  { value: 'transactions', label: 'Tracking transactions and deal flow' },
  { value: 'lead-routing', label: 'Lead routing and follow-up' },
  { value: 'quickbooks-sync', label: 'QuickBooks/accounting sync' },
  { value: 'all', label: 'All of the above' },
  { value: 'other', label: 'Something else' },
]

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
])

type UtmParams = {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
}

function getFirstName(fullName: string) {
  const trimmed = fullName.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0] ?? ''
}

function extractDomain(email: string) {
  const parts = email.trim().toLowerCase().split('@')
  if (parts.length !== 2) return ''
  return parts[1] ?? ''
}

function resolveUtm(search: string): UtmParams {
  const params = new URLSearchParams(search)
  const utmSource = params.get('utm_source') || params.get('utmSource') || undefined
  const utmMedium = params.get('utm_medium') || params.get('utmMedium') || undefined
  const utmCampaign = params.get('utm_campaign') || params.get('utmCampaign') || undefined
  const utmContent = params.get('utm_content') || params.get('utmContent') || undefined
  const utmTerm = params.get('utm_term') || params.get('utmTerm') || undefined

  return { utmSource, utmMedium, utmCampaign, utmContent, utmTerm }
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return undefined
  return new Date(year, month - 1, day)
}

export default function DemoBooking() {
  const navigate = useNavigate()
  const location = useLocation()

  const userTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Local time', [])
  const utm = useMemo(() => resolveUtm(location.search), [location.search])

  const [step, setStep] = useState<1 | 2 | 'confirmed'>(1)
  const [availability, setAvailability] = useState<DemoBookingAvailabilityResponse | null>(null)
  const [availabilityStatus, setAvailabilityStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null)
  const [isBooking, setIsBooking] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookedEvent, setBookedEvent] = useState<DemoBookingBookResponse['event'] | null>(null)

  const availabilityRef = useRef<HTMLDivElement | null>(null)

  const form = useForm<DemoBookingValues>({
    resolver: zodResolver(demoBookingSchema),
    defaultValues: {
      fullName: '',
      email: '',
      brokerageName: '',
      agentCount: '',
      challenge: '',
      notes: '',
    },
    mode: 'onTouched',
  })

  const fullName = form.watch('fullName')
  const email = form.watch('email')
  const brokerageName = form.watch('brokerageName')
  const agentCount = form.watch('agentCount')
  const challenge = form.watch('challenge')
  const notes = form.watch('notes')

  const firstName = useMemo(() => getFirstName(fullName), [fullName])
  const isPersonalEmail = useMemo(() => PERSONAL_EMAIL_DOMAINS.has(extractDomain(email)), [email])

  const slotsByLocalDateKey = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!availability?.days) return map

    for (const day of availability.days) {
      for (const iso of day.slots ?? []) {
        const date = new Date(iso)
        if (Number.isNaN(date.getTime())) continue
        const key = format(date, 'yyyy-MM-dd')
        const existing = map.get(key)
        if (existing) existing.push(iso)
        else map.set(key, [iso])
      }
    }

    for (const [, slots] of map) {
      slots.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    }

    return map
  }, [availability?.days])

  const availableDateKeys = useMemo(() => new Set(Array.from(slotsByLocalDateKey.keys())), [slotsByLocalDateKey])
  const selectedDateKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null
  const slotsForSelectedDate = selectedDateKey ? (slotsByLocalDateKey.get(selectedDateKey) ?? []) : []

  useEffect(() => {
    document.title = 'Book a demo · Hatch'
  }, [])

  useEffect(() => {
    if (step !== 2) return

    let cancelled = false
    setAvailabilityStatus('loading')
    setAvailabilityError(null)
    setBookingError(null)
    setBookedEvent(null)
    setSelectedSlotIso(null)

    const url = `/api/v1/demo-booking/availability?days=14`
    fetch(url, { credentials: 'omit' })
      .then(async (res) => {
        if (!res.ok) {
          const message = await res.text().catch(() => '')
          throw new Error(message || `Failed to load availability (${res.status})`)
        }
        return res.json() as Promise<DemoBookingAvailabilityResponse>
      })
      .then((data) => {
        if (cancelled) return
        setAvailability(data)
        setAvailabilityStatus('ready')

        const keys = Array.from(
          new Set(
            data.days.flatMap((d) =>
              (d.slots ?? [])
                .map((iso) => {
                  const date = new Date(iso)
                  return Number.isNaN(date.getTime()) ? null : format(date, 'yyyy-MM-dd')
                })
                .filter(Boolean)
            )
          )
        ).sort()
        if (!selectedDate && keys.length > 0) {
          setSelectedDate(dateFromKey(keys[0] as string))
        }
      })
      .catch((err) => {
        if (cancelled) return
        setAvailability(null)
        setAvailabilityStatus('error')
        setAvailabilityError(err instanceof Error ? err.message : 'Failed to load availability')
      })

    return () => {
      cancelled = true
    }
  }, [step])

  const handleStep1 = useCallback(
    (values: DemoBookingValues) => {
      setStep(2)
      try {
        ;(window as any).HatchPixel?.track?.('demo_booking.step1_completed', {
          emailDomain: extractDomain(values.email),
        })
      } catch {
        // ignore
      }
    },
    []
  )

  const handleConfirm = useCallback(async () => {
    if (!selectedSlotIso) {
      toast({
        title: 'Pick a time first',
        description: 'Select an available 30-minute slot, then click Confirm Demo.',
      })
      availabilityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    setIsBooking(true)
    setBookingError(null)
    setBookedEvent(null)

    try {
      const payload = {
        fullName: fullName.trim(),
        email: email.trim(),
        brokerageName: brokerageName.trim(),
        agentCount: agentCount?.trim() || undefined,
        challenge: challenge?.trim() || undefined,
        notes: notes?.trim() || undefined,
        start: selectedSlotIso,
        timeZone: userTimeZone,
        utmSource: utm.utmSource,
        utmMedium: utm.utmMedium,
        utmCampaign: utm.utmCampaign,
        utmContent: utm.utmContent,
        utmTerm: utm.utmTerm,
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
        website: '',
      }

      const res = await fetch('/api/v1/demo-booking/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const message = await res.text().catch(() => '')
        throw new Error(message || `Booking failed (${res.status})`)
      }

      const data = (await res.json()) as DemoBookingBookResponse
      if (!data.ok || !data.event) {
        throw new Error('Booking failed')
      }

      setBookedEvent(data.event)
      setStep('confirmed')

      try {
        ;(window as any).HatchPixel?.track?.('demo_booking.booked', {
          emailDomain: extractDomain(email),
          agentCount: agentCount || null,
          challenge: challenge || null,
        })
      } catch {
        // ignore
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Booking failed'
      setBookingError(message)
      toast({ title: 'Could not book that time', description: message })
    } finally {
      setIsBooking(false)
    }
  }, [
    agentCount,
    brokerageName,
    challenge,
    email,
    fullName,
    notes,
    selectedSlotIso,
    userTimeZone,
    utm.utmCampaign,
    utm.utmContent,
    utm.utmMedium,
    utm.utmSource,
    utm.utmTerm,
  ])

  if (step === 'confirmed') {
    const start = bookedEvent?.start ? new Date(bookedEvent.start) : null
    const end = bookedEvent?.end ? new Date(bookedEvent.end) : null
    const timeLabel =
      start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
        ? `${format(start, 'EEEE, MMM d')} · ${format(start, 'h:mm a')}–${format(end, 'h:mm a')}`
        : null

    return (
      <div className="min-h-screen bg-surface-background">
        <Navbar />
        <main className="relative overflow-hidden bg-gradient-to-b from-ink-50 via-ink-50 to-brand-green-100/40">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-32 top-[-12rem] h-[28rem] w-[28rem] rounded-full bg-brand-gradient blur-3xl opacity-25" />
            <div className="absolute bottom-[-14rem] right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-brand-gradient-soft blur-3xl opacity-60" />
          </div>

          <div className="container relative mx-auto max-w-4xl px-4 py-6xl">
            <div className="rounded-[28px] border border-[var(--glass-border)] bg-white/85 p-8 shadow-brand-lg backdrop-blur-xl">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-green-600/12 text-brand-green-700">
                  <BadgeCheck className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold text-ink-900">You’re all set{firstName ? `, ${firstName}` : ''}!</h1>
                  <p className="text-ink-600">
                    You’ll receive a calendar invite by email with a reschedule link.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 rounded-2xl border border-[var(--border-subtle)] bg-white/70 p-5 text-sm text-ink-700">
                {timeLabel ? (
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-4 w-4 text-brand-blue-600" />
                    <div>
                      <p className="font-medium text-ink-900">Appointment</p>
                      <p className="mt-1 text-ink-600">{timeLabel}</p>
                      <p className="mt-1 text-ink-600">Times shown in {userTimeZone}.</p>
                    </div>
                  </div>
                ) : null}

                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-4 w-4 text-brand-green-700" />
                  <div>
                    <p className="font-medium text-ink-900">What to expect</p>
                    <p className="mt-1 text-ink-600">
                      In 30 minutes, we’ll walk through compliance automation, marketing workflows, and agent
                      management tailored to your brokerage.
                    </p>
                  </div>
                </div>

                {(challenge || notes) && (
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 text-brand-green-700" />
                    <div>
                      <p className="font-medium text-ink-900">We’ll focus on</p>
                      <p className="mt-1 text-ink-600">
                        {challenge
                          ? CHALLENGE_OPTIONS.find((opt) => opt.value === challenge)?.label ?? challenge
                          : 'Your priorities'}
                        {notes ? ` — ${notes}` : null}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" onClick={() => navigate('/')}>
                  Back to home
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setStep(2)
                  }}
                >
                  Book another time
                </Button>
                {bookedEvent?.htmlLink ? (
                  <Button asChild size="lg" variant="ghost">
                    <a href={bookedEvent.htmlLink} target="_blank" rel="noreferrer">
                      View invite
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-background">
      <Navbar />

      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-ink-50 via-ink-50 to-brand-green-100/40">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-32 top-[-12rem] h-[28rem] w-[28rem] rounded-full bg-brand-gradient blur-3xl opacity-25" />
            <div className="absolute bottom-[-14rem] right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-brand-gradient-soft blur-3xl opacity-60" />
          </div>

          <div className="container relative mx-auto max-w-6xl px-4 py-6xl">
            <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
              <div className="space-y-8 lg:col-span-7">
                <div className="space-y-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-blue-600">Book a demo</p>
                  <h1 className="max-w-2xl text-ink-900">See Hatch in action</h1>
                  <p className="max-w-xl text-lg text-ink-600">
                    30 minutes to see how brokerages automate compliance, marketing, and agent management—all in one
                    command center.
                  </p>
                </div>

                <div className="grid gap-3 text-sm text-ink-700 sm:grid-cols-2">
                  <div className="flex items-start gap-2 rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 shadow-brand-sm backdrop-blur-xl">
                    <Shield className="mt-0.5 h-4 w-4 text-brand-green-700" />
                    <div>
                      <p className="font-medium text-ink-900">Built for Florida brokerages</p>
                      <p className="mt-1 text-ink-600">Designed around FREC-ready marketing workflows.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 shadow-brand-sm backdrop-blur-xl">
                    <Sparkles className="mt-0.5 h-4 w-4 text-brand-blue-600" />
                    <div>
                      <p className="font-medium text-ink-900">AI-powered compliance checks</p>
                      <p className="mt-1 text-ink-600">Catch issues before listings go live.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 shadow-brand-sm backdrop-blur-xl">
                    <Users className="mt-0.5 h-4 w-4 text-brand-blue-600" />
                    <div>
                      <p className="font-medium text-ink-900">Ops for teams + agents</p>
                      <p className="mt-1 text-ink-600">Permissions, routing, and accountability at scale.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 shadow-brand-sm backdrop-blur-xl">
                    <Clock className="mt-0.5 h-4 w-4 text-brand-green-700" />
                    <div>
                      <p className="font-medium text-ink-900">No pressure</p>
                      <p className="mt-1 text-ink-600">A conversation—bring your questions.</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--glass-border)] bg-white/55 p-6 text-sm text-ink-700 shadow-brand-sm backdrop-blur-xl">
                  <p className="font-medium text-ink-900">“Hatch cut our compliance review time by 80%.”</p>
                  <p className="mt-2 text-ink-600">— Brokerage Operations, Florida</p>
                </div>
              </div>

              <aside className="rounded-[28px] border border-[var(--glass-border)] bg-white/85 p-6 shadow-brand-lg backdrop-blur-xl lg:col-span-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-green-600">
                      {step === 1 ? 'Step 1 of 2' : 'Step 2 of 2'}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-ink-900">
                      {step === 1 ? 'Tell us a bit about you' : 'Pick a time'}
                    </p>
                  </div>
                  {step === 2 ? (
                    <Button
                      variant="ghost"
                      className="gap-2"
                      onClick={() => {
                        setStep(1)
                      }}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                  ) : null}
                </div>

                <div className="mt-6">
                  <Form {...form}>
                    {step === 1 ? (
                      <form className="space-y-5" onSubmit={form.handleSubmit(handleStep1)}>
                        <FormField
                          control={form.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full name</FormLabel>
                              <FormControl>
                                <Input placeholder="Your name" autoComplete="name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Work email</FormLabel>
                              <FormControl>
                                <Input placeholder="you@yourbrokerage.com" autoComplete="email" {...field} />
                              </FormControl>
                              <FormMessage />
                              {isPersonalEmail ? (
                                <p className="text-xs text-amber-700">
                                  Prefer a work email if you have one—we tailor the demo to your brokerage.
                                </p>
                              ) : null}
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="brokerageName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Brokerage name</FormLabel>
                              <FormControl>
                                <Input placeholder="Your brokerage name" autoComplete="organization" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button size="lg" type="submit" className="w-full">
                          Next: Pick a Time
                        </Button>

                        <p className="text-xs text-ink-600">
                          No pressure, no obligation—just a quick look at whether Hatch fits your brokerage.
                        </p>
                      </form>
                    ) : (
                      <div className="space-y-6">
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="agentCount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Number of agents</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select team size" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {AGENT_COUNT_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="challenge"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Biggest challenge right now (optional)</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select one" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {CHALLENGE_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Anything specific you’d like us to cover? (optional)</FormLabel>
                                <FormControl>
                                  <Textarea rows={3} placeholder="Optional—tell us what matters most to you" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <p className="font-medium text-ink-900">Availability</p>
                            <div className="flex items-center gap-2 text-ink-600">
                              <Globe className="h-4 w-4" />
                              <span>Times shown in {userTimeZone}</span>
                            </div>
                          </div>

                          <div ref={availabilityRef} />

                          {availabilityStatus === 'loading' ? (
                            <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 text-sm text-ink-700 shadow-brand-sm backdrop-blur-xl">
                              Loading available times…
                            </div>
                          ) : null}

                          {availabilityStatus === 'error' ? (
                            <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 text-sm text-ink-700 shadow-brand-sm backdrop-blur-xl">
                              <p className="font-medium text-ink-900">Scheduler unavailable</p>
                              <p className="mt-1 text-ink-600">{availabilityError ?? 'Failed to load availability.'}</p>
                              <p className="mt-3 text-ink-600">
                                If you’re seeing this in production, the Google Calendar booking service likely isn’t
                                configured.
                              </p>
                            </div>
                          ) : null}

                          {availabilityStatus === 'ready' && availability?.ok ? (
                            <div className="grid gap-4 rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 shadow-brand-sm backdrop-blur-xl sm:grid-cols-2">
                              <div className="rounded-2xl border border-[var(--glass-border)] bg-white/55 p-3">
                                <Calendar
                                  mode="single"
                                  selected={selectedDate}
                                  onSelect={(date) => {
                                    setSelectedDate(date ?? undefined)
                                    setSelectedSlotIso(null)
                                  }}
                                  disabled={(date) => !availableDateKeys.has(format(date, 'yyyy-MM-dd'))}
                                />
                              </div>

                              <div className="flex flex-col">
                                <p className="mb-2 text-sm font-medium text-ink-900">
                                  {selectedDateKey ? format(selectedDate as Date, 'EEEE, MMM d') : 'Select a date'}
                                </p>

                                <div className="grid grid-cols-2 gap-2">
                                  {slotsForSelectedDate.length === 0 ? (
                                    <div className="col-span-2 rounded-xl border border-[var(--glass-border)] bg-white/55 p-3 text-sm text-ink-700">
                                      No times available for this date.
                                    </div>
                                  ) : (
                                    slotsForSelectedDate.map((iso) => {
                                      const date = new Date(iso)
                                      const label = Number.isNaN(date.getTime()) ? iso : format(date, 'h:mm a')
                                      const selected = selectedSlotIso === iso
                                      return (
                                        <button
                                          key={iso}
                                          type="button"
                                          className={cn(
                                            'rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                                            'border-[var(--glass-border)] bg-white/55 hover:bg-white/75',
                                            selected ? 'border-brand-blue-600/40 bg-brand-blue-600/10' : null
                                          )}
                                          onClick={() => setSelectedSlotIso(iso)}
                                        >
                                          <span className="font-medium text-ink-900">{label}</span>
                                        </button>
                                      )
                                    })
                                  )}
                                </div>

                                <div className="mt-3 rounded-xl border border-[var(--glass-border)] bg-white/45 p-3 text-sm text-ink-700">
                                  <div className="flex items-start gap-2">
                                    <CheckCircle className="mt-0.5 h-4 w-4 text-brand-green-700" />
                                    <div>
                                      <p className="font-medium text-ink-900">30-minute demo</p>
                                      <p className="mt-1 text-ink-600">
                                        Need to reschedule? Use the link in your calendar invite.
                                      </p>
                                      {availability?.calendarTimeZone && availability.calendarTimeZone !== userTimeZone ? (
                                        <p className="mt-2 text-ink-600">
                                          Hatch team calendar is in {availability.calendarTimeZone}.
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {bookingError ? (
                            <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 text-sm text-ink-700 shadow-brand-sm backdrop-blur-xl">
                              <p className="font-medium text-ink-900">Could not book</p>
                              <p className="mt-1 text-ink-600">{bookingError}</p>
                            </div>
                          ) : null}

                          <Button size="lg" className="w-full" disabled={isBooking} onClick={handleConfirm}>
                            {isBooking ? 'Confirming…' : 'Confirm Demo'}
                          </Button>
                        </div>

                        <div className="rounded-2xl border border-[var(--glass-border)] bg-white/55 p-4 text-sm text-ink-700 shadow-brand-sm backdrop-blur-xl">
                          <p className="font-medium text-ink-900">Your details</p>
                          <div className="mt-2 space-y-1 text-ink-600">
                            <p>{fullName || '—'}</p>
                            <p>{email || '—'}</p>
                            <p>{brokerageName || '—'}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </Form>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
