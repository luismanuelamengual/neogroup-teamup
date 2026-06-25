'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  const tOrganizer = useTranslations('organizer')
  const tPlayer = useTranslations('player')
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
      showSuccessMessage(tOrganizer('manage.tournamentUpdated'))
    },
    [executeRequest, showSuccessMessage, tOrganizer]
  )
  const deleteTournament = useCallback(
    async (tournamentId: number): Promise<void> => {
      await executeRequest('/deleteTournament', { id: tournamentId })
      showSuccessMessage(tOrganizer('manage.tournamentDeleted'))
      router.push('/tournaments')
    },
    [executeRequest, router, showSuccessMessage, tOrganizer]
  )
  const startTournament = useCallback(
    async (tournamentId: number): Promise<void> => {
      try {
        await executeRequest('/startTournament', { id: tournamentId })
        showSuccessMessage(tOrganizer('manage.tournamentStarted'))
      } catch (e) {
        throw e
      }
    },
    [executeRequest, showSuccessMessage, tOrganizer]
  )
  const finishTournament = useCallback(
    async (tournamentId: number): Promise<void> => {
      try {
        await executeRequest('/finishTournament', { id: tournamentId })
        showSuccessMessage(tOrganizer('manage.tournamentFinished'))
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage, tOrganizer]
  )
  const saveMatchResult = useCallback(
    async (matchId: number, score: MatchScore): Promise<void> => {
      try {
        await executeRequest('/setMatchResult', { id: matchId, score })
        showSuccessMessage(tPlayer('resultSubmitted'))
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage, tPlayer]
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
        showSuccessMessage(tPlayer('tournamentJoined'))
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage, tPlayer]
  )
  const leaveTournament = useCallback(
    async (tournamentId: number): Promise<void> => {
      try {
        await executeRequest('/leaveTournament', { tournamentId })
        showSuccessMessage(tPlayer('tournamentLeft'))
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage, tPlayer]
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
