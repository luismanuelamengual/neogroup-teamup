import { DB } from '@neogroup/neorm'
import { OrderByDirection } from '@neogroup/neorm'
import { Competitor, CompetitorDto } from '@/app/(tournaments)/models/Competitor'
import { MatchDto } from '@/app/(tournaments)/models/Match'
import { RoundDto } from '@/app/(tournaments)/models/Round'
import { Tournament, TournamentDto } from '@/app/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { toTournamentDto } from '@/app/(tournaments)/utils/tournament'

/** Server-side data fetching helpers shared by pages and actions. */

export interface TournamentDetail {
  tournament: TournamentDto
  competitors: CompetitorDto[]
  rounds: RoundDto[]
  matches: MatchDto[]
}

export async function getTournamentDetail(tournamentId: number): Promise<TournamentDetail | null> {
  const tournament: Tournament | null = await Tournament.where('id', tournamentId)
    .with('competitors', 'rounds', 'matches')
    .first()

  if (!tournament) {
    return null
  }

  const competitors = [...(tournament.competitors ?? [])].sort((a, b) => a.id - b.id)
  const rounds = [...(tournament.rounds ?? [])].sort((a, b) => a.number - b.number)
  const matches = [...(tournament.matches ?? [])].sort((a, b) => a.roundId - b.roundId || a.position - b.position)

  return {
    tournament: toTournamentDto(tournament, competitors.length),
    competitors: competitors.map((competitor) => competitor.toDto()),
    rounds: rounds.map((round) => round.toDto()),
    matches: matches.map((match) => match.toDto())
  }
}

async function getCompetitorCounts(tournamentIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>()

  if (tournamentIds.length === 0) {
    return counts
  }

  const rows = await DB.table('competitors')
    .select('tournamentId', 'COUNT(*) AS total')
    .whereIn('tournamentId', tournamentIds)
    .groupBy('tournamentId')
    .get()

  for (const row of rows) {
    counts.set(Number(row.tournamentId), Number(row.total))
  }

  return counts
}

export interface OrganizerTournamentFilters {
  name?: string
  onlyActive?: boolean
}

export async function getOrganizerTournaments(
  ownerId: number,
  filters: OrganizerTournamentFilters
): Promise<TournamentDto[]> {
  const tournaments: Tournament[] = await Tournament.where('ownerId', ownerId)
    .when(!!filters.onlyActive, (query) =>
      query.whereIn('status', [TournamentStatus.STAND_BY, TournamentStatus.ONGOING])
    )
    .orderBy('id', OrderByDirection.DESC)
    .get()
  const filtered = filters.name
    ? tournaments.filter((tournament) => tournament.name.toLowerCase().includes(filters.name!.toLowerCase()))
    : tournaments
  const counts = await getCompetitorCounts(filtered.map((tournament) => tournament.id))

  return filtered.map((tournament) => toTournamentDto(tournament, counts.get(tournament.id) ?? 0))
}

export async function searchTournaments(name: string): Promise<TournamentDto[]> {
  const tournaments: Tournament[] = await Tournament.orderBy('id', OrderByDirection.DESC).limit(100).get()
  const normalized = name.trim().toLowerCase()
  const filtered = normalized
    ? tournaments.filter((tournament) => tournament.name.toLowerCase().includes(normalized))
    : tournaments
  const limited = filtered.slice(0, 30)
  const counts = await getCompetitorCounts(limited.map((tournament) => tournament.id))

  return limited.map((tournament) => toTournamentDto(tournament, counts.get(tournament.id) ?? 0))
}

/** Tournaments in stand_by or ongoing where the user participates (as player or partner). */
export async function getPlayerActiveTournaments(userId: number): Promise<TournamentDto[]> {
  const entries: Competitor[] = await Competitor.where((group: any) =>
    group.where('userId', userId).orWhere('partnerUserId', userId)
  ).get()
  const tournamentIds = [...new Set(entries.map((entry) => entry.tournamentId))]

  if (tournamentIds.length === 0) {
    return []
  }

  const tournaments: Tournament[] = await Tournament.whereIn('id', tournamentIds)
    .whereIn('status', [TournamentStatus.STAND_BY, TournamentStatus.ONGOING])
    .orderBy('id', OrderByDirection.DESC)
    .get()
  const counts = await getCompetitorCounts(tournaments.map((tournament) => tournament.id))

  return tournaments.map((tournament) => toTournamentDto(tournament, counts.get(tournament.id) ?? 0))
}

/** The competitor entry of a user inside a tournament (as main player or partner). */
export async function getUserCompetitorEntry(tournamentId: number, userId: number): Promise<CompetitorDto | null> {
  const entry: Competitor | null = await Competitor.where('tournamentId', tournamentId)
    .where((group: any) => group.where('userId', userId).orWhere('partnerUserId', userId))
    .first()

  return entry ? entry.toDto() : null
}
