import { beforeEach, describe, expect, it } from 'vitest'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getStaleTournaments } from '@/app/(protected)/(tournaments)/services/tournaments'
import { buildTournament, getAllMatches, homeWinScore, resetDatabase, setResult, start } from '@/tests/setup/harness'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * `getStaleTournaments` powers the organizer-home warning banner: an ONGOING
 * tournament that still has a real match pending and hasn't budged in a while
 * is one `processTournaments` can never auto-finish on its own (see
 * `isTournamentComplete`), so its ranking points stay withheld until the
 * organizer notices and loads the missing results.
 */
describe('getStaleTournaments', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('flags an ONGOING tournament whose only pending match has had no activity in 14+ days', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 2 })

    await start(built)

    const [match] = await getAllMatches(built.categoryIds[0]!)

    match!.updatedAt = new Date(Date.now() - 20 * DAY_MS)
    await match!.save()

    const stale = await getStaleTournaments()

    expect(stale.map((t) => t.id)).toContain(built.tournament.id)
  })

  it('does not flag a tournament that was just started (fresh match activity)', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 2 })

    await start(built)

    const stale = await getStaleTournaments()

    expect(stale.map((t) => t.id)).not.toContain(built.tournament.id)
  })

  it('does not flag a tournament with no pending matches left, even with old timestamps', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 2 })

    await start(built)

    const [match] = await getAllMatches(built.categoryIds[0]!)

    await setResult(match!.id, homeWinScore(built.tournament.scoreFormat))

    const resolved = (await Match.withoutGlobalScopes().where('id', match!.id).first())!

    resolved.updatedAt = new Date(Date.now() - 30 * DAY_MS)
    await resolved.save()

    const stale = await getStaleTournaments()

    expect(stale.map((t) => t.id)).not.toContain(built.tournament.id)
  })

  it('does not flag a tournament whose only stale pending row is an unresolved bracket placeholder', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 2 })

    await start(built)

    const [match] = await getAllMatches(built.categoryIds[0]!)

    // Resolve the real (and only) match, then plant an old, unfed "to be
    // defined" placeholder in the same category — the shape a later bracket
    // round has before its feeder matches are done. It must never trip the
    // banner on its own: it has no rival yet, so there is nothing to load.
    await setResult(match!.id, homeWinScore(built.tournament.scoreFormat))

    const placeholder = new Match()

    Object.assign(placeholder, {
      tournamentCategoryId: match!.tournamentCategoryId,
      roundNumber: 2,
      type: MatchType.BRACKET,
      groupNumber: null,
      position: 0,
      bracketInstance: 1,
      homeCompetitorId: null,
      awayCompetitorId: null,
      score: null,
      status: MatchStatus.PENDING,
      winner: null,
      siteId: null,
      date: null,
      hour: null,
      courtNumber: null,
      createdAt: new Date(Date.now() - 30 * DAY_MS),
      updatedAt: new Date(Date.now() - 30 * DAY_MS)
    })
    await placeholder.save()

    const stale = await getStaleTournaments()

    expect(stale.map((t) => t.id)).not.toContain(built.tournament.id)
  })

  it('never returns a STAND_BY tournament', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 2 })
    const stale = await getStaleTournaments()

    expect(stale.map((t) => t.id)).not.toContain(built.tournament.id)
  })
})
