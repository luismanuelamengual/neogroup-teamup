import { describe, expect, it } from 'vitest'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import {
  formatScore,
  getGamesWon,
  getScoreWinner,
  getSetsWon,
  isValidScore,
  parseScore,
  serializeScore
} from '@/app/(protected)/(tournaments)/utils/score'

describe('score — BASIC_COUNT validation', () => {
  const f = ScoreFormat.BASIC_COUNT

  it('accepts a decisive count', () => {
    expect(isValidScore({ home: 16, away: 9 }, f)).toBe(true)
    expect(isValidScore({ home: 0, away: 7 }, f)).toBe(true)
  })

  it('rejects a tie', () => {
    expect(isValidScore({ home: 9, away: 9 }, f)).toBe(false)
    expect(isValidScore({ home: 0, away: 0 }, f)).toBe(false)
  })

  it('rejects negatives and missing sides', () => {
    expect(isValidScore({ home: -1, away: 3 }, f)).toBe(false)
    expect(isValidScore({ home: 5 } as any, f)).toBe(false)
  })

  it('round-trips through serialize/parse', () => {
    const serialized = serializeScore({ home: 14, away: 5 }, f)

    expect(serialized).toBe('3:14-5')
    expect(parseScore(serialized)).toEqual({ home: 14, away: 5 })
  })
})

describe('score — THREE_SETS validation', () => {
  const f = ScoreFormat.THREE_SETS

  it('accepts straight sets and a decided third set', () => {
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 6, away: 3 }
          ]
        },
        f
      )
    ).toBe(true)
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 4, away: 6 },
            { home: 6, away: 3 }
          ]
        },
        f
      )
    ).toBe(true)
    expect(
      isValidScore(
        {
          sets: [
            { home: 7, away: 5 },
            { home: 7, away: 6 }
          ]
        },
        f
      )
    ).toBe(true)
  })

  it('rejects a 1-1 set split with no decider (tie)', () => {
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 4, away: 6 }
          ]
        },
        f
      )
    ).toBe(false)
  })

  it('rejects irregular set scores', () => {
    expect(
      isValidScore(
        {
          sets: [
            { home: 8, away: 6 },
            { home: 6, away: 3 }
          ]
        },
        f
      )
    ).toBe(false)
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 5 },
            { home: 6, away: 3 }
          ]
        },
        f
      )
    ).toBe(false)
  })

  it('rejects a third set when the first two are not split', () => {
    // Home already won both → a third set is illegal.
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 6, away: 3 },
            { home: 6, away: 2 }
          ]
        },
        f
      )
    ).toBe(false)
  })

  it('rejects more than three sets', () => {
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 4, away: 6 },
            { home: 6, away: 3 },
            { home: 6, away: 0 }
          ]
        },
        f
      )
    ).toBe(false)
  })
})

describe('score — TWO_SETS_SUPER_TIEBREAK validation', () => {
  const f = ScoreFormat.TWO_SETS_SUPER_TIEBREAK

  it('accepts a valid super tiebreak as the third set', () => {
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 4, away: 6 },
            { home: 10, away: 8 }
          ]
        },
        f
      )
    ).toBe(true)
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 4, away: 6 },
            { home: 11, away: 9 }
          ]
        },
        f
      )
    ).toBe(true)
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 4, away: 6 },
            { home: 13, away: 11 }
          ]
        },
        f
      )
    ).toBe(true)
  })

  it('rejects an invalid super tiebreak (no win-by-two beyond 10)', () => {
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 4, away: 6 },
            { home: 10, away: 9 }
          ]
        },
        f
      )
    ).toBe(false)
    expect(
      isValidScore(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 4, away: 6 },
            { home: 12, away: 9 }
          ]
        },
        f
      )
    ).toBe(false)
  })
})

describe('score — walkovers', () => {
  it('accepts walkover for either side', () => {
    expect(isValidScore({ walkover: MatchSide.HOME }, ScoreFormat.THREE_SETS)).toBe(true)
    expect(isValidScore({ walkover: MatchSide.AWAY }, ScoreFormat.BASIC_COUNT)).toBe(true)
  })

  it('round-trips a walkover', () => {
    const serialized = serializeScore({ walkover: MatchSide.AWAY }, ScoreFormat.THREE_SETS)

    expect(serialized).toBe('1:wo2')
    expect(parseScore(serialized)).toEqual({ walkover: MatchSide.AWAY })
  })

  it('formats a walkover as W.O.', () => {
    expect(formatScore({ walkover: MatchSide.HOME }, ScoreFormat.THREE_SETS)).toBe('W.O.')
  })
})

describe('score — winner / counting helpers', () => {
  it('determines the set winner', () => {
    const score = {
      sets: [
        { home: 6, away: 4 },
        { home: 3, away: 6 },
        { home: 6, away: 2 }
      ]
    }

    expect(getScoreWinner(score, ScoreFormat.THREE_SETS)).toBe(MatchSide.HOME)
    expect(getSetsWon(score)).toEqual({ home: 2, away: 1 })
  })

  it('counts games across sets', () => {
    const score = {
      sets: [
        { home: 6, away: 4 },
        { home: 3, away: 6 }
      ]
    }

    expect(getGamesWon(score, ScoreFormat.THREE_SETS)).toEqual({ home: 9, away: 10 })
  })

  it('treats BASIC_COUNT counters as games', () => {
    expect(getGamesWon({ home: 12, away: 7 }, ScoreFormat.BASIC_COUNT)).toEqual({ home: 12, away: 7 })
  })

  it('returns null winner for an undecided set score', () => {
    expect(
      getScoreWinner(
        {
          sets: [
            { home: 6, away: 4 },
            { home: 4, away: 6 }
          ]
        },
        ScoreFormat.THREE_SETS
      )
    ).toBeNull()
  })
})
