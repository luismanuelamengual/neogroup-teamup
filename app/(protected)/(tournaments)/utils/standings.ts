import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { StandingsRowDto } from '@/app/(protected)/(tournaments)/models/StandingsRowDto'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getGamesWon, getSetsWon } from '@/app/(protected)/(tournaments)/utils/score'

/**
 * Computes the standings table from the resolved matches of a tournament.
 * - League: points per presented match + per set won + per match won.
 * - Americano: points per game won + per match won (per individual when partners swap).
 * - Groups + playoff: each group (pass its `bracket`) ranks like a league.
 *
 * `bracket` narrows the table to a single parallel structure (e.g. a group of a
 * groups+playoff tournament). When omitted every bracket of the category counts.
 */
export function computeStandings(
  tournament: TournamentDto,
  category?: string | null,
  bracket?: string | null
): StandingsRowDto[] {
  if (tournament.type === TournamentType.PLAYOFF || tournament.type === TournamentType.PLAYOFF_WITH_CONSOLATION) {
    return []
  }

  // Groups+playoff: only the round-robin group phase has standings.
  const isGroups = tournament.type === TournamentType.GROUPS_PLAYOFF

  if (isGroups && !(bracket && bracket.startsWith('group:'))) {
    return []
  }

  const allRounds = tournament.rounds ?? []
  const roundIds = new Set(
    allRounds
      .filter(
        (r) =>
          (category == null || (r.category ?? null) === category) &&
          (bracket == null || (r.bracket ?? null) === bracket)
      )
      .map((r) => r.id)
  )
  const matches = (tournament.matches ?? []).filter((m) => roundIds.has(m.roundId))
  // League/americano rank every category competitor; groups rank only the ones
  // that actually play in the group (derived from the group matches).
  const allCompetitors = tournament.competitors ?? []
  const groupCompetitorIds = new Set<number>()

  if (isGroups) {
    for (const match of matches) {
      match.homeCompetitorIds.forEach((id) => groupCompetitorIds.add(id))
      match.awayCompetitorIds?.forEach((id) => groupCompetitorIds.add(id))
    }
  }

  const competitors = isGroups
    ? allCompetitors.filter((c) => groupCompetitorIds.has(c.id))
    : category != null
    ? allCompetitors.filter((c) => c.category === category)
    : allCompetitors
  // Groups score like a league (sets + match wins).
  // AMERICANO_WITH_SWAP scores the same as AMERICANO.
  const rawType = isGroups ? TournamentType.LEAGUE : tournament.type
  const type =
    rawType === TournamentType.AMERICANO_WITH_SWAP ? TournamentType.AMERICANO : rawType
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
      played: 0,
      won: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      points: 0
    })
  }

  const addToSide = (ids: number[] | null, updater: (row: StandingsRowDto) => void) => {
    for (const id of ids ?? []) {
      const row = rows.get(id)

      if (row) {
        updater(row)
      }
    }
  }

  for (const match of matches) {
    if (match.status === MatchStatus.PENDING || !match.awayCompetitorIds) {
      continue
    }

    const score = match.score ?? {}
    const isWalkover = match.status === MatchStatus.WALKOVER || !!score.walkover

    if (type === TournamentType.LEAGUE) {
      const sets = isWalkover ? { home: 0, away: 0 } : getSetsWon(score)

      addToSide(match.homeCompetitorIds, (row) => {
        row.played++
        row.setsWon = (row.setsWon ?? 0) + sets.home
        row.setsLost = (row.setsLost ?? 0) + sets.away
        row.points += sets.home * leagueSettings.pointsPerSetWon

        if (!isWalkover || score.walkover === MatchSide.HOME) {
          row.points += leagueSettings.pointsPerPresent
        }

        if (match.winner === MatchSide.HOME) {
          row.won++
          row.points += leagueSettings.pointsPerMatchWon
        }
      })
      addToSide(match.awayCompetitorIds, (row) => {
        row.played++
        row.setsWon = (row.setsWon ?? 0) + sets.away
        row.setsLost = (row.setsLost ?? 0) + sets.home
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

      addToSide(match.homeCompetitorIds, (row) => {
        row.played++
        row.gamesWon = (row.gamesWon ?? 0) + games.home
        row.gamesLost = (row.gamesLost ?? 0) + games.away
        row.points += games.home * americanoSettings.pointsPerGameWon

        if (match.winner === MatchSide.HOME) {
          row.won++
          row.points += americanoSettings.pointsPerMatchWon
        }
      })
      addToSide(match.awayCompetitorIds, (row) => {
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
      if (match.status === MatchStatus.PENDING || !match.awayCompetitorIds) {
        continue
      }

      const homeHasA = match.homeCompetitorIds.includes(idA)
      const homeHasB = match.homeCompetitorIds.includes(idB)
      const awayHasA = match.awayCompetitorIds.includes(idA)
      const awayHasB = match.awayCompetitorIds.includes(idB)

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
