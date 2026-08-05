import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { StandingsRowDto } from '@/app/(protected)/(tournaments)/models/StandingsRowDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeGroupMembership } from '@/app/(protected)/(tournaments)/utils/groups'
import { countsForStandings } from '@/app/(protected)/(tournaments)/utils/matches'
import { getGamesWon, getSeriesMatchesWon, getSetsWon } from '@/app/(protected)/(tournaments)/utils/score'
import { Tournament } from '../models/Tournament'
import { TournamentDto } from '../models/TournamentDto'

/** Minimal match shape the interclubes ranking needs. Both `Match` and `MatchDto` satisfy it. */
export interface RankableMatch {
  homeCompetitorId: number | null
  awayCompetitorId: number | null
  status: MatchStatus
  winner: MatchSide | null
  score: MatchScore | null
}

/** Blank interclubes stats row. */
function emptyInterclubsRow(competitorId: number): StandingsRowDto {
  return {
    competitorId,
    displayName: '',
    shortName: '',
    played: 0,
    won: 0,
    setsWon: 0,
    setsLost: 0,
    subMatchesWon: 0,
    subMatchesLost: 0,
    points: 0
  }
}

/**
 * Ranks interclubes competitors from their played series.
 *
 * The ladder, in order:
 *  1. **Ptos** — encounters (series) won. Nothing else earns points: winning
 *     3-0 or 2-1 is worth exactly the same.
 *  2. **DP** — difference of individual matches won and lost, which is what
 *     separates two teams that won the same number of encounters.
 *  3. **DS** — same idea one level down, on sets.
 *  4. Head-to-head between the tied teams.
 *
 * A series settled by walkover counts as a win but contributes no individual
 * matches or sets to either side — the same convention the league standings
 * already use for a walkover's sets, since nothing was actually played.
 *
 * It is deliberately shared by the standings table and the knockout seeding
 * (`rankGroup`), so what the table shows and who advances can never disagree.
 */
export function rankInterclubs(competitorIds: number[], matches: RankableMatch[]): StandingsRowDto[] {
  const rows = new Map(competitorIds.map((id) => [id, emptyInterclubsRow(id)]))

  const addTo = (id: number | null, updater: (row: StandingsRowDto) => void) => {
    const row = id != null ? rows.get(id) : undefined

    if (row) {
      updater(row)
    }
  }

  for (const match of matches) {
    if (!countsForStandings(match)) {
      continue
    }

    const score = match.score ?? {}
    const isWalkover = match.status === MatchStatus.WALKOVER || !!score.walkover
    const subMatches = isWalkover ? { home: 0, away: 0 } : getSeriesMatchesWon(score)
    const sets = isWalkover ? { home: 0, away: 0 } : getSetsWon(score)

    addTo(match.homeCompetitorId, (row) => {
      row.played++
      row.subMatchesWon = (row.subMatchesWon ?? 0) + subMatches.home
      row.subMatchesLost = (row.subMatchesLost ?? 0) + subMatches.away
      row.setsWon = (row.setsWon ?? 0) + sets.home
      row.setsLost = (row.setsLost ?? 0) + sets.away

      if (match.winner === MatchSide.HOME) {
        row.won++
        row.points++
      }
    })
    addTo(match.awayCompetitorId, (row) => {
      row.played++
      row.subMatchesWon = (row.subMatchesWon ?? 0) + subMatches.away
      row.subMatchesLost = (row.subMatchesLost ?? 0) + subMatches.home
      row.setsWon = (row.setsWon ?? 0) + sets.away
      row.setsLost = (row.setsLost ?? 0) + sets.home

      if (match.winner === MatchSide.AWAY) {
        row.won++
        row.points++
      }
    })
  }

  /** 1 when idA beat idB in a direct encounter, -1 when idB won, 0 otherwise. */
  const headToHead = (idA: number, idB: number): number => {
    for (const match of matches) {
      if (!countsForStandings(match)) {
        continue
      }

      const homeHasA = match.homeCompetitorId === idA
      const homeHasB = match.homeCompetitorId === idB
      const awayHasA = match.awayCompetitorId === idA
      const awayHasB = match.awayCompetitorId === idB

      if ((homeHasA && awayHasB) || (homeHasB && awayHasA)) {
        if (match.winner === MatchSide.HOME) {
          return homeHasA ? 1 : -1
        }

        if (match.winner === MatchSide.AWAY) {
          return awayHasA ? 1 : -1
        }
      }
    }

    return 0
  }

  return [...rows.values()].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points
    }

    const subDiffA = (a.subMatchesWon ?? 0) - (a.subMatchesLost ?? 0)
    const subDiffB = (b.subMatchesWon ?? 0) - (b.subMatchesLost ?? 0)

    if (subDiffB !== subDiffA) {
      return subDiffB - subDiffA
    }

    const setDiffA = (a.setsWon ?? 0) - (a.setsLost ?? 0)
    const setDiffB = (b.setsWon ?? 0) - (b.setsLost ?? 0)

    if (setDiffB !== setDiffA) {
      return setDiffB - setDiffA
    }

    return headToHead(b.competitorId, a.competitorId)
  })
}

