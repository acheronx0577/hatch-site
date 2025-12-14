import React, { useCallback, useMemo } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import BrokerSidebar from './BrokerSidebar'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resolveUserIdentity } from '@/lib/utils'
import { CopilotDock } from '@/components/copilot/CopilotDock'
import { HatchAIWidget, type HatchAIMessage } from '@/components/copilot/HatchAIWidget'
import { chatAiPersona, type PersonaChatMessage } from '@/lib/api/hatch'
import type { PersonaId } from '@/lib/ai/aiPersonas'
import { useToast } from '@/components/ui/use-toast'
import { buildMemoryToastPayload } from '@/lib/ai/memoryToast'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { usePresence } from '@/lib/realtime/presenceSocket'
import { GlobalSearch } from '@/components/global-search/GlobalSearch'
import CognitoAuthControls from '@/components/auth/CognitoAuthControls'

interface BrokerLayoutProps {
  showBackButton?: boolean
}

export default function BrokerLayout({ showBackButton = false }: BrokerLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, user, isDemoSession, activeOrgId, status } = useAuth()
  const { sendLocation } = usePresence(activeOrgId, user?.id ?? null, location.pathname + location.search)
  const { toast } = useToast()

  const { displayName, initials } = useMemo(
    () => resolveUserIdentity(session?.profile, user?.email ?? null, 'Broker'),
    [session?.profile, user?.email]
  )
  const redirectPath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search]
  )
  const isAuthenticated = status === 'authenticated' && !!user

  const debug = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const flag = params.get('copilotDebug')
    return flag === '1' || flag === 'true'
  }, [location.search])

  const handleWidgetSend = useCallback(
    async ({
      text,
      personaId,
      history,
      forceCurrentPersona
    }: {
      text: string
      personaId: PersonaId
      history: HatchAIMessage[]
      forceCurrentPersona?: boolean
    }) => {
      const response = await chatAiPersona({
        text,
        currentPersonaId: personaId,
        forceCurrentPersona,
        history: history.map<PersonaChatMessage>(({ role, content, personaId: msgPersonaId }) => ({
          role,
          content,
          personaId: msgPersonaId
        }))
      })

      const memoryToast = buildMemoryToastPayload(response.memoryLog)
      if (memoryToast) {
        toast(memoryToast)
      }

      // Prefer API-provided authorship; otherwise attribute handoff then reply.
      let firstAssistantSeen = false
      const replies =
        response.messages?.map<HatchAIMessage>((message) => {
          if (message.role !== 'assistant') {
            return { id: crypto.randomUUID(), role: message.role, content: message.content, personaId: message.personaId }
          }
          const msgPersonaId = message.personaId ?? (firstAssistantSeen ? response.activePersonaId : personaId)
          firstAssistantSeen = true
          return { id: crypto.randomUUID(), role: 'assistant', content: message.content, personaId: msgPersonaId }
        }) ?? []

      return {
        activePersonaId: response.activePersonaId,
        replies
      }
    },
    [toast]
  )

  const [searchOpen, setSearchOpen] = React.useState(false)
  const [chatOpen, setChatOpen] = React.useState(false)

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault()
        setChatOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  React.useEffect(() => {
    sendLocation(`path:${location.pathname}${location.search}`)
  }, [location.pathname, location.search, sendLocation])

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600 shadow-sm">
          Checking your session…
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: redirectPath }} />
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <BrokerSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {isDemoSession && (
          <div className="bg-amber-100 border-b border-amber-200 px-6 py-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
            Demo Mode — data is read-only and actions are not persisted.
          </div>
        )}
        {/* Header */}
        <header className="bg-white shadow-sm border-b px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center" aria-hidden="true" />
            
            {/* Public Site Navigation. */}
            <div className="flex items-center space-x-4">
              <Button variant="outline" onClick={() => setSearchOpen(true)}>
                Search ⌘K
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 border-gray-300"
              >
                <ExternalLink className="h-4 w-4" />
                <span>View Public Site</span>
              </Button>
              <NotificationBell />
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-medium">{initials}</span>
                </div>
                <span className="text-gray-700 font-medium">{displayName}</span>
              </div>
              <CognitoAuthControls className="ml-2" />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          <Outlet />
        </main>
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <CopilotDock debug={debug} />
        <HatchAIWidget isOpen={chatOpen} onClose={() => setChatOpen(false)} onSend={handleWidgetSend} />
      </div>
    </div>
  )
}
