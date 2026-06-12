import { MatchSide } from '@/app/(tournaments)/models/MatchSide'
import { SetScore } from '@/app/(tournaments)/models/SetScore'

/**
 * Score payload stored in the matches table.
 * - THREE_SETS / TWO_SETS_SUPER_TIEBREAK → uses `sets`
 * - BASIC_COUNT → uses `home` / `away`
 * - walkover → uses `walkover` with the winning side
 */
export interface MatchScore {
  sets?: SetScore[]
  home?: number
  away?: number
  walkover?: MatchSide
}
