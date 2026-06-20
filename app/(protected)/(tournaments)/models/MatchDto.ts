import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'

/** Serializable representation of a Match — safe to pass server→client. */
export interface MatchDto {
  id: number
  tournamentCategoryId: number
  roundId: number
  position: number
  homeCompetitorIds: number[]
  awayCompetitorIds: number[] | null
  /** Compact score string `{scoreFormatId}:{results}` (see utils/score.ts). Null when no result. */
  score: string | null
  status: MatchStatus
  winner: MatchSide | null
  createdAt: string
  updatedAt: string
}
