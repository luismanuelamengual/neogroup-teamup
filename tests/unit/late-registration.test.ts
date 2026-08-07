import { describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  getLateRegistrationSlots,
  LateRegistrationCategory,
  LateRegistrationCompetitor,
  LateRegistrationMatch,
  LateRegistrationSlotKind,
  LateRegistrationTournament
} from '@/app/(protected)/(tournaments)/utils/lateRegistration'

/**
 * Pure rules of who may still be registered once a tournament is running.
 *
 * These are the tests that decide whether the organizer is OFFERED a slot; the
 * flow tests (tests/flows/late-registration.test.ts) then check that taking one
 * actually produces the right matches. Kept apart because the same function
 * guards the server too — a slot wrongly offered here is a slot wrongly accepted
 * there.
 */

const CATEGORY: LateRegistrationCategory = { id: 1, maxCompetitors: 32 }

function tournamentOf(
  type: TournamentType,
  status: TournamentStatus = TournamentStatus.ONGOING,
  settings: LateRegistrationTournament['settings'] = {}
): LateRegistrationTournament {
  return { type, status, settings }
}

/** Same, with `allowUnorderedResults` on — where rounds are a layout, not a schedule. */
function unorderedTournamentOf(type: TournamentType): LateRegistrationTournament {
  return tournamentOf(type, TournamentStatus.ONGOING, { allowUnorderedResults: true })
}

let matchSeq = 0

function match(overrides: Partial<LateRegistrationMatch> = {}): LateRegistrationMatch {
  matchSeq++

  return {
    id: matchSeq,
    tournamentCategoryId: CATEGORY.id,
    roundNumber: 1,
    type: MatchType.BRACKET,
    groupNumber: null,
    position: 0,
    homeCompetitorId: 100,
    awayCompetitorId: 200,
    status: MatchStatus.PENDING,
    ...overrides
  }
}

/** A first-round bye: home only, stored as already won. */
function bye(position: number, overrides: Partial<LateRegistrationMatch> = {}): LateRegistrationMatch {
  return match({
    position,
    homeCompetitorId: 100 + position,
    awayCompetitorId: null,
    status: MatchStatus.WALKOVER,
    ...overrides
  })
}

/** Competitors carrying frozen group membership, one entry per group. */
function groupedCompetitors(groups: number[][]): LateRegistrationCompetitor[] {
  return groups.flatMap((group, groupNumber) =>
    group.map((id, groupPosition) => ({
      id,
      tournamentCategoryId: CATEGORY.id,
      data: { groupNumber, groupPosition }
    }))
  )
}

/** A group lane with one still-unplayed match, so the phase reads as in progress. */
function groupPhaseMatches(groupCount: number): LateRegistrationMatch[] {
  return Array.from({ length: groupCount }, (_, groupNumber) =>
    match({ type: MatchType.LEAGUE, groupNumber, status: MatchStatus.PENDING })
  )
}

describe('getLateRegistrationSlots — gates that apply to every type', () => {
  it('offers nothing while the tournament has not started', () => {
    const slots = getLateRegistrationSlots(
      tournamentOf(TournamentType.PLAYOFF, TournamentStatus.STAND_BY),
      CATEGORY,
      [bye(0), match({ position: 1 })],
      []
    )

    expect(slots).toEqual([])
  })

  it('offers nothing once the tournament is finished', () => {
    const slots = getLateRegistrationSlots(
      tournamentOf(TournamentType.PLAYOFF, TournamentStatus.FINISHED),
      CATEGORY,
      [bye(0), match({ position: 1 })],
      []
    )

    expect(slots).toEqual([])
  })

  it('respects the category entry limit', () => {
    const full: LateRegistrationCategory = { id: 1, maxCompetitors: 2 }
    const competitors: LateRegistrationCompetitor[] = [
      { id: 100, tournamentCategoryId: CATEGORY.id },
      { id: 101, tournamentCategoryId: CATEGORY.id }
    ]

    expect(
      getLateRegistrationSlots(
        tournamentOf(TournamentType.PLAYOFF),
        full,
        [bye(0), match({ position: 1 })],
        competitors
      )
    ).toEqual([])
  })

  it('ignores matches and competitors of other categories', () => {
    const foreign = bye(0, { tournamentCategoryId: 999 })

    expect(getLateRegistrationSlots(tournamentOf(TournamentType.PLAYOFF), CATEGORY, [foreign], [])).toEqual([])
  })

  for (const type of [TournamentType.AMERICANO, TournamentType.INTERCLUBS]) {
    it(`never offers a slot in a ${TournamentType[type]} tournament, ordered or not`, () => {
      const matches = [
        match({ type: MatchType.LEAGUE, groupNumber: null }),
        match({ type: MatchType.LEAGUE, groupNumber: 0 }),
        bye(0)
      ]

      expect(getLateRegistrationSlots(tournamentOf(type), CATEGORY, matches, groupedCompetitors([[1, 2, 3]]))).toEqual(
        []
      )
      expect(
        getLateRegistrationSlots(unorderedTournamentOf(type), CATEGORY, matches, groupedCompetitors([[1, 2, 3]]))
      ).toEqual([])
    })
  }
})

