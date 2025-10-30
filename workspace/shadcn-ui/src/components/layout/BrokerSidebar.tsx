import React, { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  GitBranch,
  UserCheck,
  FileText,
  Globe,
  LogOut,
  NotebookPen,
  Home,
  ShieldCheck,
  Percent
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { HatchLogo } from '@/components/HatchLogo'

export default function BrokerSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()

  const menuItems = [
    { icon: Home, label: 'Dashboard', path: '/broker/dashboard' },
    { icon: Building2, label: 'Properties', path: '/broker/properties' },
    { icon: NotebookPen, label: 'CRM', path: '/broker/crm' },
    { icon: ShieldCheck, label: 'Compliance', path: '/broker/compliance' },
    { icon: UserCheck, label: 'Team', path: '/broker/team' },
    { icon: Percent, label: 'Commission Plans', path: '/broker/commission-plans' },
    { icon: GitBranch, label: 'Lead Routing', path: '/broker/lead-routing' },
    { icon: BarChart3, label: 'Analytics', path: '/broker/analytics' },
    { icon: FileText, label: 'Draft Listings', path: '/broker/draft-listings' },
  ]

  const isActive = (path: string) => location.pathname === path

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } finally {
      navigate('/login')
    }
  }, [navigate, signOut])

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div
          className="flex items-center cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate('/')}
        >
          <HatchLogo className="h-12 md:h-16" />
        </div>
        <p className="text-sm text-gray-500 mt-1">Broker Portal</p>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {menuItems.map((item) => (
            <Button
              key={item.path}
              variant={isActive(item.path) ? "default" : "ghost"}
              className={`w-full justify-start ${
                isActive(item.path) 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => navigate(item.path)}
            >
              <item.icon className="mr-3 h-4 w-4" />
              {item.label}
            </Button>
          ))}
        </div>

        {/* Public Site Access */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <Button
            variant="outline"
            className="w-full justify-start text-gray-700 hover:bg-gray-50 border-gray-300"
            onClick={() => navigate('/')}
          >
            <Globe className="mr-3 h-4 w-4" />
            View Public Site
          </Button>
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <Button
          variant="ghost"
          className="w-full justify-start text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          onClick={handleSignOut}
        >
          <LogOut className="mr-3 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
