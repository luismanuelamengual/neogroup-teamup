import { beforeEach, describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getChampionCompetitorId } from '@/app/(protected)/(tournaments)/utils/champion'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import {
  buildTournament,
  getAllMatches,
  getMatches,
  getRounds,
  getTournamentStatus,
  hasNoDoubleBooking,
  playToCompletion,
  reloadTournament,
  resetDatabase,
  start
} from '@/tests/setup/harness'

function expectedGroupSizes(total: number, perGroup: number): number[] {
  const safe = Math.max(2, Math.floor(perGroup) || 2)
  const count = Math.max(1, Math.ceil(total / safe))
  const base = Math.floor(total / count)
  const remainder = total % count

  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

describe('GROUPS_PLAYOFF — full flows', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  const configs = [
    { n: 8, competitorsPerGroup: 4, qualifiersPerGroup: 2 },
    { n: 12, competitorsPerGroup: 4, qualifiersPerGroup: 2 },
    { n: 9, competitorsPerGroup: 3, qualifiersPerGroup: 1 },
    { n: 16, competitorsPerGroup: 4, qualifiersPerGroup: 2 },
    { n: 6, competitorsPerGroup: 3, qualifiersPerGroup: 2 }
  ]

  for (const config of configs) {
    it(`completes ${config.n} players, groups of ${config.competitorsPerGroup}, ${config.qualifiersPerGroup} qualifiers`, async () => {
      const built = await buildTournament({
        type: TournamentType.GROUPS_PLAYOFF,
        competitors: config.n,
        scoreFormat: ScoreFormat.BASIC_COUNT,
        settings: {
          competitorsPerGroup: config.competitorsPerGroup,
          qualifiersPerGroup: config.qualifiersPerGroup,
          pointsPerPresent: 0,
          pointsPerSetWon: 1,
          pointsPerMatchWon: 1
        }
      })

      await start(built)

      const categoryId = built.categoryIds[0]
      const sizes = expectedGroupSizes(config.n, config.competitorsPerGroup)
      // One LEAGUE lane (group) per expected group, identified by groupNumber.
      const groupNumbers = new Set(
        (await getRounds(categoryId))
          .filter((r) => r.type === MatchType.LEAGUE && r.groupNumber != null)
          .map((r) => r.groupNumber)
      )

      expect(groupNumbers.size).toBe(sizes.length)

      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      // A knockout phase must have been created after the groups.
      const knockoutRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)

      expect(knockoutRounds.length).toBeGreaterThan(0)

      // Each group round has no double-booking.
      for (const round of (await getRounds(categoryId)).filter((r) => r.type === MatchType.LEAGUE)) {
        expect(hasNoDoubleBooking(await getMatches(round.id))).toBe(true)
      }

      // Everything resolved + a champion.
      const all = await getAllMatches(categoryId)

      expect(all.every((m) => m.status !== MatchStatus.PENDING)).toBe(true)

      const tournament = await reloadTournament(built.tournament.id)

      expect(getChampionCompetitorId(tournament)).not.toBeNull()
    })
  }

  it('closes the groups early and starts the knockout once maxRounds is reached', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      // Groups of 4 would naturally play 3 rounds; cap them at 2.
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2, maxRounds: 2 }
    })

    await start(built)
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    const categoryId = built.categoryIds[0]
    const groupRounds = new Set(
      (await getRounds(categoryId)).filter((r) => r.type === MatchType.LEAGUE).map((r) => r.number)
    )

    // Every group lane stopped at round 2, never reaching the natural 3rd round.
    expect(Math.max(...groupRounds)).toBe(2)

    const knockoutRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)

    expect(knockoutRounds.length).toBeGreaterThan(0)
    // The knockout starts right after the capped group phase (round 3).
    expect(Math.min(...knockoutRounds.map((r) => r.number))).toBe(3)

    const all = await getAllMatches(categoryId)

    expect(all.every((m) => m.status !== MatchStatus.PENDING)).toBe(true)
  })

  /** Competitors that reached the knockout phase of a category. */
  async function knockoutEntrants(categoryId: number): Promise<Set<number>> {
    const rounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)
    const first = rounds.sort((a, b) => a.number - b.number)[0]
    const entrants = new Set<number>()

    if (!first) {
      return entrants
    }

    for (const match of await getMatches(first.id)) {
      for (const id of [...match.homeCompetitorIds, ...(match.awayCompetitorIds ?? [])]) {
        entrants.add(id)
      }
    }

    return entrants
  }

  it('sends the top 6 of a lone group when the minimum demands it (example 1)', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      // One group of 8: 2 qualifiers by default, but at least 6 must advance.
      settings: { competitorsPerGroup: 8, qualifiersPerGroup: 2, minPlayoffQualifiers: 6 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const groupNumbers = new Set(
      (await getRounds(categoryId))
        .filter((r) => r.type === MatchType.LEAGUE && r.groupNumber != null)
        .map((r) => r.groupNumber)
    )

    expect(groupNumbers.size).toBe(1)

    await playToCompletion(built)

    const entrants = await knockoutEntrants(categoryId)

    expect(entrants.size).toBe(6)

    const tournament = await reloadTournament(built.tournament.id)
    const standings = computeStandings(tournament, categoryId, 0).map((row) => row.competitorId)

    // Not just "six of them": the six best of the group table, in that order.
    expect([...entrants].sort((a, b) => standings.indexOf(a) - standings.indexOf(b))).toEqual(standings.slice(0, 6))

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
    expect(getChampionCompetitorId(tournament)).not.toBeNull()
  })

  it('raises the cut-off evenly across two groups (example 2)', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      // 2 groups of 4: the minimum of 6 lifts the cut from 2 to 3 per group.
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2, minPlayoffQualifiers: 6 }
    })

    await start(built)
    await playToCompletion(built)

    const categoryId = built.categoryIds[0]

    expect(await knockoutEntrants(categoryId).then((set) => set.size)).toBe(6)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('sends everybody when the minimum dwarfs the field (example 3)', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 10,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 10, qualifiersPerGroup: 4, minPlayoffQualifiers: 9000 }
    })

    await start(built)
    await playToCompletion(built)

    const categoryId = built.categoryIds[0]

    expect(await knockoutEntrants(categoryId).then((set) => set.size)).toBe(10)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('ignores a minimum the qualifiers already cover (example 4)', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 16,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      // 4 groups of 4 already send 8 ≥ 4, so nothing changes.
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2, minPlayoffQualifiers: 4 }
    })

    await start(built)
    await playToCompletion(built)

    const categoryId = built.categoryIds[0]

    expect(await knockoutEntrants(categoryId).then((set) => set.size)).toBe(8)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('builds a knockout for a single group even without a minimum', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 6, qualifiersPerGroup: 2 }
    })

    await start(built)
    await playToCompletion(built)

    const categoryId = built.categoryIds[0]
    const knockoutRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)

    // The top 2 of the group play a final, replaying their group match.
    expect(knockoutRounds.length).toBe(1)
    expect(await knockoutEntrants(categoryId).then((set) => set.size)).toBe(2)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('keeps group rivals apart in the first knockout round', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 9,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      // 3 groups of 3 sending 2 each: 6 entrants in a bracket of 8, the shape
      // that used to pair the third group's winner against its own runner-up.
      settings: { competitorsPerGroup: 3, qualifiersPerGroup: 2 }
    })

    await start(built)
    await playToCompletion(built)

    const categoryId = built.categoryIds[0]
    const groupOf = new Map<number, number>()

    for (const round of (await getRounds(categoryId)).filter((r) => r.type === MatchType.LEAGUE)) {
      for (const match of await getMatches(round.id)) {
        for (const id of [...match.homeCompetitorIds, ...(match.awayCompetitorIds ?? [])]) {
          groupOf.set(id, round.groupNumber as number)
        }
      }
    }

    const bracketRounds = (await getRounds(categoryId))
      .filter((r) => r.type === MatchType.BRACKET)
      .sort((a, b) => a.number - b.number)

    for (const match of await getMatches(bracketRounds[0].id)) {
      if (match.awayCompetitorIds?.length === 1 && match.homeCompetitorIds.length === 1) {
        expect(groupOf.get(match.homeCompetitorIds[0])).not.toBe(groupOf.get(match.awayCompetitorIds[0]))
      }
    }
  })

  it('only starts the knockout once every group has finished', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const { setResult, homeWinScore, getPendingActiveMatches } = await import('@/tests/setup/harness')

    // Resolve only the matches of group 0 across all its rounds, leaving the
    // other groups untouched; the knockout must NOT appear yet.
    for (let guard = 0; guard < 50; guard++) {
      const pending = await getPendingActiveMatches([categoryId])
      const group0 = []

      for (const match of pending) {
        if (match.type === MatchType.LEAGUE && match.groupNumber === 0) {
          group0.push(match)
        }
      }

      if (group0.length === 0) {
        break
      }

      for (const match of group0) {
        await setResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT))
      }
    }

    const knockoutBefore = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)

    expect(knockoutBefore.length).toBe(0)

    // Finishing the rest triggers the knockout and the tournament completes.
    await playToCompletion(built)

    const knockoutAfter = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)

    expect(knockoutAfter.length).toBeGreaterThan(0)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })
})
