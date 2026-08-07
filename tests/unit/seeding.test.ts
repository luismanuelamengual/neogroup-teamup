import { describe, expect, it } from 'vitest'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getPreclassificationCount, snakeSeedGroups } from '@/app/(protected)/(tournaments)/utils/preclassification'
import {
  assignGroups,
  computeGroupSizes,
  getBracketSize,
  getKnockoutRounds,
  getTotalRounds,
  repairClashingPairings,
  repairSameGroupPairings,
  repairSameSitePairings,
  resolveGroupQualifiers,
  seedFromGroups,
  seedPlayoffPairings
} from '@/app/(protected)/(tournaments)/utils/tournaments'

/** Builds a group's ranked rows; `points` descend with the position by default. */
const ranked = (ids: number[], points?: number[]) =>
  ids.map((competitorId, index) => ({ competitorId, points: points ? points[index] : ids.length - index }))

describe('bracket math', () => {
  it('computes the next power-of-two bracket size', () => {
    expect(getBracketSize(2)).toBe(2)
    expect(getBracketSize(3)).toBe(4)
    expect(getBracketSize(5)).toBe(8)
    expect(getBracketSize(8)).toBe(8)
    expect(getBracketSize(9)).toBe(16)
  })

  it('computes the number of knockout rounds', () => {
    expect(getKnockoutRounds(2)).toBe(1)
    expect(getKnockoutRounds(4)).toBe(2)
    expect(getKnockoutRounds(5)).toBe(3)
    expect(getKnockoutRounds(8)).toBe(3)
    expect(getKnockoutRounds(16)).toBe(4)
  })

  it('seeds round 1 so the top seed meets the lowest, with byes for the top seeds', () => {
    // 5 entrants → bracket of 8 → 3 byes go to seeds 1,2,3.
    const pairings = seedPlayoffPairings([1, 2, 3, 4, 5])
    const byes = pairings.filter((p) => p.away === null).map((p) => p.home!)

    expect(byes.sort((a, b) => a - b)).toEqual([1, 2, 3])
    // The single real match pits the two lowest seeds (4 vs 5).
    const real = pairings.filter((p) => p.away !== null)

    expect(real.length).toBe(1)
    expect([real[0].home!, real[0].away!].sort((a, b) => a - b)).toEqual([4, 5])
  })
})

