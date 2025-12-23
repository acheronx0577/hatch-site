import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useChat } from '@/hooks/useChat'
import { ChatMessageBubble } from './ChatMessageBubble'

type Props = {
  open: boolean
  onClose: () => void
  launchContext?: {
    title?: string
    contextType?: 'GENERAL' | 'LEAD' | 'LISTING' | 'TRANSACTION'
    contextId?: string
    contextSnapshot?: Record<string, unknown>
  } | null
}

export const ChatWindow: React.FC<Props> = ({ open, onClose, launchContext }) => {
  const {
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
    openContextSession,
    selectSession,
    setError
  } = useChat()

  const [input, setInput] = useState('')
  const messagesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setInput('')
  }, [open, setError])

  useEffect(() => {
    if (!open) return
    if (!launchContext) return
    void openContextSession(launchContext)
    setInput('')
  }, [launchContext, open, openContextSession])

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, sending])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    await sendMessage(input.trim())
    setInput('')
  }

  const tabSessions = sessions.filter((session) => session.contextType && session.contextType !== 'LEGACY')

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
      <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={onClose} />
      <div className="relative z-50 m-4 w-full max-w-lg rounded-lg border bg-background shadow-lg flex flex-col pointer-events-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
              H
            </div>
            <div className="text-sm font-semibold">Ask Hatch</div>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            Esc
          </button>
        </div>

        <div className="border-b px-3 py-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {loadingSessions ? (
              <div className="text-xs text-muted-foreground">Loading threads…</div>
            ) : tabSessions.length === 0 ? (
              <div className="text-xs text-muted-foreground">No threads yet.</div>
            ) : (
              tabSessions.map((session) => {
                const active = session.id === currentSessionId
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      selectSession(session.id)
                      setInput('')
                    }}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                      active ? 'bg-blue-600 text-white border-blue-600' : 'bg-muted/40 text-foreground hover:bg-muted'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {session.title || (session.contextType === 'GENERAL' ? 'General' : 'Thread')}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="border-b px-3 py-2">
          {loadingContext ? (
            <div className="text-xs text-muted-foreground">Loading context…</div>
          ) : sessionContext?.panel ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{sessionContext.panel.title}</div>
                  {sessionContext.panel.subtitle ? (
                    <div className="truncate text-xs text-muted-foreground">{sessionContext.panel.subtitle}</div>
                  ) : null}
                </div>
                {sessionContext.panel.href ? (
                  <Link
                    to={sessionContext.panel.href}
                    className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold hover:bg-muted"
                  >
                    Open
                  </Link>
                ) : null}
              </div>

              {(sessionContext.panel.fields ?? []).length ? (
                <div className="grid grid-cols-2 gap-2">
                  {sessionContext.panel.fields.slice(0, 6).map((field: any) => (
                    <div key={field.label} className="rounded-md border bg-muted/30 px-2 py-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {field.label}
                      </div>
                      <div className="truncate text-xs">{field.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {(sessionContext.panel.documents ?? []).length ? (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Documents</div>
                  <div className="flex flex-wrap gap-2">
                    {sessionContext.panel.documents.slice(0, 6).map((doc: any) => (
                      doc.href ? (
                        <Link
                          key={doc.id}
                          to={doc.href}
                          className="rounded-full border px-3 py-1 text-[11px] font-semibold hover:bg-muted"
                        >
                          {doc.name}
                        </Link>
                      ) : (
                        <span
                          key={doc.id}
                          className="rounded-full border px-3 py-1 text-[11px] font-semibold opacity-60"
                        >
                          {doc.name}
                        </span>
                      )
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Select a thread to see its context.
            </div>
          )}
        </div>

        <div className="flex-1 min-h-[280px] flex flex-col">
          <div ref={messagesRef} className="flex-1 overflow-auto px-3 py-2 text-xs">
            {loadingMessages ? <div className="text-muted-foreground text-sm">Loading…</div> : null}
            {!loadingMessages && messages.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                Ask Hatch anything. Use the context panel above to keep the conversation anchored.
              </div>
            ) : null}
            {messages.map((m) => (
              <ChatMessageBubble key={m.id} message={m} />
            ))}
            {sending ? <div className="text-muted-foreground text-xs mt-2">Hatch is thinking…</div> : null}
          </div>
          {error ? <div className="px-3 py-1 text-xs text-red-500 border-t">{error}</div> : null}
          <form onSubmit={handleSubmit} className="border-t px-3 py-2">
            <textarea
              rows={2}
              className="w-full resize-none text-sm bg-background border rounded px-2 py-1 focus:outline-none focus:ring"
              placeholder="Ask Hatch anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e as any)
                }
              }}
            />
            <div className="mt-1 flex justify-between items-center text-[10px] text-muted-foreground">
              <span>Enter to send · Shift+Enter for newline</span>
              <button
                type="submit"
                className="px-2 py-1 rounded bg-blue-600 text-white text-[11px] hover:bg-blue-700 disabled:opacity-50"
                disabled={!input.trim() || sending}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
