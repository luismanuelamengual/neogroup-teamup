import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getHeadToHeadMatches } from '@/app/(protected)/(head-to-head)/services/headToHead'
import { isSameRoster, parseHeadToHeadSide } from '@/app/(protected)/(head-to-head)/utils/headToHead'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { flipScore } from '@/app/(protected)/(tournaments)/utils/score'
import {
  awayWinScore,
  buildTournament,
  BuiltTournament,
  getAllMatches,
  homeWinScore,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'
import { setTestSession } from '@/tests/setup/stubs/auth-service'

const ORGANIZATION_ID = 1
const OTHER_ORGANIZATION_ID = ORGANIZATION_ID + 1
const FORMAT = ScoreFormat.BASIC_COUNT

/** Overwrites a competitor's roster, so two tournaments can hold the same people. */
async function setRoster(competitorId: number, playerIds: number[]): Promise<void> {
  const competitor = await Competitor.where('id', competitorId).first()

  competitor!.playerIds = playerIds
  await competitor!.save()
}

/** The first playable match of a started tournament. */
async function firstMatch(built: BuiltTournament) {
  const [match] = await getAllMatches(built.categoryIds[0]!)

  return match!
}

/**
 * The head-to-head spans every tournament of the organization, so these tests
 * build several and re-point their competitors at the same players — which is
 * exactly what happens in real life when the same two rivals sign up again.
 */
describe('getHeadToHeadMatches', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  // Test files share one process, so a session left set would start filtering
  // every later query in the run — see the stub's own note.
  afterEach(() => {
    setTestSession(null)
  })

  it('collects the encounters of both tournaments, newest first', async () => {
    const first = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

    await start(first)

    const firstTarget = await firstMatch(first)
    const [playerA] = first.rosterByCompetitorId.get(firstTarget.homeCompetitorId!)!
    const [playerB] = first.rosterByCompetitorId.get(firstTarget.awayCompetitorId!)!

    await setResult(firstTarget.id, homeWinScore(FORMAT))

    // A second tournament where the SAME two players meet again.
    const second = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

    await start(second)

    const secondTarget = await firstMatch(second)

    await setRoster(secondTarget.homeCompetitorId!, [playerB!])
    await setRoster(secondTarget.awayCompetitorId!, [playerA!])
    await setResult(secondTarget.id, homeWinScore(FORMAT))

    const matches = await getHeadToHeadMatches([playerA!], [playerB!])

    expect(matches.map((match) => match.id).sort()).toEqual([firstTarget.id, secondTarget.id].sort())
    // Both competitors come resolved, which is what lets a caller tell which of
    // the two sides played at home in each match.
    expect(matches.every((match) => match.homeCompetitor != null && match.awayCompetitor != null)).toBe(true)
    // And so does the tournament each one belongs to, so the caller can name it.
    expect(matches.every((match) => match.tournamentCategory?.tournament != null)).toBe(true)
  })

  it('returns each match as stored, leaving the orientation to the caller', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

    await start(built)

    const target = await firstMatch(built)
    const [playerA] = built.rosterByCompetitorId.get(target.homeCompetitorId!)!
    const [playerB] = built.rosterByCompetitorId.get(target.awayCompetitorId!)!

    await setResult(target.id, homeWinScore(FORMAT))

    // Asked from B's point of view, the match still comes back with A at home:
    // it is the stored match, and B's own view flips it (see flipScore below).
    const [match] = await getHeadToHeadMatches([playerB!], [playerA!])

    expect(match!.homeCompetitor!.playerIds).toEqual([playerA])
    expect(match!.winner).toBe(MatchSide.HOME)
  })

  it('serializes into the MatchDto shape the endpoint promises', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

    await start(built)

    const target = await firstMatch(built)
    const [playerA] = built.rosterByCompetitorId.get(target.homeCompetitorId!)!
    const [playerB] = built.rosterByCompetitorId.get(target.awayCompetitorId!)!

    await setResult(target.id, homeWinScore(FORMAT))

    const [match] = await getHeadToHeadMatches([playerA!], [playerB!])
    // The route returns the entities and Next serializes them, so what the view
    // actually receives is this — eager-loaded relations included. Asserting on
    // the JSON rather than on the entity is what pins that contract.
    const dto = JSON.parse(JSON.stringify(match)) as MatchDto

    expect(dto.homeCompetitor?.playerIds).toEqual([playerA])
    expect(dto.awayCompetitor?.playerIds).toEqual([playerB])
    expect(dto.tournamentCategory?.tournament?.name).toBeTruthy()
    expect(dto.tournamentCategory?.tournament?.scoreFormat).toBe(FORMAT)
    // The rosters are all the sides are needed for, so no user row rides along
    // — which is also what keeps password hashes out of the response.
    expect(JSON.stringify(dto)).not.toContain('passwordHash')
  })

  it('ignores matches the two sides did not play against each other', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

    await start(built)

    const matches = await getAllMatches(built.categoryIds[0]!)
    const [first, second] = matches

    await setResult(first!.id, homeWinScore(FORMAT))
    await setResult(second!.id, awayWinScore(FORMAT))

    const [playerA] = built.rosterByCompetitorId.get(first!.homeCompetitorId!)!
    // A rival from the OTHER side of the bracket: they have not met yet.
    const [playerC] = built.rosterByCompetitorId.get(second!.homeCompetitorId!)!

    expect(await getHeadToHeadMatches([playerA!], [playerC!])).toEqual([])
  })

  it('matches a doubles pair only against the exact rival pair', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      competitors: 4,
      playersPerCompetitor: 2,
      scoreFormat: FORMAT
    })

    await start(built)

    const target = await firstMatch(built)
    const homeRoster = built.rosterByCompetitorId.get(target.homeCompetitorId!)!
    const awayRoster = built.rosterByCompetitorId.get(target.awayCompetitorId!)!

    await setResult(target.id, homeWinScore(FORMAT))

    expect(await getHeadToHeadMatches(homeRoster, awayRoster)).toHaveLength(1)

    // Same two players on the away side, but one of them partnered with
    // somebody else: that pair never played this match.
    const otherPair = [awayRoster[0]!, homeRoster[1]!]

    expect(await getHeadToHeadMatches(homeRoster, otherPair)).toEqual([])
  })

  it('never leaks an encounter from another organization', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

    await start(built)

    const target = await firstMatch(built)
    const [playerA] = built.rosterByCompetitorId.get(target.homeCompetitorId!)!
    const [playerB] = built.rosterByCompetitorId.get(target.awayCompetitorId!)!

    await setResult(target.id, homeWinScore(FORMAT))
    // Signed in at another club. The organization hangs off the tournament and
    // is reached through a `whereHas` subquery, which neorm builds WITHOUT the
    // related entity's global scopes — so this covers a condition the service
    // has to apply by hand, and that nothing else would catch if it were lost.
    setTestSession({ user: { id: built.ownerId, organizationId: OTHER_ORGANIZATION_ID } })

    expect(await getHeadToHeadMatches([playerA!], [playerB!])).toEqual([])
  })

  it('finds the encounter for a user of the organization it belongs to', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4, scoreFormat: FORMAT })

    await start(built)

    const target = await firstMatch(built)
    const [playerA] = built.rosterByCompetitorId.get(target.homeCompetitorId!)!
    const [playerB] = built.rosterByCompetitorId.get(target.awayCompetitorId!)!

    await setResult(target.id, homeWinScore(FORMAT))
    setTestSession({ user: { id: built.ownerId, organizationId: ORGANIZATION_ID } })

    expect(await getHeadToHeadMatches([playerA!], [playerB!])).toHaveLength(1)
  })

  it('returns nothing for a side facing itself', async () => {
    expect(await getHeadToHeadMatches([1, 2], [2, 1])).toEqual([])
  })
})

