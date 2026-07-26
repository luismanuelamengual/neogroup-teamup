import { describe, expect, it } from 'vitest'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  assignLocality,
  buildSiteLabels,
  describeInterclubsFormat,
  getTeamLabelSuffix,
  InterclubsMode,
  LocalityMatch,
  resolveInterclubsFormat,
  resolveLocality
} from '@/app/(protected)/(tournaments)/utils/interclubs'
import {
  formatScore,
  getScoreWinner,
  getSeriesMatchesWon,
  getSetsWon,
  isValidScore,
  normalizeScore
} from '@/app/(protected)/(tournaments)/utils/score'
import { RankableMatch, rankInterclubs } from '@/app/(protected)/(tournaments)/utils/standings'

const FORMAT = ScoreFormat.BASIC_COUNT
const HOME_WIN: MatchScore = { home: 16, away: 8 }
const AWAY_WIN: MatchScore = { home: 8, away: 16 }

/** A valid series: 1 doubles + 2 singles, no player repeated, `homeWins` for home. */
function series(homeRoster: number[], awayRoster: number[], homeWins: number): MatchScore {
  const lineups = [
    { double: true, homePlayerIds: homeRoster.slice(0, 2), awayPlayerIds: awayRoster.slice(0, 2) },
    { double: false, homePlayerIds: [homeRoster[2]], awayPlayerIds: [awayRoster[2]] },
    { double: false, homePlayerIds: [homeRoster[3]], awayPlayerIds: [awayRoster[3]] }
  ]

  return {
    matches: lineups.map((lineup, index) => ({
      ...lineup,
      score: index < homeWins ? HOME_WIN : AWAY_WIN,
      winner: index < homeWins ? MatchSide.HOME : MatchSide.AWAY
    }))
  }
}

const HOME_TEAM = [1, 2, 3, 4]
const AWAY_TEAM = [5, 6, 7, 8]
const ROSTERS = { type: TournamentType.INTERCLUBS, homePlayerIds: HOME_TEAM, awayPlayerIds: AWAY_TEAM }

describe('interclubs — format resolution', () => {
  it('plays a single home-and-away zone with 4 teams or fewer', () => {
    for (const count of [2, 3, 4]) {
      const format = resolveInterclubsFormat(count)

      expect(format.mode).toBe(InterclubsMode.DOUBLE_LEAGUE)
      expect(format.groupSizes).toEqual([count])
      expect(format.totalQualifiers).toBe(0)
    }
  })

  it('builds zones of 4 and spreads the leftovers over them (floor rule)', () => {
    expect(resolveInterclubsFormat(8).groupSizes).toEqual([4, 4])
    expect(resolveInterclubsFormat(9).groupSizes).toEqual([5, 4])
    expect(resolveInterclubsFormat(11).groupSizes).toEqual([6, 5])
    expect(resolveInterclubsFormat(12).groupSizes).toEqual([4, 4, 4])
    expect(resolveInterclubsFormat(14).groupSizes).toEqual([5, 5, 4])
  })

  it('keeps 5 to 7 teams in a single zone', () => {
    for (const count of [5, 6, 7]) {
      const format = resolveInterclubsFormat(count)

      expect(format.mode).toBe(InterclubsMode.GROUPS_PLAYOFF)
      expect(format.groupSizes).toEqual([count])
    }
  })

  it('advances 2 per zone, or 4 when there is a single zone', () => {
    expect(resolveInterclubsFormat(6).qualifiersPerGroup).toBe(4)
    expect(resolveInterclubsFormat(6).totalQualifiers).toBe(4)
    expect(resolveInterclubsFormat(11).qualifiersPerGroup).toBe(2)
    expect(resolveInterclubsFormat(11).totalQualifiers).toBe(4)
    expect(resolveInterclubsFormat(12).totalQualifiers).toBe(6)
  })

  it('describes the resulting format, and says nothing below 2 teams', () => {
    expect(describeInterclubsFormat(1)).toBeNull()
    expect(describeInterclubsFormat(3)).toContain('ida y vuelta')
    expect(describeInterclubsFormat(11)).toContain('2 zonas')
  })
})

