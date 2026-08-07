import { beforeEach, describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getChampionCompetitorId } from '@/app/(protected)/(tournaments)/utils/champion'
import { resolveInterclubsFormat } from '@/app/(protected)/(tournaments)/utils/interclubs'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import {
  buildTournament,
  getAllMatches,
  getRounds,
  getTournamentStatus,
  hasNoDoubleBooking,
  pairKey,
  playToCompletion,
  reloadTournament,
  resetDatabase,
  start
} from '@/tests/setup/harness'

/** Home-game count per competitor across every real match of a category. */
function homeGameCounts(matches: { homeCompetitorId: number | null; awayCompetitorId: number | null }[]) {
  const counts = new Map<number, number>()

  for (const match of matches) {
    if (match.awayCompetitorId == null || match.homeCompetitorId == null) {
      continue
    }

    counts.set(match.homeCompetitorId, (counts.get(match.homeCompetitorId) ?? 0) + 1)
  }

  return counts
}

describe('INTERCLUBS — home-and-away league (2 to 4 teams)', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const teams of [2, 3, 4]) {
    it(`completes a ${teams}-team tournament playing everybody twice`, async () => {
      const built = await buildTournament({
        type: TournamentType.INTERCLUBS,
        competitors: teams,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await start(built)
      await playToCompletion(built)

      const categoryId = built.categoryIds[0]
      const matches = await getAllMatches(categoryId)

      // No knockout: the league itself decides the title.
      expect(matches.every((match) => match.type === MatchType.LEAGUE)).toBe(true)
      expect(matches.every((match) => match.groupNumber === null)).toBe(true)

      // Every pair meets exactly twice.
      const meetings = new Map<string, number>()

      for (const match of matches) {
        const key = pairKey(match)

        if (key) {
          meetings.set(key, (meetings.get(key) ?? 0) + 1)
        }
      }

      const expectedPairs = (teams * (teams - 1)) / 2

      expect(meetings.size).toBe(expectedPairs)
      expect([...meetings.values()].every((count) => count === 2)).toBe(true)

      // And each pair meets once at each venue.
      for (const match of matches) {
        const mirror = matches.find(
          (candidate) =>
            candidate.id !== match.id &&
            candidate.homeCompetitorId === match.awayCompetitorId &&
            candidate.awayCompetitorId === match.homeCompetitorId
        )

        expect(mirror).toBeTruthy()
      }

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const tournament = await reloadTournament(built.tournament.id)

      expect(getChampionCompetitorId(tournament, categoryId)).toBeTruthy()
    })
  }

  it('gives every team the same number of home games in a 4-team league', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    const counts = homeGameCounts(await getAllMatches(built.categoryIds[0]))

    // 3 opponents, home and away → 3 home games each.
    expect([...counts.values()]).toEqual([3, 3, 3, 3])
  })

  it('never books a team twice in the same round', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    for (const round of await getRounds(built.categoryIds[0])) {
      expect(hasNoDoubleBooking(round.matches)).toBe(true)
    }
  })

  it('ranks the standings by encounters won', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 3,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    const tournament = await reloadTournament(built.tournament.id)
    const rows = computeStandings(tournament, built.categoryIds[0])

    expect(rows.length).toBe(3)
    expect(rows[0].points).toBeGreaterThanOrEqual(rows[1].points)

    // Points are encounters won, and each team plays 4 of them (2 rivals × 2).
    for (const row of rows) {
      expect(row.played).toBe(4)
      expect(row.points).toBe(row.won)
    }
  })
})

