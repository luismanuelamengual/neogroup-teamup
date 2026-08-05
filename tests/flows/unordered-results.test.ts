import { beforeEach, describe, expect, it } from 'vitest'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import {
  buildTournament,
  BuiltTournament,
  finalizeIfComplete,
  getAllMatches,
  getPendingActiveMatches,
  getTournamentStatus,
  homeWinScore,
  playToCompletion,
  reloadTournament,
  resetDatabase,
  setResult,
  SetResultError,
  start
} from '@/tests/setup/harness'

/** Round-robin rounds (circle method) for `n` competitors. */
function roundRobinRounds(n: number): number {
  return n % 2 === 0 ? n - 1 : n
}

/** Every distinct pairing of `n` competitors. */
function totalPairings(n: number): number {
  return (n * (n - 1)) / 2
}

/** The round-robin fixture between two competitors, whatever its current status. */
async function fixtureBetween(categoryId: number, home: number, away: number): Promise<Match> {
  const matches = await getAllMatches(categoryId)
  const match = matches.find(
    (candidate) =>
      candidate.type === MatchType.LEAGUE &&
      ((candidate.homeCompetitorId === home && candidate.awayCompetitorId === away) ||
        (candidate.homeCompetitorId === away && candidate.awayCompetitorId === home))
  )

  if (!match) {
    throw new Error(`no fixture between ${home} and ${away}`)
  }

  return match
}

/** Resolves the fixture between two competitors in favour of whoever plays home. */
async function play(built: BuiltTournament, categoryId: number, a: number, b: number): Promise<void> {
  const match = await fixtureBetween(categoryId, a, b)

  await setResult(match.id, homeWinScore(built.tournament.scoreFormat))
}

/** How many resolved (non-void) matches each competitor played in a category. */
async function playedByCompetitor(categoryId: number): Promise<Map<number, number>> {
  const matches = await getAllMatches(categoryId)
  const played = new Map<number, number>()

  for (const match of matches) {
    if (
      match.status === MatchStatus.PENDING ||
      match.status === MatchStatus.VOID ||
      match.awayCompetitorId == null ||
      match.homeCompetitorId == null
    ) {
      continue
    }

    for (const id of [match.homeCompetitorId, match.awayCompetitorId]) {
      played.set(id, (played.get(id) ?? 0) + 1)
    }
  }

  return played
}

