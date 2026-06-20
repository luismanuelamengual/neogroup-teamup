import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SetScore } from '@/app/(protected)/(tournaments)/models/SetScore'

/**
 * Serializes a score into the compact string stored in the database:
 *
 *   `{scoreFormatId}:{results}`   (results concatenated with "|")
 *
 * Examples:
 *   - 3 sets:                "1:6-2|6-4", "1:5-7|6-4|1-6", walkover "1:wo1"
 *   - 2 sets + super t-break: "2:6-2|7-6", "2:6-1|6-7|13-11", walkover "2:wo2"
 *   - basic count:           "3:14-5", "3:9-18", walkover "3:wo1"
 *
 * The walkover suffix is `wo{side}` where side is the MatchSide of the winner
 * (1 = home, 2 = away).
 */
export function serializeScore(score: MatchScore, format: ScoreFormat): string {
  if (score.walkover) {
    return `${format}:wo${score.walkover}`
  }

  if (format === ScoreFormat.BASIC_COUNT) {
    return `${format}:${score.home ?? 0}-${score.away ?? 0}`
  }

  const results = (score.sets ?? [])
    .filter((set) => set.home !== 0 || set.away !== 0)
    .map((set) => `${set.home}-${set.away}`)
    .join('|')

  return `${format}:${results}`
}

/**
 * Parses the compact score string back into a MatchScore. The score format is
 * read from the embedded prefix, so the caller does not need to pass it.
 * Returns null for empty/invalid input.
 */
export function parseScore(raw: string | null | undefined): MatchScore | null {
  if (!raw) {
    return null
  }

  const separator = raw.indexOf(':')

  if (separator < 0) {
    return null
  }

  const format = Number(raw.slice(0, separator)) as ScoreFormat
  const body = raw.slice(separator + 1)

  if (body.startsWith('wo')) {
    const side = Number(body.slice(2)) as MatchSide

    return side === MatchSide.HOME || side === MatchSide.AWAY ? { walkover: side } : null
  }

  const parsePair = (token: string): SetScore | null => {
    const [home, away] = token.split('-').map((value) => Number(value))

    if (Number.isNaN(home) || Number.isNaN(away)) {
      return null
    }

    return { home, away }
  }

  if (format === ScoreFormat.BASIC_COUNT) {
    const pair = parsePair(body)

    return pair ? { home: pair.home, away: pair.away } : null
  }

  const sets = body
    .split('|')
    .filter((token) => token !== '')
    .map(parsePair)
    .filter((set): set is SetScore => set !== null)

  return { sets }
}

/** Number of set inputs shown for each score format. */
export function getSetsCount(format: ScoreFormat): number {
  return format === ScoreFormat.THREE_SETS || format === ScoreFormat.TWO_SETS_SUPER_TIEBREAK ? 3 : 0
}

/** Computes the winning side of a score, or null when it cannot be determined. */
export function getScoreWinner(score: MatchScore, format: ScoreFormat): MatchSide | null {
  if (score.walkover) {
    return score.walkover
  }

  if (format === ScoreFormat.BASIC_COUNT) {
    if (score.home == null || score.away == null || score.home === score.away) {
      return null
    }

    return score.home > score.away ? MatchSide.HOME : MatchSide.AWAY
  }

  const sets = (score.sets ?? []).filter((set) => set.home !== set.away)

  if (sets.length === 0) {
    return null
  }

  let homeSets = 0
  let awaySets = 0

  for (const set of sets) {
    if (set.home > set.away) {
      homeSets++
    } else {
      awaySets++
    }
  }

  if (homeSets === awaySets) {
    return null
  }

  return homeSets > awaySets ? MatchSide.HOME : MatchSide.AWAY
}

/** Counts sets won by each side (sets formats only). */
export function getSetsWon(score: MatchScore): { home: number; away: number } {
  const result = { home: 0, away: 0 }

  for (const set of score.sets ?? []) {
    if (set.home > set.away) {
      result.home++
    } else if (set.away > set.home) {
      result.away++
    }
  }

  return result
}

