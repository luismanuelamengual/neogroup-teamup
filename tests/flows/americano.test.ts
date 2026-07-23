import { beforeEach, describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
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
  playToCompletion,
  reloadTournament,
  resetDatabase,
  start
} from '@/tests/setup/harness'

function roundRobinRounds(n: number): number {
  return n % 2 === 0 ? n - 1 : n
}

describe('AMERICANO — full flows', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const n of [2, 4, 5, 6]) {
    it(`completes a ${n}-competitor americano`, async () => {
      const built = await buildTournament({
        type: TournamentType.AMERICANO,
        competitors: n,
        scoreFormat: ScoreFormat.BASIC_COUNT,
        settings: { pointsPerGameWon: 1, pointsPerMatchWon: 0 }
      })

      await start(built)
      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const categoryId = built.categoryIds[0]
      const rounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.LEAGUE)

      expect(rounds.length).toBe(roundRobinRounds(n))

      for (const round of rounds) {
        expect(hasNoDoubleBooking(await getMatches(round.id))).toBe(true)
      }

      const all = await getAllMatches(categoryId)

      expect(all.every((m) => m.status !== MatchStatus.PENDING)).toBe(true)
    })
  }

  it('caps the tournament at maxRounds', async () => {
    const built = await buildTournament({
      type: TournamentType.AMERICANO,
      competitors: 8, // would naturally be 7 rounds
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { pointsPerGameWon: 1, pointsPerMatchWon: 0, maxRounds: 3 }
    })

    await start(built)
    await playToCompletion(built)

    const rounds = (await getRounds(built.categoryIds[0])).filter((r) => r.type === MatchType.LEAGUE)

    expect(rounds.length).toBe(3)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('uses the circle-method round-robin for round 1 (no rematches possible)', async () => {
    const built = await buildTournament({
      type: TournamentType.AMERICANO,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const rounds = (await getRounds(built.categoryIds[0])).filter((r) => r.type === MatchType.LEAGUE)
    const round1 = rounds.find((r) => r.number === 1)!
    const matches = await getMatches(round1.id)

    // Round 1 is a clean round-robin slice: 3 matches, no double-booking.
    expect(matches.length).toBe(3)
    expect(hasNoDoubleBooking(matches)).toBe(true)
    // (The fairness of LATER rounds is examined in the bug-hunting suite.)
  })

  it('scores standings by games won', async () => {
    const built = await buildTournament({
      type: TournamentType.AMERICANO,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { pointsPerGameWon: 1, pointsPerMatchWon: 0 }
    })

    await start(built)
    await playToCompletion(built)

    const tournament = await reloadTournament(built.tournament.id)
    const standings = computeStandings(tournament, built.categoryIds[0])

    expect(standings.length).toBe(4)

    // points must equal games won when pointsPerGameWon=1, pointsPerMatchWon=0
    for (const row of standings) {
      expect(row.points).toBe(row.gamesWon ?? 0)
    }
  })
})
