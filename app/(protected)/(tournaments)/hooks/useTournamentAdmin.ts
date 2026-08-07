'use client'

import { useCallback } from 'react'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useRequests } from '@/app/hooks/useRequests'

/** Organizer-only tournament administration actions (categories + competitors). */
export function useTournamentAdmin() {
  const executeRequest = useRequests()
  const { showSuccessMessage } = useNotifications()
  const addCategory = useCallback(
    async (tournamentId: number, categoryId: number, maxCompetitors: number): Promise<void> => {
      await executeRequest('/addTournamentCategory', { tournamentId, categoryId, maxCompetitors })
      showSuccessMessage('Categoría agregada correctamente')
    },
    [executeRequest, showSuccessMessage]
  )
  const removeCategory = useCallback(
    async (tournamentId: number, tournamentCategoryId: number): Promise<void> => {
      await executeRequest('/removeTournamentCategory', { tournamentId, tournamentCategoryId })
      showSuccessMessage('Categoría quitada correctamente')
    },
    [executeRequest, showSuccessMessage]
  )
  const registerCompetitor = useCallback(
    async (
      tournamentId: number,
      tournamentCategoryId: number,
      playerIds: number[],
      siteId: number | null = null,
      // Which structural hole the entrant takes when the tournament is already
      // running (a knockout bye, or a group of the group phase). Both null on a
      // tournament that has not started, where there is no structure yet.
      slot: { matchId?: number | null; groupNumber?: number | null } | null = null
    ): Promise<void> => {
      await executeRequest('/registerCompetitor', {
        tournamentId,
        tournamentCategoryId,
        playerIds,
        siteId,
        slotMatchId: slot?.matchId ?? null,
        slotGroupNumber: slot?.groupNumber ?? null
      })
      showSuccessMessage('Competidor inscripto correctamente')
    },
    [executeRequest, showSuccessMessage]
  )
  const moveCompetitor = useCallback(
    async (tournamentId: number, competitorId: number, tournamentCategoryId: number): Promise<void> => {
      await executeRequest('/moveCompetitor', { tournamentId, competitorId, tournamentCategoryId })
      showSuccessMessage('Competidor movido correctamente')
    },
    [executeRequest, showSuccessMessage]
  )
  const unregisterCompetitor = useCallback(
    async (tournamentId: number, competitorId: number): Promise<void> => {
      await executeRequest('/unregisterCompetitor', { tournamentId, competitorId })
      showSuccessMessage('Competidor desinscripto correctamente')
    },
    [executeRequest, showSuccessMessage]
  )
  const setCompetitorSeed = useCallback(
    async (tournamentId: number, competitorId: number, seedNumber: number | null): Promise<void> => {
      await executeRequest('/setCompetitorSeed', { tournamentId, competitorId, seedNumber })
      showSuccessMessage('Seed actualizado correctamente')
    },
    [executeRequest, showSuccessMessage]
  )

  return {
    addCategory,
    removeCategory,
    registerCompetitor,
    moveCompetitor,
    unregisterCompetitor,
    setCompetitorSeed
  }
}
