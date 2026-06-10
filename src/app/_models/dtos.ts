import { Competitor } from '@/app/_models/competitor.entity'
import { Match } from '@/app/_models/match.entity'
import { Round } from '@/app/_models/round.entity'
import { Tournament } from '@/app/_models/tournament.entity'
import { User } from '@/app/_models/user.entity'
import {
  Discipline,
  MatchScore,
  MatchSide,
  MatchStatus,
  RoundStatus,
  ScoreFormat,
  TournamentSettings,
  TournamentStatus,
  TournamentType
} from '@/app/_models/types'

/** Plain serializable objects passed from server components/actions to client components. */

export interface UserDto {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  nickname: string | null
  displayName: string
  avatarUrl: string
}

export interface TournamentDto {
  id: number
  ownerId: number
  name: string
  description: string | null
  status: TournamentStatus
  discipline: Discipline
  type: TournamentType
  scoreFormat: ScoreFormat
  startDate: string
  location: string | null
  maxCompetitors: number
  settings: TournamentSettings
  currentRound: number
  competitorsCount?: number
}

export interface CompetitorDto {
  id: number
  tournamentId: number
  userId: number | null
  partnerUserId: number | null
  partnerName: string | null
  displayName: string
}

export interface RoundDto {
  id: number
  tournamentId: number
  number: number
  status: RoundStatus
}

export interface MatchDto {
  id: number
  tournamentId: number
  roundId: number
  position: number
  homeCompetitorIds: number[]
  awayCompetitorIds: number[] | null
  score: MatchScore | null
  status: MatchStatus
  winner: MatchSide | null
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

export function getUserDisplayName(user: Pick<User, 'first_name' | 'last_name' | 'nickname' | 'email'>): string {
  if (user.nickname) {
    return user.nickname
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')

  return fullName || user.email
}

export function toTournamentDto(tournament: Tournament, competitorsCount?: number): TournamentDto {
  // The database driver may return DATE columns as Date objects.
  const startDate: unknown = tournament.start_date

  return {
    id: tournament.id,
    ownerId: tournament.owner_id,
    name: tournament.name,
    description: tournament.description,
    status: tournament.status,
    discipline: tournament.discipline,
    type: tournament.type,
    scoreFormat: tournament.score_format,
    startDate:
      startDate instanceof Date ? startDate.toISOString().slice(0, 10) : String(startDate).slice(0, 10),
    location: tournament.location,
    maxCompetitors: tournament.max_competitors,
    settings: tournament.settings ?? {},
    currentRound: tournament.current_round,
    competitorsCount
  }
}

export function toCompetitorDto(competitor: Competitor): CompetitorDto {
  return {
    id: competitor.id,
    tournamentId: competitor.tournament_id,
    userId: competitor.user_id,
    partnerUserId: competitor.partner_user_id,
    partnerName: competitor.partner_name,
    displayName: competitor.display_name
  }
}

export function toRoundDto(round: Round): RoundDto {
  return {
    id: round.id,
    tournamentId: round.tournament_id,
    number: round.number,
    status: round.status
  }
}

export function toMatchDto(match: Match): MatchDto {
  return {
    id: match.id,
    tournamentId: match.tournament_id,
    roundId: match.round_id,
    position: match.position,
    homeCompetitorIds: match.home_competitor_ids,
    awayCompetitorIds: match.away_competitor_ids,
    score: match.score,
    status: match.status,
    winner: match.winner
  }
}
