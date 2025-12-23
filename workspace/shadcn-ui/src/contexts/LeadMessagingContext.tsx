import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { useAuth } from './AuthContext'
import MessagingPanel, { type MessagingPanelMessageType } from '@/components/crm/MessagingPanel'
import type { LeadSummary } from '@/lib/api/hatch'

interface LeadMessagingContextValue {
  isOpen: boolean
  openForLead: (leadId: string, opts?: { lead?: LeadSummary; messageType?: MessagingPanelMessageType }) => void
  close: () => void
}

const LeadMessagingContext = createContext<LeadMessagingContextValue | undefined>(undefined)

export const LeadMessagingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [leadId, setLeadId] = useState<string | null>(null)
  const [lead, setLead] = useState<LeadSummary | null>(null)
  const [messageType, setMessageType] = useState<MessagingPanelMessageType>('email')

  useEffect(() => {
    if (!user) {
      setOpen(false)
      setLeadId(null)
      setLead(null)
    }
  }, [user])

  const close = useCallback(() => {
    setOpen(false)
    setLeadId(null)
    setLead(null)
  }, [])

  const openForLead = useCallback(
    (nextLeadId: string, opts?: { lead?: LeadSummary; messageType?: MessagingPanelMessageType }) => {
      if (!user) return
      setLeadId(nextLeadId)
      setLead(opts?.lead ?? null)
      if (opts?.messageType) {
        setMessageType(opts.messageType)
      }
      setOpen(true)
    },
    [user]
  )

  const value = useMemo(
    () => ({
      isOpen: open,
      openForLead,
      close
    }),
    [open, openForLead, close]
  )

  return (
    <LeadMessagingContext.Provider value={value}>
      {children}
      {user && leadId ? (
        <MessagingPanel
          open={open}
          onOpenChange={(next) => {
            if (next) {
              setOpen(true)
              return
            }
            close()
          }}
          leadId={leadId}
          lead={lead}
          messageType={messageType}
          onMessageTypeChange={setMessageType}
        />
      ) : null}
    </LeadMessagingContext.Provider>
  )
}

export const useLeadMessaging = () => {
  const ctx = useContext(LeadMessagingContext)
  if (!ctx) {
    throw new Error('useLeadMessaging must be used within a LeadMessagingProvider')
  }
  return ctx
}

