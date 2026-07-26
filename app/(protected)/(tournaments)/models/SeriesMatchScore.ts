import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'

/**
 * One of the individual matches that make up an interclubes series
 * ("encuentro"). Three of them are played every time two clubs meet: either
 * one doubles plus two singles, or two doubles plus one single.
 *
 * The players are stored explicitly (rather than implied by the roster order)
 * because a team registers many players and only some of them take the court in
 * a given series — and each player may only play ONE of the three matches.
 */
export interface SeriesMatchScore {
  /** True when this match is a doubles (2 players per side), false for a single. */
  double: boolean
  /** Players of the home team who played this match (1 for a single, 2 for a doubles). */
  homePlayerIds: number[]
  /** Players of the away team who played this match. */
  awayPlayerIds: number[]
  /** Result of this individual match, in the tournament's score format. */
  score: MatchScore
  /** Winning side of this individual match. */
  winner: MatchSide
}
