import { beforeEach, describe, expect, it } from 'vitest'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getChampionCompetitorId } from '@/app/(protected)/(tournaments)/utils/champion'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import {
  buildTournament,
  finalizeIfComplete,
  getAllMatches,
  getPendingActiveMatches,
  getTournamentStatus,
  reloadTournament,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

async function resolveAll(
  built: { tournament: { id: number; scoreFormat: ScoreFormat }; categoryIds: number[] },
  score: any
): Promise<void> {
  for (let guard = 0; guard < 100; guard++) {
    if ((await getTournamentStatus(built.tournament.id)) === TournamentStatus.FINISHED) {
      break
    }

    const pending = await getPendingActiveMatches(built.categoryIds)

    if (pending.length === 0) {
      break
    }

    for (const match of pending) {
      await setResult(match.id, score)
    }
  }

  // Loading the last match no longer finishes the tournament — finalise it the
  // way the processTournaments cron would once nothing is left to play.
  await finalizeIfComplete(built.tournament.id)
}

describe('walkovers', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('drives a full playoff entirely on walkovers and still crowns a champion', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await resolveAll(built, { walkover: MatchSide.HOME })

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
    expect(getChampionCompetitorId(await reloadTournament(built.tournament.id))).not.toBeNull()

    const all = await getAllMatches(built.categoryIds[0])
    const realWalkovers = all.filter((m) => m.awayCompetitorIds && m.awayCompetitorIds.length > 0)

    expect(realWalkovers.every((m) => m.status === MatchStatus.WALKOVER && m.winner === MatchSide.HOME)).toBe(true)
  })

  it('awards present + match points only to the side that showed up (league walkover)', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { pointsPerPresent: 10, pointsPerSetWon: 0, pointsPerMatchWon: 3 }
    })

    await start(built)
    await resolveAll(built, { walkover: MatchSide.HOME })

    const tournament = await reloadTournament(built.tournament.id)
    const standings = computeStandings(tournament, built.categoryIds[0])

    // Every match is a home walkover: the home side gets present(10) + win(3);
    // the away (no-show) side gets neither for that match. Points must therefore
    // equal wins*3 + wins*10 (a competitor is "present" exactly on the matches it
    // attended, i.e. the ones it won as home).
    for (const row of standings) {
      expect(row.points).toBe(row.won * 13)
    }

    // The standings must still rank all four competitors.
    expect(standings.length).toBe(4)
  })

  it('records a walkover as WALKOVER status with the chosen winner', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 2,
      scoreFormat: ScoreFormat.THREE_SETS
    })

    await start(built)

    const pending = await getPendingActiveMatches(built.categoryIds)

    expect(pending.length).toBe(1)
    await setResult(pending[0].id, { walkover: MatchSide.AWAY })

    const match = (await getAllMatches(built.categoryIds[0]))[0]

    expect(match.status).toBe(MatchStatus.WALKOVER)
    expect(match.winner).toBe(MatchSide.AWAY)
  })
})