/**
 * Computes the standings table from the resolved matches of a tournament.
 * - League: points per presented match + per set won + per match won.
 * - Americano: points per game won + per match won (per individual when partners swap).
 * - Groups + playoff: each group (pass its `bracket`) ranks like a league.
 *
 * `groupNumber` narrows the table to a single group of a groups+playoff
 * tournament. When omitted the plain league/americano flow (groupNumber null)
 * of the category counts.
 */
export function computeStandings(
  tournament: Tournament | TournamentDto,
  category?: number | null,
  groupNumber?: number | null
): StandingsRowDto[] {
  if (tournament.type === TournamentType.PLAYOFF) {
    return []
  }

  const isInterclubs = tournament.type === TournamentType.INTERCLUBS
  // Groups+playoff: only the round-robin group phase (a specific group) has
  // standings. Interclubes is the same when it plays zones, but its small
  // variant is a single league whose lane carries no group index — so, unlike
  // groups+playoff, a null groupNumber is a legitimate table there.
  const isGroups = tournament.type === TournamentType.GROUPS_PLAYOFF

  if (isGroups && groupNumber == null) {
    return []
  }

  // League and americano both live in the round-robin (LEAGUE) lane; groups carry
  // their group index in groupNumber. Standings are computed over that lane only.
  const matches = (tournament.matches ?? []).filter(
    (m) =>
      (category == null || m.tournamentCategoryId === category) &&
      (m.groupNumber ?? null) === (groupNumber ?? null) &&
      m.type === MatchType.LEAGUE
  )
  // League/americano rank every category competitor; a group (or an interclubes
  // zone) ranks only its own members.
  //
  // Membership is recomputed from the competitors with the very same rule the
  // engine used to build the groups — NOT read off the materialised matches.
  // A group of odd size rests one competitor per round, so while the round robin
  // is still being materialised the resting competitor appears in no match yet;
  // deriving membership from the matches dropped them from the table (on round 1
  // that is always the top seed, the fixed point of the circle method).
  const allCompetitors = tournament.competitors ?? []
  const byGroup = isGroups || (isInterclubs && groupNumber != null)
  const groupCompetitorIds = new Set<number>()

  if (byGroup) {
    // Groups are per category instance, so membership can only be recomputed
    // when the table is scoped to one; without it the matches are all there is.
    if (category != null) {
      const categoryCompetitors = allCompetitors.filter((c) => c.tournamentCategoryId === category)
      const membership = computeGroupMembership(categoryCompetitors, tournament.settings, tournament.type)

      for (const id of membership[groupNumber as number] ?? []) {
        groupCompetitorIds.add(id)
      }
    }

    // Defensive: a competitor added to a group after it was materialised (or any
    // future divergence) still shows up if it plays there.
    for (const match of matches) {
      if (match.homeCompetitorId != null) {
        groupCompetitorIds.add(match.homeCompetitorId)
      }

      if (match.awayCompetitorId != null) {
        groupCompetitorIds.add(match.awayCompetitorId)
      }
    }
  }

  const competitors = byGroup
    ? allCompetitors.filter((c) => groupCompetitorIds.has(c.id))
    : category != null
      ? allCompetitors.filter((c) => c.tournamentCategoryId === category)
      : allCompetitors

  // Interclubes has its own ladder (encounters won → individual matches → sets),
  // with no configurable points at all.
  if (isInterclubs) {
    return rankInterclubs(
      competitors.map((competitor) => competitor.id),
      matches
    ).map((row) => {
      const competitor = competitors.find((entry) => entry.id === row.competitorId)

      return { ...row, displayName: competitor?.displayName ?? '', shortName: competitor?.shortName ?? '' }
    })
  }

  // Groups score like a league (sets + match wins).
  const type = isGroups ? TournamentType.LEAGUE : tournament.type
  const { scoreFormat, settings } = tournament
  const groupsDefaults = DEFAULT_GROUPS_PLAYOFF_SETTINGS
  const leagueSettings = isGroups
    ? {
        pointsPerPresent: settings?.pointsPerPresent ?? groupsDefaults.pointsPerPresent,
        pointsPerSetWon: settings?.pointsPerSetWon ?? groupsDefaults.pointsPerSetWon,
        pointsPerMatchWon: settings?.pointsPerMatchWon ?? groupsDefaults.pointsPerMatchWon
      }
    : { ...DEFAULT_LEAGUE_SETTINGS, ...(settings ?? {}) }
  const americanoSettings = { ...DEFAULT_AMERICANO_SETTINGS, ...(settings ?? {}) }
  const rows = new Map<number, StandingsRowDto>()

  for (const competitor of competitors) {
    rows.set(competitor.id, {
      competitorId: competitor.id,
      displayName: competitor.displayName,
      shortName: competitor.shortName,
      played: 0,
      won: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      points: 0
    })
  }

  const addToSide = (id: number | null, updater: (row: StandingsRowDto) => void) => {
    const row = id != null ? rows.get(id) : undefined

    if (row) {
      updater(row)
    }
  }

  for (const match of matches) {
    if (!countsForStandings(match)) {
      continue
    }

    const score = match.score ?? {}
    const isWalkover = match.status === MatchStatus.WALKOVER || !!score.walkover

    if (type === TournamentType.LEAGUE) {
      const sets = isWalkover ? { home: 0, away: 0 } : getSetsWon(score)
      const games = isWalkover ? { home: 0, away: 0 } : getGamesWon(score, scoreFormat)

      addToSide(match.homeCompetitorId, (row) => {
        row.played++
        row.setsWon = (row.setsWon ?? 0) + sets.home
        row.setsLost = (row.setsLost ?? 0) + sets.away
        row.gamesWon = (row.gamesWon ?? 0) + games.home
        row.gamesLost = (row.gamesLost ?? 0) + games.away
        row.points += sets.home * leagueSettings.pointsPerSetWon

        if (!isWalkover || score.walkover === MatchSide.HOME) {
          row.points += leagueSettings.pointsPerPresent
        }

        if (match.winner === MatchSide.HOME) {
          row.won++
          row.points += leagueSettings.pointsPerMatchWon
        }
      })
      addToSide(match.awayCompetitorId, (row) => {
        row.played++
        row.setsWon = (row.setsWon ?? 0) + sets.away
        row.setsLost = (row.setsLost ?? 0) + sets.home
        row.gamesWon = (row.gamesWon ?? 0) + games.away
        row.gamesLost = (row.gamesLost ?? 0) + games.home
        row.points += sets.away * leagueSettings.pointsPerSetWon

        if (!isWalkover || score.walkover === MatchSide.AWAY) {
          row.points += leagueSettings.pointsPerPresent
        }

        if (match.winner === MatchSide.AWAY) {
          row.won++
          row.points += leagueSettings.pointsPerMatchWon
        }
      })
    } else if (type === TournamentType.AMERICANO) {
      const games = isWalkover ? { home: 0, away: 0 } : getGamesWon(score, scoreFormat)

      addToSide(match.homeCompetitorId, (row) => {
        row.played++
        row.gamesWon = (row.gamesWon ?? 0) + games.home
        row.gamesLost = (row.gamesLost ?? 0) + games.away
        row.points += games.home * americanoSettings.pointsPerGameWon

        if (match.winner === MatchSide.HOME) {
          row.won++
          row.points += americanoSettings.pointsPerMatchWon
        }
      })
      addToSide(match.awayCompetitorId, (row) => {
        row.played++
        row.gamesWon = (row.gamesWon ?? 0) + games.away
        row.gamesLost = (row.gamesLost ?? 0) + games.home
        row.points += games.away * americanoSettings.pointsPerGameWon

        if (match.winner === MatchSide.AWAY) {
          row.won++
          row.points += americanoSettings.pointsPerMatchWon
        }
      })
    }
  }

  /**
   * Returns 1 if idA beat idB in a direct match, -1 if idB beat idA, 0 if
   * no match was played between them or it was unresolved.
   */
  const headToHead = (idA: number, idB: number): number => {
    for (const match of matches) {
      if (!countsForStandings(match)) {
        continue
      }

      const homeHasA = match.homeCompetitorId === idA
      const homeHasB = match.homeCompetitorId === idB
      const awayHasA = match.awayCompetitorId === idA
      const awayHasB = match.awayCompetitorId === idB

      if ((homeHasA && awayHasB) || (homeHasB && awayHasA)) {
        if (match.winner === MatchSide.HOME) {
          return homeHasA ? 1 : -1
        }

        if (match.winner === MatchSide.AWAY) {
          return awayHasA ? 1 : -1
        }
      }
    }

    return 0
  }

  return [...rows.values()].sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points
    }

    // Tiebreaker 1: set differential (only meaningful for League/Groups)
    if (type === TournamentType.LEAGUE) {
      const setDiffA = (a.setsWon ?? 0) - (a.setsLost ?? 0)
      const setDiffB = (b.setsWon ?? 0) - (b.setsLost ?? 0)

      if (setDiffB !== setDiffA) {
        return setDiffB - setDiffA
      }

      // Tiebreaker 2: game differential
      const gameDiffA = (a.gamesWon ?? 0) - (a.gamesLost ?? 0)
      const gameDiffB = (b.gamesWon ?? 0) - (b.gamesLost ?? 0)

      if (gameDiffB !== gameDiffA) {
        return gameDiffB - gameDiffA
      }

      // Tiebreaker 3: head-to-head result
      return headToHead(b.competitorId, a.competitorId)
    }

    // Americano fallback: games won
    return (b.gamesWon ?? 0) - (a.gamesWon ?? 0)
  })
}
