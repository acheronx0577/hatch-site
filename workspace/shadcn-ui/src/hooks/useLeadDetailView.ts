import { useCallback, useEffect, useRef, useState } from 'react'

interface LeadDetailViewState {
  isOpen: boolean
  leadId: string | null
}

interface UseLeadDetailViewOptions {
  closeDelayMs?: number
}

export function useLeadDetailView(options: UseLeadDetailViewOptions = {}) {
  const closeDelayMs = options.closeDelayMs ?? 300
  const [state, setState] = useState<LeadDetailViewState>({ isOpen: false, leadId: null })
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCloseTimeout = useCallback(() => {
    if (!closeTimeoutRef.current) return
    clearTimeout(closeTimeoutRef.current)
    closeTimeoutRef.current = null
  }, [])

  useEffect(() => {
    return () => clearCloseTimeout()
  }, [clearCloseTimeout])

  const openLeadDetails = useCallback(
    (leadId: string) => {
      clearCloseTimeout()
      setState({ isOpen: true, leadId })
    },
    [clearCloseTimeout]
  )

  const closeLeadDetails = useCallback(() => {
    clearCloseTimeout()
    setState((prev) => ({ ...prev, isOpen: false }))
    closeTimeoutRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, leadId: null }))
      closeTimeoutRef.current = null
    }, closeDelayMs)
  }, [clearCloseTimeout, closeDelayMs])

  const setIsOpen = useCallback(
    (open: boolean) => {
      if (open) {
        setState((prev) => (prev.leadId ? { ...prev, isOpen: true } : prev))
        return
      }
      closeLeadDetails()
    },
    [closeLeadDetails]
  )

  return {
    ...state,
    openLeadDetails,
    closeLeadDetails,
    setIsOpen
  }
}

