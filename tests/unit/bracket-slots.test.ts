import { describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { BracketSlotMatch, resolveSlotLabels, roundLabel } from '@/app/(protected)/(tournaments)/utils/bracket'

/** Names a competitor "C<id>", which is all the labels need to be checked against. */
const nameOf = (id: number) => `C${id}`

/** Builds a match, defaulting to a still-undefined PENDING bracket slot. */
function match(
  overrides: Partial<BracketSlotMatch> & Pick<BracketSlotMatch, 'roundNumber' | 'position'>
): BracketSlotMatch {
  return {
    type: MatchType.BRACKET,
    groupNumber: null,
    homeCompetitorId: null,
    awayCompetitorId: null,
    status: MatchStatus.PENDING,
    ...overrides
  }
}

/** A real, decided matchup between two competitors. */
const played = (roundNumber: number, position: number, home: number, away: number): BracketSlotMatch =>
  match({ roundNumber, position, homeCompetitorId: home, awayCompetitorId: away, status: MatchStatus.PLAYED })
/** A real matchup that hasn't been played yet. */
const pending = (roundNumber: number, position: number, home: number, away: number): BracketSlotMatch =>
  match({ roundNumber, position, homeCompetitorId: home, awayCompetitorId: away })

describe('roundLabel', () => {
  it('counts the stages back from the final', () => {
    expect(roundLabel(2, 3, 1)).toBe('Final')
    expect(roundLabel(1, 3, 2)).toBe('Semifinal')
    expect(roundLabel(0, 3, 4)).toBe('Cuartos de final')
    expect(roundLabel(0, 5, 16)).toBe('Ronda 1')
  })
})

describe('resolveSlotLabels — main bracket', () => {
  it('describes a second-round slot from the two matches that feed it', () => {
    const semifinal = match({ roundNumber: 2, position: 0 })
    const all = [pending(1, 0, 1, 2), pending(1, 1, 3, 4), semifinal, match({ roundNumber: 3, position: 0 })]

    expect(resolveSlotLabels(semifinal, all, nameOf)).toEqual({
      home: 'Ganador de C1 vs C2',
      away: 'Ganador de C3 vs C4'
    })
  })

  it('only describes the side that is still empty', () => {
    const semifinal = match({ roundNumber: 2, position: 0, homeCompetitorId: 1 })
    const all = [played(1, 0, 1, 2), pending(1, 1, 3, 4), semifinal]

    expect(resolveSlotLabels(semifinal, all, nameOf)).toEqual({ home: null, away: 'Ganador de C3 vs C4' })
  })

  it('says nothing about the seeded first round', () => {
    const first = match({ roundNumber: 1, position: 0 })

    expect(resolveSlotLabels(first, [first, match({ roundNumber: 2, position: 0 })], nameOf)).toEqual({
      home: null,
      away: null
    })
  })

  it('falls back to the feeder stage instead of nesting descriptions', () => {
    // Round 3 is fed by round 2, which is itself still undefined: chaining would
    // read "Ganador de Ganador de … vs Ganador de …".
    const final = match({ roundNumber: 3, position: 0 })
    const all = [
      pending(1, 0, 1, 2),
      pending(1, 1, 3, 4),
      pending(1, 2, 5, 6),
      pending(1, 3, 7, 8),
      match({ roundNumber: 2, position: 0 }),
      match({ roundNumber: 2, position: 1 }),
      final
    ]

    expect(resolveSlotLabels(final, all, nameOf)).toEqual({
      home: 'Ganador de Semifinal #1',
      away: 'Ganador de Semifinal #2'
    })
  })

  it('resolves feeders by lane index, so a groups+playoff bracket starting past round 1 works', () => {
    // Group phase occupies rounds 1-3; the bracket starts at round 4.
    const semifinal = match({ roundNumber: 5, position: 0 })
    const all = [
      match({ roundNumber: 1, position: 0, type: MatchType.LEAGUE, groupNumber: 0 }),
      pending(4, 0, 1, 2),
      pending(4, 1, 3, 4),
      semifinal
    ]

    expect(resolveSlotLabels(semifinal, all, nameOf)).toEqual({
      home: 'Ganador de C1 vs C2',
      away: 'Ganador de C3 vs C4'
    })
  })
})

describe('resolveSlotLabels — consolation bracket', () => {
  const consolation = (roundNumber: number, position: number) =>
    match({ roundNumber, position, type: MatchType.CONSOLATION_BRACKET })

  it('takes the losers of the main bracket first round', () => {
    const slot = consolation(2, 0)
    const all = [pending(1, 0, 1, 2), pending(1, 1, 3, 4), pending(1, 2, 5, 6), pending(1, 3, 7, 8), slot]

    expect(resolveSlotLabels(slot, all, nameOf)).toEqual({
      home: 'Perdedor de C1 vs C2',
      away: 'Perdedor de C3 vs C4'
    })
  })

  it('names the bye occupant directly, since a bye produces no loser of its own', () => {
    const slot = consolation(2, 0)
    const bye = match({
      roundNumber: 1,
      position: 0,
      homeCompetitorId: 1,
      awayCompetitorId: null,
      status: MatchStatus.WALKOVER
    })
    const all = [bye, pending(1, 1, 3, 4), slot]

    expect(resolveSlotLabels(slot, all, nameOf)).toEqual({
      home: 'C1 si pierde',
      away: 'Perdedor de C3 vs C4'
    })
  })

  it('takes winners once past its own first round', () => {
    const slot = consolation(3, 0)
    const all = [pending(1, 0, 1, 2), consolation(2, 0), consolation(2, 1), slot]
    const withNames = all.map((entry) =>
      entry.type === MatchType.CONSOLATION_BRACKET && entry.roundNumber === 2
        ? { ...entry, homeCompetitorId: entry.position * 2 + 10, awayCompetitorId: entry.position * 2 + 11 }
        : entry
    )

    expect(resolveSlotLabels(slot, withNames, nameOf)).toEqual({
      home: 'Ganador de C10 vs C11',
      away: 'Ganador de C12 vs C13'
    })
  })
})

describe('resolveSlotLabels — non-applicable matches', () => {
  it('ignores league matches', () => {
    const league = match({ roundNumber: 1, position: 0, type: MatchType.LEAGUE, groupNumber: 0 })

    expect(resolveSlotLabels(league, [league], nameOf)).toEqual({ home: null, away: null })
  })

  it('ignores voided fixtures', () => {
    const void_ = match({ roundNumber: 2, position: 0, awayCompetitorId: null, status: MatchStatus.VOID })
    const all = [pending(1, 0, 1, 2), pending(1, 1, 3, 4), void_]

    expect(resolveSlotLabels(void_, all, nameOf)).toEqual({ home: null, away: null })
  })

  it('ignores fully-defined matchups', () => {
    const defined = pending(2, 0, 1, 3)
    const all = [played(1, 0, 1, 2), played(1, 1, 3, 4), defined]

    expect(resolveSlotLabels(defined, all, nameOf)).toEqual({ home: null, away: null })
  })
})
