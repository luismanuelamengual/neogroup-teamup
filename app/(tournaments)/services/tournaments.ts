import { Repository } from '@neogroup/neorm'
import { OrderByDirection } from '@neogroup/neorm'
import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Match } from '@/app/(tournaments)/models/Match'
import { Round } from '@/app/(tournaments)/models/Round'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'

/** Server-side data fetching helpers shared by pages and actions. */

export interface TournamentDetail {
  tournament: Tournament
  competitors: Competitor[]
  rounds: Round[]
  matches: Match[]
}

export async function getTournamentDetail(tournamentId: number): Promise<TournamentDetail | null> {
  const tournament: Tournament | null = await Repository.get(Tournament)
    .where('id', tournamentId)
    .with('competitors', 'rounds', 'matches')
    .first()

  if (!tournament) {
    return null
  }

  const competitors = [...(tournament.competitors ?? [])].sort((a, b) => a.id - b.id)
  const rounds = [...(tournament.rounds ?? [])].sort((a, b) => a.number - b.number)
  const matches = [...(tournament.matches ?? [])].sort((a, b) => a.roundId - b.roundId || a.position - b.position)

  return { tournament, competitors, rounds, matches }
}

export interface OrganizerTournamentFilters {
  name?: string
  onlyActive?: boolean
}

export async function getOrganizerTournaments(
  ownerId: number,
  filters: OrganizerTournamentFilters
): Promise<Tournament[]> {
  const tournaments: Tournament[] = await Repository.get(Tournament)
    .where('ownerId', ownerId)
    .with('competitors')
    .when(!!filters.onlyActive, (query) =>
      query.whereIn('status', [TournamentStatus.STAND_BY, TournamentStatus.ONGOING])
    )
    .orderBy('id', OrderByDirection.DESC)
    .get()

  return filters.name
    ? tournaments.filter((t) => t.name.toLowerCase().includes(filters.name!.toLowerCase()))
    : tournaments
}

export async function searchTournaments(name: string): Promise<Tournament[]> {
  const tournaments: Tournament[] = await Repository.get(Tournament)
    .with('competitors')
    .orderBy('id', OrderByDirection.DESC)
    .limit(100)
    .get()

  const normalized = name.trim().toLowerCase()
  const filtered = normalized
    ? tournaments.filter((t) => t.name.toLowerCase().includes(normalized))
    : tournaments

  return filtered.slice(0, 30)
}

/** Tournaments in stand_by or ongoing where the user participates (as player or partner). */
export async function getPlayerActiveTournaments(userId: number): Promise<Tournament[]> {
  const entries: Competitor[] = await Repository.get(Competitor)
    .where((group: any) => group.where('userId', userId).orWhere('partnerUserId', userId))
    .get()

  const tournamentIds = [...new Set(entries.map((entry) => entry.tournamentId))]

  if (tournamentIds.length === 0) {
    return []
  }

  return Repository.get(Tournament)
    .whereIn('id', tournamentIds)
    .with('competitors')
    .whereIn('status', [TournamentStatus.STAND_BY, TournamentStatus.ONGOING])
    .orderBy('id', OrderByDirection.DESC)
    .get()
}

/** The competitor entry of a user inside a tournament (as main player or partner). */
export async function getUserCompetitorEntry(tournamentId: number, userId: number): Promise<Competitor | null> {
  return Repository.get(Competitor)
    .where('tournamentId', tournamentId)
    .where((group: any) => group.where('userId', userId).orWhere('partnerUserId', userId))
    .first()
}
