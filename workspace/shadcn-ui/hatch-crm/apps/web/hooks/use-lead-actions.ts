'use client';

import { useCallback, useState } from 'react';

import { ApiError } from '@/lib/api/errors';
import {
  createLeadNote,
  type LeadDetail,
  type LeadNote,
  updateLead
} from '@/lib/api';

type PendingAction = 'stage' | 'assign' | 'note' | null;

export interface LeadActions {
  pending: PendingAction;
  error: string | null;
  clearError: () => void;
  changeStage: (stageId: string, pipelineId?: string | null) => Promise<LeadDetail>;
  assignOwner: (ownerId: string) => Promise<LeadDetail>;
  addNote: (body: string) => Promise<LeadNote>;
}

export function useLeadActions(leadId: string): LeadActions {
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(action: PendingAction, fn: () => Promise<T>) => {
      setPending(action);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message ?? 'Unable to complete action'
            : err instanceof Error
            ? err.message
            : 'Unable to complete action';
        setError(message);
        throw err;
      } finally {
        setPending(null);
      }
    },
    []
  );

  const changeStage = useCallback(
    (stageId: string, pipelineId?: string | null) =>
      run('stage', () =>
        updateLead(leadId, {
          stageId,
          ...(pipelineId ? { pipelineId } : {})
        })
      ),
    [leadId, run]
  );

  const assignOwner = useCallback(
    (ownerId: string) =>
      run('assign', () =>
        updateLead(leadId, {
          ownerId
        })
      ),
    [leadId, run]
  );

  const addNote = useCallback(
    (body: string) => run('note', () => createLeadNote(leadId, body)),
    [leadId, run]
  );

  return {
    pending,
    error,
    clearError: () => setError(null),
    changeStage,
    assignOwner,
    addNote
  };
}

