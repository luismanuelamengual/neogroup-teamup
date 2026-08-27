import { beforeEach, describe, expect, it } from 'vitest'
import { Ranking } from '@/app/(protected)/(rankings)/models/Ranking'
import { getDefaultRankingSettings } from '@/app/(protected)/(rankings)/models/RankingSettings'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { finishTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { getChampionCompetitorId, getPodiumCompetitorIds } from '@/app/(protected)/(tournaments)/utils/champion'
import {
  buildTournament,
  getMatches,
  getRounds,
  getTournamentStatus,
  homeWinScore,
  reloadTournament,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

/**
 * An organizer can finish a tournament manually (POST /api/finishTournament)
 * even while a category's final is still pending — nothing in that endpoint
 * checks completeness (only the processTournaments cron does, via
 * `isTournamentComplete`, and only to decide whether to auto-finish). This
 * suite pins down what ranking points a category's finalists get in that case.
 */
describe('ranking points when a category is finished with its final unplayed', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('awards both finalists the finalist points instead of nobody', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    built.tournament.rankingSettings = getDefaultRankingSettings(TournamentType.PLAYOFF)
    await built.tournament.save()

    await start(built)

    const categoryId = built.categoryIds[0]
    const bracketRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)
    const semifinalRound = bracketRounds.find((r) => r.number === 1)!
    const semifinalMatches = await getMatches(semifinalRound.id)

    expect(semifinalMatches.length).toBe(2)

    // Home side wins both semifinals — away sides are the eliminated
    // semifinalists, home sides are the two who reach the final.
    const semifinalLoserIds = semifinalMatches.map((m) => m.awayCompetitorId!)
    const finalistIds = semifinalMatches.map((m) => m.homeCompetitorId!)

    for (const match of semifinalMatches) {
      await setResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT))
    }

    const finalRound = (await getRounds(categoryId))
      .filter((r) => r.type === MatchType.BRACKET)
      .find((r) => r.number === 2)!
    const finalMatches = await getMatches(finalRound.id)

    expect(finalMatches.length).toBe(1)
    const finalMatch = finalMatches[0]

    // The final is set up (both finalists known) but has no result — exactly
    // the "final not played" scenario.
    expect(finalMatch.homeCompetitorId).not.toBeNull()
    expect(finalMatch.awayCompetitorId).not.toBeNull()
    expect(finalMatch.winner).toBeNull()
    expect([finalMatch.homeCompetitorId, finalMatch.awayCompetitorId].sort()).toEqual([...finalistIds].sort())

    // Organizer finishes the tournament anyway (the manual action performs no
    // completeness check — see finishTournament/route.ts).
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.ONGOING)
    const tournament = await Tournament.withoutGlobalScopes().where('id', built.tournament.id).first()

    await finishTournament(tournament!)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    // Nobody is crowned champion — that stays genuinely undetermined.
    const reloaded = await reloadTournament(built.tournament.id)

    expect(getChampionCompetitorId(reloaded)).toBeNull()
    expect(getPodiumCompetitorIds(reloaded)).toEqual([])

    // But ranking points were still awarded for the rounds that WERE decided.
    const awards = await Ranking.get()
    const pointsByUserId = new Map(awards.map((a) => [a.userId, a.points]))

    expect(awards.length).toBe(4)

    for (const competitorId of finalistIds) {
      const userId = built.rosterByCompetitorId.get(competitorId)![0]

      // Both finalists share the runner-up placement — reaching the final
      // already guarantees each of them at least 2nd place.
      expect(pointsByUserId.get(userId)).toBe(70)
    }

    for (const competitorId of semifinalLoserIds) {
      const userId = built.rosterByCompetitorId.get(competitorId)![0]

      expect(pointsByUserId.get(userId)).toBe(45)
    }

    // Nobody gets the champion's points — that placement is withheld, not
    // guessed or split, because it genuinely was never decided.
    expect([...pointsByUserId.values()].some((points) => points === 100)).toBe(false)
  })
})
