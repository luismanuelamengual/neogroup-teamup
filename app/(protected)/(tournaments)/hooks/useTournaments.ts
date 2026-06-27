'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import type { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useRequests } from '@/app/hooks/useRequests'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { CreateTournamentInput } from '../models/CreateTournamentInput'
import { JoinTournamentInput } from '../models/JoinTournamentInput'
import { TournamentFilters } from '../models/TournamentFilters'

export function useTournaments() {
  const executeRequest = useRequests()
  const { showSuccessMessage } = useNotifications()
  const router = useRouter()
  const getTournament = useCallback(
    (tournamentId: number): Promise<TournamentDto | null> =>
      executeRequest<TournamentDto>('/getTournament', { id: tournamentId }).catch(() => null),
    [executeRequest]
  )
  const createTournament = useCallback(
    (tournament: CreateTournamentInput): Promise<{ id: number }> =>
      executeRequest<{ id: number }>('/createTournament', tournament),
    [executeRequest]
  )
  const getCategories = useCallback(
    (discipline: Discipline, subDiscipline: SubDiscipline | null): Promise<CategoryDto[]> =>
      executeRequest<CategoryDto[]>('/getCategories', { discipline, subDiscipline }),
    [executeRequest]
  )
  const updateTournament = useCallback(
    async (tournamentId: number, tournament: Partial<TournamentDto>): Promise<void> => {
      await executeRequest('/updateTournament', { id: tournamentId, ...tournament })
      showSuccessMessage('Torneo actualizado correctamente')
    },
    [executeRequest, showSuccessMessage]
  )
  const deleteTournament = useCallback(
    async (tournamentId: number): Promise<void> => {
      await executeRequest('/deleteTournament', { id: tournamentId })
      showSuccessMessage('Torneo eliminado correctamente')
      router.push('/tournaments')
    },
    [executeRequest, router, showSuccessMessage]
  )
  const startTournament = useCallback(
    async (tournamentId: number): Promise<void> => {
      try {
        await executeRequest('/startTournament', { id: tournamentId })
        showSuccessMessage('Torneo iniciado correctamente')
      } catch (e) {
        throw e
      }
    },
    [executeRequest, showSuccessMessage]
  )
  const finishTournament = useCallback(
    async (tournamentId: number): Promise<void> => {
      try {
        await executeRequest('/finishTournament', { id: tournamentId })
        showSuccessMessage('Torneo finalizado correctamente')
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage]
  )
  const saveMatchResult = useCallback(
    async (matchId: number, score: MatchScore): Promise<void> => {
      try {
        await executeRequest('/setMatchResult', { id: matchId, score })
        showSuccessMessage('Resultado guardado correctamente')
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage]
  )
  const getTournaments = useCallback(
    ({
      name = undefined,
      statuses = undefined,
      ownedByPlayer = false,
      page = 1,
      pageSize = 10
    }: TournamentFilters = {}): Promise<PaginatedResponse<TournamentDto[]>> =>
      executeRequest<PaginatedResponse<TournamentDto[]>>('/getTournaments', {
        name,
        statuses,
        ownedByPlayer,
        page,
        pageSize
      }),
    [executeRequest]
  )
  const joinTournament = useCallback(
    async (tournamentId: number, input: JoinTournamentInput): Promise<void> => {
      try {
        await executeRequest('/joinTournament', { tournamentId, ...input })
        showSuccessMessage('Te inscribiste al torneo correctamente')
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage]
  )
  const leaveTournament = useCallback(
    async (tournamentId: number): Promise<void> => {
      try {
        await executeRequest('/leaveTournament', { tournamentId })
        showSuccessMessage('Te diste de baja del torneo correctamente')
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage]
  )

  return {
    getTournament,
    getTournaments,
    createTournament,
    updateTournament,
    deleteTournament,
    startTournament,
    finishTournament,
    joinTournament,
    leaveTournament,
    saveMatchResult,
    getCategories
  }
}
