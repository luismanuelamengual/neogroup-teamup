import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { SeriesMatchScore } from '@/app/(protected)/(tournaments)/models/SeriesMatchScore'
import { SetScore } from '@/app/(protected)/(tournaments)/models/SetScore'

/**
 * Score payload stored in the matches table.
 * - THREE_SETS / TWO_SETS_SUPER_TIEBREAK → uses `sets`
 * - BASIC_COUNT → uses `home` / `away`
 * - walkover → uses `walkover` with the winning side
 * - interclubes → uses `matches` with the three individual results, plus
 *   `home` / `away` as the resulting series score (3-0, 2-1, …)
 */
export interface MatchScore {
  sets?: SetScore[]
  home?: number
  away?: number
  walkover?: MatchSide
  /**
   * Individual matches of an interclubes series. When present, `home` / `away`
   * hold how many of them each side won — the shape itself is what tells a
   * series apart from a plain result, so no extra discriminator is needed.
   */
  matches?: SeriesMatchScore[]
}
