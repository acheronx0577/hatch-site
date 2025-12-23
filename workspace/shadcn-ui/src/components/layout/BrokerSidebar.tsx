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
  DollarSign,
  FileText,
  GitBranch,
  Handshake,
  Globe,
  LogOut,
  Lock,
  Megaphone,
  NotebookPen,
  Radar,
  Sparkles,
  Settings,
  ShieldCheck,
  Shuffle,
  TrendingUp,
  UserCheck,
  Users,
  Home as HomeIcon,
  Briefcase,
  Activity
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { HatchLogo } from '@/components/HatchLogo'
import { useUserRole, userHasRole, type UserRole } from '@/lib/auth/roles'
import { fetchAgentPortalConfig } from '@/lib/api/agent-portal'
import { cn } from '@/lib/utils'

const DEFAULT_AGENT_ALLOWED_PATHS = ['/broker/crm', '/broker/contracts', '/broker/transactions'] as const

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
    label: 'MAIN',
    groups: [
      {
        key: 'home',
        label: 'Home',
        icon: Radar,
        path: '/broker/mission-control',
        roles: ['BROKER', 'ADMIN']
      }
    ]
  },
  {
    label: 'WORK',
    groups: [
      {
        key: 'clients',
        label: 'Clients',
        icon: Users,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: NotebookPen, label: 'Leads & CRM', path: '/broker/crm', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Building2, label: 'Accounts', path: '/broker/accounts', roles: ['BROKER', 'ADMIN'] }
        ]
      },
      {
        key: 'properties',
        label: 'Properties',
        icon: HomeIcon,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: HomeIcon, label: 'Active Listings', path: '/broker/properties', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: FileText, label: 'Draft Listings', path: '/broker/draft-listings', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Handshake, label: 'Offer Intents', path: '/broker/offer-intents', roles: ['BROKER', 'AGENT', 'ADMIN'] }
        ]
      },
      {
        key: 'deals',
        label: 'Deals',
        icon: Briefcase,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: TrendingUp, label: 'Opportunities', path: '/broker/opportunities', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Shuffle, label: 'Transactions', path: '/broker/transactions', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: FileText, label: 'Contracts', path: '/broker/contracts', roles: ['BROKER', 'AGENT', 'ADMIN'] }
        ]
      },
      {
        key: 'earnings',
        label: 'Earnings',
        icon: DollarSign,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: DollarSign, label: 'Financials', path: '/broker/financials', roles: ['BROKER', 'AGENT', 'ADMIN'] }
        ]
      }
    ]
  },
  {
    label: 'TEAM',
    groups: [
      {
        key: 'team',
        label: 'Team',
        icon: UserCheck,
        roles: ['BROKER', 'ADMIN'],
        children: [
          { icon: UserCheck, label: 'Agents & Teams', path: '/broker/team', roles: ['BROKER', 'ADMIN'] },
          { icon: GitBranch, label: 'Lead Routing', path: '/broker/lead-routing', roles: ['BROKER', 'ADMIN'] },
          { icon: ShieldCheck, label: 'Risk Center', path: '/broker/compliance', roles: ['BROKER', 'AGENT', 'ADMIN'] }
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
          { icon: Sparkles, label: 'Lead Generation (Beta)', path: '/broker/marketing/lead-gen', roles: ['BROKER', 'ADMIN'] },
          { icon: Megaphone, label: 'Marketing', path: '/broker/marketing', roles: ['BROKER', 'ADMIN'] },
          { icon: BarChart3, label: 'Analytics', path: '/broker/analytics', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Activity, label: 'Live Activity', path: '/broker/live-activity', roles: ['BROKER', 'AGENT', 'ADMIN'] }
        ]
      }
    ]
  },
  {
    label: 'SETTINGS',
    groups: [
      {
        key: 'settings',
        label: 'Settings',
        icon: Settings,
        roles: ['BROKER', 'AGENT', 'ADMIN'],
        children: [
          { icon: Settings, label: 'Preferences', path: '/broker/settings', roles: ['BROKER', 'AGENT', 'ADMIN'] },
          { icon: Lock, label: 'Audit Log', path: '/broker/audit-log', roles: ['BROKER', 'ADMIN'] },
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
  const { signOut, activeOrgId } = useAuth()
  const role = useUserRole()
  const portalLabel = role === 'AGENT' ? 'Agent Portal' : 'Broker Portal'

  const [isCollapsed, setIsCollapsed] = React.useState(false)

  const orgId = activeOrgId ?? (import.meta.env.VITE_ORG_ID || null)
  const agentPortalQuery = useQuery({
    queryKey: ['agent-portal-config', orgId],
    queryFn: () => fetchAgentPortalConfig(orgId as string),
    enabled: role === 'AGENT' && !!orgId,
    staleTime: 60_000
  })

  const allowedPaths = React.useMemo(() => {
    if (role !== 'AGENT') return null
    const configured = agentPortalQuery.data?.allowedPaths
    if (Array.isArray(configured) && configured.length > 0) {
      return configured
    }
    return [...DEFAULT_AGENT_ALLOWED_PATHS]
  }, [agentPortalQuery.data?.allowedPaths, role])

  const isPathActive = useCallback(
    (path: string) => location.pathname === path || location.pathname.startsWith(`${path}/`),
    [location.pathname]
  )

  const sections = React.useMemo(() => {
    const isAllowedForAgent = (path: string) => {
      if (role !== 'AGENT') return true
      if (!path.startsWith('/broker/')) return true
      const allowList = allowedPaths ?? DEFAULT_AGENT_ALLOWED_PATHS
      return allowList.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    }

    return NAV_SECTIONS.map((section) => {
      const groups = section.groups
        .map((group) => {
          const children =
            group.children?.filter((child) => userHasRole(role, child.roles) && isAllowedForAgent(child.path)) ?? []

          const groupPathAllowed = group.path ? isAllowedForAgent(group.path) : false
          const canAccessGroup = (userHasRole(role, group.roles) && (!group.path || groupPathAllowed)) || children.length > 0
          if (!canAccessGroup) return null
          return { ...group, children }
        })
        .filter(Boolean) as NavGroup[]

      return { ...section, groups }
    }).filter((section) => section.groups.length > 0)
  }, [allowedPaths, role])

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
      className={cn(
        'relative flex h-full flex-col overflow-hidden border-r border-[var(--glass-border)] bg-[var(--glass-background)] backdrop-blur-xl transition-all duration-200',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/50 via-white/15 to-white/0 dark:from-white/10 dark:via-white/5" />
      <div className="relative flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] p-4">
          <div
            className="flex items-center cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/')}
          >
            <HatchLogo className={isCollapsed ? 'h-10 w-10' : 'h-12 md:h-16'} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 !text-slate-600 hover:!text-slate-900 hover:!bg-white/25 dark:!text-ink-100/70 dark:hover:!text-ink-100 dark:hover:!bg-white/10',
              isCollapsed ? 'mx-auto' : ''
            )}
            onClick={() => setIsCollapsed((prev) => !prev)}
            title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        {!isCollapsed && <p className="mt-1 px-4 text-sm text-slate-500 dark:text-ink-100/60">{portalLabel}</p>}

        {/* Navigation Menu */}
        <nav className="flex-1 space-y-3 overflow-y-auto p-3">
          {sections.map((section) => (
            <div key={section.label} className="space-y-1">
              {!isCollapsed && (
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-ink-100/45">
                  {section.label}
                </div>
              )}
              <div className="space-y-1">
                {section.groups.map((group) => {
                  const isGroupActive =
                    (group.path && isPathActive(group.path)) ||
                    group.children?.some((child) => isPathActive(child.path))
                  const showChildren = expandedSections[group.key] && !isCollapsed

                  return (
                    <div key={group.key}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'w-full justify-between !rounded-xl px-3 py-2',
                          isGroupActive
                            ? '!bg-white/50 !text-ink-900 shadow-brand border border-white/35 hover:!bg-white/60 dark:!bg-white/10 dark:!text-ink-100 dark:border-white/15 dark:hover:!bg-white/15'
                            : '!text-ink-700 hover:!bg-white/25 hover:!text-ink-900 dark:!text-ink-100/75 dark:hover:!bg-white/10 dark:hover:!text-ink-100',
                          isCollapsed ? '!px-0 justify-center' : ''
                        )}
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
                                size="sm"
                                className={cn(
                                  'w-full justify-start !rounded-xl text-sm',
                                  isChildActive
                                    ? '!bg-brand-blue-600/12 !text-brand-blue-700 border border-brand-blue-600/20 hover:!bg-brand-blue-600/18 dark:!bg-brand-blue-600/20 dark:!text-brand-blue-300 dark:border-brand-blue-400/25'
                                    : '!text-ink-600 hover:!bg-white/20 hover:!text-ink-900 dark:!text-ink-100/70 dark:hover:!bg-white/10 dark:hover:!text-ink-100',
                                  isCollapsed ? 'hidden' : 'pl-10'
                                )}
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
        <div className="border-t border-[var(--glass-border)] p-4">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'w-full justify-start !text-slate-600 hover:!text-slate-900 hover:!bg-white/25 dark:!text-ink-100/70 dark:hover:!text-ink-100 dark:hover:!bg-white/10',
              isCollapsed ? 'justify-center' : ''
            )}
            onClick={handleSignOut}
            title="Sign Out"
          >
            <LogOut className={`${isCollapsed ? '' : 'mr-3'} h-4 w-4`} />
            {!isCollapsed && 'Sign Out'}
          </Button>
        </div>
      </div>
    </div>
  )
}
