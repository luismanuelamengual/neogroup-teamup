import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(tournaments)/models/AmericanoSettings'
import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(tournaments)/models/LeagueSettings'
import { Match } from '@/app/(tournaments)/models/Match'
import { MatchSide } from '@/app/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'
import { ScoreFormat } from '@/app/(tournaments)/models/ScoreFormat'
import { StandingsRowDto } from '@/app/(tournaments)/models/StandingsRowDto'
import { TournamentSettings } from '@/app/(tournaments)/models/TournamentSettings'
import { TournamentType } from '@/app/(tournaments)/models/TournamentType'
import { getGamesWon, getSetsWon } from '@/app/(tournaments)/utils/score'

/**
 * Computes the standings table from the resolved matches of a tournament.
 * - League: points per presented match + per set won + per match won.
 * - Americano: points per game won + per match won (per individual when partners swap).
 */
export function computeStandings(
  type: TournamentType,
  scoreFormat: ScoreFormat,
  settings: TournamentSettings,
  competitors: Competitor[],
  matches: Match[]
): StandingsRowDto[] {
  const rows = new Map<number, StandingsRowDto>()

  for (const competitor of competitors) {
    rows.set(competitor.id, {
      competitorId: competitor.id,
      displayName: competitor.displayName,
      played: 0,
      won: 0,
      setsWon: 0,
      gamesWon: 0,
      points: 0
    })
  }

  const leagueSettings = { ...DEFAULT_LEAGUE_SETTINGS, ...settings }
  const americanoSettings = { ...DEFAULT_AMERICANO_SETTINGS, ...settings }

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
        row.points += games.home * americanoSettings.pointsPerGameWon

        if (match.winner === MatchSide.HOME) {
          row.won++
          row.points += americanoSettings.pointsPerMatchWon
        }
      })
      addToSide(match.awayCompetitorIds, (row) => {
        row.played++
        row.gamesWon = (row.gamesWon ?? 0) + games.away
        row.points += games.away * americanoSettings.pointsPerGameWon

        if (match.winner === MatchSide.AWAY) {
          row.won++
          row.points += americanoSettings.pointsPerMatchWon
        }
      })
    }
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.won - a.won ||
      (b.setsWon ?? 0) - (a.setsWon ?? 0) ||
      (b.gamesWon ?? 0) - (a.gamesWon ?? 0)
  )
}
