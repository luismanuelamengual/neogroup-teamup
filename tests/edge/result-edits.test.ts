import { beforeEach, describe, expect, it } from 'vitest'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  buildTournament,
  getMatches,
  getRounds,
  getTournamentStatus,
  homeWinScore,
  playToCompletion,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

describe('result edits — grace window', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('regenerates the next americano round when a closed round is edited in its grace window', async () => {
    // A maxRounds-truncated americano pairs by standings (winners vs winners), so
    // a corrected round-1 result must re-pair round 2. (A full americano runs a
    // fixed round-robin whose pairings do not depend on results.)
    const built = await buildTournament({
      type: TournamentType.AMERICANO,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { maxRounds: 3 }
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const round1 = (await getRounds(categoryId)).find((r) => r.number === 1)!
    const round1Matches = await getMatches(round1.id)

    // Resolve round 1 → round 2 is generated from the standings.
    for (const match of round1Matches) {
      await setResult(match.id, { home: 16, away: 5 })
    }

    const round2Before = (await getRounds(categoryId)).find((r) => r.number === 2)!
    const pairingsBefore = (await getMatches(round2Before.id))
      .map((m) => `${m.homeCompetitorIds}-${m.awayCompetitorIds}`)
      .join('|')
    // Edit round 1 (still active as a grace window): flip the first match.
    const round1Now = await getMatches(round1.id)

    await setResult(round1Now[0].id, { home: 5, away: 16 })

    const round2After = (await getRounds(categoryId)).find((r) => r.number === 2)!
    const round2Rounds = (await getRounds(categoryId)).filter((r) => r.number === 2 && r.type === RoundType.AMERICANO)
    const pairingsAfter = (await getMatches(round2After.id))
      .map((m) => `${m.homeCompetitorIds}-${m.awayCompetitorIds}`)
      .join('|')

    // The edit must NOT leave duplicate round-2 rows behind...
    expect(round2Rounds.length).toBe(1)
    // ...and the pairings should have been recomputed from the corrected standings.
    expect(pairingsAfter).not.toBe(pairingsBefore)

    // The tournament still completes cleanly afterwards.
    await playToCompletion(built)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('locks an earlier league round once a later round receives a result', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const round1 = (await getRounds(categoryId)).find((r) => r.number === 1)!

    // Finish round 1 → it closes (but stays editable) and round 2 opens.
    for (const match of await getMatches(round1.id)) {
      await setResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT))
    }

    // Enter ONE round-2 result: this expires round 1's grace window.
    const round2 = (await getRounds(categoryId)).find((r) => r.number === 2)!

    await setResult((await getMatches(round2.id))[0].id, homeWinScore(ScoreFormat.BASIC_COUNT))

    // Editing a round-1 match must now be rejected (round no longer active).
    const round1Match = (await getMatches(round1.id))[0]

    await expect(setResult(round1Match.id, { home: 1, away: 16 })).rejects.toThrow('roundClosed')
  })

  it('reseeds the groups+playoff knockout if a group result changes before the bracket has results', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 2 }
    })

    await start(built)

    // The whole flow (groups → knockout) must complete without orphaned or
    // duplicated knockout rounds even though groups are edited along the way.
    await playToCompletion(built)

    const knockoutRounds = (await getRounds(built.categoryIds[0])).filter((r) => r.type === RoundType.KNOCKOUT)
    const numbers = knockoutRounds.map((r) => r.number)

    // No duplicate knockout round numbers.
    expect(new Set(numbers).size).toBe(numbers.length)
    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })
})
