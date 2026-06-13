import type { UserDto } from '@/app/(auth)/models/User'
import type { Tournament } from '@/app/(tournaments)/models/Tournament'
import { executeRequest } from '@/app/actions/api'

/** Client-side registration actions: thin wrappers around the REST API. */

/** Payload to register the signed-in user (optionally with a partner) into a tournament. */
export interface JoinTournamentInput {
  partnerUserId?: number | null
  partnerName?: string | null
}

/** Searches platform users by name, nickname or email (for partner selection). */
export async function searchUsers(query: string): Promise<UserDto[]> {
  const normalized = query.trim()

  if (normalized.length < 2) {
    return []
  }

  return executeRequest<UserDto[]>('/users/search', { query: normalized })
}

/** Searches joinable/visible tournaments by name. */
export async function searchTournaments(name: string): Promise<Tournament[]> {
  return executeRequest<Tournament[]>('/tournaments/search', { name })
}

/** Tournaments in stand_by or ongoing where the signed-in user participates. */
export async function getPlayerActiveTournaments(): Promise<Tournament[]> {
  return executeRequest<Tournament[]>('/tournaments/active')
}

/** Registers the signed-in user (optionally with a partner) into a tournament. */
export async function joinTournament(tournamentId: number, input: JoinTournamentInput): Promise<void> {
  await executeRequest('/registrations/join', { tournamentId, ...input })
}

/** Removes the signed-in user registration while the tournament is in stand_by. */
export async function leaveTournament(tournamentId: number): Promise<void> {
  await executeRequest('/registrations/leave', { tournamentId })
}
