import { beforeEach, describe, expect, it } from 'vitest'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  addTournamentCategory,
  loadManageableTournament,
  moveCompetitor,
  registerCompetitor,
  unregisterCompetitor
} from '@/app/(protected)/(tournaments)/services/administration'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import { getLateRegistrationSlots } from '@/app/(protected)/(tournaments)/utils/lateRegistration'
import { isMatchEditable } from '@/app/(protected)/(tournaments)/utils/matches'
import { Role } from '@/app/models/Role'
import {
  buildTournament,
  BuiltTournament,
  createUser,
  getAllMatches,
  getPendingActiveMatches,
  getTournamentStatus,
  homeWinScore,
  playToCompletion,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

/**
 * Registering a competitor into a tournament that is ALREADY RUNNING.
 *
 * The whole feature rests on one promise: the entrant takes a hole the
 * structure already had, and NOTHING else changes. So most of what is asserted
 * here is what stayed the same — every pairing that existed before the entrant
 * joined must still exist afterwards, in the same round, against the same rival
 * — plus the matches the entrant is owed, which must add up to a complete round
 * robin (groups) or a real first-round matchup (knockout byes).
 */

/** Reloads the tournament through the same gate the API route uses. */
function manageable(built: BuiltTournament, allowOngoing = true) {
  return loadManageableTournament(built.tournament.id, built.ownerId, { allowOngoing })
}

/**
 * Registers a brand-new competitor into a running tournament, optionally naming
 * the slot. The roster matches the discipline (a padel entrant is a pair), same
 * as the admin dialog builds it.
 */
async function registerLate(
  built: BuiltTournament,
  tournamentCategoryId: number,
  slot: { matchId?: number | null; groupNumber?: number | null } | null = null
): Promise<Competitor> {
  const tournament = await manageable(built)
  const size = registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type) ? 2 : 1
  const playerIds: number[] = []

  for (let index = 0; index < size; index++) {
    playerIds.push(await createUser(built.tournament.organizationId))
  }

  return registerCompetitor(tournament, tournamentCategoryId, playerIds, null, slot)
}

/** Slots currently on offer for a category, re-derived from live state. */
async function slotsOf(built: BuiltTournament, tournamentCategoryId: number) {
  const tournament = await manageable(built)
  const category = (tournament.categories ?? []).find((each) => each.id === tournamentCategoryId)!

  return getLateRegistrationSlots(tournament, category, tournament.matches ?? [], tournament.competitors ?? [])
}

/** Order-insensitive identity of a matchup, so a fixture is recognised however its sides are stored. */
function pairKey(match: Match): string {
  return [match.homeCompetitorId, match.awayCompetitorId]
    .filter((id): id is number => id != null)
    .sort((a, b) => a - b)
    .join(':')
}

/**
 * Every real fixture of a lane, keyed by "round|pair", so it can be diffed
 * across a registration.
 *
 * `roundNumbers` narrows it to the rounds whose content is DECIDED rather than
 * derived. It matters for a knockout: only the first round is seeded, every
 * later one is a projection of the winners so far — and filling a bye correctly
 * un-projects it, since its occupant is no longer through.
 */
async function fixtureIndex(
  tournamentCategoryId: number,
  type: MatchType,
  groupNumber: number | null = null,
  roundNumbers: number[] | null = null
) {
  const matches = await getAllMatches(tournamentCategoryId)

  return new Set(
    matches
      .filter(
        (match) =>
          match.type === type &&
          (match.groupNumber ?? null) === groupNumber &&
          (roundNumbers == null || roundNumbers.includes(match.roundNumber)) &&
          match.homeCompetitorId != null &&
          match.awayCompetitorId != null
      )
      .map((match) => `${match.roundNumber}|${pairKey(match)}`)
  )
}

/** Plays waves until the group phase is over and the knockout bracket exists. */
async function playGroupPhase(built: BuiltTournament, tournamentCategoryId: number): Promise<void> {
  for (let wave = 0; wave < 20; wave++) {
    const bracketExists = (await getAllMatches(tournamentCategoryId)).some((match) => match.type === MatchType.BRACKET)

    if (bracketExists) {
      return
    }

    if ((await playOneWave(built)) === 0) {
      throw new Error('the group phase stalled with no playable match')
    }
  }

  throw new Error('the group phase never produced a knockout bracket')
}

