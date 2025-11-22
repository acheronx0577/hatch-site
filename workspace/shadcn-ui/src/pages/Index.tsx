import React, { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { 
  Search, 
  Building2, 
  Users, 
  TrendingUp, 
  Shield,
  CheckCircle,
  Star,
  ArrowRight,
  Home,
  MapPin,
  Heart
} from 'lucide-react'

export default function Index() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const handleStartSearching = () => {
    navigate('/properties')
  }

  const handleForProfessionalsClick = () => {
    // If no user is signed in, show pricing page
    if (!user) {
      navigate('/pricing')
      return
    }

    // Check if user has broker/agent role
    const userRole = user.role || user.user_metadata?.role
    const isBrokerOrAgent = userRole === 'broker' || userRole === 'agent' || userRole === 'primary_broker'

    if (isBrokerOrAgent) {
      // User is authenticated and has broker/agent role - go to broker dashboard
      navigate('/broker/dashboard')
    } else {
      // User is signed in but doesn't have broker/agent role - show pricing
      navigate('/pricing')
    }
  }

  const features = [
    {
      icon: Search,
      title: 'Advanced Search',
      description: 'Find properties with powerful filters and AI-powered recommendations'
    },
    {
      icon: Building2,
      title: 'Professional Tools',
      description: 'Complete CRM and listing management for real estate professionals'
    },
    {
      icon: Users,
      title: 'Team Collaboration',
      description: 'Manage your team and track performance with comprehensive analytics'
    },
    {
      icon: Shield,
      title: 'Secure & Reliable',
      description: 'Enterprise-grade security with 99.9% uptime guarantee'
    }
  ]

  const testimonials = [
    {
      name: 'Sarah Johnson',
      role: 'Real Estate Broker',
      content: 'Hatch has transformed how we manage our listings and communicate with clients.',
      rating: 5
    },
    {
      name: 'Mike Rodriguez',
      role: 'Property Investor',
      content: 'The search functionality is incredible. Found my investment property in days.',
      rating: 5
    },
    {
      name: 'Lisa Chen',
      role: 'First-time Buyer',
      content: 'The platform made buying my first home stress-free and enjoyable.',
      rating: 5
    }
  ]

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <section className="relative py-20 px-4 fade-in">
        <div className="container mx-auto text-center">
          <Badge variant="secondary" className="mb-6 px-4 py-2">
            🚀 Now serving Florida real estate professionals
          </Badge>
          
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Find Your Perfect
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              {' '}Home
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            The most advanced real estate platform in Florida. Search thousands of properties, 
            connect with top agents, and manage your real estate business all in one place.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button 
              size="lg" 
              className="px-8 py-4 text-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              onClick={handleStartSearching}
            >
              <Search className="mr-2 h-5 w-5" />
              Start Searching
            </Button>
            
            <Button 
              size="lg" 
              variant="outline" 
              className="px-8 py-4 text-lg border-2"
              onClick={handleForProfessionalsClick}
            >
              <Building2 className="mr-2 h-5 w-5" />
              For Professionals
            </Button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">50K+</div>
              <div className="text-gray-600">Active Listings</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">1,200+</div>
              <div className="text-gray-600">Real Estate Professionals</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">98%</div>
              <div className="text-gray-600">Customer Satisfaction</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-white fade-in">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Everything You Need in One Platform
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Whether you're buying, selling, or managing properties, Hatch provides 
              the tools you need to succeed.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow fade-in">
                <CardHeader>
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-600">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Properties Section */}
      <section className="py-20 px-4 bg-gray-50 fade-in">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Featured Properties
            </h2>
            <p className="text-xl text-gray-600">
              Discover some of the most sought-after properties in Florida
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden hover:shadow-lg transition-shadow fade-in">
                <div className="h-48 bg-gradient-to-r from-blue-200 to-purple-200 flex items-center justify-center">
                  <Home className="h-12 w-12 text-gray-600" />
                </div>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-semibold">Modern Miami Condo</h3>
                    <Button variant="ghost" size="sm">
                      <Heart className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center text-gray-600 mb-2">
                    <MapPin className="h-4 w-4 mr-1" />
                    <span>Downtown Miami, FL</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600 mb-4">
                    $450,000
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>2 beds</span>
                    <span>2 baths</span>
                    <span>1,200 sq ft</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center">
            <Button 
              size="lg" 
              onClick={handleStartSearching}
              className="px-8 py-4"
            >
              View All Properties
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 px-4 bg-white fade-in">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              What Our Users Say
            </h2>
            <p className="text-xl text-gray-600">
              Join thousands of satisfied customers who trust Hatch
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="text-center fade-in">
                <CardContent className="p-6">
                  <div className="flex justify-center mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  <p className="text-gray-600 mb-4 italic">
                    "{testimonial.content}"
                  </p>
                  <div className="font-semibold text-gray-900">{testimonial.name}</div>
                  <div className="text-sm text-gray-500">{testimonial.role}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white fade-in">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join the future of real estate today
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-gray-100 px-8 py-4"
              onClick={handleStartSearching}
            >
              <Search className="mr-2 h-5 w-5" />
              Find Your Home
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4"
              onClick={handleForProfessionalsClick}
            >
              <Building2 className="mr-2 h-5 w-5" />
              Grow Your Business
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
