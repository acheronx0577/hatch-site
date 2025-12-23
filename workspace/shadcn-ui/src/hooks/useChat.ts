import { useEffect, useState } from 'react'
import {
  listChatSessions,
  createChatSession,
  getChatSessionMessages,
  getChatSessionContext,
  ensureChatSession,
  sendChatMessage,
  type ChatSession,
  type ChatMessage,
  type ChatSessionContext
} from '@/lib/api/chat'
import { useAuth } from '@/contexts/AuthContext'

const LAST_SESSION_KEY = 'ask_hatch:last_session'

export function useChat() {
  const { activeOrgId } = useAuth()
  const orgId = activeOrgId
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionContext, setSessionContext] = useState<ChatSessionContext | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    setLoadingSessions(true)
    ;(async () => {
      try {
        const savedSessionId = typeof window !== 'undefined' ? window.localStorage.getItem(LAST_SESSION_KEY) : null
        const general = await ensureChatSession(orgId, { contextType: 'GENERAL', title: 'General' })
        const list = await listChatSessions(orgId)
        setSessions(list)

        const initial =
          savedSessionId && list.some((session) => session.id === savedSessionId)
            ? savedSessionId
            : general?.id ?? list[0]?.id ?? null
        setCurrentSessionId(initial)
      } catch {
        setError('Failed to load chat sessions.')
      } finally {
        setLoadingSessions(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  useEffect(() => {
    if (!orgId || !currentSessionId) {
      setMessages([])
      setSessionContext(null)
      return
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LAST_SESSION_KEY, currentSessionId)
    }

    setLoadingMessages(true)
    getChatSessionMessages(orgId, currentSessionId)
      .then(setMessages)
      .catch(() => setError('Failed to load messages.'))
      .finally(() => setLoadingMessages(false))

    setLoadingContext(true)
    getChatSessionContext(orgId, currentSessionId)
      .then(setSessionContext)
      .catch(() => setSessionContext(null))
      .finally(() => setLoadingContext(false))
  }, [orgId, currentSessionId])

  async function startNewSession(initialTitle?: string, initialMessage?: string) {
      if (!orgId) return
      try {
        const session = await createChatSession(orgId, initialTitle)
        setSessions((prev) => [session, ...prev])
        setCurrentSessionId(session.id)
        if (initialMessage) {
          await sendMessage(initialMessage)
        }
      } catch (err) {
        setError('Failed to create session.')
      }
  }

  async function openContextSession(input: {
    title?: string
    contextType?: 'GENERAL' | 'LEAD' | 'LISTING' | 'TRANSACTION'
    contextId?: string
    contextSnapshot?: Record<string, unknown>
  }) {
    if (!orgId) return
    setError(null)
    try {
      const session = await ensureChatSession(orgId, input)
      setSessions((prev) => {
        const next = prev.filter((item) => item.id !== session.id)
        return [session, ...next]
      })
      setCurrentSessionId(session.id)
    } catch {
      setError('Failed to open chat thread.')
    }
  }

  async function sendMessage(content: string) {
    if (!orgId) return
    if (!currentSessionId) {
      await startNewSession(undefined, content)
      return
    }
    setSending(true)
    setError(null)
    try {
      const { messages: updated } = await sendChatMessage(orgId, currentSessionId, content)
      setMessages(updated)
      const refreshed = await listChatSessions(orgId)
      setSessions(refreshed)
    } catch (err) {
      setError('Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  function selectSession(id: string) {
    setCurrentSessionId(id)
  }

  return {
    sessions,
    currentSessionId,
    messages,
    sessionContext,
    loadingSessions,
    loadingMessages,
    loadingContext,
    sending,
    error,
    sendMessage,
    startNewSession,
    openContextSession,
    selectSession,
    setError
  }
}