/** Matches of one group lane. */
async function groupMatches(tournamentCategoryId: number, groupNumber: number): Promise<Match[]> {
  return (await getAllMatches(tournamentCategoryId))
    .filter((match) => match.type === MatchType.LEAGUE && match.groupNumber === groupNumber)
    .sort((a, b) => a.roundNumber - b.roundNumber || a.position - b.position)
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

/** Plays every currently playable match of a category, once. */
async function playOneWave(built: BuiltTournament): Promise<number> {
  const pending = await getPendingActiveMatches(built.categoryIds)

  for (const match of pending) {
    await setResult(match.id, homeWinScore(built.tournament.scoreFormat))
  }

  return pending.length
}

describe('late registration — PLAYOFF byes', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const n of [3, 5, 6, 7, 11]) {
    it(`turns every bye of a ${n}-competitor bracket into a real match`, async () => {
      const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: n, playersPerCompetitor: 2 })

      await start(built)

      const categoryId = built.categoryIds[0]
      const byeCount = (await getAllMatches(categoryId)).filter(
        (match) => match.roundNumber === 1 && match.status === MatchStatus.WALKOVER && match.awayCompetitorId == null
      ).length

      expect(byeCount).toBe(Math.pow(2, Math.ceil(Math.log2(n))) - n)

      // Only round 1 is seeded; the later rounds are a projection of the byes,
      // and un-projecting them is exactly what filling a bye is supposed to do.
      const before = await fixtureIndex(categoryId, MatchType.BRACKET, null, [1])
      const added: number[] = []

      // Fill them one at a time, re-deriving the offer each round trip.
      for (let filled = 0; filled < byeCount; filled++) {
        const slots = await slotsOf(built, categoryId)

        expect(slots.length).toBe(byeCount - filled)

        const competitor = await registerLate(built, categoryId, { matchId: slots[0].matchId })

        added.push(competitor.id)
      }

      // Every bye is now a real matchup, and the bracket has exactly n + byeCount
      // entrants in its first round — a full power of two, no walkovers left.
      const round1 = (await getAllMatches(categoryId)).filter(
        (match) => match.type === MatchType.BRACKET && match.roundNumber === 1
      )

      expect(round1.every((match) => match.awayCompetitorId != null)).toBe(true)
      expect(round1.every((match) => match.status === MatchStatus.PENDING)).toBe(true)

      // Nothing that already existed was moved or re-paired.
      const after = await fixtureIndex(categoryId, MatchType.BRACKET, null, [1])

      for (const fixture of before) {
        expect(after.has(fixture), `fixture ${fixture} disappeared`).toBe(true)
      }

      // Each new competitor plays exactly once in round 1.
      for (const competitorId of added) {
        const own = round1.filter(
          (match) => match.homeCompetitorId === competitorId || match.awayCompetitorId === competitorId
        )

        expect(own.length).toBe(1)
      }

      // And the tournament still plays out to a champion.
      await playToCompletion(built)
      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
    })
  }

  it('resets the slot the bye occupant had already been propagated into', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 5, playersPerCompetitor: 2 })

    await start(built)

    const categoryId = built.categoryIds[0]
    const [slot] = await slotsOf(built, categoryId)
    const bye = (await getAllMatches(categoryId)).find((match) => match.id === slot.matchId)!
    const parentPosition = Math.floor(bye.position / 2)
    const occupantId = bye.homeCompetitorId
    // Before: the occupant is already sitting in round 2.
    const parentBefore = (await getAllMatches(categoryId)).find(
      (match) => match.type === MatchType.BRACKET && match.roundNumber === 2 && match.position === parentPosition
    )!

    expect([parentBefore.homeCompetitorId, parentBefore.awayCompetitorId]).toContain(occupantId)

    const competitor = await registerLate(built, categoryId, { matchId: slot.matchId })
    const filled = (await getAllMatches(categoryId)).find((match) => match.id === slot.matchId)!

    expect(filled.awayCompetitorId).toBe(competitor.id)
    expect(filled.homeCompetitorId).toBe(occupantId)
    expect(filled.status).toBe(MatchStatus.PENDING)
    expect(filled.winner).toBeNull()
    expect(filled.score).toBeNull()

    // After: nobody is through that side any more — it has to be played for.
    const parentAfter = (await getAllMatches(categoryId)).find((match) => match.id === parentBefore.id)!
    const side = bye.position % 2 === 0 ? parentAfter.homeCompetitorId : parentAfter.awayCompetitorId

    expect(side).toBeNull()

    // The new match is genuinely playable, not a row nobody can act on.
    const all = await getAllMatches(categoryId)

    expect(
      isMatchEditable(filled, all, built.tournament.type, TournamentStatus.ONGOING, built.tournament.settings)
    ).toBe(true)
  })

  it('refuses a bracket that has no byes at all', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 8, playersPerCompetitor: 2 })

    await start(built)

    expect(await slotsOf(built, built.categoryIds[0])).toEqual([])
    await expect(registerLate(built, built.categoryIds[0])).rejects.toThrow('no admite nuevas inscripciones')
  })

  it('refuses a bye once the match it feeds has been played', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 5, playersPerCompetitor: 2 })

    await start(built)

    const categoryId = built.categoryIds[0]

    // Round 1, then round 2: the bye occupant's next match now holds a result.
    await playOneWave(built)
    await playOneWave(built)

    expect(await slotsOf(built, categoryId)).toEqual([])
    await expect(registerLate(built, categoryId)).rejects.toThrow('no admite nuevas inscripciones')
  })

  it('refuses a slot the organizer picked that is no longer on offer', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 5, playersPerCompetitor: 2 })

    await start(built)

    const categoryId = built.categoryIds[0]
    const [slot] = await slotsOf(built, categoryId)

    await registerLate(built, categoryId, { matchId: slot.matchId })

    // That very bye is gone now — asking for it again must fail loudly rather
    // than quietly dropping the entrant somewhere else.
    await expect(registerLate(built, categoryId, { matchId: slot.matchId })).rejects.toThrow('ya no está disponible')
  })

  it('keeps a consolation bracket coherent when a bye is filled', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      competitors: 5,
      playersPerCompetitor: 2,
      settings: { consolationBracket: true }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const [slot] = await slotsOf(built, categoryId)

    await registerLate(built, categoryId, { matchId: slot.matchId })
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    // No consolation slot was left dangling on a competitor that never lost.
    const consolation = (await getAllMatches(categoryId)).filter(
      (match) => match.type === MatchType.CONSOLATION_BRACKET
    )

    expect(consolation.length).toBeGreaterThan(0)
    expect(consolation.every((match) => match.status !== MatchStatus.PENDING)).toBe(true)
  })
})