describe('group sizing', () => {
  it('balances group sizes', () => {
    expect(computeGroupSizes(8, 4)).toEqual([4, 4])
    expect(computeGroupSizes(9, 4)).toEqual([3, 3, 3])
    expect(computeGroupSizes(10, 4)).toEqual([4, 3, 3])
    expect(computeGroupSizes(6, 3)).toEqual([3, 3])
    expect(computeGroupSizes(5, 4)).toEqual([3, 2])
  })

  it('assigns competitors round-robin into balanced groups', () => {
    const groups = assignGroups([1, 2, 3, 4, 5, 6, 7, 8], 4)

    expect(groups.length).toBe(2)
    expect(groups.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // No competitor appears in two groups.
    expect(new Set(groups.flat()).size).toBe(8)
  })

  it('cross-seeds qualifiers so group winners come first', () => {
    // groups -> ranked qualifiers; winners then runners-up. Equal points across
    // groups, so the competitor id breaks the tie and the classic order holds.
    const seeded = seedFromGroups([ranked([10, 11], [6, 3]), ranked([20, 21], [6, 3]), ranked([30, 31], [6, 3])])

    expect(seeded).toEqual([10, 20, 30, 11, 21, 31])
  })
})

describe('minimum playoff qualifiers', () => {
  it('keeps qualifiersPerGroup when no minimum is set', () => {
    expect(resolveGroupQualifiers([4, 4, 4, 4], 2)).toEqual([2, 2, 2, 2])
    expect(resolveGroupQualifiers([4, 3], 2, null)).toEqual([2, 2])
  })

  it('raises the cut-off evenly to reach the minimum (examples 1 and 2)', () => {
    // One group of 8, top 2 by default, minimum 6 → the top 6 advance.
    expect(resolveGroupQualifiers([8], 2, 6)).toEqual([6])
    // Two groups of 4, minimum 6 → top 3 of each, not "top 2 plus best thirds".
    expect(resolveGroupQualifiers([4, 4], 2, 6)).toEqual([3, 3])
  })

  it('sends everybody when the minimum exceeds the field (example 3)', () => {
    expect(resolveGroupQualifiers([10], 4, 9000)).toEqual([10])
    expect(resolveGroupQualifiers([4, 4, 3], 2, 9000)).toEqual([4, 4, 3])
  })

  it('does nothing when the baseline already meets the minimum (example 4)', () => {
    expect(resolveGroupQualifiers([4, 4, 4, 4], 2, 4)).toEqual([2, 2, 2, 2])
    expect(resolveGroupQualifiers([4, 4, 4, 4], 2, 8)).toEqual([2, 2, 2, 2])
  })

  it('handles uneven groups, overshooting rather than falling short', () => {
    // The small group runs out of competitors, so the big one carries the rest.
    expect(resolveGroupQualifiers([6, 2], 2, 7)).toEqual([5, 2])
    // A shared level can overshoot the minimum — it is a floor, not a target.
    expect(resolveGroupQualifiers([5, 4, 4], 2, 10)).toEqual([4, 4, 4])
  })

  it('never returns fewer than one qualifier per group', () => {
    expect(resolveGroupQualifiers([4, 4], 0, undefined)).toEqual([1, 1])
  })
})

describe('seeding within a rank tier', () => {
  it('orders each tier by group points, best first', () => {
    const seeded = seedFromGroups([ranked([10, 11], [9, 2]), ranked([20, 21], [4, 5]), ranked([30, 31], [7, 8])])

    // Winners tier ordered 10 (9 pts) > 30 (7) > 20 (4); runners-up 31 (8) > 21 (5) > 11 (2).
    expect(seeded).toEqual([10, 30, 20, 31, 21, 11])
  })

  it('keeps group winners ahead of runners-up even with fewer points', () => {
    // 20 wins a small group with 4 points; 11 is a runner-up with 8. The tier
    // still comes first, because points are not comparable across group sizes.
    const seeded = seedFromGroups([ranked([10, 11], [9, 8]), ranked([20, 21], [4, 1])])

    expect(seeded).toEqual([10, 20, 11, 21])
  })

  it('breaks equal points by ranking seed, then by competitor id', () => {
    const tieBreakers = new Map([
      [10, { seedNumber: 3 }],
      [20, { seedNumber: 1 }],
      [30, { seedNumber: null }]
    ])
    const seeded = seedFromGroups([ranked([10], [5]), ranked([20], [5]), ranked([30], [5])], tieBreakers)

    // Seeds 1 and 3 first in order; the unseeded competitor goes last.
    expect(seeded).toEqual([20, 10, 30])
  })

  it('is deterministic — two calls on the same input agree', () => {
    const build = () => seedFromGroups([ranked([10, 11], [5, 5]), ranked([20, 21], [5, 5])])

    expect(build()).toEqual(build())
  })

  it('falls back to plain standings order for a single group', () => {
    const seeded = seedFromGroups([ranked([10, 11, 12, 13, 14, 15], [9, 8, 7, 6, 5, 4])])

    expect(seeded).toEqual([10, 11, 12, 13, 14, 15])
  })
})

describe('same-group pairing repair', () => {
  /** group index of every competitor, using the tens digit (10,11 → group 1). */
  const groupsOf = (...entries: [number, number][]) => new Map(entries)

  it('swaps rivals so nobody replays a group opponent', () => {
    // 3 groups sending 2 each: the plain bracket pairs C1 vs C2 (30 vs 31).
    const seeded = seedFromGroups([ranked([10, 11]), ranked([20, 21]), ranked([30, 31])])
    const groupOf = groupsOf([10, 0], [11, 0], [20, 1], [21, 1], [30, 2], [31, 2])
    const pairings = repairSameGroupPairings(seedPlayoffPairings(seeded), groupOf)

    for (const pairing of pairings) {
      if (pairing.away != null) {
        expect(groupOf.get(pairing.home!)).not.toBe(groupOf.get(pairing.away))
      }
    }
  })

  it('leaves byes and the competitors facing them untouched', () => {
    const seeded = seedFromGroups([ranked([10, 11]), ranked([20, 21]), ranked([30, 31])])
    const groupOf = groupsOf([10, 0], [11, 0], [20, 1], [21, 1], [30, 2], [31, 2])
    const before = seedPlayoffPairings(seeded)
      .filter((pairing) => pairing.away === null)
      .map((pairing) => pairing.home!)
    const after = repairSameGroupPairings(seedPlayoffPairings(seeded), groupOf)
      .filter((pairing) => pairing.away === null)
      .map((pairing) => pairing.home!)

    expect(after).toEqual(before)
  })

  it('is a no-op when every competitor comes from the same group', () => {
    const seeded = [10, 11, 12, 13]
    const groupOf = groupsOf([10, 0], [11, 0], [12, 0], [13, 0])
    const before = seedPlayoffPairings(seeded)
    const after = repairSameGroupPairings(seedPlayoffPairings(seeded), groupOf)

    expect(after).toEqual(before)
  })

  it('does not drop or duplicate anyone', () => {
    const seeded = seedFromGroups([ranked([10, 11]), ranked([20, 21]), ranked([30, 31])])
    const groupOf = groupsOf([10, 0], [11, 0], [20, 1], [21, 1], [30, 2], [31, 2])
    const pairings = repairSameGroupPairings(seedPlayoffPairings(seeded), groupOf)
    const placed = pairings.flatMap((pairing) => [pairing.home, pairing.away].filter((id): id is number => id != null))

    expect(placed.sort((a, b) => a - b)).toEqual([10, 11, 20, 21, 30, 31])
  })
})

describe('same-site pairing repair', () => {
  /** site of every competitor, using the tens digit (10,11 → site 1) — same shape as `groupOf`. */
  const sitesOf = (...entries: [number, number][]) => new Map(entries)

  it('swaps rivals so nobody from the same site meets in round 1', () => {
    const seeded = seedFromGroups([ranked([10, 11]), ranked([20, 21]), ranked([30, 31])])
    const siteOf = sitesOf([10, 0], [11, 0], [20, 1], [21, 1], [30, 2], [31, 2])
    const pairings = repairSameSitePairings(seedPlayoffPairings(seeded), siteOf)

    for (const pairing of pairings) {
      if (pairing.away != null) {
        expect(siteOf.get(pairing.home!)).not.toBe(siteOf.get(pairing.away))
      }
    }
  })

  it('leaves byes and the competitors facing them untouched', () => {
    const seeded = seedFromGroups([ranked([10, 11]), ranked([20, 21]), ranked([30, 31])])
    const siteOf = sitesOf([10, 0], [11, 0], [20, 1], [21, 1], [30, 2], [31, 2])
    const before = seedPlayoffPairings(seeded)
      .filter((pairing) => pairing.away === null)
      .map((pairing) => pairing.home!)
    const after = repairSameSitePairings(seedPlayoffPairings(seeded), siteOf)
      .filter((pairing) => pairing.away === null)
      .map((pairing) => pairing.home!)

    expect(after).toEqual(before)
  })

  it('is a no-op when a competitor has no known site', () => {
    const seeded = [10, 11, 12, 13]
    const siteOf = sitesOf([10, 0], [11, 1])
    const before = seedPlayoffPairings(seeded)
    const after = repairSameSitePairings(seedPlayoffPairings(seeded), siteOf)

    expect(after).toEqual(before)
  })

  it('does not drop or duplicate anyone', () => {
    const seeded = seedFromGroups([ranked([10, 11]), ranked([20, 21]), ranked([30, 31])])
    const siteOf = sitesOf([10, 0], [11, 0], [20, 1], [21, 1], [30, 2], [31, 2])
    const pairings = repairSameSitePairings(seedPlayoffPairings(seeded), siteOf)
    const placed = pairings.flatMap((pairing) => [pairing.home, pairing.away].filter((id): id is number => id != null))

    expect(placed.sort((a, b) => a - b)).toEqual([10, 11, 20, 21, 30, 31])
  })

  it('resolves a group clash and a site clash together in one pass', () => {
    // 10/11 share a group; 20/30 (not otherwise related) happen to share a site.
    // A repair that ran the two dimensions independently, one after the other,
    // could undo the first fix while chasing the second — repairClashingPairings
    // must satisfy both from a single swap pass.
    const seeded = [10, 20, 30, 11]
    const groupOf = new Map([
      [10, 0],
      [11, 0],
      [20, 1],
      [30, 2]
    ])
    const siteOf = new Map([
      [20, 100],
      [30, 100]
    ])
    const pairings = repairClashingPairings(seedPlayoffPairings(seeded), [
      (id) => groupOf.get(id),
      (id) => siteOf.get(id)
    ])

    for (const pairing of pairings) {
      if (pairing.away == null) {
        continue
      }

      expect(groupOf.get(pairing.home!)).not.toBe(groupOf.get(pairing.away))
      expect(siteOf.get(pairing.home!)).not.toBe(siteOf.get(pairing.away))
    }
  })
})

describe('preclassification count', () => {
  it('caps seeds to the next power-of-two below the field, max 16', () => {
    expect(getPreclassificationCount(3)).toBe(2)
    expect(getPreclassificationCount(4)).toBe(2)
    expect(getPreclassificationCount(8)).toBe(4)
    expect(getPreclassificationCount(16)).toBe(8)
    expect(getPreclassificationCount(64)).toBe(16)
  })
})

describe('snake seeding', () => {
  it('keeps top seeds in different groups', () => {
    const groups = snakeSeedGroups([1, 2, 3, 4], [5, 6, 7, 8], [2, 2, 2, 2])

    // Seeds 1..4 land in distinct groups.
    expect(groups.map((g) => g[0])).toEqual([1, 2, 3, 4])
    // Everyone is placed exactly once.
    expect(new Set(groups.flat()).size).toBe(8)
  })

  it('snakes the second seeding round in reverse', () => {
    const groups = snakeSeedGroups([1, 2, 3, 4, 5, 6], [], [2, 2, 2])

    // round 1: seeds 1,2,3 → groups 0,1,2 ; round 2: seeds 4,5,6 → groups 2,1,0
    expect(groups[0]).toEqual([1, 6])
    expect(groups[1]).toEqual([2, 5])
    expect(groups[2]).toEqual([3, 4])
  })

  it('respects group capacity so nobody is shorted a slot (regression: 11 competitors, 4 seeds)', () => {
    // computeGroupSizes(11, 4) = [4, 4, 3]; every competitor must land in a group.
    const seeded = [1, 2, 3, 4]
    const unseeded = [5, 6, 7, 8, 9, 10, 11]
    const groups = snakeSeedGroups(seeded, unseeded, [4, 4, 3])

    expect(groups.map((g) => g.length)).toEqual([4, 4, 3])
    expect(groups.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    // Every seed is placed (this is the seed that used to go missing).
    expect(seeded.every((id) => groups.some((g) => g.includes(id)))).toBe(true)
  })

  it('never leaves a group with a single member when a balanced split exists (regression: 9 competitors, 1 seed)', () => {
    // computeGroupSizes(9, 4) = [3, 3, 3], not the skewed [4, 3, 2] the old
    // two-independent-modulo-passes implementation produced.
    const groups = snakeSeedGroups([1], [2, 3, 4, 5, 6, 7, 8, 9], [3, 3, 3])

    expect(groups.map((g) => g.length)).toEqual([3, 3, 3])
    expect(groups.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('total rounds per type', () => {
  it('league = circle-method rounds', () => {
    expect(getTotalRounds(TournamentType.LEAGUE, {}, 4)).toBe(3)
    expect(getTotalRounds(TournamentType.LEAGUE, {}, 5)).toBe(5)
  })

  it('americano respects maxRounds', () => {
    expect(getTotalRounds(TournamentType.AMERICANO, { maxRounds: 3 }, 8)).toBe(3)
    expect(getTotalRounds(TournamentType.AMERICANO, {}, 8)).toBe(7)
  })

  it('playoff = knockout rounds', () => {
    expect(getTotalRounds(TournamentType.PLAYOFF, {}, 8)).toBe(3)
    expect(getTotalRounds(TournamentType.PLAYOFF, {}, 5)).toBe(3)
  })
})
