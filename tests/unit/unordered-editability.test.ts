import { describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { countsForStandings, EditableMatch, isMatchEditable } from '@/app/(protected)/(tournaments)/utils/matches'
import { allowsUnorderedResults, matchesPerCompetitor } from '@/app/(protected)/(tournaments)/utils/settings'

/** A round-robin fixture of the given round, with two real sides. */
function leagueMatch(overrides: Partial<EditableMatch> & { id: number; roundNumber: number }): EditableMatch {
  return {
    type: MatchType.LEAGUE,
    groupNumber: null,
    position: 0,
    bracketInstance: null,
    homeCompetitorId: 1,
    awayCompetitorId: 2,
    status: MatchStatus.PENDING,
    ...overrides
  }
}

describe('allowsUnorderedResults', () => {
  it('is off unless the setting is explicitly enabled', () => {
    expect(allowsUnorderedResults(TournamentType.LEAGUE, null)).toBe(false)
    expect(allowsUnorderedResults(TournamentType.LEAGUE, {})).toBe(false)
    expect(allowsUnorderedResults(TournamentType.LEAGUE, { allowUnorderedResults: true })).toBe(true)
  })

  it('only applies to the two round-robin types that expose it', () => {
    const settings = { allowUnorderedResults: true }

    expect(allowsUnorderedResults(TournamentType.LEAGUE, settings)).toBe(true)
    expect(allowsUnorderedResults(TournamentType.GROUPS_PLAYOFF, settings)).toBe(true)
    // Americanos pair later rounds from the standings, so those rounds cannot
    // exist up front; interclubes and knockouts are not configurable this way.
    expect(allowsUnorderedResults(TournamentType.AMERICANO, settings)).toBe(false)
    expect(allowsUnorderedResults(TournamentType.INTERCLUBS, settings)).toBe(false)
    expect(allowsUnorderedResults(TournamentType.PLAYOFF, settings)).toBe(false)
  })
})

describe('matchesPerCompetitor', () => {
  it('reads maxRounds as a quota, treating anything empty or non-positive as unset', () => {
    expect(matchesPerCompetitor({ maxRounds: 4 })).toBe(4)
    expect(matchesPerCompetitor({})).toBeNull()
    expect(matchesPerCompetitor(null)).toBeNull()
    expect(matchesPerCompetitor({ maxRounds: 0 })).toBeNull()
  })
})

describe('countsForStandings', () => {
  it('excludes pending, voided and rival-less matches', () => {
    expect(countsForStandings({ status: MatchStatus.PLAYED, awayCompetitorId: 2 })).toBe(true)
    expect(countsForStandings({ status: MatchStatus.WALKOVER, awayCompetitorId: 2 })).toBe(true)
    expect(countsForStandings({ status: MatchStatus.PENDING, awayCompetitorId: 2 })).toBe(false)
    // The case this guard exists for: a voided fixture keeps both its sides.
    expect(countsForStandings({ status: MatchStatus.VOID, awayCompetitorId: 2 })).toBe(false)
    expect(countsForStandings({ status: MatchStatus.WALKOVER, awayCompetitorId: null })).toBe(false)
  })
})

describe('isMatchEditable — unordered round robins', () => {
  const earlier = leagueMatch({ id: 1, roundNumber: 1 })
  const later = leagueMatch({ id: 2, roundNumber: 2, status: MatchStatus.PLAYED })
  const lane = [earlier, later]
  const unordered = { allowUnorderedResults: true }

  it('locks an earlier round once a later one holds a result, as it always did', () => {
    expect(isMatchEditable(earlier, lane, TournamentType.LEAGUE, TournamentStatus.ONGOING)).toBe(false)
    expect(isMatchEditable(earlier, lane, TournamentType.LEAGUE, TournamentStatus.ONGOING, {})).toBe(false)
  })

  it('keeps every round open when results may be loaded unordered', () => {
    expect(isMatchEditable(earlier, lane, TournamentType.LEAGUE, TournamentStatus.ONGOING, unordered)).toBe(true)
  })

  it('never accepts a result into a voided fixture', () => {
    const voided = leagueMatch({ id: 3, roundNumber: 1, status: MatchStatus.VOID })

    expect(isMatchEditable(voided, [voided], TournamentType.LEAGUE, TournamentStatus.ONGOING, unordered)).toBe(false)
  })

  it('still locks a group result once the knockout has started', () => {
    const groupMatch = leagueMatch({ id: 4, roundNumber: 1, groupNumber: 0 })
    const bracketMatch: EditableMatch = {
      id: 5,
      roundNumber: 4,
      type: MatchType.BRACKET,
      groupNumber: null,
      position: 0,
      bracketInstance: 1,
      homeCompetitorId: 1,
      awayCompetitorId: 2,
      status: MatchStatus.PLAYED
    }

    expect(
      isMatchEditable(
        groupMatch,
        [groupMatch, bracketMatch],
        TournamentType.GROUPS_PLAYOFF,
        TournamentStatus.ONGOING,
        unordered
      )
    ).toBe(false)
  })

  it('stays read-only once the tournament is over', () => {
    expect(isMatchEditable(earlier, lane, TournamentType.LEAGUE, TournamentStatus.FINISHED, unordered)).toBe(false)
  })
})
