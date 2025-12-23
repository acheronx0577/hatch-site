import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { createLeadNote, type LeadDetail, type LeadNote, type UpdateLeadPayload, updateLead } from '@/lib/api/hatch'

type PendingAction = 'stage' | 'owner' | 'leadType' | 'note' | 'fit' | null

interface LeadActions {
  pending: PendingAction
  error: string | null
  clearError: () => void
  changeStage: (stageId: string, pipelineId?: string | null) => Promise<LeadDetail>
  assignOwner: (ownerId: string) => Promise<LeadDetail>
  updateLeadType: (leadType: UpdateLeadPayload['leadType']) => Promise<LeadDetail>
  addNote: (body: string) => Promise<LeadNote>
  updateFit: (fit: UpdateLeadPayload['fit']) => Promise<LeadDetail>
}

export function useLeadActions(leadId: string | null): LeadActions {
  const [pending, setPending] = useState<PendingAction>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const invalidateLeadMetrics = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['pipeline-board', 'columns'] })
    void queryClient.invalidateQueries({ queryKey: ['mission-control', 'overview'] })
    void queryClient.invalidateQueries({ queryKey: ['mission-control', 'agents'] })
  }, [queryClient])

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
        }).then((updated) => {
          invalidateLeadMetrics()
          return updated
        })
      ),
    [invalidateLeadMetrics, leadId, run]
  )

  const assignOwner = useCallback(
    (ownerId: string) =>
      run('owner', () =>
        updateLead(leadId!, {
          ownerId: ownerId === '' ? null : ownerId
        }).then((updated) => {
          invalidateLeadMetrics()
          return updated
        })
      ),
    [invalidateLeadMetrics, leadId, run]
  )

  const updateLeadType = useCallback(
    (leadType: UpdateLeadPayload['leadType']) =>
      run('leadType', () =>
        updateLead(leadId!, { leadType }).then((updated) => {
          invalidateLeadMetrics()
          return updated
        })
      ),
    [invalidateLeadMetrics, leadId, run]
  )

  const addNote = useCallback(
    (body: string) =>
      run('note', () =>
        createLeadNote(leadId!, body).then((note) => {
          void queryClient.invalidateQueries({ queryKey: ['mission-control', 'activity'] })
          return note
        })
      ),
    [leadId, queryClient, run]
  )

  const updateFit = useCallback(
    (fit: UpdateLeadPayload['fit']) =>
      run('fit', () =>
        updateLead(leadId!, { fit }).then((updated) => {
          invalidateLeadMetrics()
          return updated
        })
      ),
    [invalidateLeadMetrics, leadId, run]
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    pending,
    error,
    clearError,
    changeStage,
    assignOwner,
    updateLeadType,
    addNote,
    updateFit
  }
}
