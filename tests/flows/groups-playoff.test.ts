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
