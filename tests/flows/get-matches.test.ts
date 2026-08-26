import { beforeEach, describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getMatches, setMatchSchedule } from '@/app/(protected)/(tournaments)/services/matches'
import { buildTournament, createSite, getAllMatches, resetDatabase, start } from '@/tests/setup/harness'

const ORGANIZATION_ID = 1

/**
 * `getMatches` is the unified match listing, analogous to `getTournaments`.
 * These tests cover its filters directly against the real engine (a playoff
 * bracket started from `buildTournament`), independent of any single caller.
 */
describe('getMatches', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('filters by competitorIds, matching either the home or the away side', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })

    await start(built)

    const allMatches = await getAllMatches(built.categoryIds[0]!)
    const target = allMatches[0]!
    const byHome = await getMatches({ competitorIds: [target.homeCompetitorId!] })
    const byAway = await getMatches({ competitorIds: [target.awayCompetitorId!] })

    expect(byHome.map((m) => m.id)).toEqual([target.id])
    expect(byAway.map((m) => m.id)).toEqual([target.id])
  })

  it('returns nothing for a competitor id that has no matches', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })

    await start(built)

    const matches = await getMatches({ competitorIds: [999999] })

    expect(matches).toEqual([])
  })

  it('filters by status', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })

    await start(built)

    const pending = await getMatches({
      tournamentCategoryId: built.categoryIds[0],
      statuses: [MatchStatus.PENDING]
    })
    const played = await getMatches({
      tournamentCategoryId: built.categoryIds[0],
      statuses: [MatchStatus.PLAYED]
    })

    expect(pending.length).toBeGreaterThan(0)
    expect(played).toEqual([])
  })

  it('filters by an inclusive date window, excluding unscheduled matches', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })

    await start(built)

    const allMatches = await getAllMatches(built.categoryIds[0]!)
    const siteId = await createSite(ORGANIZATION_ID)

    await setMatchSchedule(
      allMatches[0]!.id,
      { siteId, date: '2026-08-12', hour: '10:00', courtNumber: 1 },
      built.ownerId,
      ORGANIZATION_ID
    )
    await setMatchSchedule(
      allMatches[1]!.id,
      { siteId, date: '2026-09-01', hour: '10:00', courtNumber: 1 },
      built.ownerId,
      ORGANIZATION_ID
    )

    const inWindow = await getMatches({
      tournamentCategoryId: built.categoryIds[0],
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31'
    })

    // The third match of the bracket (the final) is never scheduled here, so a
    // date window also has to exclude it — not just the one scheduled outside it.
    expect(inWindow.map((m) => m.id)).toEqual([allMatches[0]!.id])
  })

  it('filters by tournamentId', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })
    const otherBuilt = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })

    await start(built)
    await start(otherBuilt)

    const matches = await getMatches({ tournamentId: built.tournament.id })

    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every((m) => built.categoryIds.includes(m.tournamentCategoryId))).toBe(true)
  })

  it('filters by tournamentStatuses', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })

    await start(built)

    const whileOngoing = await getMatches({
      tournamentCategoryId: built.categoryIds[0],
      tournamentStatuses: [TournamentStatus.ONGOING]
    })

    built.tournament.status = TournamentStatus.FINISHED
    await built.tournament.save()

    const afterFinished = await getMatches({
      tournamentCategoryId: built.categoryIds[0],
      tournamentStatuses: [TournamentStatus.ONGOING]
    })

    expect(whileOngoing.length).toBeGreaterThan(0)
    expect(afterFinished).toEqual([])
  })

  it('eager-loads the tournament, category and venue with withTournament/withSite', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      // Two entries force real catalogue categories (see buildTournament).
      categories: [4, 4]
    })

    await start(built)

    const allMatches = await getAllMatches(built.categoryIds[0]!)
    const siteId = await createSite(ORGANIZATION_ID, 'Club Belgrano')

    await setMatchSchedule(
      allMatches[0]!.id,
      { siteId, date: '2026-08-12', hour: '10:00', courtNumber: 1 },
      built.ownerId,
      ORGANIZATION_ID
    )

    const [match] = await getMatches({
      id: allMatches[0]!.id,
      withTournament: true,
      withSite: true
    })

    expect(match!.tournamentCategory?.tournament?.id).toBe(built.tournament.id)
    expect(match!.tournamentCategory?.tournament?.name).toBe(built.tournament.name)
    expect(match!.tournamentCategory?.category?.name).toBe('Category 1')
    expect(match!.site?.id).toBe(siteId)
    expect(match!.site?.name).toBe('Club Belgrano')
  })

  it('orders matches by date and hour', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })

    await start(built)

    const allMatches = await getAllMatches(built.categoryIds[0]!)
    const siteId = await createSite(ORGANIZATION_ID)

    await setMatchSchedule(
      allMatches[0]!.id,
      { siteId, date: '2026-08-13', hour: '09:00', courtNumber: 1 },
      built.ownerId,
      ORGANIZATION_ID
    )
    await setMatchSchedule(
      allMatches[1]!.id,
      { siteId, date: '2026-08-12', hour: '18:00', courtNumber: 1 },
      built.ownerId,
      ORGANIZATION_ID
    )

    const matches = await getMatches({ tournamentCategoryId: built.categoryIds[0] })

    expect(matches.map((m) => m.id).slice(-2)).toEqual([allMatches[1]!.id, allMatches[0]!.id])
  })
})