describe('interclubs — team labels', () => {
  it('numbers venue teams as A, B, … and past Z as AA', () => {
    expect(getTeamLabelSuffix(0)).toBe('A')
    expect(getTeamLabelSuffix(1)).toBe('B')
    expect(getTeamLabelSuffix(25)).toBe('Z')
    expect(getTeamLabelSuffix(26)).toBe('AA')
    expect(getTeamLabelSuffix(27)).toBe('AB')
  })

  it('leaves a lone team of a venue with the plain venue name', () => {
    const labels = buildSiteLabels([
      { id: 1, siteId: 10, siteName: 'Alemán' },
      { id: 2, siteId: 20, siteName: 'Belgrano' }
    ])

    expect(labels.get(1)).toBe('Alemán')
    expect(labels.get(2)).toBe('Belgrano')
  })

  it('adds a letter to every team when a venue enters more than one', () => {
    const labels = buildSiteLabels([
      { id: 1, siteId: 10, siteName: 'Alemán' },
      { id: 2, siteId: 20, siteName: 'Belgrano' },
      { id: 3, siteId: 10, siteName: 'Alemán' }
    ])

    // The first team loses its plain name as soon as a sibling shows up.
    expect(labels.get(1)).toBe('Alemán A')
    expect(labels.get(3)).toBe('Alemán B')
    expect(labels.get(2)).toBe('Belgrano')
  })

  it('orders the letters by registration order, not by input order', () => {
    const labels = buildSiteLabels([
      { id: 7, siteId: 10, siteName: 'Alemán' },
      { id: 3, siteId: 10, siteName: 'Alemán' }
    ])

    expect(labels.get(3)).toBe('Alemán A')
    expect(labels.get(7)).toBe('Alemán B')
  })

  it('gives no label to a team without a venue', () => {
    const labels = buildSiteLabels([{ id: 1, siteId: null, siteName: null }])

    expect(labels.get(1)).toBeNull()
  })
})

describe('interclubs — home advantage (localía)', () => {
  const match = (id: number, roundNumber: number, home: number, away: number): LocalityMatch => ({
    id,
    roundNumber,
    homeCompetitorIds: [home],
    awayCompetitorIds: [away]
  })

  it('inverts the localía of a rematch', () => {
    const history = [match(1, 1, 10, 20)]

    expect(resolveLocality(10, 20, history)).toEqual({ home: 20, away: 10 })
    // Order of the arguments must not matter.
    expect(resolveLocality(20, 10, history)).toEqual({ home: 20, away: 10 })
  })

  it('inverts against the most recent meeting when there are several', () => {
    const history = [match(1, 1, 10, 20), match(2, 4, 20, 10)]

    expect(resolveLocality(10, 20, history)).toEqual({ home: 10, away: 20 })
  })

  it('gives home to whoever has hosted less often', () => {
    // 10 hosted twice (against others), 20 never.
    const history = [match(1, 1, 10, 30), match(2, 2, 10, 40)]

    expect(resolveLocality(10, 20, history)).toEqual({ home: 20, away: 10 })
  })

  it('ignores byes when counting home games', () => {
    const bye: LocalityMatch = { id: 9, roundNumber: 1, homeCompetitorIds: [20], awayCompetitorIds: null }
    const history = [match(1, 1, 10, 30), bye]

    // 20's bye is not a home game, so it still hosts fewer than 10.
    expect(resolveLocality(10, 20, history)).toEqual({ home: 20, away: 10 })
  })

  it('breaks a tie deterministically (same answer every time)', () => {
    const first = resolveLocality(10, 20, [], 'r1')
    const second = resolveLocality(20, 10, [], 'r1')

    expect(first).toEqual(second)
    expect([first.home, first.away].sort()).toEqual([10, 20])
  })

  it('spreads home games within a round it is assigning', () => {
    const pairs = [
      { first: 1, second: 2, position: 0 },
      { first: 3, second: 4, position: 1 }
    ]
    const sides = assignLocality(pairs, [], 1)

    expect(sides).toHaveLength(2)

    for (const side of sides) {
      expect(side.home).not.toBe(side.away)
    }
  })

  it('alternates the localía of a rematch round', () => {
    const first = assignLocality([{ first: 1, second: 2, position: 0 }], [], 1)[0]
    const history = [match(1, 1, first.home, first.away)]
    const second = assignLocality([{ first: 1, second: 2, position: 0 }], history, 2)[0]

    expect(second.home).toBe(first.away)
    expect(second.away).toBe(first.home)
  })
})

