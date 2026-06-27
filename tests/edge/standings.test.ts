import { beforeEach, describe, expect, it } from 'vitest'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import {
  buildTournament,
  getPendingActiveMatches,
  reloadTournament,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

describe('standings — type-specific behavior', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('returns an empty table for pure knockout tournaments', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const tournament = await reloadTournament(built.tournament.id)

    expect(computeStandings(tournament, built.categoryIds[0])).toEqual([])
  })

  it('returns an empty table for a groups+playoff unless a group is specified', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2 }
    })

    await start(built)

    const tournament = await reloadTournament(built.tournament.id)

    // Without a group number the standings are empty...
    expect(computeStandings(tournament, built.categoryIds[0])).toEqual([])
    // ...but a specific group returns a ranked table.
    const group0 = computeStandings(tournament, built.categoryIds[0], 0)

    expect(group0.length).toBeGreaterThan(0)
  })

  it('counts sets and games for a THREE_SETS league', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.THREE_SETS,
      settings: { pointsPerPresent: 0, pointsPerSetWon: 1, pointsPerMatchWon: 2 }
    })

    await start(built)

    // Resolve every match 6-3 6-4 (home wins 2-0).
    for (let guard = 0; guard < 20; guard++) {
      const pending = await getPendingActiveMatches(built.categoryIds)

      if (pending.length === 0) {
        break
      }

      for (const match of pending) {
        await setResult(match.id, {
          sets: [
            { home: 6, away: 3 },
            { home: 6, away: 4 }
          ]
        })
      }
    }

    const tournament = await reloadTournament(built.tournament.id)
    const standings = computeStandings(tournament, built.categoryIds[0])

    expect(standings.length).toBe(4)

    // Sets won/lost must be tracked, and points must follow the formula
    // points = setsWon*1 + wins*2 (pointsPerPresent = 0).
    for (const row of standings) {
      expect((row.setsWon ?? 0) + (row.setsLost ?? 0)).toBe(row.played * 2)
      expect(row.points).toBe((row.setsWon ?? 0) + row.won * 2)
    }
  })

  it('ranks a clear league winner first', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const dominator = built.competitorIds[0]

    // The dominator wins whenever it plays; other matches: home wins.
    for (let guard = 0; guard < 20; guard++) {
      const pending = await getPendingActiveMatches([categoryId])

      if (pending.length === 0) {
        break
      }

      for (const match of pending) {
        const homeIsDominator = match.homeCompetitorIds[0] === dominator
        const awayIsDominator = match.awayCompetitorIds?.[0] === dominator

        if (awayIsDominator) {
          await setResult(match.id, { home: 5, away: 16 })
        } else if (homeIsDominator) {
          await setResult(match.id, { home: 16, away: 5 })
        } else {
          await setResult(match.id, { home: 16, away: 14 })
        }
      }
    }

    const tournament = await reloadTournament(built.tournament.id)
    const standings = computeStandings(tournament, categoryId)

    expect(standings[0].competitorId).toBe(dominator)
    expect(standings[0].won).toBe(3)
  })
})
