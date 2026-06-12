import type { CompetitorDto, TournamentDto } from '@/app/(tournaments)/models/dtos'
import type { CreateTournamentInput, UpdateTournamentInput } from '@/app/(tournaments)/models/inputs'
import type { MatchScore } from '@/app/(tournaments)/models/types'
import type { OrganizerTournamentFilters, TournamentDetail } from '@/app/(tournaments)/services/queries'
import { executeRequest } from '@/app/actions/api'
import type { ApiResult } from '@/app/models/api'

/**
 * Client-side tournament actions: thin wrappers around the REST API
 * (plus any data massaging needed by the views).
 */

export type ActionResult = ApiResult
export type { CreateTournamentInput, UpdateTournamentInput }

export interface TournamentDetailWithEntry extends TournamentDetail {
  userEntry: CompetitorDto | null
  isOwner: boolean
}

/** Tournaments owned by the signed-in user (organizer view). */
export async function getOrganizerTournaments(filters: OrganizerTournamentFilters = {}): Promise<TournamentDto[]> {
  const params = new URLSearchParams()

  if (filters.name) {
    params.set('name', filters.name)
  }

  if (filters.onlyActive) {
    params.set('active', '1')
  }

  const query = params.toString()
  const data = await executeRequest<{ tournaments: TournamentDto[] }>(`/tournaments${query ? `?${query}` : ''}`)

  return data.tournaments ?? []
}

/** Full tournament detail plus the signed-in user competitor entry (if any). */
export async function getTournamentDetail(tournamentId: number): Promise<TournamentDetailWithEntry | null> {
  const data = await executeRequest<TournamentDetailWithEntry & { error?: string }>(`/tournaments/${tournamentId}`)

  return data.error ? null : data
}

/** Creates a new tournament in stand_by status. */
export async function createTournament(input: CreateTournamentInput): Promise<ActionResult> {
  return executeRequest<ActionResult>('/tournaments', { method: 'POST', body: JSON.stringify(input) })
}

/** Updates the editable attributes of a tournament. */
export async function updateTournament(tournamentId: number, input: UpdateTournamentInput): Promise<ActionResult> {
  return executeRequest<ActionResult>(`/tournaments/${tournamentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  })
}

/** Starts the tournament: sets it ongoing and generates the first round. */
export async function startTournament(tournamentId: number): Promise<ActionResult> {
  return executeRequest<ActionResult>(`/tournaments/${tournamentId}/start`, { method: 'POST' })
}

/** Closes the current round once every match has a result. */
export async function closeCurrentRound(tournamentId: number): Promise<ActionResult> {
  return executeRequest<ActionResult>(`/tournaments/${tournamentId}/rounds/close`, { method: 'POST' })
}

/** Starts the next round (the current one must be closed). */
export async function startNextRound(tournamentId: number): Promise<ActionResult> {
  return executeRequest<ActionResult>(`/tournaments/${tournamentId}/rounds/next`, { method: 'POST' })
}

/** Marks the tournament as finished. */
export async function finishTournament(tournamentId: number): Promise<ActionResult> {
  return executeRequest<ActionResult>(`/tournaments/${tournamentId}/finish`, { method: 'POST' })
}

/** Saves (or edits) a match result. */
export async function saveMatchResult(matchId: number, score: MatchScore): Promise<ActionResult> {
  return executeRequest<ActionResult>(`/matches/${matchId}/result`, {
    method: 'PUT',
    body: JSON.stringify({ score })
  })
}