describe('interclubs — series score', () => {
  it('accepts one doubles plus two singles', () => {
    expect(isValidScore(series(HOME_TEAM, AWAY_TEAM, 2), FORMAT, ROSTERS)).toBe(true)
  })

  it('accepts two doubles plus one single (needs a fifth player)', () => {
    const score: MatchScore = {
      matches: [
        { double: true, homePlayerIds: [1, 2], awayPlayerIds: [5, 6], score: HOME_WIN, winner: MatchSide.HOME },
        { double: true, homePlayerIds: [3, 4], awayPlayerIds: [7, 8], score: HOME_WIN, winner: MatchSide.HOME },
        { double: false, homePlayerIds: [9], awayPlayerIds: [10], score: AWAY_WIN, winner: MatchSide.AWAY }
      ]
    }

    expect(
      isValidScore(score, FORMAT, {
        type: TournamentType.INTERCLUBS,
        homePlayerIds: [1, 2, 3, 4, 9],
        awayPlayerIds: [5, 6, 7, 8, 10]
      })
    ).toBe(true)
  })

  it('rejects a plain result on an interclubes match', () => {
    expect(isValidScore(HOME_WIN, FORMAT, ROSTERS)).toBe(false)
  })

  it('rejects a series that is not three matches', () => {
    const score = series(HOME_TEAM, AWAY_TEAM, 2)

    expect(isValidScore({ matches: score.matches!.slice(0, 2) }, FORMAT, ROSTERS)).toBe(false)
  })

  it('rejects three singles or three doubles', () => {
    const threeSingles: MatchScore = {
      matches: [
        { double: false, homePlayerIds: [1], awayPlayerIds: [5], score: HOME_WIN, winner: MatchSide.HOME },
        { double: false, homePlayerIds: [2], awayPlayerIds: [6], score: HOME_WIN, winner: MatchSide.HOME },
        { double: false, homePlayerIds: [3], awayPlayerIds: [7], score: AWAY_WIN, winner: MatchSide.AWAY }
      ]
    }

    expect(isValidScore(threeSingles, FORMAT, ROSTERS)).toBe(false)
  })

  it('rejects a player playing two matches of the same series', () => {
    const score: MatchScore = {
      matches: [
        { double: true, homePlayerIds: [1, 2], awayPlayerIds: [5, 6], score: HOME_WIN, winner: MatchSide.HOME },
        // Player 1 already played the doubles: they cannot play the single too.
        { double: false, homePlayerIds: [1], awayPlayerIds: [7], score: HOME_WIN, winner: MatchSide.HOME },
        { double: false, homePlayerIds: [4], awayPlayerIds: [8], score: AWAY_WIN, winner: MatchSide.AWAY }
      ]
    }

    expect(isValidScore(score, FORMAT, ROSTERS)).toBe(false)
  })

  it('rejects a player who is not in the team', () => {
    const score = series(HOME_TEAM, AWAY_TEAM, 2)

    score.matches![1].homePlayerIds = [99]

    expect(isValidScore(score, FORMAT, ROSTERS)).toBe(false)
  })

  it('rejects a doubles with one player, or a single with two', () => {
    const score = series(HOME_TEAM, AWAY_TEAM, 2)

    score.matches![0].homePlayerIds = [1]

    expect(isValidScore(score, FORMAT, ROSTERS)).toBe(false)
  })

  it('rejects an individual result that contradicts its declared winner', () => {
    const score = series(HOME_TEAM, AWAY_TEAM, 2)

    score.matches![0].winner = MatchSide.AWAY

    expect(isValidScore(score, FORMAT, ROSTERS)).toBe(false)
  })

  it('accepts a walkover for the whole series', () => {
    expect(isValidScore({ walkover: MatchSide.HOME }, FORMAT, ROSTERS)).toBe(true)
  })

  it('gives the series to whoever won most individual matches', () => {
    expect(getScoreWinner(series(HOME_TEAM, AWAY_TEAM, 3), FORMAT)).toBe(MatchSide.HOME)
    expect(getScoreWinner(series(HOME_TEAM, AWAY_TEAM, 2), FORMAT)).toBe(MatchSide.HOME)
    expect(getScoreWinner(series(HOME_TEAM, AWAY_TEAM, 1), FORMAT)).toBe(MatchSide.AWAY)
    expect(getScoreWinner(series(HOME_TEAM, AWAY_TEAM, 0), FORMAT)).toBe(MatchSide.AWAY)
  })

  it('counts individual matches and formats the series scoreline', () => {
    const score = series(HOME_TEAM, AWAY_TEAM, 2)

    expect(getSeriesMatchesWon(score)).toEqual({ home: 2, away: 1 })
    expect(formatScore(score, FORMAT)).toBe('2-1')
  })

  it('stores the series scoreline alongside the individual matches', () => {
    const stored = normalizeScore(series(HOME_TEAM, AWAY_TEAM, 2))

    expect(stored.home).toBe(2)
    expect(stored.away).toBe(1)
    expect(stored.matches).toHaveLength(3)
  })

  it('adds up the sets of the three matches', () => {
    // BASIC_COUNT has no sets, so a three-sets series is used here.
    const setsFormat = ScoreFormat.THREE_SETS
    const win: MatchScore = {
      sets: [
        { home: 6, away: 3 },
        { home: 6, away: 4 }
      ]
    }
    const loss: MatchScore = {
      sets: [
        { home: 3, away: 6 },
        { home: 4, away: 6 }
      ]
    }
    const score: MatchScore = {
      matches: [
        { double: true, homePlayerIds: [1, 2], awayPlayerIds: [5, 6], score: win, winner: MatchSide.HOME },
        { double: false, homePlayerIds: [3], awayPlayerIds: [7], score: win, winner: MatchSide.HOME },
        { double: false, homePlayerIds: [4], awayPlayerIds: [8], score: loss, winner: MatchSide.AWAY }
      ]
    }

    expect(isValidScore(score, setsFormat, ROSTERS)).toBe(true)
    expect(getSetsWon(score)).toEqual({ home: 4, away: 2 })
  })
})

