import { MatchScore } from '@/app/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'

/** Serializable representation of a Match — safe to pass server→client. */
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
  createdAt: string
  updatedAt: string
}
