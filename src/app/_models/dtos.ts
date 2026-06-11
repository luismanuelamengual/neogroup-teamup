import { Competitor } from '@/app/_models/Competitor'
import { Match } from '@/app/_models/Match'
import { Round } from '@/app/_models/Round'
import { Tournament } from '@/app/_models/Tournament'
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
import { User } from '@/app/_models/User'

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

export function getUserDisplayName(user: Pick<User, 'firstName' | 'lastName' | 'nickname' | 'email'>): string {
  if (user.nickname) {
    return user.nickname
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')

  return fullName || user.email
}

export function toTournamentDto(tournament: Tournament, competitorsCount?: number): TournamentDto {
  // The database driver may return DATE columns as Date objects.
  const startDate: unknown = tournament.startDate

  return {
    id: tournament.id,
    ownerId: tournament.ownerId,
    name: tournament.name,
    description: tournament.description,
    status: tournament.status,
    discipline: tournament.discipline,
    type: tournament.type,
    scoreFormat: tournament.scoreFormat,
    startDate: startDate instanceof Date ? startDate.toISOString().slice(0, 10) : String(startDate).slice(0, 10),
    location: tournament.location,
    maxCompetitors: tournament.maxCompetitors,
    settings: tournament.settings ?? {},
    currentRound: tournament.currentRound,
    competitorsCount
  }
}

export function toCompetitorDto(competitor: Competitor): CompetitorDto {
  return {
    id: competitor.id,
    tournamentId: competitor.tournamentId,
    userId: competitor.userId,
    partnerUserId: competitor.partnerUserId,
    partnerName: competitor.partnerName,
    displayName: competitor.displayName
  }
}

export function toRoundDto(round: Round): RoundDto {
  return {
    id: round.id,
    tournamentId: round.tournamentId,
    number: round.number,
    status: round.status
  }
}

export function toMatchDto(match: Match): MatchDto {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    roundId: match.roundId,
    position: match.position,
    homeCompetitorIds: match.homeCompetitorIds,
    awayCompetitorIds: match.awayCompetitorIds,
    score: match.score,
    status: match.status,
    winner: match.winner
  }
}
