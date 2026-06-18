import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/** Translation keys (under the "tournaments" namespace) for each enum value. */

export const TOURNAMENT_STATUS_KEYS: Record<TournamentStatus, string> = {
  [TournamentStatus.STAND_BY]: 'stand_by',
  [TournamentStatus.ONGOING]: 'ongoing',
  [TournamentStatus.FINISHED]: 'finished'
}

export const DISCIPLINE_KEYS: Record<Discipline, string> = {
  [Discipline.PADEL]: 'padel',
  [Discipline.TENNIS]: 'tennis'
}

export const SUB_DISCIPLINE_KEYS: Record<SubDiscipline, string> = {
  [SubDiscipline.SINGLES]: 'singles',
  [SubDiscipline.DOUBLES]: 'doubles'
}

export const TOURNAMENT_TYPE_KEYS: Record<TournamentType, string> = {
  [TournamentType.LEAGUE]: 'league',
  [TournamentType.AMERICANO]: 'americano',
  [TournamentType.PLAYOFF]: 'playoff'
}

export const SCORE_FORMAT_KEYS: Record<ScoreFormat, string> = {
  [ScoreFormat.THREE_SETS]: 'three_sets',
  [ScoreFormat.TWO_SETS_SUPER_TIEBREAK]: 'two_sets_super_tiebreak',
  [ScoreFormat.BASIC_COUNT]: 'basic_count'
}

/** CSS/object keys for each match side. */
export const MATCH_SIDE_KEYS: Record<MatchSide, 'home' | 'away'> = {
  [MatchSide.HOME]: 'home',
  [MatchSide.AWAY]: 'away'
}
