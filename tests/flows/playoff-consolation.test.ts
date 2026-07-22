import { beforeEach, describe, expect, it } from 'vitest'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getChampionCompetitorId } from '@/app/(protected)/(tournaments)/utils/champion'
import {
  awayWinScore,
  buildTournament,
  competitorsInMatches,
  getAllMatches,
  getMatches,
  getRounds,
  getTournamentStatus,
  hasNoDoubleBooking,
  homeWinScore,
  playToCompletion,
  reloadTournament,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

describe('PLAYOFF_WITH_CONSOLATION — full flows', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  for (const n of [4, 8, 16]) {
    it(`builds and completes both brackets for ${n} competitors`, async () => {
      const built = await buildTournament({
        type: TournamentType.PLAYOFF_WITH_CONSOLATION,
        competitors: n,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await start(built)
      await playToCompletion(built)

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const categoryId = built.categoryIds[0]
      const rounds = await getRounds(categoryId)
      const mainRounds = rounds.filter((r) => r.type === MatchType.BRACKET)
      const consolationRounds = rounds.filter((r) => r.type === MatchType.CONSOLATION_BRACKET)

      // The consolation bracket must have been created (first-round losers play on).
      expect(mainRounds.length).toBeGreaterThan(0)
      expect(consolationRounds.length).toBeGreaterThan(0)

      // Everything is resolved.
      const all = await getAllMatches(categoryId)

      expect(all.every((m) => m.status !== MatchStatus.PENDING)).toBe(true)

      // Main champion exists.
      const tournament = await reloadTournament(built.tournament.id)

      expect(getChampionCompetitorId(tournament)).not.toBeNull()
    })
  }

  // Non-power-of-two fields (byes in round 1) exercise the bye→void/walkover
  // paths of the consolation skeleton at scale, with upsets thrown in so both
  // "bye player wins" (void) and "bye player loses" (fills in) happen a lot.
  for (const n of [3, 5, 6, 7, 9, 11]) {
    it(`builds and completes both brackets for ${n} competitors (byes + upsets)`, async () => {
      const built = await buildTournament({
        type: TournamentType.PLAYOFF_WITH_CONSOLATION,
        competitors: n,
        scoreFormat: ScoreFormat.BASIC_COUNT
      })

      await start(built)

      const categoryId = built.categoryIds[0]
      const consolationBefore = (await getRounds(categoryId)).filter((r) => r.type === MatchType.CONSOLATION_BRACKET)

      // Visible from the start, with n >= 3 (there's always room for at least one
      // consolation slot pair once there is at least one bye or two round-1 matches).
      expect(consolationBefore.length).toBeGreaterThan(0)

      // Alternate winners so upsets happen (odd-indexed resolutions go to "away").
      let call = 0

      await playToCompletion(built, { decide: () => (call++ % 2 === 0 ? 'home' : 'away') })

      expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

      const all = await getAllMatches(categoryId)

      expect(all.every((m) => m.status !== MatchStatus.PENDING)).toBe(true)

      const tournament = await reloadTournament(built.tournament.id)

      expect(getChampionCompetitorId(tournament)).not.toBeNull()
    })
  }

  it('seeds the consolation bracket from the first-round losers', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF_WITH_CONSOLATION,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const rounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)
    const round1 = rounds.find((r) => r.number === 1)!
    const round1Matches = await getMatches(round1.id)
    // Resolve round 1 (home wins) to know who the losers are.
    const expectedLosers: number[] = []

    for (const match of round1Matches) {
      if (match.awayCompetitorIds && match.awayCompetitorIds.length > 0) {
        expectedLosers.push(match.awayCompetitorIds[0])
        await setResult(match.id, homeWinScore(ScoreFormat.BASIC_COUNT))
      }
    }

    // Now the consolation bracket should be seeded with exactly those losers.
    const consolationRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.CONSOLATION_BRACKET)

    expect(consolationRounds.length).toBeGreaterThan(0)

    const consolationFirst = consolationRounds.sort((a, b) => a.number - b.number)[0]
    const consolationMatches = await getMatches(consolationFirst.id)
    const consolationCompetitors = new Set<number>()

    for (const match of consolationMatches) {
      match.homeCompetitorIds.forEach((id) => consolationCompetitors.add(id))
      match.awayCompetitorIds?.forEach((id) => consolationCompetitors.add(id))
    }

    for (const loser of expectedLosers) {
      expect(consolationCompetitors.has(loser)).toBe(true)
    }

    expect(hasNoDoubleBooking(consolationMatches)).toBe(true)
  })

  it('shows the consolation bracket right from "Iniciar torneo", before any result is loaded', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF_WITH_CONSOLATION,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const consolationRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.CONSOLATION_BRACKET)

    // The skeleton exists immediately — nobody has played a single match yet.
    expect(consolationRounds.length).toBeGreaterThan(0)

    const allConsolationMatches = (await Promise.all(consolationRounds.map((round) => getMatches(round.id)))).flat()

    // Every slot is still "to be defined": no competitor known on either side.
    for (const match of allConsolationMatches) {
      expect(match.homeCompetitorIds.length).toBe(0)
      expect(match.awayCompetitorIds).toEqual([])
      expect(match.status).toBe(MatchStatus.PENDING)
    }
  })

  it('fills a consolation slot as soon as its own first-round match is resolved, independently of the rest of the round', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF_WITH_CONSOLATION,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const mainRound1 = (await getRounds(categoryId)).find((r) => r.type === MatchType.BRACKET && r.number === 1)!
    const round1Matches = await getMatches(mainRound1.id)
    const [firstMatch] = round1Matches

    await setResult(firstMatch.id, homeWinScore(ScoreFormat.BASIC_COUNT))

    const consolationFirst = (await getRounds(categoryId))
      .filter((r) => r.type === MatchType.CONSOLATION_BRACKET)
      .sort((a, b) => a.number - b.number)[0]
    const consolationMatches = await getMatches(consolationFirst.id)
    // Exactly one slot got filled (the loser of the single match we resolved) —
    // the rest of the round is still untouched, no need to wait for it.
    const partiallyKnown = consolationMatches.filter(
      (m) => m.homeCompetitorIds.length > 0 || (m.awayCompetitorIds?.length ?? 0) > 0
    )

    expect(partiallyKnown.length).toBe(1)
    expect(competitorsInMatches(partiallyKnown)).toEqual([firstMatch.awayCompetitorIds![0]])
    // Still not a playable match (the other side is unresolved) and not touched status-wise.
    expect(partiallyKnown[0].status).toBe(MatchStatus.PENDING)
  })

  it('resolves a bye-vs-real consolation slot the way the byegone player would expect', async () => {
    // 3 competitors, bracket size 4 → round 1 has one bye and one real match, and
    // the consolation bracket has a single match fed by both.
    const built = await buildTournament({
      type: TournamentType.PLAYOFF_WITH_CONSOLATION,
      competitors: 3,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const mainRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)
    const round1 = mainRounds.find((r) => r.number === 1)!
    const round1Matches = await getMatches(round1.id)
    const byeMatch = round1Matches.find((m) => m.awayCompetitorIds === null)!
    const realMatch = round1Matches.find((m) => m.awayCompetitorIds !== null)!

    expect(byeMatch).toBeDefined()
    expect(realMatch).toBeDefined()

    // Resolving the real match immediately fills its slot, well before the bye
    // player's own fate (the main final) is known.
    await setResult(realMatch.id, homeWinScore(ScoreFormat.BASIC_COUNT))

    const consolationRound = (await getRounds(categoryId)).find((r) => r.type === MatchType.CONSOLATION_BRACKET)!
    const [consolationMatch] = await getMatches(consolationRound.id)
    const realLoserId = realMatch.awayCompetitorIds![0]

    expect(competitorsInMatches([consolationMatch])).toEqual([realLoserId])
    expect(consolationMatch.status).toBe(MatchStatus.PENDING)

    // Now the bye player wins the main final: their consolation slot is
    // confirmed void, and the other slot's walkover becomes the whole story —
    // no consolation match is ever actually played.
    const round2 = mainRounds.find((r) => r.number === 2)!
    const [finalMatch] = await getMatches(round2.id)

    await setResult(finalMatch.id, homeWinScore(ScoreFormat.BASIC_COUNT))

    const consolationAfter = (await getMatches(consolationRound.id))[0]

    expect(consolationAfter.status).toBe(MatchStatus.WALKOVER)
    expect(consolationAfter.winner).toBe(MatchSide.HOME)
    expect(consolationAfter.homeCompetitorIds).toEqual([realLoserId])
    expect(consolationAfter.awayCompetitorIds).toBeNull()
  })

  it('turns into a real playable consolation match when the bye player loses instead', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF_WITH_CONSOLATION,
      competitors: 3,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const mainRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.BRACKET)
    const round1Matches = await getMatches(mainRounds.find((r) => r.number === 1)!.id)
    const realMatch = round1Matches.find((m) => m.awayCompetitorIds !== null)!

    await setResult(realMatch.id, homeWinScore(ScoreFormat.BASIC_COUNT))

    const round2Match = (await getMatches(mainRounds.find((r) => r.number === 2)!.id))[0]

    // The bye player (home of the final) loses this time.
    await setResult(round2Match.id, awayWinScore(ScoreFormat.BASIC_COUNT))

    const consolationRound = (await getRounds(categoryId)).find((r) => r.type === MatchType.CONSOLATION_BRACKET)!
    const consolationMatch = (await getMatches(consolationRound.id))[0]

    // Both slots are now known and it is a genuine, playable match.
    expect(consolationMatch.status).toBe(MatchStatus.PENDING)
    expect(consolationMatch.homeCompetitorIds.length).toBe(1)
    expect(consolationMatch.awayCompetitorIds?.length).toBe(1)

    await setResult(consolationMatch.id, homeWinScore(ScoreFormat.BASIC_COUNT))
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)
  })

  it('re-resolves the affected consolation slot when a still-unconsumed main-bracket result is corrected', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF_WITH_CONSOLATION,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]
    const mainRound1 = (await getRounds(categoryId)).find((r) => r.type === MatchType.BRACKET && r.number === 1)!
    const [firstMatch] = await getMatches(mainRound1.id)
    const originalLoserId = firstMatch.awayCompetitorIds![0]

    await setResult(firstMatch.id, homeWinScore(ScoreFormat.BASIC_COUNT))

    // Correct the result before the main round 2 has consumed it (grace window).
    await setResult(firstMatch.id, awayWinScore(ScoreFormat.BASIC_COUNT))

    const correctedLoserId = firstMatch.homeCompetitorIds[0]
    const consolationRounds = (await getRounds(categoryId)).filter((r) => r.type === MatchType.CONSOLATION_BRACKET)
    // No orphaned/duplicate consolation rounds from the delete+rebuild.
    const roundNumbers = consolationRounds.map((r) => r.number)

    expect(new Set(roundNumbers).size).toBe(roundNumbers.length)

    const consolationFirst = consolationRounds.sort((a, b) => a.number - b.number)[0]
    const consolationCompetitors = competitorsInMatches(await getMatches(consolationFirst.id))

    expect(consolationCompetitors).toContain(correctedLoserId)
    expect(consolationCompetitors).not.toContain(originalLoserId)
  })
})
