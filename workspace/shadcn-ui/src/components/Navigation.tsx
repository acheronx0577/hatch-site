import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { 
  Home, 
  BarChart3, 
  Users, 
  FileText, 
  UserPlus,
  DollarSign,
  LogOut,
  MessageSquare,
  ShieldCheck
} from 'lucide-react'
import { HatchLogo } from '@/components/HatchLogo'

export default function Navigation() {
  const { user, signOut, profile } = useAuth()
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  const publicNavItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/pricing', label: 'Pricing', icon: DollarSign }
  ]

  const authenticatedNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { path: '/messages', label: 'Messages', icon: MessageSquare },
    { path: '/pricing', label: 'Pricing', icon: DollarSign }
  ]

  const brokerNavItems = [
    { path: '/broker/dashboard', label: 'Broker Dashboard', icon: BarChart3 },
  { path: '/broker/crm', label: 'CRM', icon: Users },
  { path: '/broker/compliance', label: 'Compliance', icon: ShieldCheck },
    { path: '/messages', label: 'Messages', icon: MessageSquare },
    { path: '/broker/properties', label: 'Properties', icon: Home },
    { path: '/broker/listings', label: 'Listings', icon: FileText },
    { path: '/broker/team', label: 'Team', icon: UserPlus },
    { path: '/pricing', label: 'Pricing', icon: DollarSign }
  ]

  const getNavItems = () => {
    if (!user) return publicNavItems
    
    // Check if user is a broker (has broker role or emergency admin privileges)
    const isBroker = profile?.role === 'broker' || 
                    profile?.role === 'primary_broker' ||
                    localStorage.getItem('hatch_emergency_admin') === user.email ||
                    localStorage.getItem('hatch_force_admin') === 'true'
    
    return isBroker ? brokerNavItems : authenticatedNavItems
  }

  const navItems = getNavItems()

  return (
    <nav className="bg-white shadow-lg border-b">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <HatchLogo className="h-12 md:h-16" />
          </Link>

          {/* Navigation Items */}
          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* Auth Section */}
          <div className="flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  Welcome, {user.email}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={signOut}
                  className="flex items-center space-x-1"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link to="/auth">
                  <Button variant="outline" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button size="sm">
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium ${
                    isActive(item.path)
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
