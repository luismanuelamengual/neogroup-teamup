/**
 * REGRESSION SUITE — previously-found defects, now fixed.
 *
 * Each test reproduces a bug that the bug-hunting pass surfaced and asserts the
 * CORRECT behavior, so it stays green only while the fix holds. See
 * tests/FINDINGS.md for the full write-up of each one.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { Ranking } from '@/app/(protected)/(rankings)/models/Ranking'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  buildTournament,
  finalizeIfComplete,
  getMatches,
  getPendingActiveMatches,
  getRounds,
  getTournamentStatus,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

describe('REGRESSION #1 — starting a seeded tournament must not duplicate competitors', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const type of [TournamentType.PLAYOFF, TournamentType.GROUPS_PLAYOFF, TournamentType.PLAYOFF_WITH_CONSOLATION]) {
    it(`keeps the competitor count stable when starting ${TournamentType[type]}`, async () => {
      const built = await buildTournament({ type, competitors: 8, scoreFormat: ScoreFormat.BASIC_COUNT })

      await start(built)

      const competitors = await Competitor.withoutGlobalScopes()
        .where('tournamentCategoryId', built.categoryIds[0])
        .get()

      // Seeds are now persisted with a targeted UPDATE, not an upsert keyed on
      // the auto-generated primary key (which duplicated every row on start).
      expect(competitors.length).toBe(8)
    })
  }
})

describe('REGRESSION #2 — americano must not force avoidable rematches', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('plays a perfect single round-robin for an even field (no rematches, no unplayed pairs)', async () => {
    const built = await buildTournament({
      type: TournamentType.AMERICANO,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const pairCount = new Map<string, number>()

    for (let guard = 0; guard < 50; guard++) {
      if ((await getTournamentStatus(built.tournament.id)) === TournamentStatus.FINISHED) {
        break
      }

      const pending = await getPendingActiveMatches([categoryId])

      if (pending.length === 0) {
        break
      }

      for (const match of pending) {
        const key = [match.homeCompetitorIds[0], match.awayCompetitorIds![0]].sort((a, b) => a - b).join('-')

        pairCount.set(key, (pairCount.get(key) ?? 0) + 1)
        await setResult(match.id, { home: 16, away: 9 })
      }
    }

    // 6 players over 5 rounds → all 15 pairs exactly once.
    const replayed = [...pairCount.values()].filter((count) => count > 1)

    expect(replayed.length).toBe(0)
    expect(pairCount.size).toBe(15)
  })
})

describe('REGRESSION #3 — odd-field americano must distribute byes fairly', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('keeps the number of matches played within one across all competitors', async () => {
    const built = await buildTournament({
      type: TournamentType.AMERICANO,
      competitors: 5,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const played = new Map<number, number>(built.competitorIds.map((id) => [id, 0]))

    for (let guard = 0; guard < 50; guard++) {
      if ((await getTournamentStatus(built.tournament.id)) === TournamentStatus.FINISHED) {
        break
      }

      const pending = await getPendingActiveMatches([categoryId])

      if (pending.length === 0) {
        break
      }

      for (const match of pending) {
        for (const id of [...match.homeCompetitorIds, ...(match.awayCompetitorIds ?? [])]) {
          played.set(id, (played.get(id) ?? 0) + 1)
        }

        await setResult(match.id, { home: 16, away: 9 })
      }
    }

    const counts = [...played.values()]
    const spread = Math.max(...counts) - Math.min(...counts)

    expect(spread).toBeLessThanOrEqual(1)
  })
})

describe('REGRESSION #4 — single-group groups+playoff must not replay the same pair', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('does not make the same two competitors meet twice (group + final)', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 2,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]

    for (let guard = 0; guard < 20; guard++) {
      if ((await getTournamentStatus(built.tournament.id)) === TournamentStatus.FINISHED) {
        break
      }

      const pending = await getPendingActiveMatches([categoryId])

      if (pending.length === 0) {
        break
      }

      for (const match of pending) {
        await setResult(match.id, { home: 16, away: 9 })
      }
    }

    // A single group is decided by its standings; no redundant knockout final.
    const rounds = await getRounds(categoryId)
    let realMatches = 0

    for (const round of rounds) {
      for (const match of await getMatches(round.id)) {
        if (match.awayCompetitorIds && match.awayCompetitorIds.length > 0) {
          realMatches++
        }
      }
    }

    expect(realMatches).toBe(1)

    // Loading the last match no longer finishes the tournament; the cron does.
    await finalizeIfComplete(built.tournament.id)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })
})

describe('REGRESSION #5 — preclassification seeds must not mix across categories', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('assigns an independent seed #1..#N per category instead of a single global ranking', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      categories: [4, 4]
    })
    const [categoryAIds, categoryBIds] = [built.competitorIds.slice(0, 4), built.competitorIds.slice(4, 8)]

    // Give every competitor ranking points so all of them are seed-eligible, but
    // reverse the point order relative to creation order within each category so
    // sorting by points actually reshuffles them (this would catch an
    // implementation that "accidentally" keeps categories separate via id order).
    for (const ids of [categoryAIds, categoryBIds]) {
      for (const [index, competitorId] of ids.entries()) {
        const competitor = await Competitor.withoutGlobalScopes().where('id', competitorId).first()

        if (!competitor) {
          throw new Error('competitor not found')
        }

        const ranking = new Ranking()

        Object.assign(ranking, {
          organizationId: built.tournament.organizationId,
          categoryId: null,
          userId: competitor.playerIds[0],
          points: (ids.length - index) * 10,
          expirationDate: new Date('2099-01-01'),
          createdAt: new Date()
        })
        await ranking.save()
      }
    }

    await start(built)

    for (const categoryIds of [categoryAIds, categoryBIds]) {
      const competitors = await Competitor.withoutGlobalScopes().whereIn('id', categoryIds).get()
      const seeds = competitors.map((c) => c.seedNumber).sort((a, b) => (a ?? 99) - (b ?? 99))

      // 4 competitors -> getPreclassificationCount(4) = 2 seeds, per category.
      expect(seeds).toEqual([1, 2, null, null])
    }
  })
})

describe('REGRESSION #6 — manually-set seeds take priority over ranking at tournament start', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('keeps a manually-locked seed and only fills the remaining slots from ranking', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })
    const [a, b, c, d] = built.competitorIds
    // Lock seed #1 on competitor A from the admin page, even though it has no
    // ranking points at all — the organizer's choice must be respected.
    const competitorA = await Competitor.withoutGlobalScopes().where('id', a).first()

    competitorA!.seedNumber = 1
    await competitorA!.save()

    // D is the strongest player by ranking points — without the manual seed it
    // would become seed #1.
    const competitorD = await Competitor.withoutGlobalScopes().where('id', d).first()
    const ranking = new Ranking()

    Object.assign(ranking, {
      organizationId: built.tournament.organizationId,
      categoryId: null,
      userId: competitorD!.playerIds[0],
      points: 100,
      expirationDate: new Date('2099-01-01'),
      createdAt: new Date()
    })
    await ranking.save()

    await start(built)

    const competitors = await Competitor.withoutGlobalScopes().whereIn('id', [a, b, c, d]).get()
    const byId = new Map(competitors.map((competitor) => [competitor.id, competitor]))

    // A keeps its manual seed #1 regardless of having zero ranking points.
    expect(byId.get(a)!.seedNumber).toBe(1)
    // D, the top-ranked competitor, gets the only remaining slot: seed #2
    // (getPreclassificationCount(4) = 2 seeds total, #1 already taken by A).
    expect(byId.get(d)!.seedNumber).toBe(2)
    expect(byId.get(b)!.seedNumber).toBeNull()
    expect(byId.get(c)!.seedNumber).toBeNull()
  })

  it('resolves duplicate manual seeds within a category, keeping only the lowest competitor id', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })
    const [a, b] = built.competitorIds

    for (const id of [a, b]) {
      const competitor = await Competitor.withoutGlobalScopes().where('id', id).first()

      competitor!.seedNumber = 1
      await competitor!.save()
    }

    await start(built)

    const competitors = await Competitor.withoutGlobalScopes().whereIn('id', [a, b]).get()
    const seeded = competitors.filter((competitor) => competitor.seedNumber === 1)

    // A category may never end up with two seeded competitors sharing the
    // same number.
    expect(seeded).toHaveLength(1)
    expect(seeded[0].id).toBe(Math.min(a, b))
  })
})
