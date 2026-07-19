'use client'

import { useCallback } from 'react'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useRequests } from '@/app/hooks/useRequests'

/** Organizer-only tournament administration actions (categories + competitors). */
export function useTournamentAdmin() {
  const executeRequest = useRequests()
  const { showSuccessMessage } = useNotifications()
  const addCategory = useCallback(
    async (tournamentId: number, name: string, maxCompetitors: number): Promise<void> => {
      await executeRequest('/addTournamentCategory', { tournamentId, name, maxCompetitors })
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
    async (tournamentId: number, tournamentCategoryId: number, playerIds: number[]): Promise<void> => {
      await executeRequest('/registerCompetitor', { tournamentId, tournamentCategoryId, playerIds })
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

  return { addCategory, removeCategory, registerCompetitor, moveCompetitor, unregisterCompetitor }
}