describe('interclubs — standings ladder', () => {
  const played = (home: number, away: number, homeWins: number): RankableMatch => ({
    homeCompetitorIds: [home],
    awayCompetitorIds: [away],
    status: MatchStatus.PLAYED,
    winner: homeWins >= 2 ? MatchSide.HOME : MatchSide.AWAY,
    score: series([1, 2, 3, 4], [5, 6, 7, 8], homeWins)
  })

  it('ranks by encounters won before anything else', () => {
    // 10 wins narrowly twice, 20 wins once by a landslide.
    const rows = rankInterclubs([10, 20, 30], [played(10, 30, 2), played(10, 20, 2), played(20, 30, 3)])

    expect(rows.map((row) => row.competitorId)).toEqual([10, 20, 30])
    expect(rows[0].points).toBe(2)
    expect(rows[1].points).toBe(1)
  })

  it('separates equal points by individual-match differential', () => {
    // Both won one encounter; 20 did it 3-0, 10 did it 2-1, so 20 ends up
    // +4/-2 on individual matches and 10 the mirror image.
    const rows = rankInterclubs([10, 20], [played(10, 20, 2), played(20, 10, 3)])

    expect(rows.map((row) => row.competitorId)).toEqual([20, 10])
    expect(rows[0].points).toBe(rows[1].points)
    expect(rows[0].subMatchesWon! - rows[0].subMatchesLost!).toBe(2)
    expect(rows[1].subMatchesWon! - rows[1].subMatchesLost!).toBe(-2)
  })

  it('counts a walkover as an encounter won with no individual matches', () => {
    const rows = rankInterclubs(
      [10, 20],
      [
        {
          homeCompetitorIds: [10],
          awayCompetitorIds: [20],
          status: MatchStatus.WALKOVER,
          winner: MatchSide.HOME,
          score: { walkover: MatchSide.HOME }
        }
      ]
    )

    expect(rows[0].competitorId).toBe(10)
    expect(rows[0].points).toBe(1)
    expect(rows[0].subMatchesWon).toBe(0)
    expect(rows[0].setsWon).toBe(0)
  })

  it('ignores matches that have not been played', () => {
    const rows = rankInterclubs(
      [10, 20],
      [
        {
          homeCompetitorIds: [10],
          awayCompetitorIds: [20],
          status: MatchStatus.PENDING,
          winner: null,
          score: null
        }
      ]
    )

    expect(rows.every((row) => row.played === 0 && row.points === 0)).toBe(true)
  })

  it('falls back to the head-to-head between the tied teams', () => {
    // Identical records (1 win each, 3-0 and 0-3), so only the direct result
    // can separate them — and 20 won it.
    const rows = rankInterclubs([10, 20], [played(10, 20, 0), played(20, 10, 0)])

    expect(rows.map((row) => row.competitorId)).toEqual([20, 10])
  })
})
