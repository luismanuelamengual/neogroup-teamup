/**
 * REGRESSION #7 — a group's table must list every competitor of the group, even
 * before its whole round robin has been materialised.
 *
 * A group of odd size rests one competitor per round. The standings used to
 * derive the group's membership from the materialised matches, so on round 1 —
 * the only round that exists right after the start — the resting competitor was
 * missing from the table. That competitor is `ids[0]` (the fixed point of the
 * circle method), i.e. the TOP SEED. Reported as: "seed #1 was not added to the
 * only group; it shows 6 of the 7 registered competitors".
 *
 * See tests/FINDINGS.md.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import { buildTournament, reloadTournament, resetDatabase, start } from '@/tests/setup/harness'

describe('REGRESSION #7 — group standings list every member from round 1', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('7 competitors in a single group of 40 → the group table holds all 7', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 7,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      // The reported configuration: a group size and a playoff floor far above
      // the field, so everybody lands in one odd-sized group.
      settings: { competitorsPerGroup: 40, qualifiersPerGroup: 2, minPlayoffQualifiers: 40 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const tournament = await reloadTournament(built.tournament.id)
    const standings = computeStandings(tournament, categoryId, 0)

    expect(standings).toHaveLength(7)
    expect(new Set(standings.map((row) => row.competitorId))).toEqual(new Set(built.competitorIds))
  })

  it('keeps the top seed in the group table when the field is seeded', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 7,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      seeds: [null, null, 1, 2, null, null, null],
      settings: { competitorsPerGroup: 40, qualifiersPerGroup: 2, minPlayoffQualifiers: 40 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const seedOne = await Competitor.withoutGlobalScopes()
      .where('tournamentCategoryId', categoryId)
      .where('seedNumber', 1)
      .first()

    expect(seedOne).not.toBeNull()

    const tournament = await reloadTournament(built.tournament.id)
    const standings = computeStandings(tournament, categoryId, 0)

    expect(standings).toHaveLength(7)
    // The seed sits out round 1 (it is the fixed point of the circle method):
    // it must still be listed in its group.
    expect(standings.some((row) => row.competitorId === seedOne!.id)).toBe(true)
  })

  it('splits an even multi-group field exactly as the engine plays it', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 9,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const tournament = await reloadTournament(built.tournament.id)
    // computeGroupSizes(9, 4) = [3, 3, 3]: three odd groups, nobody may be lost.
    const sizes = [0, 1, 2].map((group) => computeStandings(tournament, categoryId, group).length)

    expect(sizes).toEqual([3, 3, 3])
  })
})
