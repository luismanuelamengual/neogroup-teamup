import type { ApiResult, CreateTournamentInput, UpdateTournamentInput } from '@/app/_models/api'
import type { CompetitorDto, TournamentDto } from '@/app/_models/dtos'
import type { MatchScore } from '@/app/_models/types'
import { apiRequest } from '@/app/_utils/api-client'
import type { OrganizerTournamentFilters, TournamentDetail } from '@/app/_utils/queries'

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
  const data = await apiRequest<{ tournaments: TournamentDto[] }>(`/api/tournaments${query ? `?${query}` : ''}`)

  return data.tournaments ?? []
}

/** Full tournament detail plus the signed-in user competitor entry (if any). */
export async function getTournamentDetail(tournamentId: number): Promise<TournamentDetailWithEntry | null> {
  const data = await apiRequest<TournamentDetailWithEntry & { error?: string }>(`/api/tournaments/${tournamentId}`)

  return data.error ? null : data
}

/** Creates a new tournament in stand_by status. */
export async function createTournament(input: CreateTournamentInput): Promise<ActionResult> {
  return apiRequest<ActionResult>('/api/tournaments', { method: 'POST', body: JSON.stringify(input) })
}

/** Updates the editable attributes of a tournament. */
export async function updateTournament(tournamentId: number, input: UpdateTournamentInput): Promise<ActionResult> {
  return apiRequest<ActionResult>(`/api/tournaments/${tournamentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  })
}

/** Starts the tournament: sets it ongoing and generates the first round. */
export async function startTournament(tournamentId: number): Promise<ActionResult> {
  return apiRequest<ActionResult>(`/api/tournaments/${tournamentId}/start`, { method: 'POST' })
}

/** Closes the current round once every match has a result. */
export async function closeCurrentRound(tournamentId: number): Promise<ActionResult> {
  return apiRequest<ActionResult>(`/api/tournaments/${tournamentId}/rounds/close`, { method: 'POST' })
}

/** Starts the next round (the current one must be closed). */
export async function startNextRound(tournamentId: number): Promise<ActionResult> {
  return apiRequest<ActionResult>(`/api/tournaments/${tournamentId}/rounds/next`, { method: 'POST' })
}

/** Marks the tournament as finished. */
export async function finishTournament(tournamentId: number): Promise<ActionResult> {
  return apiRequest<ActionResult>(`/api/tournaments/${tournamentId}/finish`, { method: 'POST' })
}

/** Saves (or edits) a match result. */
export async function saveMatchResult(matchId: number, score: MatchScore): Promise<ActionResult> {
  return apiRequest<ActionResult>(`/api/matches/${matchId}/result`, {
    method: 'PUT',
    body: JSON.stringify({ score })
  })
}
