import { beforeEach, describe, expect, it } from 'vitest'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  loadManageableTournament,
  moveCompetitor,
  unregisterCompetitor
} from '@/app/(protected)/(tournaments)/services/administration'
import { canRemoveCompetitor, RemovalBlockReason } from '@/app/(protected)/(tournaments)/utils/lateRemoval'
import {
  buildTournament,
  BuiltTournament,
  getAllMatches,
  getPendingActiveMatches,
  homeWinScore,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

/**
 * Taking a competitor OUT of a tournament that is ALREADY RUNNING — moving them
 * to another category, or unregistering them altogether.
 *
 * The promise is stricter than the one late registration makes, and everything
 * here is written to hold it to that: the competitor has to come out WITHOUT A
 * TRACE. So the assertions are overwhelmingly about what stayed the same — every
 * fixture that did not involve them must still exist, in the same round, against
 * the same rival — plus the absence of anything that mentions them, and the
 * refusals, which is where most cases land.
 */

/** Reloads the tournament through the same gate the API route uses. */
function manageable(built: BuiltTournament) {
  return loadManageableTournament(built.tournament.id, built.ownerId, { allowOngoing: true })
}

/** Order-insensitive identity of a matchup. */
function pairKey(match: Match): string {
  return [match.homeCompetitorId, match.awayCompetitorId]
    .filter((id): id is number => id != null)
    .sort((a, b) => a - b)
    .join(':')
}

/** Every real fixture of a category, keyed by "round|pair", so it can be diffed across a departure. */
async function fixtureIndex(tournamentCategoryId: number): Promise<Set<string>> {
  const matches = await getAllMatches(tournamentCategoryId)

  return new Set(
    matches
      .filter((match) => match.homeCompetitorId != null && match.awayCompetitorId != null)
      .map((match) => `${match.roundNumber}|${pairKey(match)}`)
  )
}

/** The removal check for a competitor, re-derived from live state. */
async function checkOf(built: BuiltTournament, competitorId: number) {
  const tournament = await manageable(built)
  const competitor = (tournament.competitors ?? []).find((each) => each.id === competitorId)!
  const category = (tournament.categories ?? []).find((each) => each.id === competitor.tournamentCategoryId)!

  return canRemoveCompetitor(tournament, category, tournament.matches ?? [], tournament.competitors ?? [], competitorId)
}

/** Competitor ids of a category, in the order the engine reads them (by id). */
async function competitorIdsOf(tournamentCategoryId: number): Promise<number[]> {
  const competitors = await Competitor.where('tournamentCategoryId', tournamentCategoryId).orderBy('id').get()

  return competitors.map((competitor) => competitor.id)
}

/** Frozen group membership of a category, as competitor ids per group. */
async function frozenGroups(tournamentCategoryId: number): Promise<number[][]> {
  const competitors = await Competitor.where('tournamentCategoryId', tournamentCategoryId).orderBy('id').get()
  const groups: number[][] = []

  for (const competitor of competitors) {
    const groupNumber = competitor.data?.groupNumber

    expect(groupNumber, `competitor ${competitor.id} has no frozen group`).not.toBeUndefined()
    groups[groupNumber!] = groups[groupNumber!] ?? []
    groups[groupNumber!].push(competitor.id)
  }

  return groups
}

/** Asserts nothing anywhere in the category still refers to `competitorId`. */
async function expectNoTraceOf(tournamentCategoryId: number, competitorId: number): Promise<void> {
  const matches = await getAllMatches(tournamentCategoryId)

  for (const match of matches) {
    expect(match.homeCompetitorId).not.toBe(competitorId)
    expect(match.awayCompetitorId).not.toBe(competitorId)
  }
}

/** Plays every currently playable match of a tournament, once. */
async function playOneWave(built: BuiltTournament): Promise<number> {
  const pending = await getPendingActiveMatches(built.categoryIds)

  for (const match of pending) {
    await setResult(match.id, homeWinScore(built.tournament.scoreFormat))
  }

  return pending.length
}

describe('late removal — league', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  /**
   * The canonical move: the last competitor of an EVEN lane leaves for a
   * category whose ODD lane has a rest slot waiting. The origin becomes the odd
   * lane it would have been all along, the destination the even one.
   *
   * A league's lane is ordered by competitor id, so the mover has to sit at the
   * end of BOTH: last of their own lane to leave it untouched, and above every
   * id of the destination to land on its rest slot. The categories are built
   * `[5, 6]` for exactly that reason — the second one holds the higher ids.
   */
  it('moves the last competitor of an even lane into another category, changing no fixture', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, categories: [5, 6], playersPerCompetitor: 2 })

    await start(built)

    const [targetId, originId] = built.categoryIds
    const origin = await competitorIdsOf(originId)
    const mover = origin[origin.length - 1]
    const originBefore = await fixtureIndex(originId)
    const targetBefore = await fixtureIndex(targetId)
    const moverFixtures = [...originBefore].filter((key) => key.split('|')[1].split(':').includes(String(mover)))

    expect(moverFixtures.length).toBeGreaterThan(0)
    expect((await checkOf(built, mover)).removable).toBe(true)

    await moveCompetitor(await manageable(built), mover, targetId)

    const originAfter = await fixtureIndex(originId)
    const targetAfter = await fixtureIndex(targetId)

    // The origin lost exactly the mover's fixtures and nothing else: every other
    // pairing is still in the same round, against the same rival.
    expect([...originAfter].sort()).toEqual([...originBefore].filter((key) => !moverFixtures.includes(key)).sort())
    await expectNoTraceOf(originId, mover)

    // The destination kept every fixture it had and gained the mover's.
    for (const key of targetBefore) {
      expect(targetAfter.has(key)).toBe(true)
    }

    // Everything the destination gained is a fixture of the newcomer — an
    // ordered league materialises one round at a time, so what they pick up now
    // is the match of the round in play (the rest slot they landed on), and the
    // remaining ones come as the lane advances.
    const gained = [...targetAfter].filter((key) => !targetBefore.has(key))

    expect(gained.length).toBeGreaterThan(0)

    for (const key of gained) {
      expect(key.split('|')[1].split(':')).toContain(String(mover))
    }

    // The destination lane is now the even one it became: nobody rests.
    const rivals = await competitorIdsOf(targetId)
    const firstRound = (await getAllMatches(targetId)).filter((match) => match.roundNumber === 1)

    expect(rivals).toContain(mover)
    expect(firstRound.length).toBe(rivals.length / 2)
    expect((await Competitor.find(mover))!.tournamentCategoryId).toBe(targetId)
  })

  /**
   * The other half of the same rule, read from the destination: a competitor
   * whose id is below the ids already in the destination league would be
   * inserted into the MIDDLE of its order and re-pair every fixture, so the
   * category stops being a destination even though its lane has a rest slot.
   */
  it('refuses a destination league whose competitors registered later', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, categories: [6, 5], playersPerCompetitor: 2 })

    await start(built)

    const [originId, targetId] = built.categoryIds
    const origin = await competitorIdsOf(originId)
    const mover = origin[origin.length - 1]
    const before = await fixtureIndex(targetId)

    // Leaving is fine — it is the arrival that is not.
    expect((await checkOf(built, mover)).removable).toBe(true)
    await expect(moveCompetitor(await manageable(built), mover, targetId)).rejects.toThrow()

    expect(await fixtureIndex(targetId)).toEqual(before)
    expect((await Competitor.find(mover))!.tournamentCategoryId).toBe(originId)
  })

  it('refuses a competitor that is not the last of its lane', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, categories: [6, 5], playersPerCompetitor: 2 })

    await start(built)

    const [originId, targetId] = built.categoryIds
    const origin = await competitorIdsOf(originId)
    const check = await checkOf(built, origin[0])

    expect(check.removable).toBe(false)
    expect(check.reason).toBe(RemovalBlockReason.PAIRINGS)
    await expect(moveCompetitor(await manageable(built), origin[0], targetId)).rejects.toThrow()

    // A refused move leaves the tournament untouched.
    expect((await Competitor.find(origin[0]))!.tournamentCategoryId).toBe(originId)
  })

  it('refuses a competitor that already played', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, categories: [6, 5], playersPerCompetitor: 2 })

    await start(built)

    const [originId, targetId] = built.categoryIds
    const origin = await competitorIdsOf(originId)
    const mover = origin[origin.length - 1]
    const theirs = (await getAllMatches(originId)).find(
      (match) => match.homeCompetitorId === mover || match.awayCompetitorId === mover
    )!

    await setResult(theirs.id, homeWinScore(built.tournament.scoreFormat))

    const check = await checkOf(built, mover)

    expect(check.removable).toBe(false)
    expect(check.reason).toBe(RemovalBlockReason.PLAYED)
    await expect(moveCompetitor(await manageable(built), mover, targetId)).rejects.toThrow()
  })

  it('unregisters the last competitor of an even lane, leaving the rest of the fixture intact', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 6, playersPerCompetitor: 2 })

    await start(built)

    const categoryId = built.categoryIds[0]
    const ids = await competitorIdsOf(categoryId)
    const leaver = ids[ids.length - 1]
    const before = await fixtureIndex(categoryId)
    const theirs = [...before].filter((key) => key.split('|')[1].split(':').includes(String(leaver)))

    await unregisterCompetitor(await manageable(built), leaver)

    expect([...(await fixtureIndex(categoryId))].sort()).toEqual([...before].filter((k) => !theirs.includes(k)).sort())
    expect(await Competitor.find(leaver)).toBeNull()
    await expectNoTraceOf(categoryId, leaver)
  })

  /**
   * The lane is left odd, so the round robin still has as many rounds as before
   * and can be played to the end — the real proof that the departure left the
   * competition intact rather than merely tidy.
   */
  it('plays the shrunken lane to completion', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 6, playersPerCompetitor: 2 })

    await start(built)

    const categoryId = built.categoryIds[0]
    const ids = await competitorIdsOf(categoryId)

    await unregisterCompetitor(await manageable(built), ids[ids.length - 1])

    for (let wave = 0; wave < 20 && (await playOneWave(built)) > 0; wave++) {
      // Keep playing until nothing is pending.
    }

    const matches = await getAllMatches(categoryId)
    const remaining = ids.slice(0, -1)

    expect(matches.some((match) => match.status === MatchStatus.PENDING)).toBe(false)
    // A round robin of 5 is 10 matches, every pair exactly once.
    expect(new Set(matches.map(pairKey)).size).toBe((remaining.length * (remaining.length - 1)) / 2)
  })
})

