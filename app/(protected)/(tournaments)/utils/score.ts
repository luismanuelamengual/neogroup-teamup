import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SetScore } from '@/app/(protected)/(tournaments)/models/SetScore'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { INTERCLUBS_SERIES_MATCHES } from '@/app/(protected)/(tournaments)/utils/interclubs'

/** Number of set inputs shown for each score format. */
export function getSetsCount(format: ScoreFormat): number {
  return format === ScoreFormat.THREE_SETS || format === ScoreFormat.TWO_SETS_SUPER_TIEBREAK ? 3 : 0
}

/**
 * True when a score holds an interclubes series (three individual matches)
 * rather than a single result. The shape is the discriminator: a series always
 * carries its `matches` array, and nothing else ever does.
 */
export function isSeriesScore(score: MatchScore | null | undefined): boolean {
  return !!score && Array.isArray(score.matches) && score.matches.length > 0
}

/** Individual matches won by each side in a series. */
export function getSeriesMatchesWon(score: MatchScore): { home: number; away: number } {
  const result = { home: 0, away: 0 }

  for (const match of score.matches ?? []) {
    if (match.winner === MatchSide.HOME) {
      result.home++
    } else if (match.winner === MatchSide.AWAY) {
      result.away++
    }
  }

  return result
}

/** Computes the winning side of a score, or null when it cannot be determined. */
export function getScoreWinner(score: MatchScore, format: ScoreFormat): MatchSide | null {
  if (score.walkover) {
    return score.walkover
  }

  // An interclubes series is won by whoever took most of its three matches.
  if (isSeriesScore(score)) {
    const matches = getSeriesMatchesWon(score)

    if (matches.home === matches.away) {
      return null
    }

    return matches.home > matches.away ? MatchSide.HOME : MatchSide.AWAY
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
  // A series has no sets of its own: its sets are those of its three matches.
  if (isSeriesScore(score)) {
    return (score.matches ?? []).reduce(
      (total, match) => {
        const sets = getSetsWon(match.score)

        return { home: total.home + sets.home, away: total.away + sets.away }
      },
      { home: 0, away: 0 }
    )
  }

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

/** Counts games won by each side. For BASIC_COUNT scores, the counters are used as games.
 *  For TWO_SETS_SUPER_TIEBREAK, the super tiebreak (3rd set) is excluded because it counts
 *  as a set win rather than individual games. */
export function getGamesWon(score: MatchScore, format: ScoreFormat): { home: number; away: number } {
  if (isSeriesScore(score)) {
    return (score.matches ?? []).reduce(
      (total, match) => {
        const games = getGamesWon(match.score, format)

        return { home: total.home + games.home, away: total.away + games.away }
      },
      { home: 0, away: 0 }
    )
  }

  if (format === ScoreFormat.BASIC_COUNT) {
    return { home: score.home ?? 0, away: score.away ?? 0 }
  }

  const sets = score.sets ?? []
  const setsToCount = format === ScoreFormat.TWO_SETS_SUPER_TIEBREAK ? sets.slice(0, 2) : sets
  const result = { home: 0, away: 0 }

  for (const set of setsToCount) {
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

/**
 * Extra information `isValidScore` needs beyond the raw payload. Only
 * interclubes uses it: its scores must BE a series (a plain 6-3 6-4 is not a
 * valid result for an encounter), and the players of each individual match must
 * come from the right team.
 */
export interface ScoreContext {
  type?: TournamentType
  /** Roster of the home competitor, when known. */
  homePlayerIds?: number[]
  /** Roster of the away competitor, when known. */
  awayPlayerIds?: number[]
}

/**
 * Validates the three individual matches of an interclubes series.
 *
 * Rules, all of them from how interclubes is actually played:
 *  - exactly three matches, either 1 doubles + 2 singles or 2 doubles + 1 single;
 *  - a doubles fields 2 players per side, a single 1;
 *  - **a player may only play one of the three matches** — whoever plays the
 *    single is not available for the doubles and vice versa (which is why a
 *    team needs at least 4 players, and 5 for the two-doubles line-up);
 *  - every player must belong to the team they play for (when the rosters are
 *    known);
 *  - each individual result must be valid for the tournament's score format and
 *    produce a winner.
 *
 * A walkover at series level (`score.walkover`) short-circuits all of this: the
 * encounter was not played at all.
 */
export function isValidSeriesScore(score: MatchScore, format: ScoreFormat, context: ScoreContext = {}): boolean {
  if (score.walkover) {
    return score.walkover === MatchSide.HOME || score.walkover === MatchSide.AWAY
  }

  const matches = score.matches ?? []

  if (matches.length !== INTERCLUBS_SERIES_MATCHES) {
    return false
  }

  const doublesCount = matches.filter((match) => match.double).length

  // 3 doubles or 3 singles is not an interclubes encounter.
  if (doublesCount !== 1 && doublesCount !== 2) {
    return false
  }

  const usedHome = new Set<number>()
  const usedAway = new Set<number>()

  for (const match of matches) {
    const expectedPlayers = match.double ? 2 : 1
    const sides: [number[], Set<number>, number[] | undefined][] = [
      [match.homePlayerIds ?? [], usedHome, context.homePlayerIds],
      [match.awayPlayerIds ?? [], usedAway, context.awayPlayerIds]
    ]

    for (const [playerIds, used, roster] of sides) {
      if (playerIds.length !== expectedPlayers || new Set(playerIds).size !== expectedPlayers) {
        return false
      }

      for (const playerId of playerIds) {
        if (used.has(playerId)) {
          return false
        }

        if (roster && !roster.includes(playerId)) {
          return false
        }

        used.add(playerId)
      }
    }

    if (!isValidScore(match.score, format)) {
      return false
    }

    if (getScoreWinner(match.score, format) !== match.winner) {
      return false
    }
  }

  return getScoreWinner(score, format) !== null
}

/** Validates a score payload for the given format before persisting it. */
export function isValidScore(score: MatchScore, format: ScoreFormat, context: ScoreContext = {}): boolean {
  if (context.type === TournamentType.INTERCLUBS) {
    return isValidSeriesScore(score, format, context)
  }

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

/**
 * Prepares a score for storage. For an interclubes series it fills in the
 * overall scoreline (`home` / `away` = individual matches won by each side) so
 * the stored JSON is self-contained — `{ home: 2, away: 1, matches: [...] }` —
 * and anything reading the column knows the series result without replaying the
 * three matches. Every other score is stored as it comes.
 */
export function normalizeScore(score: MatchScore): MatchScore {
  if (!isSeriesScore(score)) {
    return score
  }

  const matches = getSeriesMatchesWon(score)

  return { ...score, home: matches.home, away: matches.away }
}

/**
 * Per-side score columns to render as parallel cells, one row per side —
 * this is the single scoreboard shape a match card renders from, whatever the
 * tournament's score format: a sets score becomes one column per set, a
 * BASIC_COUNT or an interclubes series collapses to a single column. Keeping
 * every format on this one shape is what lets a match card show a
 * homogeneous scoreboard next to each competitor's own name, instead of
 * switching between that layout and an unrelated "old counter" pill
 * depending on the format.
 *
 * Null only when there is nothing to show as numbers yet: a walkover (which
 * has no per-side score, only a winning side) or a score that hasn't been
 * played — callers fall back to `formatScore`'s single-line text for those.
 */
export function getScoreColumns(
  score: MatchScore | null,
  format: ScoreFormat
): { home: number; away: number; superTiebreak?: boolean }[] | null {
  if (!score || score.walkover) {
    return null
  }

  if (isSeriesScore(score)) {
    const matches = getSeriesMatchesWon(score)

    return matches.home === 0 && matches.away === 0 ? null : [matches]
  }

  if (format === ScoreFormat.BASIC_COUNT) {
    return score.home == null && score.away == null ? null : [{ home: score.home ?? 0, away: score.away ?? 0 }]
  }

  const sets = (score.sets ?? []).filter((set) => set.home !== 0 || set.away !== 0)

  // The 3rd set of a TWO_SETS_SUPER_TIEBREAK score isn't a regular set — it's
  // played to 10 (or beyond) instead of games, so callers render it as a 0-0
  // "set" with the real super tiebreak score shown as a superscript above
  // each 0, instead of as the raw points count.
  return sets.length > 0
    ? sets.map((set, index) => ({
        home: set.home,
        away: set.away,
        superTiebreak: format === ScoreFormat.TWO_SETS_SUPER_TIEBREAK && index === 2
      }))
    : null
}

/** Formats a score for display (e.g. "6-3 4-6 10-7", "6-19", "2-1" or "W.O."). */
export function formatScore(score: MatchScore | null, format: ScoreFormat): string {
  if (!score) {
    return ''
  }

  if (score.walkover) {
    return 'W.O.'
  }

  // A series is shown by its own scoreline (individual matches won).
  if (isSeriesScore(score)) {
    const matches = getSeriesMatchesWon(score)

    return `${matches.home}-${matches.away}`
  }

  if (format === ScoreFormat.BASIC_COUNT) {
    return `${score.home ?? 0}-${score.away ?? 0}`
  }

  return (score.sets ?? [])
    .filter((set) => set.home !== 0 || set.away !== 0)
    .map((set) => `${set.home}-${set.away}`)
    .join('  ')
}
