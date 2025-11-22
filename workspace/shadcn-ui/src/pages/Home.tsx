import React, { useEffect, useState, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Navbar } from '@/components/layout/Navbar'
import { Search, MapPin, TrendingUp, Clock, Flame, CheckCircle, Shield, Star, Users, Home as HomeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Performance monitoring will be done in useLayoutEffect

type Persona = 'buyer' | 'seller' | 'pro'

const priceOptions = [
  { label: 'Any', value: 'any' },
  { label: '$250K+', value: '250000' },
  { label: '$500K+', value: '500000' },
  { label: '$1M+', value: '1000000' },
]

const propertyTypeOptions = [
  { label: 'House', value: 'house' },
  { label: 'Condo', value: 'condo' },
  { label: 'Townhome', value: 'townhome' },
  { label: 'Land', value: 'land' },
]

const howItWorksSteps = [
  {
    title: 'Search & save',
    description: 'Create a free account, save the homes you love, and filter by what matters most.',
  },
  {
    title: 'Match with a local expert',
    description: 'We connect you with a verified agent who specializes in your neighborhood.',
  },
  {
    title: 'Tour & close with confidence',
    description: 'Instant alerts, secure documents, and bank-level encryption every step of the way.',
  },
]

const consumerFeatures = [
  {
    icon: Search,
    title: 'Smart Search',
    description: 'School zones, commute times, and AI-recommended homes tailored to your wishlist.',
  },
  {
    icon: Flame,
    title: 'Instant Alerts',
    description: 'Be first to know when the right home hits the market or drops in price.',
  },
  {
    icon: Users,
    title: 'Verified Agents',
    description: 'Hand-matched experts with Florida market experience and proven track records.',
  },
  {
    icon: TrendingUp,
    title: 'Market Insights',
    description: 'Real-time pricing, neighborhood trends, and MLS data you can trust.',
  },
  {
    icon: Shield,
    title: 'Secure Offers',
    description: 'E-sign, audit trails, and compliance baked in so every offer is protected.',
  },
  {
    icon: HomeIcon,
    title: 'One Team',
    description: 'Lenders and title partners aligned from day one for a smooth close.',
  },
]

const testimonials = [
  {
    name: 'Sarah Johnson',
    city: 'Miami',
    closedDate: 'Closed July ’25',
    quote: 'Our agent understood every must-have. We found the right condo and closed below asking.',
    initials: 'SJ',
    rating: 5,
  },
  {
    name: 'Luis Martinez',
    city: 'Tampa',
    closedDate: 'Closed April ’25',
    quote: 'Listing alerts hit my phone before anyone else. We toured within hours and went under contract fast.',
    initials: 'LM',
    rating: 5,
  },
  {
    name: 'Emily Chen',
    city: 'Orlando',
    closedDate: 'Closed May ’25',
    quote: 'Transparent pricing data and a verified agent made selling our townhouse incredibly easy.',
    initials: 'EC',
    rating: 5,
  },
]

const professionalProofPoints = [
  'Pipeline automation, smart routing, and compliance in one command center.',
  'Lead conversion up 38% across teams that deploy Hatch playbooks.',
  'Bulk MLS import, audit-ready documents, and secure messaging keep every deal moving.',
]

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const [persona, setPersona] = useState<Persona>('buyer')
  const [searchLocation, setSearchLocation] = useState('')
  const [activePrice, setActivePrice] = useState(priceOptions[0].value)
  const [activePropertyTypes, setActivePropertyTypes] = useState<string[]>([])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const personaParam = params.get('persona')
    if (personaParam === 'buyer' || personaParam === 'seller' || personaParam === 'pro') {
      setPersona(personaParam)
    }
  }, [location.search])

  useEffect(() => {
    if (location.hash) {
      const element = document.getElementById(location.hash.replace('#', ''))
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [location.hash, location.pathname])

  const personaContent: Record<Persona, { subhead: string; primaryLabel: string; secondaryLabel: string }> = {
    buyer: {
      subhead: 'Search 25K+ listings, get instant alerts, and work with a verified local expert.',
      primaryLabel: 'Search homes',
      secondaryLabel: 'Get matched with an agent',
    },
    seller: {
      subhead: 'See what buyers love, price your home with confidence, and list with a top Florida agent.',
      primaryLabel: 'Request a pricing review',
      secondaryLabel: 'Talk to a listing expert',
    },
    pro: {
      subhead: 'Run your brokerage on Hatch with modern tools, automation, and real-time insights.',
      primaryLabel: 'Open Broker Dashboard',
      secondaryLabel: 'Book a demo',
    },
  }

  const heroContent = personaContent[persona]

  const handlePersonaChange = (nextPersona: Persona) => {
    setPersona(nextPersona)
    const params = new URLSearchParams(location.search)
    params.set('persona', nextPersona)
    const searchString = params.toString()
    const target = `${location.pathname}${searchString ? `?${searchString}` : ''}${location.hash || ''}`
    navigate(target, { replace: true })
  }

  const handlePrimaryCta = () => {
    if (persona === 'buyer') {
      navigate('/properties')
      return
    }
    if (persona === 'seller') {
      navigate('/broker/pricing', { state: { intent: 'seller' } })
      return
    }
    navigate('/broker/dashboard')
  }

  const handleSecondaryCta = () => {
    if (persona === 'buyer') {
      navigate('/match?intent=buyer')
      return
    }
    if (persona === 'seller') {
      navigate('/match?intent=seller')
      return
    }
    navigate('/broker/demo')
  }

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (searchLocation.trim()) {
      params.set('q', searchLocation.trim())
    }
    if (activePrice !== 'any') {
      params.set('price', activePrice)
    }
    if (activePropertyTypes.length) {
      params.set('types', activePropertyTypes.join(','))
    }
    const queryString = params.toString()
    navigate(`/properties${queryString ? `?${queryString}` : ''}`)
  }

  const togglePropertyType = (value: string) => {
    setActivePropertyTypes((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    )
  }

  const testimonialsTitle = 'Loved by Florida home buyers'

  // Intersection Observer for fade-in animations
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -100px 0px'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in-visible')
        }
      })
    }, observerOptions)

    // Observe all elements with fade-in class
    const elements = document.querySelectorAll('.fade-in')
    elements.forEach(el => observer.observe(el))

    return () => observer.disconnect()
  }, [])

  // Performance measurement on mount
  const mountTimeRef = useRef<number>(0)
  
  useLayoutEffect(() => {
    // Record mount time
    mountTimeRef.current = performance.now()
    
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark('home-component-mounted')
    }
  }, [])

  useLayoutEffect(() => {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark('home-component-rendered')
      
      // Calculate time from navigation start to component ready
      const totalLoadTime = performance.now()
      
      // Calculate time from mount to render
      const renderTime = performance.now() - mountTimeRef.current
      
      // Only log in development
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log(`⏱️ Home component total load time: ${totalLoadTime.toFixed(2)}ms`)
        // eslint-disable-next-line no-console
        console.log(`⚡ Home component render time: ${renderTime.toFixed(2)}ms`)
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-surface-background">
      <Navbar />

      <main>
        {/* Hero */}
        <section
          id="hero"
          className="relative overflow-hidden bg-gradient-to-b from-ink-50 via-ink-50 to-brand-green-100/40 fade-in"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-32 top-[-12rem] h-[28rem] w-[28rem] rounded-full bg-brand-gradient blur-3xl opacity-25" />
            <div className="absolute bottom-[-14rem] right-[-8rem] h-[32rem] w-[32rem] rounded-full bg-brand-gradient-soft blur-3xl opacity-60" />
          </div>

          <div className="container relative mx-auto max-w-6xl px-4 py-6xl">
            <div className="grid gap-12 lg:grid-cols-12 lg:items-start">
              <div className="space-y-8 lg:col-span-7">
                <div className="flex flex-wrap items-center gap-3 text-sm fade-in" id="agent-match">
                  <button
                    type="button"
                    className={cn(
                      'rounded-full px-4 py-2 font-semibold transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform',
                      persona === 'buyer'
                        ? 'bg-brand-blue-600 text-white shadow-brand hover:shadow-brand-md'
                        : 'bg-white/60 text-ink-500 hover:bg-white/80 hover:shadow-sm'
                    )}
                    onClick={() => handlePersonaChange('buyer')}
                    aria-pressed={persona === 'buyer'}
                  >
                    I’m buying
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded-full px-4 py-2 font-semibold transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform',
                      persona === 'seller'
                        ? 'bg-brand-blue-600 text-white shadow-brand hover:shadow-brand-md'
                        : 'bg-white/60 text-ink-500 hover:bg-white/80 hover:shadow-sm'
                    )}
                    onClick={() => handlePersonaChange('seller')}
                    aria-pressed={persona === 'seller'}
                  >
                    I’m selling
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded-full px-4 py-2 font-semibold transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform',
                      persona === 'pro'
                        ? 'bg-brand-blue-600 text-white shadow-brand hover:shadow-brand-md'
                        : 'bg-white/60 text-ink-500 hover:bg-white/80 hover:shadow-sm'
                    )}
                    onClick={() => handlePersonaChange('pro')}
                    aria-pressed={persona === 'pro'}
                  >
                    I’m a pro
                  </button>
                  <Button
                    variant="link"
                    className="ml-auto text-sm font-semibold text-brand-blue-600 hover:text-brand-blue-700 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform"
                    onClick={() => navigate('/#for-pros')}
                  >
                    For professionals →
                  </Button>
                </div>

                <div className="space-y-6 fade-in">
                  <h1 className="max-w-2xl text-ink-900">
                    Discover your next opportunity with{' '}
                    <span className="bg-gradient-to-r from-brand-blue-600 via-brand-blue-500 to-brand-green-500 bg-clip-text text-transparent">
                      Hatch
                    </span>
                    .
                  </h1>
                  <p className="max-w-xl text-lg text-ink-500">{heroContent.subhead}</p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center fade-in">
                  <Button size="lg" className="transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform" onClick={handlePrimaryCta}>
                    <Search className="h-5 w-5" />
                    {heroContent.primaryLabel}
                  </Button>
                  <Button size="lg" variant="outline" className="shadow-none transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform" onClick={handleSecondaryCta}>
                    {heroContent.secondaryLabel}
                  </Button>
                </div>
              </div>

              <aside
                id="market-snapshot"
                className="relative flex flex-col rounded-[28px] border border-[var(--glass-border)] bg-white/85 p-6 shadow-brand-lg backdrop-blur-xl lg:col-span-5 fade-in"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-brand-blue-600">Miami market snapshot</p>
                    <h3 className="text-xl font-semibold text-ink-800">This week at a glance</h3>
                  </div>
                  <Badge 
                    className="border-0 bg-brand-blue-600/15 text-brand-blue-700 hover:bg-brand-blue-600/25 hover:text-brand-blue-800 transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                    onClick={() => navigate('/market/miami')}
                  >
                    Updated today
                  </Badge>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-[var(--radius-md)] bg-brand-blue-600/8 p-4 fade-in transition-all duration-150 hover:scale-105 cursor-pointer" onClick={() => navigate('/market/miami')}>
                    <div className="text-xs uppercase tracking-[0.08em] text-ink-400">Median price</div>
                    <div className="mt-1 text-2xl font-semibold text-ink-900">$642K</div>
                    <div className="text-sm text-ink-500">+2.4% vs last month</div>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-brand-green-500/10 p-4 fade-in transition-all duration-150 hover:scale-105 cursor-pointer" onClick={() => navigate('/market/miami')}>
                    <div className="text-xs uppercase tracking-[0.08em] text-ink-400">Days on market</div>
                    <div className="mt-1 text-2xl font-semibold text-ink-900">27</div>
                    <div className="text-sm text-ink-500">Faster than statewide avg.</div>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-brand-blue-600/8 p-4 fade-in transition-all duration-150 hover:scale-105 cursor-pointer" onClick={() => navigate('/market/miami')}>
                    <div className="text-xs uppercase tracking-[0.08em] text-ink-400">New this week</div>
                    <div className="mt-1 text-2xl font-semibold text-ink-900">1,124</div>
                    <div className="text-sm text-ink-500">Fresh listings in Miami-Dade</div>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-brand-green-500/10 p-4 fade-in transition-all duration-150 hover:scale-105 cursor-pointer" onClick={() => navigate('/market/miami')}>
                    <div className="text-xs uppercase tracking-[0.08em] text-ink-400">Price drops</div>
                    <div className="mt-1 text-2xl font-semibold text-ink-900">312</div>
                    <div className="text-sm text-ink-500">Homes with recent reductions</div>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between text-sm text-ink-500">
                  <span>Source: South Florida MLS feed</span>
                  <Button
                    variant="link"
                    className="p-0 text-brand-blue-600 hover:text-brand-blue-700 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform"
                    onClick={() => navigate('/market/miami')}
                  >
                    See full Miami trends →
                  </Button>
                </div>
              </aside>
            </div>

            <form
              className="relative z-10 mt-10 rounded-[28px] border border-[var(--border-subtle)] bg-white/95 p-6 shadow-brand-md fade-in"
              onSubmit={handleSearchSubmit}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
                <div className="flex-1 space-y-2">
                  <label htmlFor="hero-location" className="text-sm font-semibold text-ink-700">
                    Location
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-blue-600" />
                    <input
                      id="hero-location"
                      name="location"
                      type="text"
                      placeholder="City, neighborhood, or school"
                      value={searchLocation}
                      onChange={(event) => setSearchLocation(event.target.value)}
                      className="w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-white px-10 py-3 text-base text-ink-700 shadow-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]"
                    />
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <span className="text-sm font-semibold text-ink-700">Price</span>
                  <div className="flex flex-wrap gap-2">
                    {priceOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setActivePrice(option.value)}
                        className={cn(
                          'rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform',
                          activePrice === option.value
                            ? 'border-transparent bg-brand-blue-600 text-white shadow-brand'
                            : 'border-[var(--border-subtle)] bg-white/70 text-ink-500 hover:bg-brand-blue-600/10 hover:text-brand-blue-700 hover:border-brand-blue-600'
                        )}
                        aria-pressed={activePrice === option.value}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <span className="text-sm font-semibold text-ink-700">Property type</span>
                  <div className="flex flex-wrap gap-2">
                    {propertyTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => togglePropertyType(option.value)}
                        className={cn(
                          'rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform',
                          activePropertyTypes.includes(option.value)
                            ? 'border-transparent bg-brand-green-500 text-white shadow-brand'
                            : 'border-[var(--border-subtle)] bg-white/70 text-ink-500 hover:bg-brand-green-500/10 hover:text-brand-green-700 hover:border-brand-green-500'
                        )}
                        aria-pressed={activePropertyTypes.includes(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-full lg:w-auto">
                  <Button size="lg" type="submit" className="w-full transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    <Search className="h-5 w-5" />
                    Search
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="bg-brand-green-100/50 py-5xl fade-in">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-blue-600">How Hatch works</p>
              <h2 className="mt-4 text-ink-900">Three steps to closing day</h2>
              <p className="mt-3 text-lg text-ink-600">No spam. Cancel anytime.</p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {howItWorksSteps.map((step, index) => (
                <Card
                  key={step.title}
                  className="group h-full border-transparent bg-white/90 shadow-brand-md transition-transform duration-200 ease-out hover:-translate-y-2 fade-in"
                >
                  <CardHeader className="p-6 pb-3">
                    <Badge className="mb-4 w-fit border-0 bg-brand-blue-600/15 text-brand-blue-700 transition-all duration-200 group-hover:scale-110 group-hover:bg-brand-blue-600/25">
                      Step {index + 1}
                    </Badge>
                    <CardTitle className="text-lg text-ink-800 transition-colors duration-200 group-hover:text-brand-blue-600">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 text-ink-600">{step.description}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Consumer feature grid */}
        <section id="why-hatch" className="py-5xl fade-in">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-blue-600">Why choose Hatch?</p>
              <h2 className="mt-4 text-ink-900">Built for Florida buyers and sellers</h2>
              <p className="mt-4 text-lg text-ink-500">
                Warm, human guidance meets data you can trust. Every tool is designed to get you from search to closing
                without surprises.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {consumerFeatures.map((feature, index) => (
                <Card
                  key={feature.title}
                  className="group h-full border border-[var(--border-subtle)] bg-white/95 shadow-brand-md transition-transform duration-200 ease-out hover:-translate-y-2 fade-in"
                >
                  <CardHeader className="p-8 pb-4">
                    <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue-600/12 text-brand-blue-600 transition-all duration-200 group-hover:scale-110 group-hover:bg-brand-blue-600/20">
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-lg text-ink-800 transition-colors duration-200 group-hover:text-brand-blue-600">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-8 pb-10 text-ink-500">{feature.description}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" className="bg-ink-75 py-5xl fade-in">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-blue-600">Social proof</p>
              <h2 className="mt-4 text-ink-900">{testimonialsTitle}</h2>
              <p className="mt-4 text-lg text-ink-500">
                Thousands of Floridians trust Hatch to guide their home journey with clarity and confidence.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <Card
                  key={testimonial.name}
                  className="flex h-full flex-col border border-transparent bg-white/95 shadow-brand transition-all duration-200 ease-out hover:-translate-y-2 fade-in"
                >
                  <CardHeader className="p-8 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue-600/12 text-brand-blue-600 font-semibold">
                        {testimonial.initials}
                      </div>
                      <div className="text-left">
                        <CardTitle className="text-lg text-ink-800">{testimonial.name}</CardTitle>
                        <p className="text-sm text-ink-500">
                          {testimonial.closedDate} · {testimonial.city}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-brand-green-500">
                      {Array.from({ length: testimonial.rating }).map((_, starIndex) => (
                        <Star 
                          key={starIndex} 
                          className="h-4 w-4 fill-current fade-in" 
                        />
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col px-8 pb-8">
                    <p className="text-base text-ink-600">“{testimonial.quote}”</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Professional band */}
        <section id="for-pros" className="bg-ink-900 py-5xl text-ink-50 fade-in">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
              <div className="space-y-6 lg:col-span-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-green-500 fade-in">For real estate professionals</p>
                <h2 className="text-3xl font-semibold text-ink-50 fade-in">Modern tools for brokerages, teams, and top agents</h2>
                <p className="text-lg text-ink-200 fade-in">
                  Discover your next opportunity with Hatch—built to supercharge pipeline management, team performance,
                  and compliance without the busywork.
                </p>
                <div className="flex flex-wrap gap-3 fade-in">
                  <Button size="lg" onClick={() => navigate('/broker/dashboard')} className="transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    <TrendingUp className="h-5 w-5" />
                    Open Broker Dashboard
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/30 bg-white/5 text-ink-50 hover:bg-white/10 hover:border-brand-blue-400 hover:text-brand-blue-300 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform backdrop-blur-sm"
                    onClick={() => navigate('/broker/demo')}
                  >
                    Book a demo
                  </Button>
                </div>
              </div>
              <div className="space-y-6 rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-brand-lg backdrop-blur-sm lg:col-span-6 fade-in">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[var(--radius-md)] bg-white/8 p-4 fade-in">
                    <div className="flex items-center gap-3 text-brand-green-400">
                      <TrendingUp className="h-5 w-5" />
                      <span className="text-sm font-semibold uppercase tracking-[0.08em]">Lead conversion</span>
                    </div>
                    <p className="mt-3 text-3xl font-semibold text-ink-50">↑ 38%</p>
                    <p className="text-sm text-ink-200">Teams running Hatch playbooks</p>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-white/8 p-4 fade-in">
                    <div className="flex items-center gap-3 text-brand-green-400">
                      <Clock className="h-5 w-5" />
                      <span className="text-sm font-semibold uppercase tracking-[0.08em]">Time saved</span>
                    </div>
                    <p className="mt-3 text-3xl font-semibold text-ink-50">12 hrs/week</p>
                    <p className="text-sm text-ink-200">Average per broker admin</p>
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-ink-200">
                  {professionalProofPoints.map((point, index) => (
                    <li key={point} className="flex items-start gap-2 fade-in">
                      <CheckCircle className="mt-0.5 h-4 w-4 text-brand-green-500" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative py-5xl fade-in">
          <div className="container mx-auto max-w-5xl px-4">
            <div className="relative overflow-hidden rounded-[32px] bg-brand-gradient px-8 py-12 text-ink-50 shadow-brand-lg">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25)_0,_transparent_60%)]" />
              <div className="relative z-10 flex flex-col items-center text-center">
                <h2 className="text-3xl font-semibold md:text-4xl fade-in">Ready to get started?</h2>
                <p className="mt-4 max-w-2xl text-lg text-ink-100 fade-in">
                  Search homes, save your favourites, or get matched with a verified Florida expert in minutes.
                </p>
                <div className="mt-8 flex w-full flex-col gap-4 sm:w-auto sm:flex-row fade-in">
                  <Button size="lg" variant="secondary" className="bg-ink-50 text-ink-900 hover:bg-white transition-all duration-150 hover:scale-105 active:scale-95 will-change-transform" onClick={() => navigate('/properties')}>
                    <Search className="h-5 w-5" />
                    Start searching
                  </Button>
                  <Button size="lg" className="transition-all duration-150 hover:scale-105 active:scale-95 will-change-transform" onClick={() => navigate('/match?intent=buyer')}>
                    <Users className="h-5 w-5" />
                    Get matched with an agent
                  </Button>
                </div>
                <Button
                  variant="link"
                  className="mt-4 text-sm text-ink-100 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform fade-in"
                  onClick={() => navigate('/#for-pros')}
                >
                  Are you a broker? Learn more →
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-ink-900 py-12 text-ink-300 fade-in">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="fade-in">
              <div className="flex items-center gap-2 text-ink-50">
                <HomeIcon className="h-6 w-6 text-brand-blue-500" />
                <span className="text-lg font-bold">Hatch</span>
              </div>
              <p className="mt-3 text-sm text-ink-400">
                Find your next Hatch. A premium real estate experience for buyers, sellers, and the teams who support them.
              </p>
            </div>
            <div className="fade-in">
              <h4 className="font-semibold text-ink-100">For Buyers</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Button
                    variant="link"
                    className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform"
                    onClick={() => navigate('/properties')}
                  >
                    Search properties
                  </Button>
                </li>
                <li>
                  <Button
                    variant="link"
                    className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform"
                    onClick={() => navigate('/match?intent=buyer')}
                  >
                    Get matched with an agent
                  </Button>
                </li>
                <li>
                  <Button variant="link" className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    Mortgage calculator
                  </Button>
                </li>
                <li>
                  <Button variant="link" className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    Neighborhood guide
                  </Button>
                </li>
              </ul>
            </div>
            <div className="fade-in">
              <h4 className="font-semibold text-ink-100">For Professionals</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Button
                    variant="link"
                    className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform"
                    onClick={() => navigate('/broker/dashboard')}
                  >
                    Broker dashboard
                  </Button>
                </li>
                <li>
                  <Button
                    variant="link"
                    className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform"
                    onClick={() => navigate('/broker/demo')}
                  >
                    Book a demo
                  </Button>
                </li>
                <li>
                  <Button variant="link" className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    API documentation
                  </Button>
                </li>
                <li>
                  <Button variant="link" className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    Support center
                  </Button>
                </li>
              </ul>
            </div>
            <div className="fade-in">
              <h4 className="font-semibold text-ink-100">Company</h4>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Button variant="link" className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    About us
                  </Button>
                </li>
                <li>
                  <Button variant="link" className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    Careers
                  </Button>
                </li>
                <li>
                  <Button variant="link" className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    Privacy policy
                  </Button>
                </li>
                <li>
                  <Button variant="link" className="p-0 text-ink-300 hover:text-ink-50 transition-all duration-200 hover:scale-105 active:scale-95 will-change-transform">
                    Terms of service
                  </Button>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-white/10 pt-6 text-center text-sm text-ink-400">
            <p>&copy; 2024 Hatch. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
