import { useCallback, useState } from 'react'

import { createLeadNote, type LeadDetail, type LeadNote, updateLead } from '@/lib/api/hatch'

type PendingAction = 'stage' | 'owner' | 'note' | null

interface LeadActions {
  pending: PendingAction
  error: string | null
  clearError: () => void
  changeStage: (stageId: string, pipelineId?: string | null) => Promise<LeadDetail>
  assignOwner: (ownerId: string) => Promise<LeadDetail>
  addNote: (body: string) => Promise<LeadNote>
}

export function useLeadActions(leadId: string | null): LeadActions {
  const [pending, setPending] = useState<PendingAction>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async <T,>(action: PendingAction, fn: () => Promise<T>) => {
      if (!leadId) {
        throw new Error('Lead identifier is required for this action.')
      }
      setPending(action)
      setError(null)
      try {
        return await fn()
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message || 'Unable to complete action'
            : 'Unable to complete action'
        setError(message)
        throw err
      } finally {
        setPending(null)
      }
    },
    [leadId]
  )

  const changeStage = useCallback(
    (stageId: string, pipelineId?: string | null) =>
      run('stage', () =>
        updateLead(leadId!, {
          stageId,
          ...(pipelineId ? { pipelineId } : {})
        })
      ),
    [leadId, run]
  )

  const assignOwner = useCallback(
    (ownerId: string) =>
      run('owner', () =>
        updateLead(leadId!, {
          ownerId
        })
      ),
    [leadId, run]
  )

  const addNote = useCallback(
    (body: string) =>
      run('note', () => createLeadNote(leadId!, body)),
    [leadId, run]
  )

  return {
    pending,
    error,
    clearError: () => setError(null),
    changeStage,
    assignOwner,
    addNote
  }
}
