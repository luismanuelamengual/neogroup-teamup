import { beforeEach, describe, expect, it } from 'vitest'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { closeGroupPhase } from '@/app/(protected)/(tournaments)/services/tournaments'
import { isMatchEditable } from '@/app/(protected)/(tournaments)/utils/matches'
import { getGroupPhaseState } from '@/app/(protected)/(tournaments)/utils/tournaments'
import {
  awayWinScore,
  buildTournament,
  BuiltTournament,
  getAllMatches,
  getPendingActiveMatches,
  getTournamentStatus,
  homeWinScore,
  playToCompletion,
  reloadTournament,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

const GROUPS_SETTINGS = {
  competitorsPerGroup: 4,
  qualifiersPerGroup: 2,
  pointsPerPresent: 0,
  pointsPerSetWon: 1,
  pointsPerMatchWon: 1
}

/** A started 8-competitor groups+playoff tournament: 2 groups of 4, top 2 advance. */
async function buildStarted(settings: Record<string, unknown> = {}): Promise<BuiltTournament> {
  const built = await buildTournament({
    type: TournamentType.GROUPS_PLAYOFF,
    competitors: 8,
    scoreFormat: ScoreFormat.BASIC_COUNT,
    settings: { ...GROUPS_SETTINGS, ...settings }
  })

  await start(built)

  return built
}

/** Group matches of a category (the LEAGUE lanes that carry a group index). */
async function groupMatches(categoryId: number) {
  return (await getAllMatches(categoryId)).filter(
    (match) => match.type === MatchType.LEAGUE && match.groupNumber != null
  )
}

/** Knockout (BRACKET lane) matches of a category. */
async function bracketMatches(categoryId: number) {
  return (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.BRACKET)
}

/** Resolves `count` of the currently playable group matches, home always winning. */
async function playSomeGroupMatches(built: BuiltTournament, count: number): Promise<number[]> {
  const playable = (await getPendingActiveMatches(built.categoryIds)).filter(
    (match) => match.type === MatchType.LEAGUE && match.groupNumber != null
  )
  const played: number[] = []

  for (const match of playable.slice(0, count)) {
    await setResult(match.id, homeWinScore(built.tournament.scoreFormat))
    played.push(match.id)
  }

  return played
}

describe('closeGroupPhase — organizer ends the group phase early', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('voids the pending group fixtures and seeds the knockout from the standings so far', async () => {
    const built = await buildStarted()
    const categoryId = built.categoryIds[0]

    await playSomeGroupMatches(built, 2)

    const before = await groupMatches(categoryId)
    const pendingBefore = before.filter((match) => match.status === MatchStatus.PENDING)

    expect(pendingBefore.length).toBeGreaterThan(0)
    expect(await bracketMatches(categoryId)).toHaveLength(0)

    const voided = await closeGroupPhase(await reloadTournament(built.tournament.id), categoryId)

    expect(voided).toBe(pendingBefore.length)

    const after = await groupMatches(categoryId)

    // Nothing is left pending, and the results already loaded are untouched.
    expect(after.some((match) => match.status === MatchStatus.PENDING)).toBe(false)
    expect(after.filter((match) => match.status === MatchStatus.VOID)).toHaveLength(pendingBefore.length)
    expect(after.filter((match) => match.status === MatchStatus.PLAYED)).toHaveLength(2)

    // 2 groups × 2 qualifiers = a 4-competitor bracket: 2 semifinals + 1 final.
    const bracket = await bracketMatches(categoryId)

    expect(bracket).toHaveLength(3)
    expect(bracket.every((match) => match.roundNumber > 0)).toBe(true)
  })

  it('stops the groups from generating another round', async () => {
    const built = await buildStarted()
    const categoryId = built.categoryIds[0]

    await playSomeGroupMatches(built, 2)

    const roundsBefore = new Set((await groupMatches(categoryId)).map((match) => match.roundNumber))

    await closeGroupPhase(await reloadTournament(built.tournament.id), categoryId)

    const roundsAfter = new Set((await groupMatches(categoryId)).map((match) => match.roundNumber))

    expect([...roundsAfter].sort()).toEqual([...roundsBefore].sort())

    // The advance loop runs again on every later result; the groups must stay put.
    await playToCompletion(built)

    const roundsAtTheEnd = new Set((await groupMatches(categoryId)).map((match) => match.roundNumber))

    expect([...roundsAtTheEnd].sort()).toEqual([...roundsBefore].sort())
  })

  it('leaves the voided fixtures unplayable', async () => {
    const built = await buildStarted()
    const categoryId = built.categoryIds[0]

    await playSomeGroupMatches(built, 2)
    await closeGroupPhase(await reloadTournament(built.tournament.id), categoryId)

    const voided = (await groupMatches(categoryId)).filter((match) => match.status === MatchStatus.VOID)
    const all = await getAllMatches(categoryId)
    const tournament = await reloadTournament(built.tournament.id)

    for (const match of voided) {
      expect(isMatchEditable(match, all, tournament.type, tournament.status, tournament.settings)).toBe(false)
      await expect(setResult(match.id, homeWinScore(built.tournament.scoreFormat))).rejects.toThrow()
    }
  })

  it('lets the tournament be played to its champion from there', async () => {
    const built = await buildStarted()
    const categoryId = built.categoryIds[0]

    await playSomeGroupMatches(built, 2)
    await closeGroupPhase(await reloadTournament(built.tournament.id), categoryId)
    await playToCompletion(built)

    expect(await getTournamentStatus(built.tournament.id)).toBe(TournamentStatus.FINISHED)

    // Voided group fixtures never block completion, and the bracket played out.
    const bracket = await bracketMatches(categoryId)

    expect(bracket.every((match) => match.status !== MatchStatus.PENDING)).toBe(true)
  })

  it('rebuilds the bracket when a group result is corrected afterwards', async () => {
    const built = await buildStarted()
    const categoryId = built.categoryIds[0]
    const [firstMatchId] = await playSomeGroupMatches(built, 2)

    await closeGroupPhase(await reloadTournament(built.tournament.id), categoryId)

    expect(await bracketMatches(categoryId)).toHaveLength(3)

    // Correcting a group result drops the bracket so it can be reseeded. With a
    // phase that is short of rounds, that only works because the category is
    // flagged closed — otherwise the reseed would never fire and the category
    // would be left with no knockout at all.
    await setResult(firstMatchId, awayWinScore(built.tournament.scoreFormat))

    expect(await bracketMatches(categoryId)).toHaveLength(3)
  })

  it('refuses a category whose knockout already started', async () => {
    const built = await buildStarted()
    const categoryId = built.categoryIds[0]

    await playToCompletion(built)

    await expect(closeGroupPhase(await reloadTournament(built.tournament.id), categoryId)).rejects.toThrow()
  })

  it('refuses a group phase with no result loaded at all', async () => {
    const built = await buildStarted()

    await expect(closeGroupPhase(await reloadTournament(built.tournament.id), built.categoryIds[0])).rejects.toThrow()
  })

  it('refuses a tournament that is not groups + playoff', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 6,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    await expect(closeGroupPhase(await reloadTournament(built.tournament.id), built.categoryIds[0])).rejects.toThrow()
  })

  it('only closes the category it was asked to', async () => {
    const built = await buildTournament({
      type: TournamentType.GROUPS_PLAYOFF,
      categories: [8, 8],
      scoreFormat: ScoreFormat.BASIC_COUNT,
      settings: GROUPS_SETTINGS
    })

    await start(built)

    const [firstCategoryId, secondCategoryId] = built.categoryIds

    await playSomeGroupMatches(built, 4)
    await closeGroupPhase(await reloadTournament(built.tournament.id), firstCategoryId)

    expect((await getGroupPhaseState(firstCategoryId)).knockoutStarted).toBe(true)

    const second = await getGroupPhaseState(secondCategoryId)

    expect(second.knockoutStarted).toBe(false)
    expect(second.pendingMatches).toBeGreaterThan(0)
  })

  it('keeps an unordered group phase closed instead of re-opening its fixtures', async () => {
    const built = await buildStarted({ allowUnorderedResults: true, maxRounds: 3 })
    const categoryId = built.categoryIds[0]

    await playSomeGroupMatches(built, 2)
    await closeGroupPhase(await reloadTournament(built.tournament.id), categoryId)

    const voidedRightAfter = (await groupMatches(categoryId)).filter(
      (match) => match.status === MatchStatus.VOID
    ).length

    expect(voidedRightAfter).toBeGreaterThan(0)

    // Playing the bracket runs the advance loop again and again; the quota-based
    // void pass must not hand the cancelled group fixtures back as PENDING.
    await playToCompletion(built)

    const after = await groupMatches(categoryId)

    expect(after.some((match) => match.status === MatchStatus.PENDING)).toBe(false)
  })
})
