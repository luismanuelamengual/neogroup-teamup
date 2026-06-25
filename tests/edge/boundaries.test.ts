import { beforeEach, describe, expect, it } from 'vitest'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getChampionCompetitorId } from '@/app/(protected)/(tournaments)/utils/champion'
import {
  buildTournament,
  getAllMatches,
  getRounds,
  getTournamentStatus,
  playToCompletion,
  reloadTournament,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

const ALL_TYPES = [
  TournamentType.LEAGUE,
  TournamentType.AMERICANO,
  TournamentType.AMERICANO_WITH_SWAP,
  TournamentType.PLAYOFF,
  TournamentType.PLAYOFF_WITH_CONSOLATION,
  TournamentType.GROUPS_PLAYOFF
]

describe('boundaries — minimum field', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const type of ALL_TYPES) {
    it(`refuses to start ${TournamentType[type]} with a single competitor`, async () => {
      const built = await buildTournament({ type, competitors: 1, scoreFormat: ScoreFormat.BASIC_COUNT })

      await expect(start(built)).rejects.toThrow('notEnoughCompetitors')
    })
  }

  // AMERICANO_WITH_SWAP needs at least four individuals to form two teams, so it
  // is excluded from the two-competitor case (covered separately below).
  for (const type of ALL_TYPES.filter((t) => t !== TournamentType.AMERICANO_WITH_SWAP)) {
    it(`completes ${TournamentType[type]} with exactly two competitors`, async () => {
      const built = await buildTournament({ type, competitors: 2, scoreFormat: ScoreFormat.BASIC_COUNT })

      await start(built)
      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
    })
  }

  // Swap americano requires four individuals (two teams). Fewer cannot generate a
  // single match; the engine currently surfaces a generic 'noMatchesGenerated'
  // error at START time rather than validating the field size up front
  // (see FINDINGS.md, observation O1).
  for (const n of [2, 3]) {
    it(`cannot start a swap americano with only ${n} individuals`, async () => {
      const built = await buildTournament({
        type: TournamentType.AMERICANO_WITH_SWAP,
        competitors: n,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await expect(start(built)).rejects.toThrow('noMatchesGenerated')
    })
  }

  it('completes a swap americano with the minimum of four individuals', async () => {
    const built = await buildTournament({
      type: TournamentType.AMERICANO_WITH_SWAP,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })
})

describe('boundaries — degenerate groups', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('handles a groups+playoff where one group has a single competitor', async () => {
    // 3 competitors, groups of 2 → group sizes [2, 1]. The lone competitor must
    // still qualify and the knockout must be produced.
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 3,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 2, qualifiersPerGroup: 1 }
    })

    await start(built)
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    const knockout = (await getRounds(built.categoryIds[0])).filter((r) => r.type === RoundType.KNOCKOUT)

    expect(knockout.length).toBeGreaterThan(0)
    expect(getChampionCompetitorId(await reloadTournament(built.tournament.id))).not.toBeNull()
  })

  it('caps qualifiers to the group size when qualifiersPerGroup is too large', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: { competitorsPerGroup: 4, qualifiersPerGroup: 99 }
    })

    await start(built)
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })
})

describe('boundaries — editing after the tournament ends', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('rejects a result edit once the tournament is finished', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    const anyMatch = (await getAllMatches(built.categoryIds[0]))[0]

    await expect(setResult(anyMatch.id, { home: 1, away: 16 })).rejects.toThrow('invalidStatus')
  })
})
