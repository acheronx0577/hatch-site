import React, { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Handshake,
  FileText,
  Globe,
  LogOut,
  Lock,
  Megaphone,
  NotebookPen,
  Percent,
  Radar,
  Settings,
  ShieldCheck,
  Shuffle,
  Sparkles,
  TrendingUp,
  Wallet,
  Activity,
  UserCheck,
  Users,
  Home as HomeIcon
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { HatchLogo } from '@/components/HatchLogo'
import { useUserRole, userHasRole, type UserRole } from '@/lib/auth/roles'

type NavChild = {
  icon: React.ElementType
  label: string
  path: string
  roles: UserRole[]
}

type NavGroup = {
  key: string
  label: string
  icon: React.ElementType
  path?: string
  roles: UserRole[]
  children?: NavChild[]
}

type NavSection = {
  label: string
  groups: NavGroup[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'BROKERAGE',
    groups: [
      {
        key: 'mission-control',
        label: 'Mission Control',
        icon: Radar,
        path: '/broker/mission-control',
        roles: ['BROKER', 'AGENT', 'ADMIN']
      }
    ]
  },
  {
    label: 'OPERATIONS',
    groups: [
      {
        key: 'people',
        label: 'People',
        icon: Users,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: UserCheck, label: 'Agents & Teams', path: '/broker/team', roles: ['BROKER', 'AGENT', 'ADMIN'] }
        ]
      },
      {
        key: 'business',
        label: 'Business',
        icon: Building2,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: HomeIcon, label: 'Properties', path: '/broker/properties', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Shuffle, label: 'Transactions', path: '/broker/transactions', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Building2, label: 'Accounts', path: '/broker/accounts', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: TrendingUp, label: 'Opportunities', path: '/broker/opportunities', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Handshake, label: 'Offer Intents', path: '/broker/offer-intents', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: FileText, label: 'Contracts', path: '/broker/contracts', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Wallet, label: 'Financials', path: '/broker/financials', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: FileText, label: 'Draft Listings', path: '/broker/draft-listings', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Percent, label: 'Commission Plans', path: '/broker/commission-plans', roles: ['BROKER', 'AGENT', 'ADMIN'] }
        ]
      }
    ]
  },
  {
    label: 'GROWTH',
    groups: [
      {
        key: 'growth',
        label: 'Growth',
        icon: TrendingUp,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: NotebookPen, label: 'Leads & CRM', path: '/broker/crm', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: GitBranch, label: 'Lead Routing', path: '/broker/lead-routing', roles: ['BROKER', 'ADMIN'] },
          { icon: Megaphone, label: 'Marketing', path: '/broker/marketing', roles: ['BROKER', 'ADMIN'] },
          { icon: BarChart3, label: 'Analytics', path: '/broker/analytics', roles: ['BROKER', 'ADMIN'] },
          { icon: Activity, label: 'Live Activity', path: '/broker/live-activity', roles: ['BROKER', 'ADMIN'] }
        ]
      }
    ]
  },
  {
    label: 'RISK',
    groups: [
      {
        key: 'risk',
        label: 'Risk & Compliance',
        icon: ShieldCheck,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: ShieldCheck, label: 'Compliance Hub', path: '/broker/compliance', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Lock, label: 'Audit Log', path: '/broker/audit-log', roles: ['BROKER', 'ADMIN'] }
        ]
      }
    ]
  },
  {
    label: 'ADMIN',
    groups: [
      {
        key: 'admin',
        label: 'Admin',
        icon: Settings,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: Settings, label: 'Settings', path: '/broker/settings', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Bell, label: 'Notifications', path: '/broker/notifications', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Globe, label: 'View Public Site', path: '/', roles: ['BROKER', 'AGENT', 'ADMIN'] }
        ]
      }
    ]
  }
]

