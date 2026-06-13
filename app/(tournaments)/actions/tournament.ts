import type { Competitor } from '@/app/(tournaments)/models/Competitor'
import type { MatchScore } from '@/app/(tournaments)/models/MatchScore'
import type { Tournament } from '@/app/(tournaments)/models/Tournament'
import type { OrganizerTournamentFilters, TournamentDetail } from '@/app/(tournaments)/services/tournaments'
import { executeRequest } from '@/app/actions/api'

/** Client-side tournament actions: thin wrappers around the REST API. */

export interface TournamentDetailWithEntry extends TournamentDetail {
  userEntry: Competitor | null
  isOwner: boolean
}

/** Tournaments owned by the signed-in user (organizer view). */
export async function getOrganizerTournaments(filters: OrganizerTournamentFilters = {}): Promise<Tournament[]> {
  return executeRequest<Tournament[]>('/tournaments/list', filters)
}

/** Full tournament detail plus the signed-in user competitor entry (if any). */
export async function getTournamentDetail(tournamentId: number): Promise<TournamentDetailWithEntry | null> {
  try {
    return await executeRequest<TournamentDetailWithEntry>(`/tournaments/${tournamentId}/get`)
  } catch (_error) {
    return null
  }
}

/** Creates a new tournament in stand_by status. Returns the new tournament id. */
export async function createTournament(tournament: Partial<Tournament>): Promise<{ id: number }> {
  return executeRequest<{ id: number }>('/tournaments/create', tournament)
}

/** Updates the editable attributes of a tournament. */
export async function updateTournament(tournamentId: number, tournament: Partial<Tournament>): Promise<void> {
  await executeRequest(`/tournaments/${tournamentId}/update`, tournament)
}

/** Starts the tournament: sets it ongoing and generates the first round. */
export async function startTournament(tournamentId: number): Promise<void> {
  await executeRequest(`/tournaments/${tournamentId}/start`)
}

/** Closes the current round once every match has a result. */
export async function closeCurrentRound(tournamentId: number): Promise<void> {
  await executeRequest(`/tournaments/${tournamentId}/rounds/close`)
}

/** Starts the next round (the current one must be closed). */
export async function startNextRound(tournamentId: number): Promise<void> {
  await executeRequest(`/tournaments/${tournamentId}/rounds/next`)
}

/** Marks the tournament as finished. */
export async function finishTournament(tournamentId: number): Promise<void> {
  await executeRequest(`/tournaments/${tournamentId}/finish`)
}

/** Saves (or edits) a match result. */
export async function saveMatchResult(matchId: number, score: MatchScore): Promise<void> {
  await executeRequest(`/matches/${matchId}/result`, { score })
}