describe('late registration — GROUPS_PLAYOFF group phase', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  /** 9 competitors in groups of 3: every group is odd, so every group has a rest slot. */
  const ODD_GROUPS = {
    type: TournamentType.GROUPS_PLAYOFF,
    competitors: 9,
    playersPerCompetitor: 2,
    settings: { competitorsPerGroup: 3 }
  }

  it('freezes the group membership when the tournament starts', async () => {
    const built = await buildTournament(ODD_GROUPS)

    await start(built)

    const groups = await frozenGroups(built.categoryIds[0])

    expect(groups.map((group) => group.length)).toEqual([3, 3, 3])
    expect(groups.flat().sort((a, b) => a - b)).toEqual([...built.competitorIds].sort((a, b) => a - b))

    // Positions inside a group are unique, which is what the circle method needs.
    const competitors = await Competitor.where('tournamentCategoryId', built.categoryIds[0]).get()

    for (let groupNumber = 0; groupNumber < groups.length; groupNumber++) {
      const positions = competitors
        .filter((competitor) => competitor.data?.groupNumber === groupNumber)
        .map((competitor) => competitor.data?.groupPosition)

      expect([...new Set(positions)].length).toBe(positions.length)
    }
  })

  for (const wavesPlayed of [0, 1, 2]) {
    it(`generates the entrant's whole round robin when they join after ${wavesPlayed} round(s)`, async () => {
      const built = await buildTournament(ODD_GROUPS)

      await start(built)

      const categoryId = built.categoryIds[0]

      for (let wave = 0; wave < wavesPlayed; wave++) {
        await playOneWave(built)
      }

      const before = await fixtureIndex(categoryId, MatchType.LEAGUE, 0)
      const membersBefore = (await frozenGroups(categoryId))[0]
      const competitor = await registerLate(built, categoryId, { groupNumber: 0 })
      const members = [...membersBefore, competitor.id]
      // 1. Nothing that existed was re-paired or moved to another round.
      const after = await fixtureIndex(categoryId, MatchType.LEAGUE, 0)

      for (const fixture of before) {
        expect(after.has(fixture), `fixture ${fixture} was altered`).toBe(true)
      }

      // 2. Right away, the entrant has a match in EVERY round that exists —
      //    including the ones the rest of the group already finished, which is
      //    the whole point of materialising them retroactively.
      const justAfter = await groupMatches(categoryId, 0)
      const materialisedRounds = [...new Set(justAfter.map((match) => match.roundNumber))]

      expect(materialisedRounds.length).toBeGreaterThan(0)

      for (const roundNumber of materialisedRounds) {
        const round = justAfter.filter((match) => match.roundNumber === roundNumber)
        const sides = round.flatMap((match) => [match.homeCompetitorId, match.awayCompetitorId])

        expect(round.length, `round ${roundNumber} should hold 2 matches`).toBe(2)
        expect(sides).toContain(competitor.id)
        // Nobody is booked twice in the same round.
        expect(new Set(sides).size).toBe(4)
        expect(round.map((match) => match.position).sort((a, b) => a - b)).toEqual([0, 1])
      }

      // 3. And every one of them is genuinely playable, not a row nobody can act on.
      const all = await getAllMatches(categoryId)

      for (const match of justAfter.filter(
        (each) => each.homeCompetitorId === competitor.id || each.awayCompetitorId === competitor.id
      )) {
        expect(
          isMatchEditable(match, all, built.tournament.type, TournamentStatus.ONGOING, built.tournament.settings),
          `match ${match.id} of round ${match.roundNumber} is not playable`
        ).toBe(true)
      }

      // 4. Played out, the group ends up a complete 4-competitor round robin:
      //    3 rounds of 2 matches, every pair exactly once, the entrant included.
      await playGroupPhase(built, categoryId)

      const matches = await groupMatches(categoryId, 0)
      const pairs = matches.map(pairKey)

      expect(matches.length).toBe(6)
      expect(new Set(pairs).size).toBe(6)
      expect(new Set(matches.map((match) => match.roundNumber))).toEqual(new Set([1, 2, 3]))

      for (const id of membersBefore) {
        const pair = [id, competitor.id].sort((a, b) => a - b).join(':')

        expect(pairs.filter((each) => each === pair).length, `entrant never played ${id}`).toBe(1)
      }

      // Everybody, entrant included, played the same number of matches.
      for (const id of members) {
        const played = matches.filter((match) => match.homeCompetitorId === id || match.awayCompetitorId === id)

        expect(played.length, `competitor ${id} played ${played.length} matches`).toBe(3)
      }

      // 5. The group phase did not get longer, and the other groups were untouched.
      expect((await frozenGroups(categoryId))[1].length).toBe(3)
      expect((await frozenGroups(categoryId))[2].length).toBe(3)

      await playToCompletion(built)
      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
    })
  }

  it('lets the entrant into a group without disturbing the others, then finishes', async () => {
    const built = await buildTournament(ODD_GROUPS)

    await start(built)

    const categoryId = built.categoryIds[0]

    await playOneWave(built)

    const otherGroupsBefore = [
      await fixtureIndex(categoryId, MatchType.LEAGUE, 1),
      await fixtureIndex(categoryId, MatchType.LEAGUE, 2)
    ]

    await registerLate(built, categoryId, { groupNumber: 0 })

    expect(await fixtureIndex(categoryId, MatchType.LEAGUE, 1)).toEqual(otherGroupsBefore[0])
    expect(await fixtureIndex(categoryId, MatchType.LEAGUE, 2)).toEqual(otherGroupsBefore[1])

    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    // The knockout was seeded from the groups as they ended up, entrant included.
    const bracket = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.BRACKET)

    expect(bracket.length).toBeGreaterThan(0)
    expect(bracket.every((match) => match.status !== MatchStatus.PENDING)).toBe(true)
  })

  it('accepts several entrants, one per odd group', async () => {
    const built = await buildTournament(ODD_GROUPS)

    await start(built)

    const categoryId = built.categoryIds[0]

    expect((await slotsOf(built, categoryId)).map((slot) => slot.groupNumber)).toEqual([0, 1, 2])

    for (const groupNumber of [0, 1, 2]) {
      await registerLate(built, categoryId, { groupNumber })
    }

    const groups = await frozenGroups(categoryId)

    expect(groups.map((group) => group.length)).toEqual([4, 4, 4])
    // Every group is even now, so nothing more fits.
    expect(await slotsOf(built, categoryId)).toEqual([])

    await playToCompletion(built)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('offers and honours a slot in EVERY category of a multi-category tournament', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      // Two real categories: one whose groups are odd (open) and one whose
      // groups are even (closed), so both sides of the choice are exercised.
      categories: [9, 8],
      playersPerCompetitor: 2,
      settings: { competitorsPerGroup: 3 }
    })

    await start(built)

    const [oddCategoryId, evenCategoryId] = built.categoryIds

    // Membership is frozen per category, not just for the first one.
    expect((await frozenGroups(oddCategoryId)).map((group) => group.length)).toEqual([3, 3, 3])
    expect((await frozenGroups(evenCategoryId)).map((group) => group.length)).toEqual([3, 3, 2])

    // The odd category offers one slot per odd group; the other only its odd ones.
    expect((await slotsOf(built, oddCategoryId)).map((slot) => slot.groupNumber)).toEqual([0, 1, 2])
    expect((await slotsOf(built, evenCategoryId)).map((slot) => slot.groupNumber)).toEqual([0, 1])

    // Registering into one category leaves the other's offer untouched.
    const before = await slotsOf(built, evenCategoryId)
    const competitor = await registerLate(built, oddCategoryId, { groupNumber: 1 })

    expect(competitor.tournamentCategoryId).toBe(oddCategoryId)
    expect((await slotsOf(built, evenCategoryId)).map((slot) => slot.groupNumber)).toEqual(
      before.map((slot) => slot.groupNumber)
    )
    expect((await frozenGroups(oddCategoryId)).map((group) => group.length)).toEqual([3, 4, 3])
    expect((await frozenGroups(evenCategoryId)).map((group) => group.length)).toEqual([3, 3, 2])

    // And the other category still accepts one of its own.
    const second = await registerLate(built, evenCategoryId, { groupNumber: 0 })

    expect(second.tournamentCategoryId).toBe(evenCategoryId)

    await playToCompletion(built)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('refuses an even group', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      playersPerCompetitor: 2,
      settings: { competitorsPerGroup: 4 }
    })

    await start(built)

    expect(await slotsOf(built, built.categoryIds[0])).toEqual([])
    await expect(registerLate(built, built.categoryIds[0])).rejects.toThrow('no admite nuevas inscripciones')
  })

  it('refuses once the knockout phase started', async () => {
    const built = await buildTournament(ODD_GROUPS)

    await start(built)

    const categoryId = built.categoryIds[0]

    // Play the whole group phase; the bracket is seeded the moment it ends.
    for (let wave = 0; wave < 5; wave++) {
      await playOneWave(built)
    }

    const bracket = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.BRACKET)

    expect(bracket.length).toBeGreaterThan(0)
    expect(await slotsOf(built, categoryId)).toEqual([])
    await expect(registerLate(built, categoryId, { groupNumber: 0 })).rejects.toThrow('no admite nuevas inscripciones')
  })

  it('works with an unordered group phase, whose rounds all exist up front', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 9,
      playersPerCompetitor: 2,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 3, allowUnorderedResults: true }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const before = await fixtureIndex(categoryId, MatchType.LEAGUE, 0)
    // Resolve one fixture of group 0, then let a competitor in.
    const first = (await groupMatches(categoryId, 0))[0]

    await setResult(first.id, homeWinScore(built.tournament.scoreFormat))

    const competitor = await registerLate(built, categoryId, { groupNumber: 0 })
    const after = await fixtureIndex(categoryId, MatchType.LEAGUE, 0)

    for (const fixture of before) {
      expect(after.has(fixture)).toBe(true)
    }

    const own = (await groupMatches(categoryId, 0)).filter(
      (match) => match.homeCompetitorId === competitor.id || match.awayCompetitorId === competitor.id
    )

    expect(own.length).toBe(3)

    await playToCompletion(built)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })
})