describe('Unordered results — LEAGUE', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('materialises the whole round robin on start, instead of one round at a time', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { allowUnorderedResults: true }
    })

    await start(built)

    const matches = await getAllMatches(built.categoryIds[0])

    expect(matches.length).toBe(totalPairings(6))
    expect(new Set(matches.map((m) => m.roundNumber)).size).toBe(roundRobinRounds(6))
    expect(matches.every((m) => m.status === MatchStatus.PENDING)).toBe(true)
  })

  it('lays out every pairing even when maxRounds caps the schedule', async () => {
    // The regression this whole feature hinges on: `maxRounds` used to cut the
    // schedule down to N rounds, which left most pairings non-existent and made
    // "load any match" impossible. Unordered, it caps matches per competitor
    // instead, so the full round robin is still laid out.
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 10,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { allowUnorderedResults: true, maxRounds: 4 }
    })

    await start(built)

    const matches = await getAllMatches(built.categoryIds[0])

    expect(matches.length).toBe(totalPairings(10))
    expect(new Set(matches.map((m) => m.roundNumber)).size).toBe(roundRobinRounds(10))
  })

  it('accepts results in any order, including the last round first', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { allowUnorderedResults: true }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const roundNumbers = [...new Set((await getAllMatches(categoryId)).map((m) => m.roundNumber))].sort((a, b) => b - a)

    // Newest round first, then backwards to the first one.
    for (const roundNumber of roundNumbers) {
      const matches = (await getAllMatches(categoryId)).filter((m) => m.roundNumber === roundNumber)

      for (const match of matches) {
        await setResult(match.id, homeWinScore(built.tournament.scoreFormat))
      }
    }

    const matches = await getAllMatches(categoryId)

    expect(matches.every((m) => m.status !== MatchStatus.PENDING)).toBe(true)

    await finalizeIfComplete(built.tournament.id)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('voids the remaining fixtures of a competitor that reached its match quota', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { allowUnorderedResults: true, maxRounds: 2 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const [a, b, c] = built.competitorIds

    await play(built, categoryId, a, b)

    // One match in: nobody reached the quota of 2, so nothing is voided yet.
    expect((await getAllMatches(categoryId)).some((m) => m.status === MatchStatus.VOID)).toBe(false)

    await play(built, categoryId, a, c)

    // `a` is full now, so its three remaining fixtures can never be played.
    const matches = await getAllMatches(categoryId)
    const voided = matches.filter((m) => m.status === MatchStatus.VOID)

    expect(voided.length).toBe(3)
    expect(voided.every((m) => m.homeCompetitorId === a || m.awayCompetitorId === a)).toBe(true)
  })

  it('refuses to load a result into a voided fixture', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { allowUnorderedResults: true, maxRounds: 1 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const [a, b, c] = built.competitorIds

    await play(built, categoryId, a, b)

    const voided = await fixtureBetween(categoryId, a, c)

    expect(voided.status).toBe(MatchStatus.VOID)

    await expect(setResult(voided.id, homeWinScore(built.tournament.scoreFormat))).rejects.toSatisfy(
      (error: SetResultError) => error.apiCode === 'roundClosed'
    )
  })

  it('closes the league when nobody has an available rival left, even short of the quota', async () => {
    // Six competitors, three matches each. Playing the six pairings among the
    // first four fills them up, which leaves the last two with only each other:
    // they play once and finish on 1 match. That is deliberate — running out of
    // rivals counts the same as completing the quota (fewer points is the
    // honest outcome of not having played).
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { allowUnorderedResults: true, maxRounds: 3 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const [a, b, c, d, e, f] = built.competitorIds

    for (const [home, away] of [
      [a, b],
      [a, c],
      [a, d],
      [b, c],
      [b, d],
      [c, d]
    ]) {
      await play(built, categoryId, home, away)
    }

    // e and f can still meet: neither has played anything yet.
    const remaining = await getPendingActiveMatches(built.categoryIds)

    expect(remaining.length).toBe(1)

    await play(built, categoryId, e, f)

    const matches = await getAllMatches(categoryId)

    expect(matches.some((m) => m.status === MatchStatus.PENDING)).toBe(false)

    const played = await playedByCompetitor(categoryId)

    expect([a, b, c, d].map((id) => played.get(id))).toEqual([3, 3, 3, 3])
    expect([e, f].map((id) => played.get(id))).toEqual([1, 1])

    await finalizeIfComplete(built.tournament.id)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('keeps voided fixtures out of the standings', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { allowUnorderedResults: true, maxRounds: 1, pointsPerPresent: 5, pointsPerMatchWon: 10 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const [a, b, c, d] = built.competitorIds

    await play(built, categoryId, a, b)
    await play(built, categoryId, c, d)

    const tournament = await reloadTournament(built.tournament.id)
    const standings = computeStandings(tournament, categoryId)
    const rowOf = (id: number) => standings.find((row) => row.competitorId === id)!

    // One match each: a voided fixture must not add a "present" point, nor
    // count as a match played.
    expect(standings.map((row) => row.played)).toEqual([1, 1, 1, 1])
    expect(rowOf(a).points).toBe(15)
    expect(rowOf(b).points).toBe(5)
  })

  it('restores voided fixtures when a competitor drops back under the quota', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { allowUnorderedResults: true, maxRounds: 1 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const [a, b, c, d, e] = built.competitorIds

    await play(built, categoryId, a, b)

    expect((await fixtureBetween(categoryId, a, e)).status).toBe(MatchStatus.VOID)

    // Undo the result the way a correction would, then let the next write
    // re-derive the lane: the fixtures that result had consumed come back.
    const played = await fixtureBetween(categoryId, a, b)

    played.status = MatchStatus.PENDING
    played.score = null
    played.winner = null
    await played.save()

    await play(built, categoryId, c, d)

    // Neither `a` nor `e` has played anything now, so their fixture is on again.
    expect((await fixtureBetween(categoryId, a, e)).status).toBe(MatchStatus.PENDING)
    // `c` did reach the quota with that last match, so its own stay voided.
    expect((await fixtureBetween(categoryId, c, e)).status).toBe(MatchStatus.VOID)
  })

  it('deletes the voided fixtures once the tournament is finished', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { allowUnorderedResults: true, maxRounds: 2 }
    })

    await start(built)
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    const matches = await getAllMatches(built.categoryIds[0])

    expect(matches.some((m) => m.status === MatchStatus.VOID)).toBe(false)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every((m) => m.status !== MatchStatus.PENDING)).toBe(true)
  })
})

