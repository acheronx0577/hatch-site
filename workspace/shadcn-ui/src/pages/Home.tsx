import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useNavigate } from 'react-router-dom'
import { Navbar } from '@/components/layout/Navbar'
import { useAuth } from '@/contexts/AuthContext'
import { resolveUserIdentity } from '@/lib/utils'
import { usePageAnimations } from '@/hooks/usePageAnimations'
import { 
  Search, 
  Building2,
  Users,
  TrendingUp,
  Shield,
  Zap,
  Star,
  ArrowRight,
  CheckCircle,
  DollarSign,
  BarChart3,
  Upload,
  UserPlus,
  Home as HomeIcon,
  Loader2
} from 'lucide-react'

// Animation variants
const buttonHover = {
  scale: 1.02,
  transition: { type: "spring", stiffness: 400, damping: 25 }
}

const buttonTap = {
  scale: 0.98
}

const cardHover = {
  y: -8,
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
  transition: { type: "spring", stiffness: 300, damping: 25 }
}

export default function Home() {
  const navigate = useNavigate()
  const { user, isBroker, session } = useAuth()
  const [loadingStates, setLoadingStates] = useState({
    searchProperties: false,
    forBrokers: false,
    viewPricing: false,
    startSearching: false,
    accountAction: false
  })
  const identity = useMemo(
    () => resolveUserIdentity(session?.profile, user?.email ?? null),
    [session?.profile, user?.email]
  )
  const isAuthenticated = Boolean(user)
  const dashboardPath = isBroker ? '/broker/dashboard' : '/customer/dashboard'
  const dashboardLabel = isBroker ? 'Broker Dashboard' : 'My Dashboard'
  const showPersonalGreeting = isAuthenticated && identity.displayName !== 'Your Account'
  const heroGreeting = isAuthenticated
    ? showPersonalGreeting
      ? `Welcome back, ${identity.displayName}!`
      : 'Welcome back!'
    : null

  const handleAccountNavigation = () => {
    setLoadingStates(prev => ({ ...prev, accountAction: true }))
    setTimeout(() => {
      if (isAuthenticated) {
        navigate(dashboardPath)
      } else {
        navigate('/register')
      }
      setLoadingStates(prev => ({ ...prev, accountAction: false }))
    }, 300)
  }

  const handleBrokerNavigation = () => {
    setLoadingStates(prev => ({ ...prev, forBrokers: true }))
    setTimeout(() => {
      if (isBroker) {
        navigate('/broker/dashboard')
      } else {
        navigate('/broker/pricing')
      }
      setLoadingStates(prev => ({ ...prev, forBrokers: false }))
    }, 300)
  }

  const handlePropertiesNavigation = () => {
    setLoadingStates(prev => ({ ...prev, searchProperties: true }))
    setTimeout(() => {
      navigate('/properties')
      setLoadingStates(prev => ({ ...prev, searchProperties: false }))
    }, 300)
  }

  const handleStartSearching = () => {
    setLoadingStates(prev => ({ ...prev, startSearching: true }))
    setTimeout(() => {
      navigate('/properties')
      setLoadingStates(prev => ({ ...prev, startSearching: false }))
    }, 300)
  }

  const handleViewPricing = () => {
    setLoadingStates(prev => ({ ...prev, viewPricing: true }))
    setTimeout(() => {
      if (isBroker) {
        navigate('/broker/dashboard')
      } else {
        navigate('/broker/pricing')
      }
      setLoadingStates(prev => ({ ...prev, viewPricing: false }))
    }, 300)
  }

  const handleBrokerLoginLink = () => {
    setLoadingStates(prev => ({ ...prev, accountAction: true }))
    setTimeout(() => {
      if (isBroker) {
        navigate('/broker/dashboard')
      } else if (isAuthenticated) {
        navigate('/broker/pricing')
      } else {
        navigate('/login')
      }
      setLoadingStates(prev => ({ ...prev, accountAction: false }))
    }, 300)
  }

  const features = [
    {
      icon: Search,
      title: "Smart Property Search",
      description: "Advanced search filters to find your perfect property with AI-powered recommendations."
    },
    {
      icon: Building2,
      title: "Professional Listings",
      description: "High-quality property listings with detailed information and professional photography."
    },
    {
      icon: Users,
      title: "Expert Agents",
      description: "Connect with top-rated real estate professionals in your area."
    },
    {
      icon: TrendingUp,
      title: "Market Analytics",
      description: "Real-time market data and trends to make informed decisions."
    },
    {
      icon: Shield,
      title: "Secure Transactions",
      description: "Bank-level security for all your real estate transactions and data."
    },
    {
      icon: Zap,
      title: "Instant Notifications",
      description: "Get notified immediately when properties matching your criteria become available."
    }
  ]

  const brokerFeatures = [
    {
      icon: Upload,
      title: "Bulk Upload System",
      description: "Upload hundreds of listings at once with our CSV/Excel import system"
    },
    {
      icon: BarChart3,
      title: "Advanced Analytics",
      description: "Track leads, conversions, and market performance with detailed reports"
    },
    {
      icon: Users,
      title: "Lead Management",
      description: "Comprehensive CRM system to manage and nurture your leads"
    },
    {
      icon: Building2,
      title: "Team Collaboration",
      description: "Manage your team, assign leads, and track performance"
    }
  ]

  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "Home Buyer",
      content: "Hatch made finding my dream home so easy. The search filters are incredibly detailed and the agent recommendations were spot on!",
      rating: 5
    },
    {
      name: "Mike Rodriguez",
      role: "Real Estate Broker",
      content: "The broker dashboard has transformed my business. The bulk upload feature saves me hours every week, and the analytics help me make better decisions.",
      rating: 5
    },
    {
      name: "Emily Chen",
      role: "Property Investor",
      content: "The market analytics and instant notifications have given me a competitive edge. I've closed 3 deals this month thanks to Hatch.",
      rating: 5
    }
  ]

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 to-indigo-100 py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Discover Your Perfect Property with 
              <span className="text-blue-600"> Hatch</span>
            </h1>
            {heroGreeting && (
              <p className="text-lg text-blue-700 font-semibold mb-3">
                {heroGreeting}
              </p>
            )}
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              The most advanced real estate platform connecting buyers, sellers, and professionals. 
              Find your dream home or grow your real estate business with powerful tools and insights.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={handlePropertiesNavigation}
                disabled={loadingStates.searchProperties}
                className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-3 shadow-lg hover:shadow-xl transition-shadow font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  fontWeight: 500,
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'optimizeLegibility',
                  backfaceVisibility: 'hidden',
                  transform: 'translateZ(0)'
                }}
              >
                {loadingStates.searchProperties ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    Search Properties
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleBrokerNavigation}
                disabled={loadingStates.forBrokers}
                className="text-lg px-8 py-3 border-2 hover:border-blue-600 hover:text-blue-600 shadow-md hover:shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  fontWeight: 500,
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'optimizeLegibility',
                  backfaceVisibility: 'hidden',
                  transform: 'translateZ(0)'
                }}
              >
                {loadingStates.forBrokers ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Building2 className="w-5 h-5 mr-2" />
                    {isBroker ? 'View Broker Dashboard' : 'For Brokers'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Why Choose Hatch?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              We've built the most comprehensive real estate platform with cutting-edge technology 
              and user-friendly design to make your property journey seamless.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                whileHover={cardHover}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="h-full border-2 border-transparent hover:border-blue-100 transition-colors cursor-pointer shadow-md">
                  <CardHeader>
                    <feature.icon className="h-12 w-12 text-blue-600 mb-4" />
                    <CardTitle className="text-xl font-bold">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600 leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Broker Section */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Supercharge Your Real Estate Business
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Join thousands of successful brokers and agents who use Hatch to manage listings, 
              generate leads, and close more deals.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="space-y-6">
                {brokerFeatures.map((feature, index) => (
                  <motion.div
                    key={index}
                    className="flex items-start space-x-4 p-4 rounded-xl hover:bg-white transition-colors cursor-pointer"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    whileHover={{ x: 8, transition: { type: "spring", stiffness: 300, damping: 25 } }}
                  >
                    <div className="bg-blue-100 p-3 rounded-lg flex-shrink-0">
                      <feature.icon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600">
                        {feature.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
              
              <div className="mt-8">
                <Button 
                  size="lg"
                  onClick={handleViewPricing} disabled={loadingStates.viewPricing} className="bg-green-600 hover:bg-green-700 text-lg px-8 py-3 shadow-lg hover:shadow-xl transition-shadow font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ 
                    fontWeight: 500,
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    textRendering: 'optimizeLegibility',
                    backfaceVisibility: 'hidden',
                    transform: 'translateZ(0)'
                  }}
                >
                  {loadingStates.viewPricing ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Loading...</>) : (<><DollarSign className="w-5 h-5 mr-2" />{isBroker ? 'Open Broker Dashboard' : 'View Pricing Plans'}<ArrowRight className="w-5 h-5 ml-2" /></>)}
                </Button>
              </div>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">
                Success Stories
              </h3>
              <div className="space-y-6">
                <div className="border-l-4 border-blue-600 pl-4">
                  <p className="text-gray-600 italic mb-2">
                    "Hatch increased my lead conversion rate by 40% in just 3 months. 
                    The analytics dashboard shows me exactly where my best leads come from."
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    - Jennifer Martinez, Top Producer
                  </p>
                </div>
                <div className="border-l-4 border-green-600 pl-4">
                  <p className="text-gray-600 italic mb-2">
                    "The bulk upload feature is a game-changer. I can now manage 500+ listings 
                    efficiently and focus on what matters most - closing deals."
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    - Robert Kim, Brokerage Owner
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              What Our Users Say
            </h2>
            <p className="text-xl text-gray-600">
              Join thousands of satisfied customers who found their perfect match with Hatch
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={cardHover}
              >
                <Card className="h-full border-2 border-transparent hover:border-yellow-100 transition-colors cursor-pointer shadow-md">
                  <CardHeader>
                    <div className="flex items-center space-x-1 mb-2">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ scale: 0 }}
                          whileInView={{ scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.3 + (i * 0.1), type: "spring", stiffness: 300, damping: 25 }}
                        >
                          <Star className="h-5 w-5 text-yellow-400 fill-current" />
                        </motion.div>
                      ))}
                    </div>
                    <CardTitle className="text-lg font-bold">{testimonial.name}</CardTitle>
                    <CardDescription className="text-blue-600 font-medium">{testimonial.role}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700 italic leading-relaxed">"{testimonial.content}"</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Find Your Next Hatch?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of users who have found their perfect property or grown their business with Hatch. 
            Start your journey today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="secondary" onClick={handleStartSearching} disabled={loadingStates.startSearching} className="text-lg px-8 py-3 shadow-xl hover:shadow-2xl transition-shadow font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                fontWeight: 500,
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                textRendering: 'optimizeLegibility',
                backfaceVisibility: 'hidden',
                transform: 'translateZ(0)'
              }}
            >
              {loadingStates.startSearching ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Loading...</>) : (<><Search className="w-5 h-5 mr-2" />Start Searching</>)}
            </Button>
            {isAuthenticated ? (
              <Button 
                size="lg" 
                onClick={handleAccountNavigation} disabled={loadingStates.accountAction} className="text-lg px-8 py-3 bg-white text-blue-600 border-white hover:bg-blue-50 hover:text-blue-700 shadow-xl hover:shadow-2xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  fontWeight: 500,
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'optimizeLegibility',
                  backfaceVisibility: 'hidden',
                  transform: 'translateZ(0)'
                }}
              >
                {loadingStates.accountAction ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Loading...</>) : (<><ArrowRight className="w-5 h-5 mr-2" />Go to {dashboardLabel}</>)}
              </Button>
            ) : (
              <Button 
                size="lg" 
                onClick={handleAccountNavigation} disabled={loadingStates.accountAction} className="text-lg px-8 py-3 bg-white text-blue-600 border-white hover:bg-blue-50 hover:text-blue-700 shadow-xl hover:shadow-2xl transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  fontWeight: 500,
                  WebkitFontSmoothing: 'antialiased',
                  MozOsxFontSmoothing: 'grayscale',
                  textRendering: 'optimizeLegibility',
                  backfaceVisibility: 'hidden',
                  transform: 'translateZ(0)'
                }}
              >
                {loadingStates.accountAction ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Loading...</>) : (<><UserPlus className="w-5 h-5 mr-2" />Create Account</>)}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <HomeIcon className="h-6 w-6 text-blue-400 mr-2" />
                <span className="text-lg font-bold">Hatch</span>
              </div>
              <p className="text-gray-400">
                Find Your Next Hatch. The most advanced real estate platform for buyers, sellers, and professionals.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">For Buyers</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Button variant="link" className="text-gray-400 p-0 h-auto" onClick={() => navigate('/properties')}>Search Properties</Button></li>
                <li>
                  <Button
                    variant="link"
                    className="text-gray-400 p-0 h-auto"
                    onClick={handleAccountNavigation}
                  >
                    {isAuthenticated ? `Go to ${dashboardLabel}` : 'Create Account'}
                  </Button>
                </li>
                <li><Button variant="link" className="text-gray-400 p-0 h-auto">Mortgage Calculator</Button></li>
                <li><Button variant="link" className="text-gray-400 p-0 h-auto">Neighborhood Guide</Button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">For Professionals</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Button
                    variant="link"
                    className="text-gray-400 p-0 h-auto"
                    onClick={handleBrokerNavigation}
                  >
                    {isBroker ? 'Broker Dashboard' : 'Pricing Plans'}
                  </Button>
                </li>
                <li>
                  <Button
                    variant="link"
                    className="text-gray-400 p-0 h-auto"
                    onClick={handleBrokerLoginLink}
                  >
                    {isBroker ? 'Manage Team' : 'Broker Login'}
                  </Button>
                </li>
                <li><Button variant="link" className="text-gray-400 p-0 h-auto">API Documentation</Button></li>
                <li><Button variant="link" className="text-gray-400 p-0 h-auto">Support Center</Button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Button variant="link" className="text-gray-400 p-0 h-auto">About Us</Button></li>
                <li><Button variant="link" className="text-gray-400 p-0 h-auto">Careers</Button></li>
                <li><Button variant="link" className="text-gray-400 p-0 h-auto">Privacy Policy</Button></li>
                <li><Button variant="link" className="text-gray-400 p-0 h-auto">Terms of Service</Button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 Hatch. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}