describe('late registration — round-robin lanes with unordered results', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  /** Every fixture of a lane, as "round|pair", so the layout can be compared exactly. */
  async function laneLayout(tournamentCategoryId: number, groupNumber: number | null) {
    return fixtureIndex(tournamentCategoryId, MatchType.LEAGUE, groupNumber)
  }

  for (const count of [5, 6]) {
    it(`lets a competitor into an unordered ${count}-competitor league`, async () => {
      const built = await buildTournament({
        type: TournamentType.LEAGUE,
        competitors: count,
        playersPerCompetitor: 2,
        settings: { allowUnorderedResults: true }
      })

      await start(built)

      const categoryId = built.categoryIds[0]

      // The whole round robin exists up front.
      expect((await laneLayout(categoryId, null)).size).toBe((count * (count - 1)) / 2)

      // Resolve a couple of fixtures in whatever order, then let somebody in.
      const some = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.LEAGUE).slice(0, 2)

      for (const match of some) {
        await setResult(match.id, homeWinScore(built.tournament.scoreFormat))
      }

      const before = await laneLayout(categoryId, null)
      const competitor = await registerLate(built, categoryId)
      // 1. Not one existing fixture moved round or changed rival — the whole
      //    point of an unordered lane, where the round carries no meaning.
      const after = await laneLayout(categoryId, null)

      expect([...before].every((fixture) => after.has(fixture))).toBe(true)
      expect(after.size).toBe(before.size + count)

      // 2. The entrant plays everybody, exactly once.
      const own = (await getAllMatches(categoryId)).filter(
        (match) => match.homeCompetitorId === competitor.id || match.awayCompetitorId === competitor.id
      )

      expect(own.length).toBe(count)
      expect(new Set(own.map(pairKey)).size).toBe(count)

      // 3. Nobody is booked twice in the same round, entrant included.
      const byRound = new Map<number, number[]>()

      for (const match of (await getAllMatches(categoryId)).filter((each) => each.type === MatchType.LEAGUE)) {
        byRound.set(match.roundNumber, [
          ...(byRound.get(match.roundNumber) ?? []),
          match.homeCompetitorId!,
          match.awayCompetitorId!
        ])
      }

      for (const [roundNumber, sides] of byRound) {
        expect(new Set(sides).size, `round ${roundNumber} books somebody twice`).toBe(sides.length)
      }

      // 4. And every one of the entrant's matches is playable right away.
      const all = await getAllMatches(categoryId)

      for (const match of own) {
        expect(
          isMatchEditable(match, all, built.tournament.type, TournamentStatus.ONGOING, built.tournament.settings)
        ).toBe(true)
      }

      await playToCompletion(built)
      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
    })
  }

  it('refuses an ordered even league but accepts an ordered odd one', async () => {
    const even = await buildTournament({ type: TournamentType.LEAGUE, competitors: 6, playersPerCompetitor: 2 })

    await start(even)
    expect(await slotsOf(even, even.categoryIds[0])).toEqual([])

    const odd = await buildTournament({ type: TournamentType.LEAGUE, competitors: 5, playersPerCompetitor: 2 })

    await start(odd)

    const categoryId = odd.categoryIds[0]

    await playOneWave(odd)

    const before = await laneLayout(categoryId, null)
    const competitor = await registerLate(odd, categoryId)
    // An ordered lane only materialises the rounds it has reached, so what can
    // be checked now is that nothing already there moved, and that the entrant
    // is in every round that exists.
    const justAfter = await laneLayout(categoryId, null)

    expect([...before].every((fixture) => justAfter.has(fixture))).toBe(true)

    // Played out, it is a complete 6-competitor round robin: 15 fixtures, and
    // the entrant met all five of the others.
    await playToCompletion(odd)
    expect(await getTournamentStatus(odd.tournament.id)).toBe(TournamentStatus.FINISHED)
    expect((await laneLayout(categoryId, null)).size).toBe(15)

    const own = (await getAllMatches(categoryId)).filter(
      (match) => match.homeCompetitorId === competitor.id || match.awayCompetitorId === competitor.id
    )

    expect(own.length).toBe(5)
    expect(new Set(own.map(pairKey)).size).toBe(5)
  })

  it('lets a competitor into an EVEN group of an unordered group phase', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      playersPerCompetitor: 2,
      settings: { competitorsPerGroup: 4, allowUnorderedResults: true }
    })

    await start(built)

    const categoryId = built.categoryIds[0]

    expect((await frozenGroups(categoryId)).map((group) => group.length)).toEqual([4, 4])
    // Even groups: closed while ordered, open here.
    expect((await slotsOf(built, categoryId)).map((slot) => slot.groupNumber)).toEqual([0, 1])

    const membersBefore = (await frozenGroups(categoryId))[0]
    const before = await laneLayout(categoryId, 0)
    const otherBefore = await laneLayout(categoryId, 1)
    const competitor = await registerLate(built, categoryId, { groupNumber: 0 })
    const after = await laneLayout(categoryId, 0)

    // Nothing moved, in this group or the other one.
    expect([...before].every((fixture) => after.has(fixture))).toBe(true)
    expect(await laneLayout(categoryId, 1)).toEqual(otherBefore)

    // The group is now a complete 5-competitor round robin.
    expect(after.size).toBe(10)

    for (const id of membersBefore) {
      const pair = [id, competitor.id].sort((a, b) => a - b).join(':')
      const fixtures = (await groupMatches(categoryId, 0)).map(pairKey)

      expect(fixtures.filter((each) => each === pair).length, `entrant never played ${id}`).toBe(1)
    }

    await playToCompletion(built)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('voids what the per-competitor quota can no longer fit, entrant included', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      playersPerCompetitor: 2,
      // Unordered reads maxRounds as "matches each competitor plays".
      settings: { allowUnorderedResults: true, maxRounds: 3 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const competitor = await registerLate(built, categoryId)
    const own = (await getAllMatches(categoryId)).filter(
      (match) => match.homeCompetitorId === competitor.id || match.awayCompetitorId === competitor.id
    )

    // The entrant is owed a fixture against everybody; the quota is what decides
    // how many of them actually get played (the rest are voided as it fills up).
    expect(own.length).toBe(6)

    await playToCompletion(built)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    const played = (await getAllMatches(categoryId)).filter(
      (match) =>
        match.status !== MatchStatus.VOID &&
        (match.homeCompetitorId === competitor.id || match.awayCompetitorId === competitor.id)
    )

    expect(played.length).toBeLessThanOrEqual(3)
  })
})

