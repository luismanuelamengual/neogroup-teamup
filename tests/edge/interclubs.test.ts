import { beforeEach, describe, expect, it } from 'vitest'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { assignSiteLabels, updateTeamRoster } from '@/app/(protected)/(tournaments)/services/registrations'
import { InterclubsMode, resolveInterclubsFormat } from '@/app/(protected)/(tournaments)/utils/interclubs'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import {
  buildTournament,
  createSite,
  createUser,
  getAllMatches,
  playToCompletion,
  reloadTournament,
  resetDatabase,
  seriesScore,
  setResult,
  start
} from '@/tests/setup/harness'

describe('INTERCLUBS — format boundary', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('plays 4 teams as a home-and-away league, with no zones', async () => {
    expect(resolveInterclubsFormat(4).mode).toBe(InterclubsMode.DOUBLE_LEAGUE)

    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    const matches = await getAllMatches(built.categoryIds[0])

    expect(matches.some((match) => match.type === MatchType.BRACKET)).toBe(false)
    // 6 pairings × 2 legs.
    expect(matches).toHaveLength(12)
  })

  it('switches to zones plus knockout at 5 teams', async () => {
    expect(resolveInterclubsFormat(5).mode).toBe(InterclubsMode.GROUPS_PLAYOFF)

    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 5,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    const matches = await getAllMatches(built.categoryIds[0])
    const zone = matches.filter((match) => match.type === MatchType.LEAGUE)
    const bracket = matches.filter((match) => match.type === MatchType.BRACKET)

    // A single zone of five (10 pairings, one leg) and a top-4 knockout.
    expect(zone).toHaveLength(10)
    expect(bracket).toHaveLength(3)
  })
})

describe('INTERCLUBS — walkovers and corrections', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('accepts a walkover for a whole series and still crowns a champion', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 3,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const first = (await getAllMatches(built.categoryIds[0])).find((match) => match.status === MatchStatus.PENDING)!

    await setResult(first.id, { walkover: MatchSide.HOME })

    const walkedOver = (await getAllMatches(built.categoryIds[0])).find((match) => match.id === first.id)!

    expect(walkedOver.status).toBe(MatchStatus.WALKOVER)
    expect(walkedOver.winner).toBe(MatchSide.HOME)

    await playToCompletion(built)

    const tournament = await reloadTournament(built.tournament.id)
    const rows = computeStandings(tournament, built.categoryIds[0])

    // The walkover counted as an encounter but contributed no individual matches.
    expect(rows.reduce((total, row) => total + row.points, 0)).toBe(6)
  })

  it('rejects a plain (non-series) result on an interclubes match', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 3,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const match = (await getAllMatches(built.categoryIds[0])).find((entry) => entry.status === MatchStatus.PENDING)!

    await expect(setResult(match.id, { home: 16, away: 8 })).rejects.toThrow('invalidScore')
  })

  it('rejects a series naming a player of the other team', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 3,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const match = (await getAllMatches(built.categoryIds[0])).find((entry) => entry.status === MatchStatus.PENDING)!
    const homeRoster = built.rosterByCompetitorId.get(match.homeCompetitorId!)!
    const awayRoster = built.rosterByCompetitorId.get(match.awayCompetitorId!)!
    const score = seriesScore(ScoreFormat.BASIC_COUNT, homeRoster, awayRoster, 2)

    // Swap in a player who belongs to the visiting team.
    score.matches![1].homePlayerIds = [awayRoster[3]]

    await expect(setResult(match.id, score)).rejects.toThrow('invalidScore')
  })

  it('reseeds the knockout when a zone result is corrected', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 8,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)

    const categoryId = built.categoryIds[0]

    // Play the whole zone phase; the bracket is seeded from it.
    for (let guard = 0; guard < 50; guard++) {
      const pending = (await getAllMatches(categoryId)).filter(
        (match) => match.type === MatchType.LEAGUE && match.status === MatchStatus.PENDING
      )

      if (pending.length === 0) {
        break
      }

      await playToCompletion(built, { maxIterations: 1 })
    }

    const bracketBefore = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.BRACKET)

    expect(bracketBefore.length).toBeGreaterThan(0)

    // Flip the last zone result while the bracket still holds no results.
    const lastZoneMatch = (await getAllMatches(categoryId))
      .filter((match) => match.type === MatchType.LEAGUE)
      .sort((a, b) => b.roundNumber - a.roundNumber || b.id - a.id)[0]
    const homeRoster = built.rosterByCompetitorId.get(lastZoneMatch.homeCompetitorId!)!
    const awayRoster = built.rosterByCompetitorId.get(lastZoneMatch.awayCompetitorId!)!

    await setResult(lastZoneMatch.id, seriesScore(ScoreFormat.BASIC_COUNT, homeRoster, awayRoster, 0))

    const bracketAfter = (await getAllMatches(categoryId)).filter((match) => match.type === MatchType.BRACKET)

    // The bracket was rebuilt (same shape) and still holds no result.
    expect(bracketAfter).toHaveLength(bracketBefore.length)
    expect(bracketAfter.every((match) => match.status === MatchStatus.PENDING)).toBe(true)
  })
})