describe('flipScore', () => {
  it('mirrors a sets score', () => {
    const flipped = flipScore({
      sets: [
        { home: 6, away: 3 },
        { home: 4, away: 6 }
      ]
    })

    expect(flipped?.sets).toEqual([
      { home: 3, away: 6 },
      { home: 6, away: 4 }
    ])
  })

  it('mirrors a basic count and a walkover', () => {
    expect(flipScore({ home: 9, away: 4 })).toMatchObject({ home: 4, away: 9 })
    expect(flipScore({ walkover: MatchSide.HOME })?.walkover).toBe(MatchSide.AWAY)
  })

  it('mirrors an interclubes series, rosters included', () => {
    const flipped = flipScore({
      home: 1,
      away: 0,
      matches: [
        {
          double: false,
          homePlayerIds: [1],
          awayPlayerIds: [5],
          score: { sets: [{ home: 6, away: 2 }] },
          winner: MatchSide.HOME
        }
      ]
    })
    const [entry] = flipped?.matches ?? []

    expect(flipped).toMatchObject({ home: 0, away: 1 })
    expect(entry).toMatchObject({ homePlayerIds: [5], awayPlayerIds: [1], winner: MatchSide.AWAY })
    expect(entry?.score.sets).toEqual([{ home: 2, away: 6 }])
  })

  it('leaves a missing score alone', () => {
    expect(flipScore(null)).toBeNull()
  })
})

describe('parseHeadToHeadSide', () => {
  it('parses a singles player and a doubles roster', () => {
    expect(parseHeadToHeadSide('7')).toEqual([7])
    expect(parseHeadToHeadSide('1,2')).toEqual([1, 2])
    expect(parseHeadToHeadSide(' 1 , 2 ')).toEqual([1, 2])
  })

  it('rejects anything that is not a list of distinct positive ids', () => {
    expect(parseHeadToHeadSide('')).toBeNull()
    expect(parseHeadToHeadSide('abc')).toBeNull()
    expect(parseHeadToHeadSide('1,1')).toBeNull()
    expect(parseHeadToHeadSide('0')).toBeNull()
    expect(parseHeadToHeadSide('-3')).toBeNull()
    expect(parseHeadToHeadSide('1.5')).toBeNull()
  })
})

describe('isSameRoster', () => {
  it('ignores order but not membership', () => {
    expect(isSameRoster([1, 2], [2, 1])).toBe(true)
    expect(isSameRoster([1, 2], [1, 3])).toBe(false)
    expect(isSameRoster([1], [1, 2])).toBe(false)
  })
})
