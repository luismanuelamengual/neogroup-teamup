import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'

export interface MatchDto {
  id: number
  tournamentCategoryId: number
  roundNumber: number
  type: MatchType
  groupNumber: number | null
  position: number
  bracketInstance: number | null
  homeCompetitorIds: number[]
  awayCompetitorIds: number[] | null
  score: MatchScore | null
  status: MatchStatus
  winner: MatchSide | null
  createdAt: string
  updatedAt: string
}