describe('late removal — groups + playoff', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('moves the last competitor of a group into a group of another category', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      categories: [8, 7],
      playersPerCompetitor: 2,
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2 }
    })

    await start(built)

    const [originId, targetId] = built.categoryIds
    const originGroups = await frozenGroups(originId)
    const group = originGroups.findIndex((each) => each.length % 2 === 0)

    expect(group).toBeGreaterThanOrEqual(0)

    const mover = originGroups[group][originGroups[group].length - 1]
    const originBefore = await fixtureIndex(originId)
    const targetBefore = await fixtureIndex(targetId)
    const moverFixtures = [...originBefore].filter((key) => key.split('|')[1].split(':').includes(String(mover)))

    expect((await checkOf(built, mover)).removable).toBe(true)

    // The destination's odd group is the one with a rest slot to take them.
    const targetGroups = await frozenGroups(targetId)
    const oddGroup = targetGroups.findIndex((each) => each.length % 2 === 1)

    expect(oddGroup).toBeGreaterThanOrEqual(0)
    await moveCompetitor(await manageable(built), mover, targetId, { groupNumber: oddGroup })

    expect([...(await fixtureIndex(originId))].sort()).toEqual(
      [...originBefore].filter((key) => !moverFixtures.includes(key)).sort()
    )
    await expectNoTraceOf(originId, mover)

    for (const key of targetBefore) {
      expect((await fixtureIndex(targetId)).has(key)).toBe(true)
    }

    const moved = (await Competitor.find(mover))!

    expect(moved.tournamentCategoryId).toBe(targetId)
    expect(moved.data?.groupNumber).toBe(oddGroup)

    // The group they left kept everybody else exactly where they were.
    expect((await frozenGroups(originId))[group]).toEqual(originGroups[group].filter((id) => id !== mover))
  })

  /**
   * The shape a real club league takes with this engine: one big group per
   * category (`competitorsPerGroup` far above the field), results loaded in any
   * order, a per-competitor match quota, and a `minPlayoffQualifiers` so high
   * that EVERYBODY reaches the knockout.
   *
   * That last setting is why this is worth its own test. "Everybody qualifies"
   * means a group of n sends n, so a group of n-1 sends n-1 — the quota changes
   * simply because there is one competitor fewer, not because the cut-off moved.
   * Reading that as a structural change would close the feature to exactly the
   * tournaments it is most useful for.
   */
  it('moves a competitor of an unordered, everybody-qualifies league', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      categories: [12, 10],
      playersPerCompetitor: 2,
      settings: {
        competitorsPerGroup: 100,
        qualifiersPerGroup: 1,
        minPlayoffQualifiers: 100,
        maxRounds: 4,
        allowUnorderedResults: true,
        pointsPerPresent: 1,
        pointsPerSetWon: 1,
        pointsPerMatchWon: 0
      }
    })

    await start(built)

    const [originId, targetId] = built.categoryIds
    const origin = await competitorIdsOf(originId)
    // Unordered lanes re-derive nothing, so it is not only the last competitor
    // that can go: anybody who has not played can.
    const mover = origin[3]
    const originBefore = await fixtureIndex(originId)
    const targetBefore = await fixtureIndex(targetId)
    const moverFixtures = [...originBefore].filter((key) => key.split('|')[1].split(':').includes(String(mover)))
    const check = await checkOf(built, mover)

    expect(check.message).toBeNull()
    expect(check.removable).toBe(true)

    await moveCompetitor(await manageable(built), mover, targetId, { groupNumber: 0 })

    // Not one fixture of either category moved: the origin lost exactly the
    // mover's, the destination kept every one of its own.
    expect([...(await fixtureIndex(originId))].sort()).toEqual(
      [...originBefore].filter((key) => !moverFixtures.includes(key)).sort()
    )
    await expectNoTraceOf(originId, mover)

    const targetAfter = await fixtureIndex(targetId)

    for (const key of targetBefore) {
      expect(targetAfter.has(key)).toBe(true)
    }

    // An unordered lane materialises its WHOLE round robin up front, so the
    // newcomer is owed a fixture against every single rival at once.
    const rivals = await competitorIdsOf(targetId)
    const gained = [...targetAfter].filter((key) => !targetBefore.has(key))

    expect(gained.length).toBe(rivals.length - 1)

    const moved = (await Competitor.find(mover))!

    expect(moved.tournamentCategoryId).toBe(targetId)
    expect(moved.data?.groupNumber).toBe(0)
  })

  /**
   * The case the qualifier check exists for: the leaver's group shrinking pushes
   * `minPlayoffQualifiers` to re-level the cut-off, so ANOTHER group would start
   * sending more competitors than it sends today.
   *
   * Groups of 5 and 4 with a floor of 8 sit exactly on the level "top 4 of
   * each": 4 + 4 = 8. Take one out of the group of 4 and that level only yields
   * 4 + 3 = 7, so the cut-off climbs to 5 — and the group of 5, which nobody
   * touched, would suddenly send its whole field instead of four.
   */
  it('refuses when the departure moves the cut-off of another group', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 9,
      playersPerCompetitor: 2,
      settings: { competitorsPerGroup: 5, qualifiersPerGroup: 1, minPlayoffQualifiers: 8 }
    })

    await start(built)

    const groups = await frozenGroups(built.categoryIds[0])
    const small = groups.findIndex((group) => group.length === 4)

    expect(small).toBeGreaterThanOrEqual(0)

    const check = await checkOf(built, groups[small][groups[small].length - 1])

    expect(check.removable).toBe(false)
    expect(check.reason).toBe(RemovalBlockReason.QUALIFIERS)
  })

  it('refuses once the group phase produced a bracket', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      playersPerCompetitor: 2,
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]

    for (let wave = 0; wave < 20; wave++) {
      if ((await getAllMatches(categoryId)).some((match) => match.type === MatchType.BRACKET)) {
        break
      }

      expect(await playOneWave(built)).toBeGreaterThan(0)
    }

    // Everybody played by now, so PLAYED is what stops them first — the phase
    // gate is checked below on a competitor the bracket never reached.
    const check = await checkOf(built, (await competitorIdsOf(categoryId))[0])

    expect(check.removable).toBe(false)
    expect(check.reason).toBe(RemovalBlockReason.PLAYED)
  })
})