describe('Unordered results — GROUPS_PLAYOFF', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('materialises every group round on start and still seeds the bracket at the end', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2, allowUnorderedResults: true }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const groupMatches = (await getAllMatches(categoryId)).filter((m) => m.groupNumber != null)

    // Two groups of four: every pairing of both groups exists right away.
    expect(groupMatches.length).toBe(2 * totalPairings(4))
    expect(new Set(groupMatches.map((m) => m.roundNumber)).size).toBe(roundRobinRounds(4))
    // The knockout is NOT pre-built: it still waits for the final standings.
    expect((await getAllMatches(categoryId)).some((m) => m.type === MatchType.BRACKET)).toBe(false)

    // Load the group results back to front, alternating groups.
    const ordered = [...groupMatches].sort(
      (a, b) => b.roundNumber - a.roundNumber || (a.groupNumber ?? 0) - (b.groupNumber ?? 0)
    )

    for (const match of ordered) {
      await setResult(match.id, homeWinScore(built.tournament.scoreFormat))
    }

    const bracket = (await getAllMatches(categoryId)).filter((m) => m.type === MatchType.BRACKET)

    expect(bracket.length).toBeGreaterThan(0)

    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('caps matches per competitor inside each group', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: {
        competitorsPerGroup: 4,
        qualifiersPerGroup: 2,
        allowUnorderedResults: true,
        maxRounds: 2
      }
    })

    await start(built)
    await playToCompletion(built)

    const categoryId = built.categoryIds[0]
    const matches = await getAllMatches(categoryId)
    const groupPlayed = new Map<number, number>()

    for (const match of matches) {
      if (
        match.groupNumber == null ||
        match.status === MatchStatus.PENDING ||
        match.awayCompetitorId == null ||
        match.homeCompetitorId == null
      ) {
        continue
      }

      for (const id of [match.homeCompetitorId, match.awayCompetitorId]) {
        groupPlayed.set(id, (groupPlayed.get(id) ?? 0) + 1)
      }
    }

    expect([...groupPlayed.values()].every((count) => count <= 2)).toBe(true)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })
})

describe('Unordered results — off by default', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('creates one round at a time when the setting is absent', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const matches = await getAllMatches(built.categoryIds[0])

    expect(new Set(matches.map((m) => m.roundNumber)).size).toBe(1)
  })

  it('still cuts the schedule short when maxRounds is used without the setting', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { maxRounds: 2 }
    })

    await start(built)
    await playToCompletion(built)

    const matches = await getAllMatches(built.categoryIds[0])

    expect(new Set(matches.map((m) => m.roundNumber)).size).toBe(2)
    expect(matches.some((m) => m.status === MatchStatus.VOID)).toBe(false)
  })
})