describe('getLateRegistrationSlots — PLAYOFF byes', () => {
  it('offers every first-round bye whose next match is still pending', () => {
    const matches = [
      bye(0),
      match({ position: 1 }),
      bye(2),
      match({ position: 3 }),
      // Round 2: nothing played yet.
      match({ roundNumber: 2, position: 0, homeCompetitorId: 100, awayCompetitorId: null }),
      match({ roundNumber: 2, position: 1, homeCompetitorId: 102, awayCompetitorId: null }),
      match({ roundNumber: 3, position: 0, homeCompetitorId: null, awayCompetitorId: null })
    ]
    const slots = getLateRegistrationSlots(tournamentOf(TournamentType.PLAYOFF), CATEGORY, matches, [])

    expect(slots.map((slot) => slot.kind)).toEqual([LateRegistrationSlotKind.BYE, LateRegistrationSlotKind.BYE])
    expect(slots.map((slot) => slot.matchId)).toEqual([matches[0].id, matches[2].id])
    expect(slots.every((slot) => slot.groupNumber === null)).toBe(true)
  })

  it('names the slot after the bracket stage and its 1-based position', () => {
    const matches = [
      bye(0),
      match({ position: 1 }),
      match({ position: 2 }),
      match({ position: 3 }),
      match({ roundNumber: 2, position: 0 }),
      match({ roundNumber: 2, position: 1 }),
      match({ roundNumber: 3, position: 0 })
    ]
    // Three rounds of 4/2/1 matches: the first is "Cuartos de final".
    const [slot] = getLateRegistrationSlots(tournamentOf(TournamentType.PLAYOFF), CATEGORY, matches, [])

    expect(slot.label).toBe('Bye de Cuartos de final #1')
  })

  it('withdraws a bye once the match it feeds has been played', () => {
    const matches = [bye(0), match({ position: 1 }), match({ roundNumber: 2, position: 0, status: MatchStatus.PLAYED })]

    expect(getLateRegistrationSlots(tournamentOf(TournamentType.PLAYOFF), CATEGORY, matches, [])).toEqual([])
  })

  it('keeps a bye open when a DIFFERENT branch of round 2 has been played', () => {
    const matches = [
      bye(0),
      match({ position: 1 }),
      bye(2),
      match({ position: 3 }),
      match({ roundNumber: 2, position: 0 }),
      match({ roundNumber: 2, position: 1, status: MatchStatus.PLAYED }),
      match({ roundNumber: 3, position: 0 })
    ]
    const slots = getLateRegistrationSlots(tournamentOf(TournamentType.PLAYOFF), CATEGORY, matches, [])

    // Only the bye at position 0 survives: the one at 2 feeds the played match.
    expect(slots.map((slot) => slot.matchId)).toEqual([matches[0].id])
  })

  it('offers the bye of a 2-entrant bracket, which has no round beyond it', () => {
    const slots = getLateRegistrationSlots(tournamentOf(TournamentType.PLAYOFF), CATEGORY, [bye(0)], [])

    expect(slots.map((slot) => slot.kind)).toEqual([LateRegistrationSlotKind.BYE])
  })

  it('never offers a real matchup, a played walkover or a later-round placeholder', () => {
    const matches = [
      // A real first-round matchup.
      match({ position: 0 }),
      // A walkover that was actually played (both sides present).
      match({ position: 1, status: MatchStatus.WALKOVER }),
      // A round-2 placeholder with an empty away side.
      match({ roundNumber: 2, position: 0, homeCompetitorId: 100, awayCompetitorId: null })
    ]

    expect(getLateRegistrationSlots(tournamentOf(TournamentType.PLAYOFF), CATEGORY, matches, [])).toEqual([])
  })

  it('withdraws a bye whose mirrored consolation slot already resolved', () => {
    const matches = [
      bye(0),
      match({ position: 1 }),
      match({ roundNumber: 2, position: 0 }),
      // Consolation round 1, position 0 — fed by main positions 0 and 1.
      match({
        roundNumber: 2,
        position: 0,
        type: MatchType.CONSOLATION_BRACKET,
        status: MatchStatus.VOID,
        homeCompetitorId: null,
        awayCompetitorId: null
      })
    ]

    expect(getLateRegistrationSlots(tournamentOf(TournamentType.PLAYOFF), CATEGORY, matches, [])).toEqual([])
  })

  it('keeps a bye open while its consolation slot is still undecided', () => {
    const matches = [
      bye(0),
      match({ position: 1 }),
      match({ roundNumber: 2, position: 0 }),
      match({
        roundNumber: 2,
        position: 0,
        type: MatchType.CONSOLATION_BRACKET,
        status: MatchStatus.PENDING,
        homeCompetitorId: null,
        awayCompetitorId: null
      })
    ]
    const slots = getLateRegistrationSlots(tournamentOf(TournamentType.PLAYOFF), CATEGORY, matches, [])

    expect(slots.map((slot) => slot.matchId)).toEqual([matches[0].id])
  })
})

