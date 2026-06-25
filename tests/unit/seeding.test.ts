import { describe, expect, it } from 'vitest'
import {
  assignGroups,
  computeGroupSizes,
  getBracketSize,
  getKnockoutRounds,
  getTotalRounds,
  seedFromGroups,
  seedPlayoffPairings
} from '@/app/(protected)/(tournaments)/services/tournament-engine'
import { getPreclassificationCount, snakeSeedGroups } from '@/app/(protected)/(tournaments)/utils/preclassification'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

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
    const byes = pairings.filter((p) => p.away === null).map((p) => p.home[0])

    expect(byes.sort((a, b) => a - b)).toEqual([1, 2, 3])
    // The single real match pits the two lowest seeds (4 vs 5).
    const real = pairings.filter((p) => p.away !== null)

    expect(real.length).toBe(1)
    expect([real[0].home[0], real[0].away![0]].sort((a, b) => a - b)).toEqual([4, 5])
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
    // groups -> ranked qualifiers; winners then runners-up.
    const seeded = seedFromGroups([
      [10, 11],
      [20, 21],
      [30, 31]
    ])

    expect(seeded).toEqual([10, 20, 30, 11, 21, 31])
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
    const groups = snakeSeedGroups([1, 2, 3, 4], [5, 6, 7, 8], 4)

    // Seeds 1..4 land in distinct groups.
    expect(groups.map((g) => g[0])).toEqual([1, 2, 3, 4])
    // Everyone is placed exactly once.
    expect(new Set(groups.flat()).size).toBe(8)
  })

  it('snakes the second seeding round in reverse', () => {
    const groups = snakeSeedGroups([1, 2, 3, 4, 5, 6], [], 3)

    // round 1: seeds 1,2,3 → groups 0,1,2 ; round 2: seeds 4,5,6 → groups 2,1,0
    expect(groups[0]).toEqual([1, 6])
    expect(groups[1]).toEqual([2, 5])
    expect(groups[2]).toEqual([3, 4])
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
