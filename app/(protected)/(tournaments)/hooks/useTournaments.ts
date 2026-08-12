'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import type { MatchScheduleInput } from '@/app/(protected)/(tournaments)/models/MatchScheduleInput'
import type { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useRequests } from '@/app/hooks/useRequests'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { CreateTournamentInput } from '../models/CreateTournamentInput'
import { JoinTournamentInput } from '../models/JoinTournamentInput'
import { TournamentFilters } from '../models/TournamentFilters'
import { UpdateTournamentInput } from '../models/UpdateTournamentInput'

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
  const updateTournament = useCallback(
    async (tournamentId: number, tournament: UpdateTournamentInput): Promise<void> => {
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
  // Ends one category's group phase ahead of time and starts its knockout (see
  // /api/closeGroupPhase). The toast names how many fixtures were called off, so
  // the organizer sees the cost of the action right after confirming it.
  const closeGroupPhase = useCallback(
    async (tournamentId: number, tournamentCategoryId: number): Promise<void> => {
      const { voided } = await executeRequest<{ voided: number }>('/closeGroupPhase', {
        tournamentId,
        tournamentCategoryId
      })

      showSuccessMessage(
        voided > 0
          ? `Fase de grupos finalizada. Se anularon ${voided} partido${voided === 1 ? '' : 's'} sin jugar`
          : 'Fase de grupos finalizada'
      )
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
      await executeRequest('/joinTournament', { tournamentId, ...input })
      showSuccessMessage('Te inscribiste al torneo correctamente')
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
  // Team captain adding/removing mates from their own interclubes team, while
  // registrations are still open (see /api/updateTeamRoster).
  const updateTeamRoster = useCallback(
    async (tournamentId: number, playerIds: number[]): Promise<void> => {
      await executeRequest('/updateTeamRoster', { tournamentId, playerIds })
      showSuccessMessage('Equipo actualizado correctamente')
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
    closeGroupPhase,
    joinTournament,
    leaveTournament,
    updateTeamRoster,
    saveMatchResult,
    saveMatchSchedule,
    clearMatchSchedule
  }
}
