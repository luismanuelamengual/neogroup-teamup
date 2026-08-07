import { describe, expect, it } from 'vitest'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  buildGroups,
  buildSiteMap,
  computeGroupMembership,
  GroupableCompetitor,
  repairSameSiteGroups,
  resolveCompetitorSiteId,
  resolveSiteId
} from '@/app/(protected)/(tournaments)/utils/groups'

describe('resolveSiteId', () => {
  it('prefers the explicit data.siteId over anything else', () => {
    expect(resolveSiteId(5, [1, 1, 1])).toBe(5)
    expect(resolveSiteId(5, [])).toBe(5)
  })

  it("falls back to the players' shared site when data has none", () => {
    expect(resolveSiteId(null, [7, 7])).toBe(7)
    expect(resolveSiteId(undefined, [7])).toBe(7)
  })

  it('is unassigned when the players do not all share a site', () => {
    expect(resolveSiteId(null, [7, 8])).toBeNull()
    expect(resolveSiteId(null, [7, null])).toBeNull()
    expect(resolveSiteId(null, [null, null])).toBeNull()
  })

  it('is unassigned with no data and no players', () => {
    expect(resolveSiteId(null, [])).toBeNull()
  })
})

describe('resolveCompetitorSiteId / buildSiteMap', () => {
  it('resolves an interclubes team straight from data.siteId', () => {
    const competitor: GroupableCompetitor = { id: 1, data: { siteId: 9 }, players: [{ siteId: null }] }

    expect(resolveCompetitorSiteId(competitor)).toBe(9)
  })

  it('resolves a pair from its players when data has no site', () => {
    const competitor: GroupableCompetitor = { id: 2, data: null, players: [{ siteId: 4 }, { siteId: 4 }] }

    expect(resolveCompetitorSiteId(competitor)).toBe(4)
  })

  it('is unassigned for a mixed-site pair', () => {
    const competitor: GroupableCompetitor = { id: 3, data: null, players: [{ siteId: 4 }, { siteId: 5 }] }

    expect(resolveCompetitorSiteId(competitor)).toBeNull()
  })

  it('builds a map skipping unassigned competitors', () => {
    const siteOf = buildSiteMap([
      { id: 1, data: { siteId: 9 } },
      { id: 2, players: [{ siteId: 4 }, { siteId: 5 }] },
      { id: 3, players: [{ siteId: 4 }] }
    ])

    expect(siteOf.get(1)).toBe(9)
    expect(siteOf.has(2)).toBe(false)
    expect(siteOf.get(3)).toBe(4)
  })
})

describe('repairSameSiteGroups', () => {
  it('swaps competitors so a site does not land twice in the same group', () => {
    // Groups of 2: [1,2] and [3,4]; sites put 1&2 together and 3&4 together —
    // both groups clash, but a full separation exists (1&3 same-ish sites don't
    // clash, 2&4 don't either): swap 2 with 3.
    const groups = [
      [1, 2],
      [3, 4]
    ]
    const siteOf = new Map([
      [1, 100],
      [2, 100],
      [3, 200],
      [4, 200]
    ])
    const repaired = repairSameSiteGroups(groups, siteOf)

    for (const group of repaired) {
      const sites = group.map((id) => siteOf.get(id)).filter((site): site is number => site != null)

      expect(new Set(sites).size).toBe(sites.length)
    }

    // Nobody is dropped or duplicated.
    expect(repaired.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })

  it('does not change group sizes', () => {
    const groups = [
      [1, 2, 3],
      [4, 5]
    ]
    const siteOf = new Map([
      [1, 1],
      [2, 1],
      [3, 1]
    ])
    const repaired = repairSameSiteGroups(groups, siteOf)

    expect(repaired.map((g) => g.length)).toEqual([3, 2])
  })

  it('is best effort: a site bigger than any group still leaves a clash', () => {
    // Every competitor is from the same site — nothing can be done.
    const groups = [
      [1, 2],
      [3, 4]
    ]
    const siteOf = new Map([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1]
    ])
    const repaired = repairSameSiteGroups(groups, siteOf)

    expect(repaired.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
  })

  it('leaves groups without any site info untouched', () => {
    const groups = [
      [1, 2],
      [3, 4]
    ]

    expect(repairSameSiteGroups(groups, new Map())).toEqual([
      [1, 2],
      [3, 4]
    ])
  })
})

describe('buildGroups with siteOf', () => {
  it('avoids grouping same-site competitors when a balanced split exists', () => {
    // 8 unseeded competitors, groups of 4 → two groups. Sites 100/100/100/100
    // and 200/200/200/200 pair up 1:1 with... make it so the naive round-robin
    // split (assignGroups) would clump a site if not repaired: ids alternate
    // 1..8, groupSize 4 → assignGroups puts 1,3,5,7 in group 0 and 2,4,6,8 in
    // group 1. Assign sites so competitors 1,3,5,7 (group 0) are not all the
    // same site but 1 and 3 clash, while 2 and 4 (group 1) also clash.
    const siteOf = new Map([
      [1, 10],
      [3, 10],
      [2, 20],
      [4, 20]
    ])
    const orderedIds = [1, 2, 3, 4, 5, 6, 7, 8]
    const groups = buildGroups(orderedIds, 0, { competitorsPerGroup: 4 }, TournamentType.GROUPS_PLAYOFF, siteOf)

    for (const group of groups) {
      const sites = group.map((id) => siteOf.get(id)).filter((site): site is number => site != null)

      expect(new Set(sites).size).toBe(sites.length)
    }

    expect(groups.flat().sort((a, b) => a - b)).toEqual(orderedIds)
  })

  it('is unaffected when no siteOf is given (backward compatible)', () => {
    const orderedIds = [1, 2, 3, 4, 5, 6, 7, 8]

    expect(buildGroups(orderedIds, 0, { competitorsPerGroup: 4 }, TournamentType.GROUPS_PLAYOFF)).toEqual(
      buildGroups(orderedIds, 0, { competitorsPerGroup: 4 }, TournamentType.GROUPS_PLAYOFF, new Map())
    )
  })
})

describe('computeGroupMembership with embedded site info', () => {
  it('keeps same-site competitors apart end to end from GroupableCompetitor input', () => {
    // Unseeded groups of 2 split ids round-robin: group0=[1,3], group1=[2,4].
    // Sites 1&3 the same, 2&4 the same, forces both groups to clash unless repaired.
    const competitors: GroupableCompetitor[] = [
      { id: 1, players: [{ siteId: 100 }] },
      { id: 2, players: [{ siteId: 200 }] },
      { id: 3, players: [{ siteId: 100 }] },
      { id: 4, players: [{ siteId: 200 }] }
    ]
    const siteById = new Map(competitors.map((c) => [c.id, c.players![0].siteId]))
    const membership = computeGroupMembership(competitors, { competitorsPerGroup: 2 }, TournamentType.GROUPS_PLAYOFF)

    expect(membership.flat().sort((a, b) => a - b)).toEqual([1, 2, 3, 4])

    for (const group of membership) {
      const sites = group.map((id) => siteById.get(id))

      expect(new Set(sites).size).toBe(sites.length)
    }
  })
})
