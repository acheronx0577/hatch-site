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
  Percent,
  Megaphone,
  Radar,
  Shuffle,
  Sparkles,
  Bell,
  Lock
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { HatchLogo } from '@/components/HatchLogo'
import { useUserRole, userHasRole, type UserRole } from '@/lib/auth/roles'

export default function BrokerSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()
  const role = useUserRole()

  type NavItem = {
    icon: React.ElementType
    label: string
    path: string
    roles: UserRole[]
  }

  const menuItems: NavItem[] = [
    { icon: Home, label: 'Dashboard', path: '/broker/dashboard', roles: ['BROKER', 'AGENT', 'ADMIN'] },
    { icon: Radar, label: 'Mission Control', path: '/broker/mission-control', roles: ['BROKER', 'AGENT', 'ADMIN'] },
    { icon: UserCheck, label: 'Team', path: '/broker/team', roles: ['BROKER', 'ADMIN'] },
    { icon: ShieldCheck, label: 'Compliance', path: '/broker/compliance', roles: ['BROKER', 'ADMIN'] },
    { icon: Sparkles, label: 'AI Employees', path: '/broker/ai-employees', roles: ['BROKER', 'ADMIN'] },
    { icon: Building2, label: 'Properties', path: '/broker/properties', roles: ['BROKER', 'AGENT', 'ADMIN'] },
    { icon: Shuffle, label: 'Transactions', path: '/broker/transactions', roles: ['BROKER', 'AGENT', 'ADMIN'] },
    { icon: NotebookPen, label: 'CRM', path: '/broker/crm', roles: ['BROKER', 'AGENT', 'ADMIN'] },
    { icon: Megaphone, label: 'Marketing', path: '/broker/marketing', roles: ['BROKER', 'ADMIN'] },
    { icon: Bell, label: 'Notifications', path: '/broker/notifications', roles: ['BROKER', 'AGENT', 'ADMIN'] },
    { icon: Lock, label: 'Audit Log', path: '/broker/audit-log', roles: ['BROKER', 'ADMIN'] },
    { icon: Percent, label: 'Commission Plans', path: '/broker/commission-plans', roles: ['BROKER', 'ADMIN'] },
    { icon: GitBranch, label: 'Lead Routing', path: '/broker/lead-routing', roles: ['BROKER', 'ADMIN'] },
    { icon: BarChart3, label: 'Analytics', path: '/broker/analytics', roles: ['BROKER', 'ADMIN'] },
    { icon: FileText, label: 'Draft Listings', path: '/broker/draft-listings', roles: ['BROKER', 'ADMIN'] },
  ]

  const visibleMenuItems = menuItems.filter((item) => userHasRole(role, item.roles))
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
          <HatchLogo className="h-20 md:h-28" />
        </div>
        <p className="text-sm text-gray-500 mt-1">Broker Portal</p>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {visibleMenuItems.map((item) => (
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
