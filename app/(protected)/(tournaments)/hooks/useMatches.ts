'use client'

import { useCallback } from 'react'
import type { MatchScheduleInput } from '@/app/(protected)/(tournaments)/models/MatchScheduleInput'
import type { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useRequests } from '@/app/hooks/useRequests'

/**
 * Everything a screen does to a MATCH: loading its result, and planning when
 * and where it is played. Its tournament-level sibling is `useTournaments` — a
 * match is only ever reached through a tournament, but what you do to one is
 * its own set of operations.
 */
export function useMatches() {
  const executeRequest = useRequests()
  const { showSuccessMessage } = useNotifications()
  const saveMatchResult = useCallback(
    async (matchId: number, score: MatchScore): Promise<void> => {
      try {
        await executeRequest('/setMatchResult', { id: matchId, score })
        showSuccessMessage('Resultado guardado correctamente')
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage]
  )
  // Scheduling is written on every drag & drop of the planner, so unlike
  // saveMatchResult these deliberately show no success toast — only failures are
  // surfaced, and they reject so the caller can roll back its optimistic update.
  const saveMatchSchedule = useCallback(
    (matchId: number, schedule: MatchScheduleInput): Promise<void> =>
      executeRequest('/setMatchSchedule', { id: matchId, ...schedule }).then(() => undefined),
    [executeRequest]
  )
  const clearMatchSchedule = useCallback(
    (matchId: number): Promise<void> => executeRequest('/clearMatchSchedule', { id: matchId }).then(() => undefined),
    [executeRequest]
  )

  return { saveMatchResult, saveMatchSchedule, clearMatchSchedule }
}
