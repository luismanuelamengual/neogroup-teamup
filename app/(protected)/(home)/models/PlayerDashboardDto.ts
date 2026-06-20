import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'

/** Aggregated stats of a player across every tournament they participate in. */
export interface PlayerStatsDto {
  tournamentsPlayed: number
  activeTournaments: number
  matchesPlayed: number
  matchesWon: number
  /** Win rate as an integer percentage (0–100). */
  winRate: number
  titles: number
  podiums: number
}

/** Payload for the player home dashboard. */
export interface PlayerDashboardDto {
  stats: PlayerStatsDto
  /** Non-finished tournaments the player is registered in (full detail). */
  activeTournaments: TournamentDto[]
}
