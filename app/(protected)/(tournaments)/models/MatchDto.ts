import { SiteDto } from '@/app/(protected)/(sites)/models/SiteDto'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentCategoryDto } from '@/app/(protected)/(tournaments)/models/TournamentCategoryDto'

export interface MatchDto {
  id: number
  tournamentCategoryId: number
  roundNumber: number
  type: MatchType
  groupNumber: number | null
  position: number
  bracketInstance: number | null
  homeCompetitorId: number | null
  awayCompetitorId: number | null
  score: MatchScore | null
  status: MatchStatus
  winner: MatchSide | null
  /** Venue of the match; null means it is played at the tournament's own site. */
  siteId: number | null
  /** Resolved venue (eager-loaded with the tournament's matches). */
  site?: SiteDto | null
  /** Calendar day of the match, 'YYYY-MM-DD'. Null until it is scheduled. */
  date: string | null
  /** Start time of the match, 'HH:mm'. Null until it is scheduled. */
  hour: string | null
  /** 1-based court inside the venue. Null until it is scheduled. */
  courtNumber: number | null
  createdAt: string
  updatedAt: string
  /**
   * Category instance the match belongs to, with its tournament and catalogue
   * category. Only present where the match is listed OUTSIDE a tournament it
   * already hangs from — the head-to-head history, which mixes matches from
   * many tournaments and has to name each one.
   */
  tournamentCategory?: TournamentCategoryDto
  /** Competitor on the home side, resolved. Present alongside `tournamentCategory`. */
  homeCompetitor?: CompetitorDto | null
  /** Competitor on the away side, resolved. */
  awayCompetitor?: CompetitorDto | null
}
