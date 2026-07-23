import { beforeEach, describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  buildTournament,
  getAllMatches,
  getMatches,
  getRounds,
  getTournamentStatus,
  hasNoDoubleBooking,
  playToCompletion,
  resetDatabase,
  start
} from '@/tests/setup/harness'

describe('AMERICANO_WITH_SWAP — full flows', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const n of [4, 6, 8]) {
    it(`completes a ${n}-individual swap americano (partners rotate)`, async () => {
      const built = await buildTournament({
        type: TournamentType.AMERICANO_WITH_SWAP,
        competitors: n,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await start(built)
      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const categoryId = built.categoryIds[0]
      const rounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.LEAGUE)
      // Each match is two individuals vs two individuals.
      const all = await getAllMatches(categoryId)

      for (const match of all) {
        expect(match.homeCompetitorIds.length).toBe(2)
        expect(match.awayCompetitorIds?.length).toBe(2)
        expect(match.status).not.toBe(MatchStatus.PENDING)
      }

      // No individual is double-booked within a round.
      for (const round of rounds) {
        expect(hasNoDoubleBooking(await getMatches(round.id))).toBe(true)
      }
    })
  }

  it('rotates partners across rounds (a player should get different partners)', async () => {
    const built = await buildTournament({
      type: TournamentType.AMERICANO_WITH_SWAP,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { maxRounds: 4 }
    })

    await start(built)
    await playToCompletion(built)

    const all = await getAllMatches(built.categoryIds[0])
    const target = built.competitorIds[0]
    const partners = new Set<number>()

    for (const match of all) {
      const sides = [match.homeCompetitorIds, match.awayCompetitorIds ?? []]

      for (const side of sides) {
        if (side.includes(target)) {
          for (const id of side) {
            if (id !== target) {
              partners.add(id)
            }
          }
        }
      }
    }

    // Over several rounds the player should partner with more than one person.
    expect(partners.size).toBeGreaterThan(1)
  })
})
