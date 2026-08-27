import { beforeEach, describe, expect, it } from 'vitest'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { loadManageableTournament, registerCompetitor } from '@/app/(protected)/(tournaments)/services/administration'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import {
  buildTournament,
  BuiltTournament,
  createUser,
  getAllMatches,
  getMatches,
  getRounds,
  getTournamentStatus,
  hasNoDoubleBooking,
  pairKey,
  playToCompletion,
  resetDatabase,
  start
} from '@/tests/setup/harness'

/** Round-robin rounds (circle method) for `n` competitors — one leg. */
function roundRobinRounds(n: number): number {
  return n % 2 === 0 ? n - 1 : n
}

/** Key of a match with its sides in the stored order, so "ida" and "vuelta" differ. */
function sideKey(homeCompetitorId: number | null, awayCompetitorId: number | null): string | null {
  return homeCompetitorId == null || awayCompetitorId == null ? null : `${homeCompetitorId}>${awayCompetitorId}`
}

describe('LEAGUE — ida y vuelta (doubleRound)', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const n of [2, 3, 4, 5, 6]) {
    it(`plays every pair twice in a ${n}-competitor league`, async () => {
      const built = await buildTournament({
        type: TournamentType.LEAGUE,
        competitors: n,
        scoreFormat: ScoreFormat.BASIC_COUNT,
        settings: { pointsPerPresent: 0, pointsPerSetWon: 1, pointsPerMatchWon: 1, doubleRound: true }
      })

      await start(built)
      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const categoryId = built.categoryIds[0]
      const rounds = (await getRounds(categoryId)).filter((round) => round.type === MatchType.LEAGUE)

      // Twice the circle-method schedule.
      expect(rounds.length).toBe(roundRobinRounds(n) * 2)

      // Still at most one match per competitor per round.
      for (const round of rounds) {
        expect(hasNoDoubleBooking(await getMatches(round.id))).toBe(true)
      }

      const matches = await getAllMatches(categoryId)
      const keys = matches.map(pairKey).filter((key): key is string => key !== null)

      // Every distinct pair meets exactly twice.
      expect(keys.length).toBe(n * (n - 1))

      const meetings = new Map<string, number>()

      for (const key of keys) {
        meetings.set(key, (meetings.get(key) ?? 0) + 1)
      }

      expect(meetings.size).toBe((n * (n - 1)) / 2)
      expect([...meetings.values()].every((count) => count === 2)).toBe(true)
      expect(matches.every((match) => match.status !== MatchStatus.PENDING)).toBe(true)

      // The vuelta inverts the sides: no ordered pairing is ever repeated.
      const sides = matches
        .map((match) => sideKey(match.homeCompetitorId, match.awayCompetitorId))
        .filter((key): key is string => key !== null)

      expect(new Set(sides).size).toBe(sides.length)
    })
  }

  it('replays the first leg round by round, with the sides swapped', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { pointsPerPresent: 0, pointsPerSetWon: 1, pointsPerMatchWon: 1, doubleRound: true }
    })

    await start(built)
    await playToCompletion(built)

    const legRounds = roundRobinRounds(6)
    const matches = await getAllMatches(built.categoryIds[0])

    for (let roundNumber = 1; roundNumber <= legRounds; roundNumber++) {
      const ida = matches
        .filter((match) => match.roundNumber === roundNumber)
        .map((match) => sideKey(match.homeCompetitorId, match.awayCompetitorId))
        .sort()
      const vuelta = matches
        .filter((match) => match.roundNumber === roundNumber + legRounds)
        .map((match) => sideKey(match.awayCompetitorId, match.homeCompetitorId))
        .sort()

      expect(vuelta.length).toBe(ida.length)
      expect(vuelta).toEqual(ida)
    }
  })

  it('still honours maxRounds, measured over the doubled schedule', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4, // 3 rounds per leg, 6 with the return leg
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { pointsPerPresent: 0, pointsPerSetWon: 1, pointsPerMatchWon: 1, doubleRound: true, maxRounds: 4 }
    })

    await start(built)
    await playToCompletion(built)

    const rounds = (await getRounds(built.categoryIds[0])).filter((round) => round.type === MatchType.LEAGUE)

    expect(rounds.length).toBe(4)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('ignores maxRounds when it reaches the whole doubled schedule', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { pointsPerPresent: 0, pointsPerSetWon: 1, pointsPerMatchWon: 1, doubleRound: true, maxRounds: 20 }
    })

    await start(built)
    await playToCompletion(built)

    const rounds = (await getRounds(built.categoryIds[0])).filter((round) => round.type === MatchType.LEAGUE)

    expect(rounds.length).toBe(roundRobinRounds(4) * 2)
  })

  it('lays out both legs up front when results are loaded unordered', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: {
        pointsPerPresent: 0,
        pointsPerSetWon: 1,
        pointsPerMatchWon: 1,
        doubleRound: true,
        allowUnorderedResults: true
      }
    })

    await start(built)

    const matches = await getAllMatches(built.categoryIds[0])

    expect(matches.length).toBe(6 * 5)
    expect(new Set(matches.map((match) => match.roundNumber)).size).toBe(roundRobinRounds(6) * 2)
    expect(matches.every((match) => match.status === MatchStatus.PENDING)).toBe(true)
  })

  it('leaves an untouched league exactly as it was', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    const rounds = (await getRounds(built.categoryIds[0])).filter((round) => round.type === MatchType.LEAGUE)

    expect(rounds.length).toBe(roundRobinRounds(6))
    expect((await getAllMatches(built.categoryIds[0])).length).toBe((6 * 5) / 2)
  })
})