describe('late registration — what a running tournament still refuses', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('refuses any registration in a running AMERICANO, whose rounds feed on the standings', async () => {
    for (const competitors of [5, 6]) {
      const built = await buildTournament({ type: TournamentType.AMERICANO, competitors, playersPerCompetitor: 2 })

      await start(built)

      expect(await slotsOf(built, built.categoryIds[0])).toEqual([])
      await expect(registerLate(built, built.categoryIds[0])).rejects.toThrow('no admite nuevas inscripciones')
    }
  })

  it('refuses every administrative action other than registering', async () => {
    const built = await buildTournament(ODD_GROUPS_FOR_GUARDS)

    await start(built)

    // The gate itself: without allowOngoing there is nothing to administrate.
    await expect(manageable(built, false)).rejects.toThrow('fase de inscripción')

    const tournament = await manageable(built)
    const categoryId = built.categoryIds[0]
    const competitorId = built.competitorIds[0]

    // And the actions are unreachable anyway, since they all go through the
    // stand-by-only gate.
    await expect(
      loadManageableTournament(built.tournament.id, built.ownerId).then((each) =>
        unregisterCompetitor(each, competitorId)
      )
    ).rejects.toThrow('fase de inscripción')
    await expect(
      loadManageableTournament(built.tournament.id, built.ownerId).then((each) =>
        moveCompetitor(each, competitorId, categoryId)
      )
    ).rejects.toThrow('fase de inscripción')
    await expect(
      loadManageableTournament(built.tournament.id, built.ownerId).then((each) =>
        addTournamentCategory(each, each.organizationId, 1, 8)
      )
    ).rejects.toThrow('fase de inscripción')

    // Registering, however, works.
    expect((await slotsOf(built, categoryId)).length).toBeGreaterThan(0)
    await expect(
      registerCompetitor(tournament, categoryId, [
        await createUser(tournament.organizationId),
        await createUser(tournament.organizationId)
      ])
    ).resolves.toBeDefined()
  })

  it('still refuses a caller who is not an organizer', async () => {
    const built = await buildTournament(ODD_GROUPS_FOR_GUARDS)

    await start(built)

    const player = await createUser(built.tournament.organizationId, Role.PLAYER)

    await expect(loadManageableTournament(built.tournament.id, player, { allowOngoing: true })).rejects.toThrow(
      'No autorizado'
    )
  })

  it('lets ANY organizer register a late entrant, not just the creator', async () => {
    const built = await buildTournament(ODD_GROUPS_FOR_GUARDS)

    await start(built)

    const colleague = await createUser(built.tournament.organizationId, Role.ORGANIZER)
    const tournament = await loadManageableTournament(built.tournament.id, colleague, { allowOngoing: true })
    const categoryId = built.categoryIds[0]
    const competitor = await registerCompetitor(tournament, categoryId, [
      await createUser(tournament.organizationId),
      await createUser(tournament.organizationId)
    ])

    expect(competitor.tournamentCategoryId).toBe(categoryId)
    expect((await frozenGroups(categoryId)).flat()).toContain(competitor.id)
  })

  it('still enforces the category entry limit', async () => {
    const built = await buildTournament(ODD_GROUPS_FOR_GUARDS)

    await start(built)

    const categoryId = built.categoryIds[0]
    const category = (await manageable(built)).categories!.find((each) => each.id === categoryId)!

    category.maxCompetitors = built.competitorIds.length
    await category.save()

    expect(await slotsOf(built, categoryId)).toEqual([])
    await expect(registerLate(built, categoryId)).rejects.toThrow('no admite nuevas inscripciones')
  })

  it('still refuses a player already registered in the tournament', async () => {
    const built = await buildTournament(ODD_GROUPS_FOR_GUARDS)

    await start(built)

    const tournament = await manageable(built)
    const categoryId = built.categoryIds[0]
    const existingPlayerId = built.rosterByCompetitorId.get(built.competitorIds[0])![0]

    await expect(
      registerCompetitor(tournament, categoryId, [existingPlayerId, await createUser(tournament.organizationId)])
    ).rejects.toThrow('ya inscripto')
  })
})

/** 9 competitors in odd groups — the guard tests just need a category that HAS a slot. */
const ODD_GROUPS_FOR_GUARDS = {
  type: TournamentType.GROUPS_PLAYOFF,
  competitors: 9,
  playersPerCompetitor: 2,
  settings: { competitorsPerGroup: 3 }
}
