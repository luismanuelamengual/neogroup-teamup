import { User } from '@/app/(auth)/models/User'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { executeRequest } from '@/app/actions/api'

/** Client-side registration actions: thin wrappers around the REST API. */

/** Payload to register the signed-in user (optionally with a partner) into a tournament. */
export interface JoinTournamentInput {
  partnerUserId?: number | null
  category?: string | null
}

/** Searches platform users by name, nickname or email (for partner selection). */
export async function searchUsers(query: string): Promise<User[]> {
  const normalized = query.trim()

  if (normalized.length < 2) {
    return []
  }

  const users = await executeRequest<Record<string, any>[]>('/getUsers', { query: normalized })

  return users.map(User.fromJSON)
}

/** Searches joinable/visible tournaments by name. */
export async function searchTournaments(name: string): Promise<Tournament[]> {
  const tournaments = await executeRequest<Record<string, any>[]>('/getTournaments', { scope: 'search', name })

  return tournaments.map(Tournament.fromJSON)
}

/** Tournaments in stand_by or ongoing where the signed-in user participates. */
export async function getPlayerActiveTournaments(): Promise<Tournament[]> {
  const tournaments = await executeRequest<Record<string, any>[]>('/getTournaments', { scope: 'active' })

  return tournaments.map(Tournament.fromJSON)
}

/** Registers the signed-in user (optionally with a partner) into a tournament. */
export async function joinTournament(tournamentId: number, input: JoinTournamentInput): Promise<void> {
  await executeRequest('/joinTournament', { tournamentId, ...input })
}

/** Removes the signed-in user registration while the tournament is in stand_by. */
export async function leaveTournament(tournamentId: number): Promise<void> {
  await executeRequest('/leaveTournament', { tournamentId })
}
