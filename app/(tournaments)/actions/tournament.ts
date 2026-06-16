import type { MatchScore } from '@/app/(tournaments)/models/MatchScore'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'
import { executeRequest } from '@/app/actions/api'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

export interface TournamentFilters {
  name?: string
  onlyActive?: boolean
  page?: number
  pageSize?: number
}

/** Full tournament detail (competitors, rounds, matches). */
export async function getTournament(tournamentId: number): Promise<TournamentDto | null> {
  try {
    return await executeRequest<TournamentDto>('/getTournament', { id: tournamentId })
  } catch (_error) {
    return null
  }
}

/** Creates a new tournament in stand_by status. Returns the new tournament id. */
export async function createTournament(tournament: Partial<TournamentDto>): Promise<{ id: number }> {
  return executeRequest<{ id: number }>('/createTournament', tournament)
}

/** Updates the editable attributes of a tournament. */
export async function updateTournament(tournamentId: number, tournament: Partial<TournamentDto>): Promise<void> {
  await executeRequest('/updateTournament', { id: tournamentId, ...tournament })
}

/** Starts the tournament: sets it ongoing and generates the first round. */
export async function startTournament(tournamentId: number): Promise<void> {
  await executeRequest('/startTournament', { id: tournamentId })
}

/** Closes the current round once every match has a result. */
export async function closeCurrentRound(tournamentId: number): Promise<void> {
  await executeRequest('/closeTournamentRound', { id: tournamentId })
}

/** Starts the next round (the current one must be closed). */
export async function startNextRound(tournamentId: number): Promise<void> {
  await executeRequest('/createTournamentRound', { id: tournamentId })
}

/** Marks the tournament as finished. */
export async function finishTournament(tournamentId: number): Promise<void> {
  await executeRequest('/finishTournament', { id: tournamentId })
}

/** Saves (or edits) a match result. */
export async function saveMatchResult(matchId: number, score: MatchScore): Promise<void> {
  await executeRequest('/setMatchResult', { id: matchId, score })
}

/** Payload to register the signed-in user (optionally with a partner) into a tournament. */
export interface JoinTournamentInput {
  partnerUserId?: number | null
  category?: string | null
}

/** Searches joinable/visible tournaments by name. */
export async function searchTournaments({
  name = undefined,
  onlyActive = true,
  page = 1,
  pageSize = 10
}: TournamentFilters = {}): Promise<PaginatedResponse<TournamentDto[]>> {
  return executeRequest<PaginatedResponse<TournamentDto[]>>('/getTournaments', {
    scope: 'search',
    name,
    onlyActive,
    page,
    pageSize
  })
}

/** Tournaments in stand_by or ongoing where the signed-in user participates. */
export async function getPlayerActiveTournaments({
  name = undefined,
  onlyActive = true,
  page = 1,
  pageSize = 10
}: TournamentFilters = {}): Promise<PaginatedResponse<TournamentDto[]>> {
  return executeRequest<PaginatedResponse<TournamentDto[]>>('/getTournaments', {
    scope: 'active',
    name,
    onlyActive,
    page,
    pageSize
  })
}

/** Tournaments owned by the signed-in user (organizer view). */
export async function getOrganizerTournaments({
  name = undefined,
  onlyActive = true,
  page = 1,
  pageSize = 10
}: TournamentFilters = {}): Promise<PaginatedResponse<TournamentDto[]>> {
  return executeRequest<PaginatedResponse<TournamentDto[]>>('/getTournaments', {
    scope: 'owned',
    name,
    onlyActive,
    page,
    pageSize
  })
}

/** Registers the signed-in user (optionally with a partner) into a tournament. */
export async function joinTournament(tournamentId: number, input: JoinTournamentInput): Promise<void> {
  await executeRequest('/joinTournament', { tournamentId, ...input })
}

/** Removes the signed-in user registration while the tournament is in stand_by. */
export async function leaveTournament(tournamentId: number): Promise<void> {
  await executeRequest('/leaveTournament', { tournamentId })
}