describe('INTERCLUBS — team labels through the lifecycle', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('labels a lone team with the plain venue name', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 2,
      sites: ['Alemán', 'Belgrano'],
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const competitors = await Competitor.withoutGlobalScopes()
      .where('tournamentCategoryId', built.categoryIds[0])
      .orderBy('id')
      .get()

    expect(competitors.map((competitor) => competitor.label)).toEqual(['Alemán', 'Belgrano'])
    expect(competitors[0].displayName).toBe('Alemán')
  })

  it('adds letters when a venue enters two teams', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 3,
      sites: ['Alemán', 'Belgrano', 'Alemán'],
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const competitors = await Competitor.withoutGlobalScopes()
      .where('tournamentCategoryId', built.categoryIds[0])
      .orderBy('id')
      .get()

    expect(competitors.map((competitor) => competitor.label)).toEqual(['Alemán A', 'Belgrano', 'Alemán B'])
  })

  it('drops the letter again when the sibling team leaves', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 3,
      sites: ['Alemán', 'Belgrano', 'Alemán'],
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const categoryId = built.categoryIds[0]
    const competitors = await Competitor.withoutGlobalScopes()
      .where('tournamentCategoryId', categoryId)
      .orderBy('id')
      .get()
    const second = competitors.find((competitor) => competitor.label === 'Alemán B')!

    await second.delete()
    await assignSiteLabels(categoryId)

    const remaining = await Competitor.withoutGlobalScopes()
      .where('tournamentCategoryId', categoryId)
      .orderBy('id')
      .get()

    expect(remaining.map((competitor) => competitor.label)).toEqual(['Alemán', 'Belgrano'])
  })

  it('keeps the same venue name in two different categories', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      categories: [2, 2],
      sites: ['Alemán', 'Belgrano', 'Alemán', 'Belgrano'],
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    for (const categoryId of built.categoryIds) {
      const competitors = await Competitor.withoutGlobalScopes()
        .where('tournamentCategoryId', categoryId)
        .orderBy('id')
        .get()

      // Labels are scoped to the category, so both categories have a plain
      // "Alemán" — they never meet each other.
      expect(competitors.map((competitor) => competitor.label)).toEqual(['Alemán', 'Belgrano'])
    }
  })

  it('leaves teams unlabelled when their venue disappeared', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 2,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const categoryId = built.categoryIds[0]
    const orphanSiteId = await createSite(1, 'Temporal')
    const [first] = await Competitor.withoutGlobalScopes().where('tournamentCategoryId', categoryId).orderBy('id').get()

    first.data = { siteId: orphanSiteId + 999 }
    await first.save()
    await assignSiteLabels(categoryId)

    const reloaded = await Competitor.withoutGlobalScopes().where('id', first.id).first()

    expect(reloaded!.label).toBeNull()
    // Falls back to the roster-based name.
    expect(reloaded!.displayName).toBe('')
  })
})

describe('INTERCLUBS — captain edits their own team roster', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  /** Reloads a tournament with its competitors, the same way the API route does. */
  async function loadWithCompetitors(tournamentId: number): Promise<Tournament> {
    return (await Tournament.where('id', tournamentId).with('competitors').first())!
  }

  it('lets the captain add a team mate', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 2,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const [captainId, ...mates] = built.rosterByCompetitorId.get(built.competitorIds[0])!
    const newMate = await createUser(built.tournament.organizationId)
    const tournament = await loadWithCompetitors(built.tournament.id)

    await updateTeamRoster(tournament, captainId, [...mates, newMate])

    const [team] = await Competitor.withoutGlobalScopes().where('id', built.competitorIds[0]).get()

    expect(team.playerIds).toEqual([captainId, ...mates, newMate])
  })

  it('lets the captain remove a team mate, as long as the minimum roster holds', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 2,
      playersPerCompetitor: 5,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const [captainId, ...mates] = built.rosterByCompetitorId.get(built.competitorIds[0])!
    const tournament = await loadWithCompetitors(built.tournament.id)

    await updateTeamRoster(tournament, captainId, mates.slice(0, 3))

    const [team] = await Competitor.withoutGlobalScopes().where('id', built.competitorIds[0]).get()

    expect(team.playerIds).toEqual([captainId, ...mates.slice(0, 3)])
  })

  it('rejects dropping the roster below the minimum size', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 2,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const [captainId, ...mates] = built.rosterByCompetitorId.get(built.competitorIds[0])!
    const tournament = await loadWithCompetitors(built.tournament.id)

    await expect(updateTeamRoster(tournament, captainId, mates.slice(0, 1))).rejects.toThrow('al menos')
  })

  it('rejects a non-captain team mate editing the roster', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 2,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const [, ...mates] = built.rosterByCompetitorId.get(built.competitorIds[0])!
    const tournament = await loadWithCompetitors(built.tournament.id)

    await expect(updateTeamRoster(tournament, mates[0], mates)).rejects.toThrow('No sos capitán')
  })

  it('rejects adding a player already registered in another team', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 2,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const [captainId, ...mates] = built.rosterByCompetitorId.get(built.competitorIds[0])!
    const [otherCaptainId] = built.rosterByCompetitorId.get(built.competitorIds[1])!
    const tournament = await loadWithCompetitors(built.tournament.id)

    await expect(updateTeamRoster(tournament, captainId, [...mates, otherCaptainId])).rejects.toThrow(
      'ya está inscripto'
    )
  })

  it('rejects editing the roster once the tournament has started', async () => {
    const built = await buildTournament({
      type: TournamentType.INTERCLUBS,
      competitors: 2,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })
    const [captainId, ...mates] = built.rosterByCompetitorId.get(built.competitorIds[0])!

    await start(built)

    const tournament = await loadWithCompetitors(built.tournament.id)

    await expect(updateTeamRoster(tournament, captainId, mates)).rejects.toThrow('Torneo ya iniciado')
  })
})
