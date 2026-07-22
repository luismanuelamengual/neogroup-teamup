'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import type { PaymentStatusResult } from '@/app/(protected)/(tournaments)/(api)/api/getPaymentStatus/route'
import type { JoinTournamentResult } from '@/app/(protected)/(tournaments)/(api)/api/joinTournament/route'
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
    async (tournamentId: number, input: JoinTournamentInput): Promise<JoinTournamentResult> => {
      const result = await executeRequest<JoinTournamentResult>('/joinTournament', { tournamentId, ...input })

      // Paid tournaments redirect to Mercado Pago instead of confirming here.
      if (result.paid && result.initPoint) {
        showSuccessMessage('Redirigiendo a Mercado Pago para completar el pago...')
        window.location.href = result.initPoint
      } else {
        showSuccessMessage('Te inscribiste al torneo correctamente')
      }

      return result
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
  const getPaymentStatus = useCallback(
    (tournamentId: number): Promise<PaymentStatusResult | null> =>
      executeRequest<PaymentStatusResult>('/getPaymentStatus', { tournamentId }, false).catch(() => null),
    [executeRequest]
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
    getPaymentStatus
  }
}