export default function BrokerSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()
  const role = useUserRole()

  const [isCollapsed, setIsCollapsed] = React.useState(false)

  const isPathActive = useCallback(
    (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`),
    [location.pathname]
  )

  const sections = React.useMemo(() => {
    return NAV_SECTIONS.map((section) => {
      const groups = section.groups
        .map((group) => {
          const children = group.children?.filter((child) => userHasRole(role, child.roles)) ?? []
          const canAccessGroup = userHasRole(role, group.roles) || children.length > 0
          if (!canAccessGroup) return null
          return { ...group, children }
        })
        .filter(Boolean) as NavGroup[]

      return { ...section, groups }
    }).filter((section) => section.groups.length > 0)
  }, [role])

  const activeGroupKey = React.useMemo(() => {
    for (const section of sections) {
      for (const group of section.groups) {
        if ((group.path && isPathActive(group.path)) || group.children?.some((child) => isPathActive(child.path))) {
          return group.key
        }
      }
    }
    return null
  }, [isPathActive, sections])

  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    sections.forEach((section) => {
      section.groups.forEach((group) => {
        initial[group.key] = false
      })
    })
    if (activeGroupKey) {
      initial[activeGroupKey] = true
    }
    return initial
  })

  React.useEffect(() => {
    setExpandedSections((prev) => {
      const next: Record<string, boolean> = {}
      sections.forEach((section) => {
        section.groups.forEach((group) => {
          next[group.key] = prev[group.key] ?? false
        })
      })
      return next
    })
  }, [sections])

  React.useEffect(() => {
    if (!activeGroupKey) return
    setExpandedSections((prev) => {
      if (prev[activeGroupKey]) return prev
      return { ...prev, [activeGroupKey]: true }
    })
  }, [activeGroupKey])

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedSections((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }, [])

  const handleGroupClick = useCallback(
    (group: NavGroup) => {
      if (group.children?.length) {
        toggleGroup(group.key)
      } else if (group.path) {
        navigate(group.path)
      }
    },
    [navigate, toggleGroup]
  )

  const handleSignOut = useCallback(async () => {
    try {
      await signOut()
    } finally {
      navigate('/login')
    }
  }, [navigate, signOut])

  return (
    <div
      className={`bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-200 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div
          className="flex items-center cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate('/')}
        >
          <HatchLogo className={isCollapsed ? 'h-10 w-10' : 'h-12 md:h-16'} />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-100 ${isCollapsed ? 'mx-auto' : ''}`}
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      {!isCollapsed && <p className="px-4 text-sm text-gray-500 mt-1">Broker Portal</p>}

      {/* Navigation Menu */}
      <nav className="flex-1 p-3 space-y-3">
        {sections.map((section) => (
          <div key={section.label} className="space-y-1">
            <div className="space-y-1">
              {section.groups.map((group) => {
                const isGroupActive =
                  (group.path && isPathActive(group.path)) ||
                  group.children?.some((child) => isPathActive(child.path))
                const showChildren = expandedSections[group.key] && !isCollapsed

                return (
                  <div key={group.key}>
                    <Button
                      variant={isGroupActive ? 'default' : 'ghost'}
                      className={`w-full justify-between ${
                        isGroupActive
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      } ${isCollapsed ? 'px-0 justify-center' : ''}`}
                      onClick={() => handleGroupClick(group)}
                      title={group.label}
                    >
                      <div className="flex items-center">
                        <group.icon className={`${isCollapsed ? '' : 'mr-3'} h-4 w-4`} />
                        {!isCollapsed && <span>{group.label}</span>}
                      </div>
                      {group.children && group.children.length > 0 && !isCollapsed && (
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${showChildren ? 'rotate-180' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleGroup(group.key)
                          }}
                        />
                      )}
                    </Button>

                    {group.children && group.children.length > 0 && (
                      <div className={`${showChildren ? 'mt-2 space-y-1' : 'hidden'}`}>
                        {group.children.map((child) => {
                          const isChildActive = isPathActive(child.path)
                          return (
                            <Button
                              key={child.path}
                              variant="ghost"
                              className={`w-full justify-start text-sm ${
                                isChildActive
                                  ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  : 'text-gray-600 hover:bg-gray-100'
                              } ${isCollapsed ? 'hidden' : 'pl-10'}`}
                              onClick={() => navigate(child.path)}
                              title={child.label}
                            >
                              <child.icon className="mr-3 h-4 w-4" />
                              {child.label}
                            </Button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <Button
          variant="ghost"
          className={`w-full justify-start text-gray-500 hover:text-gray-700 hover:bg-gray-50 ${
            isCollapsed ? 'justify-center' : ''
          }`}
          onClick={handleSignOut}
          title="Sign Out"
        >
          <LogOut className={`${isCollapsed ? '' : 'mr-3'} h-4 w-4`} />
          {!isCollapsed && 'Sign Out'}
        </Button>
      </div>
    </div>
  )
}
