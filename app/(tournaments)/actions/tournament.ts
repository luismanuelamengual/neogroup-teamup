import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Match } from '@/app/(tournaments)/models/Match'
import type { MatchScore } from '@/app/(tournaments)/models/MatchScore'
import { Round } from '@/app/(tournaments)/models/Round'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { executeRequest } from '@/app/actions/api'

/** Client-side tournament actions: thin wrappers around the REST API. */

export interface OrganizerTournamentFilters {
  name?: string
  onlyActive?: boolean
}

export interface TournamentDetailWithEntry {
  tournament: Tournament
  competitors: Competitor[]
  rounds: Round[]
  matches: Match[]
  userEntry: Competitor | null
  isOwner: boolean
}

/** Tournaments owned by the signed-in user (organizer view). */
export async function getOrganizerTournaments(filters: OrganizerTournamentFilters = {}): Promise<Tournament[]> {
  const tournaments = await executeRequest<Record<string, any>[]>('/getTournaments', { scope: 'owned', ...filters })

  return tournaments.map(Tournament.fromJSON)
}

/** Full tournament detail plus the signed-in user competitor entry (if any). */
export async function getTournamentDetail(tournamentId: number): Promise<TournamentDetailWithEntry | null> {
  try {
    const detail = await executeRequest<Record<string, any>>('/getTournament', { id: tournamentId })

    return {
      tournament: Tournament.fromJSON(detail.tournament),
      competitors: (detail.competitors ?? []).map(Competitor.fromJSON),
      rounds: (detail.rounds ?? []).map(Round.fromJSON),
      matches: (detail.matches ?? []).map(Match.fromJSON),
      userEntry: detail.userEntry ? Competitor.fromJSON(detail.userEntry) : null,
      isOwner: detail.isOwner
    }
  } catch (_error) {
    return null
  }
}

/** Creates a new tournament in stand_by status. Returns the new tournament id. */
export async function createTournament(tournament: Partial<Tournament>): Promise<{ id: number }> {
  return executeRequest<{ id: number }>('/createTournament', tournament)
}

/** Updates the editable attributes of a tournament. */
export async function updateTournament(tournamentId: number, tournament: Partial<Tournament>): Promise<void> {
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
