import type { Dto } from '@neogroup/neorm'
import { Competitor } from '@/app/(tournaments)/entities/Competitor'
import { Match } from '@/app/(tournaments)/entities/Match'
import { Round } from '@/app/(tournaments)/entities/Round'
import { Tournament } from '@/app/(tournaments)/entities/Tournament'
import { TournamentSettings } from '@/app/(tournaments)/models/types'

/**
 * Plain serializable objects passed from server code to client components.
 * They are derived from the entities with the neorm Dto<T> type, so adding a
 * column to an entity automatically updates its DTO.
 */

export type CompetitorDto = Dto<Competitor>

export type RoundDto = Dto<Round>

export type MatchDto = Dto<Match>

export type TournamentDto = Omit<Dto<Tournament>, 'settings'> & {
  /** Settings normalized to an object (never null). */
  settings: TournamentSettings
  competitorsCount?: number
}

export interface StandingsRowDto {
  competitorId: number
  displayName: string
  played: number
  won: number
  setsWon?: number
  gamesWon?: number
  points: number
}

export function toTournamentDto(tournament: Tournament, competitorsCount?: number): TournamentDto {
  // The database driver may return DATE columns as Date objects.
  const startDate: unknown = tournament.startDate

  return {
    ...tournament.toDto(),
    startDate: startDate instanceof Date ? startDate.toISOString().slice(0, 10) : String(startDate).slice(0, 10),
    settings: tournament.settings ?? {},
    competitorsCount
  }
}

export function toCompetitorDto(competitor: Competitor): CompetitorDto {
  return competitor.toDto()
}

export function toRoundDto(round: Round): RoundDto {
  return round.toDto()
}

export function toMatchDto(match: Match): MatchDto {
  return match.toDto()
}
