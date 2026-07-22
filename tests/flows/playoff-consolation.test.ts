import { beforeEach, describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getChampionCompetitorId } from '@/app/(protected)/(tournaments)/utils/champion'
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

describe('PLAYOFF_WITH_CONSOLATION — full flows', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const n of [4, 8, 16]) {
    it(`builds and completes both brackets for ${n} competitors`, async () => {
      const built = await buildTournament({
        type: TournamentType.PLAYOFF_WITH_CONSOLATION,
        competitors: n,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await start(built)
      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const categoryId = built.categoryIds[0]
      const rounds = await getRounds(categoryId)
      const mainRounds = rounds.filter((r) => r.type === MatchType.BRACKET)
      const consolationRounds = rounds.filter((r) => r.type === MatchType.CONSOLATION_BRACKET)

      // The consolation bracket must have been created (first-round losers play on).
      expect(mainRounds.length).toBeGreaterThan(0)
      expect(consolationRounds.length).toBeGreaterThan(0)

      // Everything is resolved.
      const all = await getAllMatches(categoryId)

      expect(all.every((m) => m.status !== MatchStatus.PENDING)).toBe(true)

      // Main champion exists.
      const tournament = await reloadTournament(built.tournament.id)

      expect(getChampionCompetitorId(tournament)).not.toBeNull()
    })
  }

  it('seeds the consolation bracket from the first-round losers', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF_WITH_CONSOLATION,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const rounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)
    const round1 = rounds.find((r) => r.number === 1)!
    const round1Matches = await getMatches(round1.id)
    // Resolve round 1 (home wins) to know who the losers are.
    const { setResult, homeWinScore } = await import('@/tests/setup/harness')
    const expectedLosers: number[] = []

    for (const match of round1Matches) {
      if (match.awayCompetitorIds && match.awayCompetitorIds.length > 0) {
        expectedLosers.push(match.awayCompetitorIds[0])
        await setResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT))
      }
    }

    // Now the consolation bracket should be seeded with exactly those losers.
    const consolationRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.CONSOLATION_BRACKET)

    expect(consolationRounds.length).toBeGreaterThan(0)

    const consolationFirst = consolationRounds.sort((a, b) => a.number - b.number)[0]
    const consolationMatches = await getMatches(consolationFirst.id)
    const consolationCompetitors = new Set<number>()

    for (const match of consolationMatches) {
      match.homeCompetitorIds.forEach((id) => consolationCompetitors.add(id))
      match.awayCompetitorIds?.forEach((id) => consolationCompetitors.add(id))
    }

    for (const loser of expectedLosers) {
      expect(consolationCompetitors.has(loser)).toBe(true)
    }

    expect(hasNoDoubleBooking(consolationMatches)).toBe(true)
  })
})