describe('getLateRegistrationSlots — GROUPS_PLAYOFF group phase', () => {
  it('offers only the odd groups, which are the ones with a rest slot', () => {
    const competitors = groupedCompetitors([
      [1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11, 12]
    ])
    const slots = getLateRegistrationSlots(
      tournamentOf(TournamentType.GROUPS_PLAYOFF),
      CATEGORY,
      groupPhaseMatches(3),
      competitors
    )

    expect(slots.map((slot) => slot.groupNumber)).toEqual([0, 2])
    expect(slots.map((slot) => slot.label)).toEqual(['Grupo 1', 'Grupo 3'])
    expect(slots.every((slot) => slot.kind === LateRegistrationSlotKind.ROUND_ROBIN && slot.matchId === null)).toBe(
      true
    )
  })

  it('offers nothing once the knockout bracket exists', () => {
    const competitors = groupedCompetitors([[1, 2, 3]])
    const matches = [...groupPhaseMatches(1), match({ type: MatchType.BRACKET, roundNumber: 4 })]

    expect(
      getLateRegistrationSlots(tournamentOf(TournamentType.GROUPS_PLAYOFF), CATEGORY, matches, competitors)
    ).toEqual([])
  })

  it('offers nothing once every group match is resolved, even before the bracket appears', () => {
    const competitors = groupedCompetitors([[1, 2, 3]])
    const matches = [match({ type: MatchType.LEAGUE, groupNumber: 0, status: MatchStatus.PLAYED })]

    expect(
      getLateRegistrationSlots(tournamentOf(TournamentType.GROUPS_PLAYOFF), CATEGORY, matches, competitors)
    ).toEqual([])
  })

  it('offers nothing when the membership was never frozen', () => {
    const competitors: LateRegistrationCompetitor[] = [1, 2, 3].map((id) => ({
      id,
      tournamentCategoryId: CATEGORY.id,
      data: null
    }))

    expect(
      getLateRegistrationSlots(tournamentOf(TournamentType.GROUPS_PLAYOFF), CATEGORY, groupPhaseMatches(1), competitors)
    ).toEqual([])
  })

  it('offers nothing when the membership is only partially frozen', () => {
    const competitors = groupedCompetitors([[1, 2, 3]])

    competitors[2].data = null

    expect(
      getLateRegistrationSlots(tournamentOf(TournamentType.GROUPS_PLAYOFF), CATEGORY, groupPhaseMatches(1), competitors)
    ).toEqual([])
  })

  it('offers a group that is too small to have a lane of its own', () => {
    const competitors = groupedCompetitors([[1], [2, 3]])
    const slots = getLateRegistrationSlots(
      tournamentOf(TournamentType.GROUPS_PLAYOFF),
      CATEGORY,
      // Only group 1 has matches; group 0 is a single competitor.
      [match({ type: MatchType.LEAGUE, groupNumber: 1 })],
      competitors
    )

    expect(slots.map((slot) => slot.groupNumber)).toEqual([0])
  })

  it('offers a group whose own lane is finished only while it still has something to play', () => {
    const competitors = groupedCompetitors([
      [1, 2, 3],
      [4, 5, 6]
    ])
    // Group 0 played itself out; group 1 has not.
    const matches = [
      match({ type: MatchType.LEAGUE, groupNumber: 0, status: MatchStatus.PLAYED }),
      match({ type: MatchType.LEAGUE, groupNumber: 1, status: MatchStatus.PENDING })
    ]
    const slots = getLateRegistrationSlots(tournamentOf(TournamentType.GROUPS_PLAYOFF), CATEGORY, matches, competitors)

    expect(slots.map((slot) => slot.groupNumber)).toEqual([1])
  })

  it('offers EVERY group, odd or even, when results may be loaded unordered', () => {
    const competitors = groupedCompetitors([
      [1, 2, 3],
      [4, 5, 6, 7],
      [8, 9, 10, 11, 12]
    ])
    const slots = getLateRegistrationSlots(
      unorderedTournamentOf(TournamentType.GROUPS_PLAYOFF),
      CATEGORY,
      groupPhaseMatches(3),
      competitors
    )

    expect(slots.map((slot) => slot.groupNumber)).toEqual([0, 1, 2])
  })

  it('still requires frozen membership and an unfinished phase when unordered', () => {
    const unfrozen: LateRegistrationCompetitor[] = [1, 2, 3, 4].map((id) => ({
      id,
      tournamentCategoryId: CATEGORY.id,
      data: null
    }))

    expect(
      getLateRegistrationSlots(
        unorderedTournamentOf(TournamentType.GROUPS_PLAYOFF),
        CATEGORY,
        groupPhaseMatches(1),
        unfrozen
      )
    ).toEqual([])

    // Every fixture resolved (or voided by the quota) means the phase is over.
    const spent = [
      match({ type: MatchType.LEAGUE, groupNumber: 0, status: MatchStatus.PLAYED }),
      match({ type: MatchType.LEAGUE, groupNumber: 0, status: MatchStatus.VOID })
    ]

    expect(
      getLateRegistrationSlots(
        unorderedTournamentOf(TournamentType.GROUPS_PLAYOFF),
        CATEGORY,
        spent,
        groupedCompetitors([[1, 2, 3, 4]])
      )
    ).toEqual([])
  })
})