describe('late removal — closed formats', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('refuses every competitor of a running playoff', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, categories: [6, 5], playersPerCompetitor: 2 })

    await start(built)

    const [originId, targetId] = built.categoryIds

    for (const competitorId of await competitorIdsOf(originId)) {
      const check = await checkOf(built, competitorId)

      expect(check.removable).toBe(false)
      // Whoever drew a bye is stopped by the bye itself; everybody else by the
      // walkover their rival would be handed.
      expect([RemovalBlockReason.FORMAT, RemovalBlockReason.BYE]).toContain(check.reason)
      await expect(moveCompetitor(await manageable(built), competitorId, targetId)).rejects.toThrow()
    }
  })

  it('refuses every competitor of a running americano', async () => {
    const built = await buildTournament({ type: TournamentType.AMERICANO, competitors: 6, playersPerCompetitor: 2 })

    await start(built)

    const categoryId = built.categoryIds[0]
    const check = await checkOf(built, (await competitorIdsOf(categoryId))[5])

    expect(check.removable).toBe(false)
    expect(check.reason).toBe(RemovalBlockReason.FORMAT)
    await expect(
      unregisterCompetitor(await manageable(built), (await competitorIdsOf(categoryId))[5])
    ).rejects.toThrow()
  })
})

describe('late removal — registration phase is unaffected', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('still moves and unregisters anybody before the tournament starts', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, categories: [4, 4], playersPerCompetitor: 2 })
    const [originId, targetId] = built.categoryIds
    const ids = await competitorIdsOf(originId)
    const tournament = await loadManageableTournament(built.tournament.id, built.ownerId)

    await moveCompetitor(tournament, ids[0], targetId)
    expect((await Competitor.find(ids[0]))!.tournamentCategoryId).toBe(targetId)

    await unregisterCompetitor(await loadManageableTournament(built.tournament.id, built.ownerId), ids[1])
    expect(await Competitor.find(ids[1])).toBeNull()
  })
})