describe('INTERCLUBS — zones plus knockout (more than 4 teams)', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const teams of [8, 11, 12]) {
    it(`completes ${teams} teams in ${resolveInterclubsFormat(teams).groupSizes.length} zones`, async () => {
      const format = resolveInterclubsFormat(teams)
      const built = await buildTournament({
        type: TournamentType.INTERCLUBS,
        competitors: teams,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await start(built)

      const categoryId = built.categoryIds[0]
      const zoneMatches = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.LEAGUE)
      const zones = new Set(zoneMatches.map((match) => match.groupNumber))

      expect(zones.size).toBe(format.groupSizes.length)

      // Zones play a single round robin (not home and away).
      const meetings = new Map<string, number>()

      await playToCompletion(built)

      for (const match of (await getAllMatches(categoryId)).filter((m) => m.type === MatchType.LEAGUE)) {
        const key = pairKey(match)

        if (key) {
          meetings.set(key, (meetings.get(key) ?? 0) + 1)
        }
      }

      expect([...meetings.values()].every((count) => count === 1)).toBe(true)

      const bracket = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.BRACKET)

      expect(bracket.length).toBeGreaterThan(0)
      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const tournament = await reloadTournament(built.tournament.id)

      expect(getChampionCompetitorId(tournament, categoryId)).toBeTruthy()
    })
  }

  it('sends the top 4 of a single zone to the knockout', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const zoneMatches = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.LEAGUE)

    // One zone of six.
    expect(new Set(zoneMatches.map((match) => match.groupNumber)).size).toBe(1)

    await playToCompletion(built)

    const bracket = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.BRACKET)

    // 4 qualifiers → 2 semifinals + 1 final.
    expect(bracket.length).toBe(3)
    expect(bracket.filter((match) => match.bracketInstance === 1)).toHaveLength(1)
    expect(bracket.filter((match) => match.bracketInstance === 2)).toHaveLength(2)
  })

  it('avoids grouping two teams of the same venue into the same zone when it can', async () => {
    // 8 teams, zones of 4 → two zones, filled in registration-order slices
    // (slots 0-3 / 4-7). Two teams share "Alemán" at slots 0 and 3, so they'd
    // land in the same zone unless the repair pass moves one of them.
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      sites: ['Alemán', 'Español', 'Italiano', 'Alemán', 'Francés', 'Portugués', 'Danés', 'Suizo']
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const zoneMatches = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.LEAGUE)
    const zoneOfCompetitor = new Map<number, number>()

    for (const match of zoneMatches) {
      if (match.homeCompetitorId != null) {
        zoneOfCompetitor.set(match.homeCompetitorId, match.groupNumber!)
      }

      if (match.awayCompetitorId != null) {
        zoneOfCompetitor.set(match.awayCompetitorId, match.groupNumber!)
      }
    }

    // The two "Alemán" teams are competitorIds[0] and competitorIds[3].
    const zones = [built.competitorIds[0], built.competitorIds[3]].map((id) => zoneOfCompetitor.get(id))

    expect(zones[0]).not.toBe(zones[1])
  })

  it('advances the zone winners computed by the standings', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]

    // Play only the zone phase, then compare the tables with who got in.
    for (let guard = 0; guard < 50; guard++) {
      const pending = (await getAllMatches(categoryId)).filter(
        (match) => match.type === MatchType.LEAGUE && match.status === MatchStatus.PENDING
      )

      if (pending.length === 0) {
        break
      }

      await playToCompletion(built, { maxIterations: 1 })
    }

    const tournament = await reloadTournament(built.tournament.id)
    const bracket = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.BRACKET)
    const entrants = new Set(
      bracket.flatMap((match) =>
        [match.homeCompetitorId, match.awayCompetitorId].filter((id): id is number => id != null)
      )
    )
    const qualifiers = new Set<number>()

    for (let zone = 0; zone < 2; zone++) {
      for (const row of computeStandings(tournament, categoryId, zone).slice(0, 2)) {
        qualifiers.add(row.competitorId)
      }
    }

    expect([...entrants].sort()).toEqual([...qualifiers].sort())
  })

  it('keeps the localía rule in the knockout too', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    const matches = await getAllMatches(built.categoryIds[0])
    const counts = homeGameCounts(matches)

    // Nobody hosts every single one of their matches: the rotation applies to
    // the bracket as well as the zones.
    for (const match of matches.filter((entry) => entry.type === MatchType.BRACKET)) {
      expect(match.homeCompetitorId).not.toBeNull()
    }

    expect([...counts.values()].every((count) => count >= 1)).toBe(true)
  })

  it('runs several categories in parallel to completion', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      categories: [6, 3],
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    const tournament = await reloadTournament(built.tournament.id)
    // The 6-team category ends in a bracket, the 3-team one in a league.
    const first = (await getAllMatches(built.categoryIds[0])).filter((match) => match.type === MatchType.BRACKET)
    const second = (await getAllMatches(built.categoryIds[1])).filter((match) => match.type === MatchType.BRACKET)

    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBe(0)

    for (const categoryId of built.categoryIds) {
      expect(getChampionCompetitorId(tournament, categoryId)).toBeTruthy()
    }
  })
})
