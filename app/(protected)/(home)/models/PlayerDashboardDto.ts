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
