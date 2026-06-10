import { MatchScore, MatchSide, ScoreFormat, SetScore } from '@/app/_models/types'

/** Number of set inputs shown for each score format. */
export function getSetsCount(format: ScoreFormat): number {
  return format === 'three_sets' || format === 'two_sets_super_tiebreak' ? 3 : 0
}

/** Computes the winning side of a score, or null when it cannot be determined. */
export function getScoreWinner(score: MatchScore, format: ScoreFormat): MatchSide | null {
  if (score.walkover) {
    return score.walkover
  }

  if (format === 'basic_count') {
    if (score.home == null || score.away == null || score.home === score.away) {
      return null
    }

    return score.home > score.away ? 'home' : 'away'
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

  return homeSets > awaySets ? 'home' : 'away'
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

/** Counts games won by each side. For basic_count scores, the counters are used as games. */
export function getGamesWon(score: MatchScore, format: ScoreFormat): { home: number; away: number } {
  if (format === 'basic_count') {
    return { home: score.home ?? 0, away: score.away ?? 0 }
  }

  const result = { home: 0, away: 0 }

  for (const set of score.sets ?? []) {
    result.home += set.home
    result.away += set.away
  }

  return result
}

/** Validates a score payload for the given format before persisting it. */
export function isValidScore(score: MatchScore, format: ScoreFormat): boolean {
  if (score.walkover) {
    return score.walkover === 'home' || score.walkover === 'away'
  }

  if (format === 'basic_count') {
    return (
      typeof score.home === 'number' &&
      typeof score.away === 'number' &&
      score.home >= 0 &&
      score.away >= 0 &&
      score.home !== score.away
    )
  }

  const sets = (score.sets ?? []).filter((set) => set.home > 0 || set.away > 0 || set.home !== set.away)
  const playedSets = sets.filter((set: SetScore) => set.home !== set.away)

  if (playedSets.length < 2) {
    return false
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

  if (format === 'basic_count') {
    return `${score.home ?? 0}-${score.away ?? 0}`
  }

  return (score.sets ?? [])
    .filter((set) => set.home !== 0 || set.away !== 0)
    .map((set) => `${set.home}-${set.away}`)
    .join('  ')
}
