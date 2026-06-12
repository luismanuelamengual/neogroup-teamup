import type { UserDto } from '@/app/(auth)/models/user'
import type { TournamentDto } from '@/app/(tournaments)/models/dtos'
import type { JoinTournamentInput } from '@/app/(tournaments)/models/inputs'
import { executeRequest } from '@/app/actions/api'
import type { ApiResult } from '@/app/models/api'

/**
 * Client-side registration actions: thin wrappers around the REST API
 * (plus any data massaging needed by the views).
 */

export type ActionResult = ApiResult
export type { JoinTournamentInput }

/** Searches platform users by name, nickname or email (for partner selection). */
export async function searchUsers(query: string): Promise<UserDto[]> {
  const normalized = query.trim()

  if (normalized.length < 2) {
    return []
  }

  const data = await executeRequest<{ users: UserDto[] }>(`/users?q=${encodeURIComponent(normalized)}`)

  return data.users ?? []
}

/** Searches joinable/visible tournaments by name. */
export async function searchTournaments(name: string): Promise<TournamentDto[]> {
  const data = await executeRequest<{ tournaments: TournamentDto[] }>(
    `/tournaments/search?name=${encodeURIComponent(name)}`
  )

  return data.tournaments ?? []
}

/** Tournaments in stand_by or ongoing where the signed-in user participates. */
export async function getPlayerActiveTournaments(): Promise<TournamentDto[]> {
  const data = await executeRequest<{ tournaments: TournamentDto[] }>('/tournaments/active')

  return data.tournaments ?? []
}

/** Registers the signed-in user (optionally with a partner) into a tournament. */
export async function joinTournament(tournamentId: number, input: JoinTournamentInput): Promise<ActionResult> {
  return executeRequest<ActionResult>('/registrations', {
    method: 'POST',
    body: JSON.stringify({ tournamentId, ...input })
  })
}

/** Removes the signed-in user registration while the tournament is in stand_by. */
export async function leaveTournament(tournamentId: number): Promise<ActionResult> {
  return executeRequest<ActionResult>(`/registrations/${tournamentId}`, { method: 'DELETE' })
}
