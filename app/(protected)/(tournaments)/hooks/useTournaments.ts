'use client'

import { useCallback } from 'react'
import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import type { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { useRequests } from '@/app/hooks/useRequests'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { CreateTournamentInput } from '../models/CreateTournamentInput'
import { JoinTournamentInput } from '../models/JoinTournamentInput'
import { TournamentFilters } from '../models/TournamentFilters'

export function useTournaments() {
  const executeRequest = useRequests()
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
    (tournamentId: number, tournament: Partial<TournamentDto>): Promise<void> =>
      executeRequest('/updateTournament', { id: tournamentId, ...tournament }),
    [executeRequest]
  )
  const deleteTournament = useCallback(
    (tournamentId: number): Promise<void> => executeRequest('/deleteTournament', { id: tournamentId }),
    [executeRequest]
  )
  const startTournament = useCallback(
    (tournamentId: number): Promise<void> => executeRequest('/startTournament', { id: tournamentId }),
    [executeRequest]
  )
  const closeCurrentRound = useCallback(
    (tournamentId: number): Promise<void> => executeRequest('/closeTournamentRound', { id: tournamentId }),
    [executeRequest]
  )
  const startNextRound = useCallback(
    (tournamentId: number): Promise<void> => executeRequest('/createTournamentRound', { id: tournamentId }),
    [executeRequest]
  )
  const finishTournament = useCallback(
    (tournamentId: number): Promise<void> => executeRequest('/finishTournament', { id: tournamentId }),
    [executeRequest]
  )
  const saveMatchResult = useCallback(
    (matchId: number, score: MatchScore): Promise<void> => executeRequest('/setMatchResult', { id: matchId, score }),
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
    (tournamentId: number, input: JoinTournamentInput): Promise<void> =>
      executeRequest('/joinTournament', { tournamentId, ...input }),
    [executeRequest]
  )
  const leaveTournament = useCallback(
    (tournamentId: number): Promise<void> => executeRequest('/leaveTournament', { tournamentId }),
    [executeRequest]
  )

  return {
    getTournament,
    createTournament,
    getCategories,
    updateTournament,
    deleteTournament,
    startTournament,
    closeCurrentRound,
    startNextRound,
    finishTournament,
    saveMatchResult,
    getTournaments,
    joinTournament,
    leaveTournament
  }
}
