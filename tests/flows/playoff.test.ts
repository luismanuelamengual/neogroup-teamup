import { beforeEach, describe, expect, it } from 'vitest'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getChampionCompetitorId, getPodiumCompetitorIds } from '@/app/(protected)/(tournaments)/utils/champion'
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

function knockoutRounds(n: number): number {
  return n < 2 ? 0 : Math.ceil(Math.log2(n))
}

function bracketSize(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))))
}

describe('PLAYOFF — full flows', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const n of [2, 4, 8, 16]) {
    it(`completes a ${n}-competitor power-of-two bracket`, async () => {
      const built = await buildTournament({
        type: TournamentType.PLAYOFF,
        competitors: n,
        scoreFormat: ScoreFormat.THREE_SETS
      })

      await start(built)

      const categoryId = built.categoryIds[0]
      const rounds = (await getRounds(categoryId)).filter((r) => r.type === RoundType.KNOCKOUT)

      expect(rounds.length).toBe(knockoutRounds(n))

      // First round has bracketSize/2 matches and no byes for power-of-two.
      const round1 = rounds.find((r) => r.number === 1)!
      const firstMatches = await getMatches(round1.id)

      expect(firstMatches.length).toBe(bracketSize(n) / 2)
      expect(firstMatches.every((m) => m.awayCompetitorIds && m.awayCompetitorIds.length > 0)).toBe(true)

      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const tournament = await reloadTournament(built.tournament.id)

      expect(getChampionCompetitorId(tournament)).not.toBeNull()
      expect(getPodiumCompetitorIds(tournament).length).toBe(2)
    })
  }

  for (const n of [3, 5, 6, 7, 11]) {
    it(`completes a ${n}-competitor bracket with byes`, async () => {
      const built = await buildTournament({
        type: TournamentType.PLAYOFF,
        competitors: n,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await start(built)

      const categoryId = built.categoryIds[0]
      const rounds = (await getRounds(categoryId)).filter((r) => r.type === RoundType.KNOCKOUT)

      expect(rounds.length).toBe(knockoutRounds(n))

      // The bracket is padded to the next power of two; the padding shows up as
      // byes (away === null) stored as already-won walkovers for the top seeds.
      const round1 = rounds.find((r) => r.number === 1)!
      const firstMatches = await getMatches(round1.id)
      const byes = firstMatches.filter((m) => m.awayCompetitorIds === null)

      expect(byes.length).toBe(bracketSize(n) - n)
      expect(byes.every((m) => m.status === MatchStatus.WALKOVER && m.winner === MatchSide.HOME)).toBe(true)

      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      // No competitor appears twice within any single real (non-bye) round.
      for (const round of rounds) {
        const real = (await getMatches(round.id)).filter((m) => m.awayCompetitorIds && m.awayCompetitorIds.length > 0)

        expect(hasNoDoubleBooking(real)).toBe(true)
      }

      const tournament = await reloadTournament(built.tournament.id)

      expect(getChampionCompetitorId(tournament)).not.toBeNull()
    })
  }

  it('lets the away side win and advance (winner propagation)', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    // Away always wins.
    await playToCompletion(built, { decide: () => 'away' })

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    const tournament = await reloadTournament(built.tournament.id)

    expect(getChampionCompetitorId(tournament)).not.toBeNull()
    // Every resolved match has a winner consistent with its status.
    const all = await getAllMatches(built.categoryIds[0])

    for (const match of all) {
      if (match.status !== MatchStatus.PENDING) {
        expect(match.winner === MatchSide.HOME || match.winner === MatchSide.AWAY).toBe(true)
      }
    }
  })
})
