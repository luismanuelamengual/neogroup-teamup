import { DB } from '@neogroup/neorm'
import { OrderByDirection } from '@neogroup/neorm'
import { Competitor } from '@/app/(tournaments)/entities/Competitor'
import { Match } from '@/app/(tournaments)/entities/Match'
import { Round } from '@/app/(tournaments)/entities/Round'
import { Tournament } from '@/app/(tournaments)/entities/Tournament'
import {
  CompetitorDto,
  MatchDto,
  RoundDto,
  toCompetitorDto,
  toMatchDto,
  toRoundDto,
  toTournamentDto,
  TournamentDto
} from '@/app/(tournaments)/models/dtos'

/** Server-side data fetching helpers shared by pages and actions. */

export interface TournamentDetail {
  tournament: TournamentDto
  competitors: CompetitorDto[]
  rounds: RoundDto[]
  matches: MatchDto[]
}

export async function getTournamentDetail(tournamentId: number): Promise<TournamentDetail | null> {
  const tournament: Tournament | null = await Tournament.find(tournamentId)

  if (!tournament) {
    return null
  }

  const competitors: Competitor[] = await Competitor.where('tournamentId', tournamentId).orderBy('id').get()
  const rounds: Round[] = await Round.where('tournamentId', tournamentId).orderBy('number').get()
  const matches: Match[] = await Match.where('tournamentId', tournamentId).orderBy('roundId').orderBy('position').get()

  return {
    tournament: toTournamentDto(tournament, competitors.length),
    competitors: competitors.map(toCompetitorDto),
    rounds: rounds.map(toRoundDto),
    matches: matches.map(toMatchDto)
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
  const query = Tournament.where('ownerId', ownerId)

  if (filters.onlyActive) {
    query.whereIn('status', ['stand_by', 'ongoing'])
  }

  const tournaments: Tournament[] = await query.orderBy('id', OrderByDirection.DESC).get()
  const filtered = filters.name
    ? tournaments.filter((tournament) => tournament.name.toLowerCase().includes(filters.name!.toLowerCase()))
    : tournaments
  const counts = await getCompetitorCounts(filtered.map((tournament) => tournament.id))

  return filtered.map((tournament) => toTournamentDto(tournament, counts.get(tournament.id) ?? 0))
}

export async function searchTournaments(name: string): Promise<TournamentDto[]> {
  const query = Tournament.whereIn('status', ['stand_by', 'ongoing', 'finished'])
  const tournaments: Tournament[] = await query.orderBy('id', OrderByDirection.DESC).limit(100).get()
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
    .whereIn('status', ['stand_by', 'ongoing'])
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

  return entry ? toCompetitorDto(entry) : null
}