describe('LEAGUE — ida y vuelta with a late entrant', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  /** Registers a brand-new competitor into the running league, same as the admin dialog does. */
  async function registerLate(built: BuiltTournament, tournamentCategoryId: number): Promise<Competitor> {
    const tournament = await loadManageableTournament(built.tournament.id, built.ownerId, { allowOngoing: true })
    const size = registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type) ? 2 : 1
    const playerIds: number[] = []

    for (let index = 0; index < size; index++) {
      playerIds.push(await createUser(built.tournament.organizationId))
    }

    return registerCompetitor(tournament, tournamentCategoryId, playerIds)
  }

  /** How many times each pair of the lane meets. */
  function meetingsOf(matches: Match[]): Map<string, number> {
    const meetings = new Map<string, number>()

    for (const match of matches) {
      const key = pairKey(match)

      if (key != null) {
        meetings.set(key, (meetings.get(key) ?? 0) + 1)
      }
    }

    return meetings
  }

  it('gives the entrant a home and an away fixture against everybody (ordered)', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 5, // odd: the lane has the rest slot an entrant takes over
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { pointsPerPresent: 0, pointsPerSetWon: 1, pointsPerMatchWon: 1, doubleRound: true }
    })

    await start(built)

    const categoryId = built.categoryIds[0]

    await registerLate(built, categoryId)
    await playToCompletion(built)

    const matches = await getAllMatches(categoryId)
    const meetings = meetingsOf(matches)

    expect(meetings.size).toBe((6 * 5) / 2)
    expect([...meetings.values()].every((count) => count === 2)).toBe(true)

    const rounds = (await getRounds(categoryId)).filter((round) => round.type === MatchType.LEAGUE)

    expect(rounds.length).toBe(roundRobinRounds(6) * 2)

    for (const round of rounds) {
      expect(hasNoDoubleBooking(await getMatches(round.id))).toBe(true)
    }
  })

  it('appends both legs of the entrant without moving a single fixture (unordered)', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 5,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: {
        pointsPerPresent: 0,
        pointsPerSetWon: 1,
        pointsPerMatchWon: 1,
        doubleRound: true,
        allowUnorderedResults: true
      }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    /** Every fixture as "round|pair", so the layout can be compared exactly. */
    const layout = async () =>
      new Set(
        (await getAllMatches(categoryId))
          .filter((match) => match.type === MatchType.LEAGUE)
          .map((match) => `${match.roundNumber}|${pairKey(match)}`)
      )

    expect((await getAllMatches(categoryId)).length).toBe(5 * 4)

    const before = await layout()
    const competitor = await registerLate(built, categoryId)
    const after = await layout()

    // Nothing that existed moved round or changed rival.
    expect([...before].every((fixture) => after.has(fixture))).toBe(true)

    const matches = await getAllMatches(categoryId)
    const own = matches.filter(
      (match) => match.homeCompetitorId === competitor.id || match.awayCompetitorId === competitor.id
    )

    // Twice against each of the five, once at home and once away.
    expect(own.length).toBe(10)
    expect(own.filter((match) => match.homeCompetitorId === competitor.id).length).toBe(5)
    expect([...meetingsOf(own).values()].every((count) => count === 2)).toBe(true)

    // Still nobody booked twice in the same round.
    for (const round of (await getRounds(categoryId)).filter((each) => each.type === MatchType.LEAGUE)) {
      expect(hasNoDoubleBooking(await getMatches(round.id))).toBe(true)
    }

    await playToCompletion(built)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })
})
