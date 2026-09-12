import { DB } from '@neogroup/neorm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPlayerStats } from '@/app/(protected)/(home)/services/dashboard'
import { getOrganizationRankingSummary, getPlayerRankingSummary } from '@/app/(protected)/(rankings)/services/rankings'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { withOrganization } from '@/app/services/organization-context'
import {
  buildTournament,
  BuiltTournament,
  createCategory,
  createOrganization,
  createUser,
  getAllMatches,
  homeWinScore,
  playToCompletion,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'
import { setTestSession } from '@/tests/setup/stubs/auth-service'

const ORGANIZATION_ID = 1
const FORMAT = ScoreFormat.BASIC_COUNT
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Signs in as `userId`, which is how the dashboard services resolve the organization. */
function signIn(userId: number): void {
  setTestSession({ user: { id: userId, organizationId: ORGANIZATION_ID } })
}

/** The single player behind a competitor (every type here registers individuals). */
function playerOf(built: BuiltTournament, competitorId: number): number {
  return built.rosterByCompetitorId.get(competitorId)![0]!
}

/** Grants a ranking award directly, so its expiry can be placed wherever the test needs it. */
async function grantRankingPoints(
  userId: number,
  points: number,
  {
    categoryId = null,
    expiresInDays = 365,
    organizationId = ORGANIZATION_ID
  }: { categoryId?: number | null; expiresInDays?: number; organizationId?: number } = {}
): Promise<void> {
  await DB.table('rankings').insert({
    organizationId,
    categoryId,
    userId,
    points,
    expirationDate: new Date(Date.now() + expiresInDays * DAY_MS),
    createdAt: new Date()
  })
}

/**
 * Backdates the cached statistics row of a player and leaves a recognisable
 * value in it, so a later read reveals whether it was served or recomputed.
 */
async function ageCachedPlayerStats(playerId: number, ageMs: number, titles = 99): Promise<void> {
  await DB.table('player_statistics')
    .where('playerId', playerId)
    .update({ titles, updatedAt: new Date(Date.now() - ageMs) })
}

/** Backdates every tournament and match, so nothing looks edited after the cache. */
async function ageTournamentActivity(ageMs: number): Promise<void> {
  const when = new Date(Date.now() - ageMs)

  await DB.table('tournaments').update({ updatedAt: when })
  await DB.table('matches').update({ updatedAt: when })
}

/**
 * The home dashboard statistics and the cache in front of them.
 *
 * Two things are worth pinning down here. That the numbers are read from the
 * data that was materialised when it could last change — the champion of a
 * finished category — rather than replayed from the raw matches on every load.
 * And that the cache still behaves the way it is documented to: a row younger
 * than the TTL is served untouched, and past the TTL it is only recomputed when
 * something was actually edited after it.
 */
describe('dashboard statistics', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  // Test files share one process, so a session left set would start filtering
  // every later query in the run — see the auth stub's own note.
  afterEach(() => {
    setTestSession(null)
  })

  describe('titles', () => {
    it('counts the categories the player finished as champion', async () => {
      const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

      await start(built)
      await playToCompletion(built)

      const championCompetitorId = (await TournamentCategory.where('id', built.categoryIds[0]!).first())!
        .championCompetitorId

      expect(championCompetitorId).not.toBeNull()

      const champion = playerOf(built, championCompetitorId!)

      signIn(champion)

      expect((await getPlayerStats(champion)).titles).toBe(1)
    })

    it('gives no title to the other entrants', async () => {
      const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

      await start(built)
      await playToCompletion(built)

      const championCompetitorId = (await TournamentCategory.where('id', built.categoryIds[0]!).first())!
        .championCompetitorId
      const loserCompetitorId = built.competitorIds.find((id) => id !== championCompetitorId)!
      const loser = playerOf(built, loserCompetitorId)

      signIn(loser)

      const stats = await getPlayerStats(loser)

      expect(stats.titles).toBe(0)
      expect(stats.tournamentsPlayed).toBe(1)
    })

    it('gives no title while the tournament is still running', async () => {
      const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

      await start(built)

      const player = playerOf(built, built.competitorIds[0]!)

      signIn(player)

      expect((await getPlayerStats(player)).titles).toBe(0)
    })
  })

  describe('cache', () => {
    it('serves a row younger than the TTL without recomputing it', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, scoreFormat: FORMAT })

      await start(built)

      const player = playerOf(built, built.competitorIds[0]!)

      signIn(player)
      await getPlayerStats(player)

      // Deliberately wrong numbers, an hour old. Getting them back is the proof
      // that the read served the row instead of aggregating again.
      await ageCachedPlayerStats(player, HOUR_MS)

      expect((await getPlayerStats(player)).titles).toBe(99)
    })

    it('keeps serving a row past the TTL when nothing was edited after it', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, scoreFormat: FORMAT })

      await start(built)

      const player = playerOf(built, built.competitorIds[0]!)

      signIn(player)
      await getPlayerStats(player)

      // The row is two days old, but the tournament and its matches are three:
      // stale by the clock, still correct in substance.
      await ageTournamentActivity(3 * DAY_MS)
      await ageCachedPlayerStats(player, 2 * DAY_MS)

      expect((await getPlayerStats(player)).titles).toBe(99)
    })

    it('recomputes a row past the TTL once a match has been edited after it', async () => {
      const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, scoreFormat: FORMAT })

      await start(built)

      const [match] = await getAllMatches(built.categoryIds[0]!)
      const player = playerOf(built, match!.homeCompetitorId!)

      signIn(player)

      expect((await getPlayerStats(player)).matchesPlayed).toBe(0)

      await ageCachedPlayerStats(player, 2 * DAY_MS)
      // Loading the result stamps the match with a fresh updatedAt, which is
      // what the staleness probe compares against.
      await setResult(match!.id, homeWinScore(FORMAT))

      const stats = await getPlayerStats(player)

      expect(stats.titles).toBe(0)
      expect(stats.matchesPlayed).toBe(1)
      expect(stats.matchesWon).toBe(1)
    })
  })

  describe('ranking summary', () => {
    it('sums the still-valid awards and ignores the expired ones', async () => {
      const player = await createUser(ORGANIZATION_ID)

      await grantRankingPoints(player, 120)
      await grantRankingPoints(player, 80)
      await grantRankingPoints(player, 500, { expiresInDays: -1 })

      const summary = await getPlayerRankingSummary(player)

      expect(summary.points).toBe(200)
    })

    it('ranks the player against their rivals in the same category', async () => {
      const categoryId = null
      const leader = await createUser(ORGANIZATION_ID)
      const runnerUp = await createUser(ORGANIZATION_ID)
      const third = await createUser(ORGANIZATION_ID)

      await grantRankingPoints(leader, 300, { categoryId })
      await grantRankingPoints(runnerUp, 200, { categoryId })
      await grantRankingPoints(third, 100, { categoryId })

      expect((await getPlayerRankingSummary(leader)).bestPosition).toBe(1)
      expect((await getPlayerRankingSummary(runnerUp)).bestPosition).toBe(2)
      expect((await getPlayerRankingSummary(third)).bestPosition).toBe(3)
    })

    it('keeps the best position across the categories the player holds points in', async () => {
      const first = await createUser(ORGANIZATION_ID)
      const rival = await createUser(ORGANIZATION_ID)
      const categoryId = await createCategory(ORGANIZATION_ID)

      // Behind in the no-category board, ahead in the catalogue one.
      await grantRankingPoints(first, 100)
      await grantRankingPoints(rival, 300)
      await grantRankingPoints(first, 300, { categoryId })
      await grantRankingPoints(rival, 100, { categoryId })

      expect((await getPlayerRankingSummary(first)).bestPosition).toBe(1)
    })

    it('reports no position for a player without awards', async () => {
      const player = await createUser(ORGANIZATION_ID)
      const summary = await getPlayerRankingSummary(player)

      expect(summary.points).toBe(0)
      expect(summary.bestPosition).toBe(0)
    })

    // The summaries take no organizationId any more: keeping the organizations
    // apart is the Ranking entity's own scope, resolved from the organization in
    // context. So these two are what actually holds that line now.
    it('counts only the awards of the organization in context', async () => {
      const player = await createUser(ORGANIZATION_ID)
      const otherOrganizationId = await createOrganization()
      const outsider = await createUser(otherOrganizationId)

      await grantRankingPoints(player, 100)
      await grantRankingPoints(outsider, 9000, { organizationId: otherOrganizationId })

      expect((await getPlayerRankingSummary(player)).points).toBe(100)
      // The same player, asked from the other organization: no awards of theirs
      // live there, so they come back unranked rather than carrying the points
      // across the tenant boundary.
      expect(await withOrganization(otherOrganizationId, () => getPlayerRankingSummary(player))).toEqual({
        points: 0,
        bestPosition: 0
      })
    })

    it('totals the organization in context, not the whole table', async () => {
      const first = await createUser(ORGANIZATION_ID)
      const second = await createUser(ORGANIZATION_ID)
      const otherOrganizationId = await createOrganization()
      const outsider = await createUser(otherOrganizationId)

      await grantRankingPoints(first, 120)
      await grantRankingPoints(first, 80)
      await grantRankingPoints(second, 50)
      await grantRankingPoints(second, 500, { expiresInDays: -1 })
      await grantRankingPoints(outsider, 9000, { organizationId: otherOrganizationId })

      // 120 + 80 + 50: the expired award and the other organization's are out,
      // and the two holders are counted once each.
      expect(await getOrganizationRankingSummary()).toEqual({ pointsAwarded: 250, rankedPlayers: 2 })
      expect(await withOrganization(otherOrganizationId, () => getOrganizationRankingSummary())).toEqual({
        pointsAwarded: 9000,
        rankedPlayers: 1
      })
    })

    it('reports zeroes for an organization with no awards', async () => {
      expect(await getOrganizationRankingSummary()).toEqual({ pointsAwarded: 0, rankedPlayers: 0 })
    })
  })
})
