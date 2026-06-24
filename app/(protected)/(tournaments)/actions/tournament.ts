import { CategoryDto } from '@/app/(protected)/(tournaments)/models/CategoryDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import type { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { executeRequest } from '@/app/actions/api'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

/** Payload accepted by createTournament: a tournament plus the category names to resolve/create. */
export type CreateTournamentInput = Partial<TournamentDto> & { categoryNames?: string[]; maxCompetitors?: number }

export interface TournamentFilters {
  name?: string
  statuses?: TournamentStatus[]
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
export async function createTournament(tournament: CreateTournamentInput): Promise<{ id: number }> {
  return executeRequest<{ id: number }>('/createTournament', tournament)
}

/** Categories of the organization for a discipline / sub-discipline (autocomplete source). */
export async function getCategories(
  discipline: Discipline,
  subDiscipline: SubDiscipline | null
): Promise<CategoryDto[]> {
  return executeRequest<CategoryDto[]>('/getCategories', { discipline, subDiscipline })
}

/** Updates the editable attributes of a tournament. */
export async function updateTournament(tournamentId: number, tournament: Partial<TournamentDto>): Promise<void> {
  await executeRequest('/updateTournament', { id: tournamentId, ...tournament })
}

/** Permanently deletes a tournament. */
export async function deleteTournament(tournamentId: number): Promise<void> {
  await executeRequest('/deleteTournament', { id: tournamentId })
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
  /** Category instance (tournament_categories.id) to register into. */
  tournamentCategoryId?: number | null
}

/** Searches all visible tournaments of the organization by name and/or status. */
export async function searchTournaments({
  name = undefined,
  statuses = undefined,
  page = 1,
  pageSize = 10
}: TournamentFilters = {}): Promise<PaginatedResponse<TournamentDto[]>> {
  return executeRequest<PaginatedResponse<TournamentDto[]>>('/getTournaments', {
    name,
    statuses,
    page,
    pageSize
  })
}

/** Tournaments in stand_by or ongoing where the signed-in user participates. */
export async function getPlayerActiveTournaments({
  name = undefined,
  statuses = [TournamentStatus.STAND_BY, TournamentStatus.ONGOING],
  page = 1,
  pageSize = 10
}: TournamentFilters = {}): Promise<PaginatedResponse<TournamentDto[]>> {
  return executeRequest<PaginatedResponse<TournamentDto[]>>('/getTournaments', {
    ownedByPlayer: true,
    statuses,
    name,
    page,
    pageSize
  })
}

/** Tournaments owned by the signed-in user (organizer view). */
export async function getOrganizerTournaments({
  name = undefined,
  statuses = undefined,
  page = 1,
  pageSize = 10
}: TournamentFilters = {}): Promise<PaginatedResponse<TournamentDto[]>> {
  return executeRequest<PaginatedResponse<TournamentDto[]>>('/getTournaments', {
    ownedByUser: true,
    name,
    statuses,
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
