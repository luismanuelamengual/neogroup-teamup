import { DB } from '@neogroup/neorm'

import { Competitor, CompetitorModel } from '@/app/_models/competitor.entity'
import {
  CompetitorDto,
  MatchDto,
  RoundDto,
  toCompetitorDto,
  toMatchDto,
  toRoundDto,
  toTournamentDto,
  TournamentDto
} from '@/app/_models/dtos'
import { Match, MatchModel } from '@/app/_models/match.entity'
import { Round, RoundModel } from '@/app/_models/round.entity'
import { Tournament, TournamentModel } from '@/app/_models/tournament.entity'
import { OrderByDirection } from '@neogroup/neorm'

/** Server-side data fetching helpers shared by pages and actions. */

export interface TournamentDetail {
  tournament: TournamentDto
  competitors: CompetitorDto[]
  rounds: RoundDto[]
  matches: MatchDto[]
}

export async function getTournamentDetail(tournamentId: number): Promise<TournamentDetail | null> {
  const tournament: Tournament | null = await TournamentModel.find(tournamentId)

  if (!tournament) {
    return null
  }

  const competitors: Competitor[] = await CompetitorModel.where('tournament_id', tournamentId)
    .orderBy('id')
    .get()
  const rounds: Round[] = await RoundModel.where('tournament_id', tournamentId).orderBy('number').get()
  const matches: Match[] = await MatchModel.where('tournament_id', tournamentId)
    .orderBy('round_id')
    .orderBy('position')
    .get()

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
    .select('tournament_id', 'COUNT(*) AS total')
    .whereIn('tournament_id', tournamentIds)
    .groupBy('tournament_id')
    .get()

  for (const row of rows) {
    counts.set(Number(row.tournament_id), Number(row.total))
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
  const query = TournamentModel.where('owner_id', ownerId)

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
  const query = TournamentModel.whereIn('status', ['stand_by', 'ongoing', 'finished'])
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
  const entries: Competitor[] = await CompetitorModel.where((group: any) =>
    group.where('user_id', userId).orWhere('partner_user_id', userId)
  ).get()
  const tournamentIds = [...new Set(entries.map((entry) => entry.tournament_id))]

  if (tournamentIds.length === 0) {
    return []
  }

  const tournaments: Tournament[] = await TournamentModel.whereIn('id', tournamentIds)
    .whereIn('status', ['stand_by', 'ongoing'])
    .orderBy('id', OrderByDirection.DESC)
    .get()
  const counts = await getCompetitorCounts(tournaments.map((tournament) => tournament.id))

  return tournaments.map((tournament) => toTournamentDto(tournament, counts.get(tournament.id) ?? 0))
}

/** The competitor entry of a user inside a tournament (as main player or partner). */
export async function getUserCompetitorEntry(tournamentId: number, userId: number): Promise<CompetitorDto | null> {
  const entry: Competitor | null = await CompetitorModel.where('tournament_id', tournamentId)
    .where((group: any) => group.where('user_id', userId).orWhere('partner_user_id', userId))
    .first()

  return entry ? toCompetitorDto(entry) : null
}