describe('getLateRegistrationSlots — LEAGUE', () => {
  /** A league lane of `count` competitors, with one fixture still unplayed. */
  function leagueOf(count: number) {
    return {
      competitors: Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        tournamentCategoryId: CATEGORY.id
      })),
      matches: [match({ type: MatchType.LEAGUE, groupNumber: null, status: MatchStatus.PENDING })]
    }
  }

  it('offers the lane of an ODD ordered league, which has a rest slot', () => {
    const { competitors, matches } = leagueOf(5)
    const slots = getLateRegistrationSlots(tournamentOf(TournamentType.LEAGUE), CATEGORY, matches, competitors)

    expect(slots.map((slot) => slot.kind)).toEqual([LateRegistrationSlotKind.ROUND_ROBIN])
    expect(slots[0].groupNumber).toBeNull()
    expect(slots[0].matchId).toBeNull()
    expect(slots[0].label).toBe('Fixture de la liga')
  })

  it('refuses an EVEN ordered league, where every fixture would change round', () => {
    const { competitors, matches } = leagueOf(6)

    expect(getLateRegistrationSlots(tournamentOf(TournamentType.LEAGUE), CATEGORY, matches, competitors)).toEqual([])
  })

  it('offers an even league once results may be loaded unordered', () => {
    const { competitors, matches } = leagueOf(6)
    const slots = getLateRegistrationSlots(unorderedTournamentOf(TournamentType.LEAGUE), CATEGORY, matches, competitors)

    expect(slots.map((slot) => slot.kind)).toEqual([LateRegistrationSlotKind.ROUND_ROBIN])
  })

  it('refuses a league whose fixture is fully resolved', () => {
    const { competitors } = leagueOf(5)
    const matches = [match({ type: MatchType.LEAGUE, groupNumber: null, status: MatchStatus.PLAYED })]

    expect(getLateRegistrationSlots(tournamentOf(TournamentType.LEAGUE), CATEGORY, matches, competitors)).toEqual([])
    expect(
      getLateRegistrationSlots(unorderedTournamentOf(TournamentType.LEAGUE), CATEGORY, matches, competitors)
    ).toEqual([])
  })
})
