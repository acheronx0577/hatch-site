import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listConversations,
  getConversation,
  createConversation,
  postConversationMessage,
  markConversationRead,
  createLeadTouchpoint,
  type CreateLeadTouchpointPayload,
  type MessageChannelType,
  type LeadTouchpointType,
  type RecordLeadTouchpointResponse,
  type ConversationDetail,
  type ConversationListItem,
  type ConversationMessage
} from '@/lib/api/hatch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, PlusCircle, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

const TENANT_ID = import.meta.env.VITE_TENANT_ID || 'tenant-hatch'

interface MessengerWidgetProps {
  onClose: () => void
  initialContactId: string | null
  onInitialContactConsumed: () => void
}

export function MessengerWidget({ onClose, initialContactId, onInitialContactConsumed }: MessengerWidgetProps) {
  const { toast } = useToast()
  const { user, profile } = useAuth()

  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null)

  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)
  const [markingRead, setMarkingRead] = useState(false)

  const [composerValue, setComposerValue] = useState('')
  const [newPersonId, setNewPersonId] = useState('')

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const fetchConversations = useCallback(async () => {
    setLoadingList(true)
    try {
      const response = await listConversations(TENANT_ID, { pageSize: 30 })
      const updatedItems = response.items.map((conversation) => ({
        ...conversation,
        person:
          conversation.person ??
          {
            id: conversation.id,
            firstName: 'Unknown',
            lastName: null,
            primaryEmail: null,
            primaryPhone: null
          }
      }))
      setConversations(updatedItems)
      if (!selectedConversationId && updatedItems.length > 0) {
        setSelectedConversationId(updatedItems[0].id)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load conversations'
      toast({ variant: 'destructive', title: 'Failed to load conversations', description: message })
    } finally {
      setLoadingList(false)
    }
  }, [selectedConversationId, toast])

  useEffect(() => {
    if (!user) return
    void fetchConversations()
  }, [fetchConversations, user])

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  )

  useEffect(() => {
    if (!user || !selectedConversationId) {
      setConversationDetail(null)
      return
    }
    const run = async () => {
      setLoadingDetail(true)
      try {
        const detail = await getConversation(selectedConversationId, TENANT_ID, { limit: 50 })
        setConversationDetail({
          ...detail,
          person:
            detail.person ??
            selectedConversation?.person ?? {
              id: selectedConversationId,
              firstName: 'Unknown',
              lastName: null,
              primaryEmail: null,
              primaryPhone: null
            }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load conversation'
        toast({ variant: 'destructive', title: 'Failed to load conversation', description: message })
      } finally {
        setLoadingDetail(false)
      }
    }
    void run()
  }, [selectedConversation, selectedConversationId, toast, user])

  const createConversationFor = useCallback(
    async (personId: string) => {
      setCreating(true)
      try {
        const detail = await createConversation({
          tenantId: TENANT_ID,
          type: 'EXTERNAL',
          personId: personId.trim()
        })
        setSelectedConversationId(detail.id)
        setConversationDetail({
          ...detail,
          person:
            detail.person ?? {
              id: personId,
              firstName: 'Unknown',
              lastName: null,
              primaryEmail: null,
              primaryPhone: null
            }
        })
        setComposerValue('')
        setNewPersonId('')
        await fetchConversations()
        // no toast; keep popup unobstructed
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to create conversation'
        toast({ variant: 'destructive', title: 'Failed to create conversation', description: message })
      } finally {
        setCreating(false)
      }
    },
    [fetchConversations, toast]
  )

  const handleCreateConversation = async () => {
    if (!newPersonId.trim()) {
      toast({
        variant: 'destructive',
        title: 'Contact required',
        description: 'Provide the contact/person ID to start a conversation.'
      })
      return
    }

    await createConversationFor(newPersonId)
  }

  const handleSendMessage = async () => {
    if (!selectedConversationId || !composerValue.trim()) {
      return
    }
    setSending(true)
    try {
      const message = await postConversationMessage(selectedConversationId, {
        tenantId: TENANT_ID,
        body: composerValue.trim()
      })
      const resolvedPersonId =
        message.personId ??
        conversationDetail?.person?.id ??
        selectedConversation?.person?.id ??
        null
      setComposerValue('')
      setConversationDetail((prev) => {
        if (!prev) return prev
        const updatedMessages: ConversationMessage[] = [message, ...prev.messages]
        return {
          ...prev,
          messages: updatedMessages,
          lastMessage: message,
          unreadCount: prev.unreadCount
        }
      })
      if (resolvedPersonId) {
        let recordedAt = message.createdAt
        let touchpointResponse: RecordLeadTouchpointResponse | null = null
        const payload: CreateLeadTouchpointPayload = {
          type: 'MESSAGE' as LeadTouchpointType,
          channel: 'IN_APP' as MessageChannelType,
          summary: 'In-app conversation reply',
          body: message.body ?? undefined,
          metadata: {
            conversationId: selectedConversationId,
            messageId: message.id,
            direction: message.direction
          },
          occurredAt: message.createdAt
        }
        try {
          touchpointResponse = await createLeadTouchpoint(resolvedPersonId, payload)
          recordedAt =
            touchpointResponse.lead.activityRollup?.lastTouchpointAt ??
            touchpointResponse.lead.lastActivityAt ??
            message.createdAt
        } catch (error) {
          console.error('Failed to record lead touchpoint', error)
        } finally {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('hatch:conversation:touchpoint', {
                detail: {
                  personId: resolvedPersonId,
                  timestamp: recordedAt,
                  score: touchpointResponse?.lead.score,
                  scoreTier: touchpointResponse?.lead.scoreTier,
                  activityRollup: touchpointResponse?.lead.activityRollup,
                  lastActivityAt: touchpointResponse?.lead.lastActivityAt ?? recordedAt
                }
              })
            )
          }
        }
      }
      await fetchConversations()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send message'
      toast({ variant: 'destructive', title: 'Failed to send', description: message })
    } finally {
      setSending(false)
    }
  }

  const handleMarkRead = async () => {
    if (!selectedConversationId) return
    setMarkingRead(true)
    try {
      await markConversationRead(selectedConversationId, { tenantId: TENANT_ID })
      await fetchConversations()
      if (selectedConversationId) {
        const detail = await getConversation(selectedConversationId, TENANT_ID, { limit: 50 })
        setConversationDetail(detail)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to mark as read'
      toast({ variant: 'destructive', title: 'Failed to mark read', description: message })
    } finally {
      setMarkingRead(false)
    }
  }

  const isViewer = useMemo(() => {
    if (!conversationDetail || !profile?.id) return false
    const participant = conversationDetail.participants.find((participant) => participant.user?.id === profile.id)
    return participant?.role === 'VIEWER'
  }, [conversationDetail, profile])

  useEffect(() => {
    if (!user || !initialContactId) return
    setNewPersonId(initialContactId)
    void (async () => {
      await createConversationFor(initialContactId)
      onInitialContactConsumed()
    })()
  }, [createConversationFor, initialContactId, onInitialContactConsumed, user])

  if (!user) {
    return (
      <Card className="w-[22rem] sm:w-[24rem] shadow-2xl border bg-white">
        <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
          <CardTitle className="text-base font-semibold">Messages</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close messenger">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-sm text-slate-600">
          Please sign in to access in-app conversations.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        'flex h-[min(80vh,34rem)] min-h-[24rem] w-[min(95vw,28rem)] sm:w-[min(90vw,32rem)] max-h-[calc(100vh-6rem)] flex-col border bg-white shadow-2xl transition-all duration-200 ease-out',
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      )}
    >
      <CardHeader className="flex-shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-slate-900">Messages</CardTitle>
          <div className="flex items-center gap-2">
            {selectedConversationId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkRead}
                disabled={markingRead || loadingDetail}
              >
                {markingRead ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Mark read
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close messenger">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-0">
        <div className="flex flex-1 flex-col sm:flex-row">
          <div className="flex min-w-0 flex-col border-b sm:h-full sm:w-[12rem] sm:flex-none sm:border-b-0 sm:border-r">
            <div className="space-y-2 border-b px-3 py-3">
              <div className="flex items-center gap-2">
                <Input
                  value={newPersonId}
                  onChange={(event) => setNewPersonId(event.target.value)}
                  placeholder="Contact ID"
                  disabled={creating}
                />
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={handleCreateConversation}
                  disabled={creating}
                  aria-label="Start conversation"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-1 px-3 py-2">
                {loadingList ? (
                  <div className="flex h-32 items-center justify-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading conversations...
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-sm text-slate-500">No conversations yet.</div>
                ) : (
                  conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className={cn(
                        'w-full rounded-lg border border-transparent px-3 py-2 text-left transition',
                        conversation.id === selectedConversationId
                          ? 'border-slate-300 bg-slate-100'
                          : 'hover:bg-slate-100'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {conversation.person?.firstName || conversation.person?.lastName
                            ? `${conversation.person?.firstName ?? ''} ${conversation.person?.lastName ?? ''}`.trim()
                            : 'Unnamed contact'}
                        </div>
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {conversation.type.toLowerCase()}
                        </Badge>
                      </div>
                      <div className="mt-1 line-clamp-1 text-xs text-slate-500">
                        {conversation.lastMessage?.body ?? 'No messages yet'}
                      </div>
                      {conversation.unreadCount > 0 ? (
                        <div className="mt-1 text-xs font-medium text-blue-600">
                          {conversation.unreadCount} unread
                        </div>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          <div className="flex min-w-0 flex-1 flex-col border-t pt-2 sm:h-full sm:border-t-0 sm:pl-0 sm:pt-0">
            {selectedConversationId ? (
              <>
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedConversation?.person?.firstName || selectedConversation?.person?.lastName
                        ? `${selectedConversation?.person?.firstName ?? ''} ${selectedConversation?.person?.lastName ?? ''}`.trim()
                        : 'Conversation'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selectedConversation?.participants.length ?? 0} participant
                      {(selectedConversation?.participants.length ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  {loadingDetail ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading messages...
                    </div>
                  ) : conversationDetail && conversationDetail.messages.length > 0 ? (
                    <div className="space-y-3 px-4 py-3">
                      {conversationDetail.messages.map((message) => {
                        const authoredByCurrentUser = message.userId === user.id
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              'rounded-lg border px-3 py-2 text-sm',
                              authoredByCurrentUser ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">
                                {authoredByCurrentUser
                                  ? 'You'
                                  : message.sender
                                  ? `${message.sender.firstName ?? ''} ${message.sender.lastName ?? ''}`.trim()
                                  : 'System'}
                              </span>
                              <span className="text-xs text-slate-500">
                                {new Date(message.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {message.body ? (
                              <p className="mt-1 text-slate-700 whitespace-pre-line">{message.body}</p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                      No messages yet. Start the conversation below.
                    </div>
                  )}
                </ScrollArea>
                {conversationDetail && !isViewer ? (
                  <div className="border-t px-4 py-3">
                    <div className="flex items-end gap-2">
                      <Textarea
                        value={composerValue}
                        onChange={(event) => setComposerValue(event.target.value)}
                        placeholder="Write a message..."
                        className="min-h-[60px] max-h-[140px]"
                        disabled={sending}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={sending || !composerValue.trim()}
                        type="button"
                        className="self-stretch"
                      >
                        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Send
                      </Button>
                    </div>
                  </div>
                ) : conversationDetail ? (
                  <div className="border-t px-4 py-3 text-xs text-slate-500">
                    You have viewer access to this conversation.
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                Select a conversation or start a new one from the list.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
