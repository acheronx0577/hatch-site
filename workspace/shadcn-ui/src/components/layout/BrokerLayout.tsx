import React, { useMemo } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import BrokerSidebar from './BrokerSidebar'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resolveUserIdentity } from '@/lib/utils'
import { useUserRole } from '@/lib/auth/roles'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { CopilotDock } from '@/components/copilot/CopilotDock'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { usePresence } from '@/lib/realtime/presenceSocket'
import { GlobalSearch } from '@/components/global-search/GlobalSearch'
import { fetchAgentPortalConfig } from '@/lib/api/agent-portal'

const DEFAULT_AGENT_ALLOWED_PATHS = ['/broker/crm', '/broker/contracts', '/broker/transactions'] as const

const normalizeBrokerPath = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed.startsWith('/broker/') || trimmed.startsWith('//') || trimmed.includes('..') || trimmed.includes('\\')) {
    return fallback
  }
  return trimmed
}

interface BrokerLayoutProps {
  showBackButton?: boolean
}

export default function BrokerLayout({ showBackButton = false }: BrokerLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, user, isDemoSession, activeOrgId, signOut, status } = useAuth()
  const role = useUserRole()
  const { sendLocation } = usePresence(activeOrgId, user?.id ?? null, location.pathname + location.search)

  const { displayName, initials } = useMemo(
    () => resolveUserIdentity(session?.profile, user?.email ?? null, 'Broker'),
    [session?.profile, user?.email]
  )
  const redirectPath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search]
  )
  const isAuthenticated = status === 'authenticated' && !!user

  const orgId = activeOrgId ?? (import.meta.env.VITE_ORG_ID || null)
  const agentPortalQuery = useQuery({
    queryKey: ['agent-portal-config', orgId],
    queryFn: () => fetchAgentPortalConfig(orgId as string),
    enabled: role === 'AGENT' && isAuthenticated && !!orgId,
    staleTime: 60_000
  })

  const agentAllowedPaths = useMemo(() => {
    if (role !== 'AGENT') return null
    const configured = agentPortalQuery.data?.allowedPaths
    if (Array.isArray(configured) && configured.length > 0) {
      return configured
    }
    return [...DEFAULT_AGENT_ALLOWED_PATHS]
  }, [agentPortalQuery.data?.allowedPaths, role])

  const agentLandingPath = useMemo(() => {
    if (role !== 'AGENT') return null
    const allowList = agentAllowedPaths ?? DEFAULT_AGENT_ALLOWED_PATHS
    const fallback = allowList[0] ?? DEFAULT_AGENT_ALLOWED_PATHS[0]
    const landingCandidate = agentPortalQuery.data?.landingPath ?? allowList[0] ?? fallback
    const normalized = normalizeBrokerPath(landingCandidate, fallback)
    return allowList.includes(normalized) ? normalized : fallback
  }, [agentAllowedPaths, agentPortalQuery.data?.landingPath, role])

  const agentRouteAllowed = useMemo(() => {
    if (role !== 'AGENT') return true
    const path = location.pathname
    if (!path.startsWith('/broker')) return true
    if (path === '/broker' || path === '/broker/') return false
    const allowList = agentAllowedPaths ?? DEFAULT_AGENT_ALLOWED_PATHS
    return allowList.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  }, [agentAllowedPaths, location.pathname, role])

  const [searchOpen, setSearchOpen] = React.useState(false)
  const [chatOpen, setChatOpen] = React.useState(false)
  const [chatLaunchContext, setChatLaunchContext] = React.useState<
    React.ComponentProps<typeof ChatWindow>['launchContext']
  >(null)

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        setChatLaunchContext(null)
        setChatOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  React.useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<React.ComponentProps<typeof ChatWindow>['launchContext']>).detail
      setChatLaunchContext(detail ?? null)
      setChatOpen(true)
    }
    const onClose = () => {
      setChatOpen(false)
      setChatLaunchContext(null)
    }
    window.addEventListener('ask-hatch:open', onOpen)
    window.addEventListener('ask-hatch:close', onClose)
    return () => {
      window.removeEventListener('ask-hatch:open', onOpen)
      window.removeEventListener('ask-hatch:close', onClose)
    }
  }, [])

  React.useEffect(() => {
    sendLocation(`path:${location.pathname}${location.search}`)
  }, [location.pathname, location.search, sendLocation])

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-b from-[#f8faff] to-[#eff6ff]">
        <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-background)] px-6 py-4 text-sm text-slate-700 shadow-brand backdrop-blur-xl">
          Checking your session…
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: redirectPath }} />
  }

  if (role === 'AGENT') {
    if (agentPortalQuery.isLoading) {
      return (
        <div className="flex h-screen items-center justify-center bg-gradient-to-b from-[#f8faff] to-[#eff6ff]">
          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-background)] px-6 py-4 text-sm text-slate-700 shadow-brand backdrop-blur-xl">
            Loading your agent portal…
          </div>
        </div>
      )
    }

    if (!agentRouteAllowed && agentLandingPath) {
      return <Navigate to={agentLandingPath} replace />
    }
  }

  return (
    <>
      <div className="hatch-broker-shell relative flex h-screen overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#f8faff] via-[#f1f4ff] to-[#eff6ff]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_0%,rgba(31,95,255,0.18),transparent_55%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_95%_15%,rgba(0,198,162,0.16),transparent_50%)]"
        />
        <BrokerSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {isDemoSession && (
            <div className="bg-amber-100 border-b border-amber-200 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
              Demo Mode — data is read-only and actions are not persisted.
            </div>
          )}
          {/* Header */}
          <header className="relative border-b border-[var(--glass-border)] bg-[var(--glass-background)] px-6 py-4 backdrop-blur-xl">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/45 via-white/12 to-white/0 dark:from-white/10 dark:via-white/5" />
            <div className="relative flex justify-between items-center">
              <div className="flex items-center" aria-hidden="true" />

              {/* Public Site Navigation. */}
              <div className="flex items-center space-x-4">
                <Button
                  variant="outline"
                  className="border-[var(--glass-border)] bg-white/35 text-ink-800 hover:bg-white/50 dark:bg-white/10 dark:text-ink-100 dark:hover:bg-white/15"
                  onClick={() => setSearchOpen(true)}
                >
                  Search ⌘K
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="flex items-center space-x-2 border-[var(--glass-border)] bg-white/25 text-ink-700 hover:bg-white/40 hover:text-ink-900 dark:bg-white/10 dark:text-ink-100 dark:hover:bg-white/15"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>View Public Site</span>
                </Button>
                <NotificationBell />
                <div className="flex items-center space-x-2 text-sm text-ink-600">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-white/25 text-brand-blue-700 shadow-brand backdrop-blur-xl dark:border-white/15 dark:bg-white/10 dark:text-brand-blue-300">
                    <span className="font-semibold">{initials}</span>
                  </div>
                  <span className="font-semibold text-ink-800 dark:text-ink-100">{displayName}</span>
                </div>
                <Button
                  variant="outline"
                  className="border-[var(--glass-border)] bg-white/25 text-ink-700 hover:bg-white/40 hover:text-ink-900 dark:bg-white/10 dark:text-ink-100 dark:hover:bg-white/15"
                  onClick={async () => {
                    await signOut()
                    navigate('/login', { replace: true })
                  }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent p-8">
            <Outlet />
          </main>
          <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
          <ChatWindow
            open={chatOpen}
            onClose={() => {
              setChatOpen(false)
              setChatLaunchContext(null)
            }}
            launchContext={chatLaunchContext}
          />
        </div>
      </div>
      <CopilotDock />
    </>
  )
}
