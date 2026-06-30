import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'

export interface MatchDto {
  id: number
  tournamentCategoryId: number
  roundId: number
  position: number
  homeCompetitorIds: number[]
  awayCompetitorIds: number[] | null
  score: string | null
  status: MatchStatus
  winner: MatchSide | null
  createdAt: string
  updatedAt: string
}