/** Counts games won by each side. For BASIC_COUNT scores, the counters are used as games. */
export function getGamesWon(score: MatchScore, format: ScoreFormat): { home: number; away: number } {
  if (format === ScoreFormat.BASIC_COUNT) {
    return { home: score.home ?? 0, away: score.away ?? 0 }
  }

  const result = { home: 0, away: 0 }

  for (const set of score.sets ?? []) {
    result.home += set.home
    result.away += set.away
  }

  return result
}

/** Returns true if the set score is a valid regular tennis/padel set. */
function isValidRegularSet(set: SetScore): boolean {
  const { home, away } = set
  const [hi, lo] = home > away ? [home, away] : [away, home]

  // 6-x with ≥2 difference (6-0 through 6-4), 7-5, or 7-6 (tiebreak)
  return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6))
}

/** Returns true if the set score is a valid super tiebreak (first to 10, win by 2). */
function isValidSuperTiebreak(set: SetScore): boolean {
  const { home, away } = set
  const [hi, lo] = home > away ? [home, away] : [away, home]

  // Winner reaches exactly 10: loser must have ≤ 8 (no extension needed).
  // Winner goes beyond 10: both must be separated by exactly 2 (deuce extension).
  return (hi === 10 && lo <= 8) || (hi > 10 && hi - lo === 2)
}

/** Validates a score payload for the given format before persisting it. */
export function isValidScore(score: MatchScore, format: ScoreFormat): boolean {
  if (score.walkover) {
    return score.walkover === MatchSide.HOME || score.walkover === MatchSide.AWAY
  }

  if (format === ScoreFormat.BASIC_COUNT) {
    return (
      typeof score.home === 'number' &&
      typeof score.away === 'number' &&
      score.home >= 0 &&
      score.away >= 0 &&
      score.home !== score.away
    )
  }

  const sets = (score.sets ?? []).filter((set) => set.home !== 0 || set.away !== 0)
  const playedSets = sets.filter((set) => set.home !== set.away)

  if (playedSets.length < 2) {
    return false
  }

  if (format === ScoreFormat.THREE_SETS || format === ScoreFormat.TWO_SETS_SUPER_TIEBREAK) {
    if (sets.length > 3) {
      return false
    }

    // Validate first two sets are regular
    const firstTwo = sets.slice(0, 2)

    if (!firstTwo.every(isValidRegularSet)) {
      return false
    }

    if (sets.length === 3) {
      // 3rd set only valid if first two are split 1-1
      const firstTwoWins = { home: 0, away: 0 }

      for (const s of firstTwo) {
        if (s.home > s.away) {
          firstTwoWins.home++
        } else {
          firstTwoWins.away++
        }
      }

      if (firstTwoWins.home !== 1 || firstTwoWins.away !== 1) {
        return false
      }

      // Validate 3rd set by format
      if (format === ScoreFormat.THREE_SETS && !isValidRegularSet(sets[2])) {
        return false
      }

      if (format === ScoreFormat.TWO_SETS_SUPER_TIEBREAK && !isValidSuperTiebreak(sets[2])) {
        return false
      }
    }
  }

  return getScoreWinner(score, format) !== null
}

/** Formats a score for display (e.g. "6-3 4-6 10-7" or "6-19" or "W.O."). */
export function formatScore(score: MatchScore | null, format: ScoreFormat): string {
  if (!score) {
    return ''
  }

  if (score.walkover) {
    return 'W.O.'
  }

  if (format === ScoreFormat.BASIC_COUNT) {
    return `${score.home ?? 0}-${score.away ?? 0}`
  }

  return (score.sets ?? [])
    .filter((set) => set.home !== 0 || set.away !== 0)
    .map((set) => `${set.home}-${set.away}`)
    .join('  ')
}
