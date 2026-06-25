import { beforeEach, describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import {
  buildTournament,
  getAllMatches,
  getMatches,
  getRounds,
  getTournamentStatus,
  hasNoDoubleBooking,
  pairKey,
  playToCompletion,
  reloadTournament,
  resetDatabase,
  start
} from '@/tests/setup/harness'

/** Round-robin rounds (circle method) for `n` competitors. */
function roundRobinRounds(n: number): number {
  return n % 2 === 0 ? n - 1 : n
}

describe('LEAGUE — full flows', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const n of [2, 3, 4, 5, 6, 8]) {
    it(`completes a ${n}-competitor league with a correct round-robin`, async () => {
      const built = await buildTournament({
        type: TournamentType.LEAGUE,
        competitors: n,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await start(built)
      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const categoryId = built.categoryIds[0]
      const leagueRounds = (await getRounds(categoryId)).filter((r) => r.type === RoundType.LEAGUE)

      // Number of rounds matches the circle-method schedule.
      expect(leagueRounds.length).toBe(roundRobinRounds(n))

      // Each competitor plays at most once per round (no double-booking).
      for (const round of leagueRounds) {
        const matches = await getMatches(round.id)

        expect(hasNoDoubleBooking(matches)).toBe(true)
      }

      // Every distinct pair meets exactly once over the whole tournament.
      const allMatches = await getAllMatches(categoryId)
      const keys = allMatches.map(pairKey).filter((k): k is string => k !== null)

      expect(keys.length).toBe((n * (n - 1)) / 2)
      expect(new Set(keys).size).toBe(keys.length)
      expect(allMatches.every((m) => m.status !== MatchStatus.PENDING)).toBe(true)
    })
  }

  it('honors custom league scoring settings in the standings', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { pointsPerPresent: 5, pointsPerSetWon: 0, pointsPerMatchWon: 10 }
    })

    await start(built)
    await playToCompletion(built) // everyone-home-wins by default

    const tournament = await reloadTournament(built.tournament.id)
    const standings = computeStandings(tournament, built.categoryIds[0])

    expect(standings.length).toBe(4)

    // Each competitor played 3 matches → 3 * pointsPerPresent = 15 baseline.
    for (const row of standings) {
      expect(row.played).toBe(3)
      // points = wins*10 + 3*5 (BASIC_COUNT has no sets, pointsPerSetWon irrelevant)
      expect(row.points).toBe(row.won * 10 + 15)
    }

    // Standings are sorted by points (descending).
    for (let i = 1; i < standings.length; i++) {
      expect(standings[i - 1].points).toBeGreaterThanOrEqual(standings[i].points)
    }
  })

  it('runs multiple categories in parallel to completion', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      categories: [4, 6],
      scoreFormat: ScoreFormat.THREE_SETS
    })

    await start(built)
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    const [catA, catB] = built.categoryIds

    expect((await getAllMatches(catA)).length).toBe((4 * 3) / 2)
    expect((await getAllMatches(catB)).length).toBe((6 * 5) / 2)
  })
})
